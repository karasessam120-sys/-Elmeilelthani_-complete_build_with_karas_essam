/*
  نقل المخدومين بين الفصول (الخادم من فصله، والأدمن من أي فصل) وتبديل الخدام (الأدمن).
  النقل بيغيّر الفصل بس، فالنجوم والتسميع والاختبارات وكل بيانات المخدوم بتفضل زي ما هي.
  ⚠️ شغّله بعد integrity_and_security.sql
*/
create table if not exists public.class_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('member','servant')),
  from_class text,
  to_class text not null,
  by_user uuid default auth.uid() references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists class_transfers_created_idx on public.class_transfers (created_at desc);
alter table public.class_transfers enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'class_transfers' loop
    execute format('drop policy %I on public.class_transfers', pol.policyname);
  end loop;
end $$;
create policy transfers_select on public.class_transfers for select to authenticated using (
  public.is_admin() or (public.current_role_name() = 'servant' and public.my_class() <> ''
    and (from_class = public.my_class() or to_class = public.my_class())));
revoke insert, update, delete on public.class_transfers from anon, authenticated;
grant select on public.class_transfers to authenticated;

-- نقل مخدومين لفصل تاني (يرجّع عدد اللي اتنقلوا)
create or replace function public.transfer_members_class(p_members uuid[], p_new_class text) returns int
language plpgsql security definer set search_path = public as $$
declare
  staff_role text := public.current_role_name();
  target text := btrim(coalesce(p_new_class, ''));
  m record; id uuid; moved int := 0;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if target = '' or not exists (select 1 from public.classes where name = target) then raise exception 'الفصل غير موجود'; end if;
  if coalesce(cardinality(p_members), 0) = 0 then raise exception 'اختار مخدوم واحد على الأقل'; end if;
  if cardinality(p_members) > 200 then raise exception 'العدد كبير، انقل على دفعات'; end if;
  foreach id in array p_members loop
    select u.id, u.church_class into m from public.users u where u.id = id and u.role = 'member' and u.status = 'active';
    if not found then continue; end if;
    if staff_role <> 'admin' and (public.my_class() = '' or m.church_class is distinct from public.my_class()) then
      raise exception 'فيه مخدوم مش في فصلك';
    end if;
    if m.church_class is not distinct from target then continue; end if;
    update public.users set church_class = target where users.id = m.id;
    insert into public.class_transfers (user_id, kind, from_class, to_class) values (m.id, 'member', m.church_class, target);
    moved := moved + 1;
  end loop;
  return moved;
end $$;

-- الأدمن: نقل خادم لفصل (فاضي = من غير فصل)
create or replace function public.admin_set_servant_class(p_servant uuid, p_new_class text) returns void
language plpgsql security definer set search_path = public as $$
declare target text := btrim(coalesce(p_new_class, '')); s record;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if target <> '' and not exists (select 1 from public.classes where name = target) then raise exception 'الفصل غير موجود'; end if;
  select id, church_class into s from public.users where id = p_servant and role = 'servant';
  if not found then raise exception 'الخادم غير موجود'; end if;
  if s.church_class is not distinct from target then return; end if;
  update public.users set church_class = target where id = p_servant;
  insert into public.class_transfers (user_id, kind, from_class, to_class) values (p_servant, 'servant', s.church_class, coalesce(nullif(target, ''), 'بدون فصل'));
end $$;

-- الأدمن: تبديل فصلين بين خادمين
create or replace function public.admin_swap_servant_classes(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record; b record;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if p_a = p_b then raise exception 'اختار خادمين مختلفين'; end if;
  select id, church_class into a from public.users where id = p_a and role = 'servant';
  select id, church_class into b from public.users where id = p_b and role = 'servant';
  if a.id is null or b.id is null then raise exception 'الخادم غير موجود'; end if;
  update public.users set church_class = b.church_class where id = a.id;
  update public.users set church_class = a.church_class where id = b.id;
  insert into public.class_transfers (user_id, kind, from_class, to_class) values
    (a.id, 'servant', a.church_class, coalesce(nullif(b.church_class, ''), 'بدون فصل')),
    (b.id, 'servant', b.church_class, coalesce(nullif(a.church_class, ''), 'بدون فصل'));
end $$;

revoke all on function public.transfer_members_class(uuid[], text) from public, anon;
revoke all on function public.admin_set_servant_class(uuid, text) from public, anon;
revoke all on function public.admin_swap_servant_classes(uuid, uuid) from public, anon;
grant execute on function public.transfer_members_class(uuid[], text) to authenticated;
grant execute on function public.admin_set_servant_class(uuid, text) to authenticated;
grant execute on function public.admin_swap_servant_classes(uuid, uuid) to authenticated;
