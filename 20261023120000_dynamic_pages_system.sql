-- Dynamic pages system: safe JSON UI, admin-only management, role-scoped visibility and audit trail.
create table if not exists public.dynamic_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  target_role text not null default 'all' check (target_role in ('all','member','servant','admin')),
  ui_structure jsonb not null default '{"version":1,"components":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint dynamic_pages_schema_version check (jsonb_typeof(ui_structure) = 'object' and ui_structure->>'version' = '1' and jsonb_typeof(ui_structure->'components') = 'array' and jsonb_array_length(ui_structure->'components') <= 40)
);
-- Compatibility guard: if the table existed before target_role was added,
-- ensure the column exists without deleting existing page data.
alter table public.dynamic_pages
  add column if not exists target_role text not null default 'all';

-- Add/refresh the allowed role constraint safely.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dynamic_pages_target_role_check'
      and conrelid = 'public.dynamic_pages'::regclass
  ) then
    alter table public.dynamic_pages
      add constraint dynamic_pages_target_role_check
      check (target_role in ('all','member','servant','admin'));
  end if;
end $$;

create index if not exists dynamic_pages_status_role_idx on public.dynamic_pages(status,target_role) where is_deleted = false;

create table if not exists public.pages_audit_logs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid,
  page_title text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pages_audit_logs_created_idx on public.pages_audit_logs(created_at desc);

create or replace function public.dynamic_pages_touch_and_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_action text; v_role text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'غير مسموح بإدارة الصفحات الديناميكية'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.updated_by := auth.uid(); new.updated_at := now();
    if new.status = 'published' then new.published_at := now(); end if;
    v_action := case when new.status = 'published' then 'publish' else 'create' end;
  else
    new.created_by := old.created_by; new.updated_by := auth.uid(); new.updated_at := now();
    if new.status = 'published' and old.status <> 'published' then new.published_at := now(); end if;
    v_action := case when new.is_deleted and not old.is_deleted then 'soft_delete'
      when not new.is_deleted and old.is_deleted then 'restore'
      when new.status = 'published' and old.status <> 'published' then 'publish'
      when new.status = 'archived' and old.status <> 'archived' then 'archive' else 'update' end;
  end if;
  select coalesce(full_name, username, 'مسؤول') into v_role from public.users where id = auth.uid();
  insert into public.pages_audit_logs(page_id,page_title,actor_id,actor_name,action,details)
  values(new.id,new.title,auth.uid(),v_role,v_action,jsonb_build_object('status',new.status,'target_role',new.target_role,'is_deleted',new.is_deleted));
  return new;
end; $$;
drop trigger if exists dynamic_pages_audit_trigger on public.dynamic_pages;
create trigger dynamic_pages_audit_trigger before insert or update on public.dynamic_pages for each row execute function public.dynamic_pages_touch_and_audit();

alter table public.dynamic_pages enable row level security;
alter table public.pages_audit_logs enable row level security;
drop policy if exists dynamic_pages_admin_all on public.dynamic_pages;
create policy dynamic_pages_admin_all on public.dynamic_pages for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists dynamic_pages_read_published on public.dynamic_pages;
create policy dynamic_pages_read_published on public.dynamic_pages for select to authenticated using (
  status = 'published' and not is_deleted and (
    target_role = 'all' or target_role = public.current_role_name()
  )
);
drop policy if exists pages_audit_admin_read on public.pages_audit_logs;
create policy pages_audit_admin_read on public.pages_audit_logs for select to authenticated using (public.is_admin());
revoke all on public.pages_audit_logs from anon;
grant select, insert, update, delete on public.dynamic_pages to authenticated;
grant select on public.pages_audit_logs to authenticated;
