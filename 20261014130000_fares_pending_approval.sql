-- Queue member submissions for servant review. Apply in Supabase SQL Editor after reviewing.
create table if not exists public.fares_pending_sync (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  psalms_list integer[] not null default '{}',
  hours_list text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  constraint fares_pending_psalms_valid check (0 < all(psalms_list) and 151 >= all(psalms_list)),
  constraint fares_pending_hours_valid check (hours_list <@ array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل']::text[])
);
create index if not exists fares_pending_sync_status_created_idx on public.fares_pending_sync(status, created_at);
alter table public.fares_pending_sync enable row level security;
drop policy if exists fares_pending_submit_own on public.fares_pending_sync;
drop policy if exists fares_pending_read_member_or_servant on public.fares_pending_sync;
create policy fares_pending_submit_own on public.fares_pending_sync for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null and reviewed_by is null);
create policy fares_pending_read_member_or_servant on public.fares_pending_sync for select to authenticated using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and exists (
      select 1 from public.users target join public.users me on me.id = auth.uid()
      where target.id = fares_pending_sync.user_id and target.church_class = me.church_class
    )
  )
);
revoke update, delete on public.fares_pending_sync from anon, authenticated;
revoke all on public.fares_pending_sync from anon;
grant select, insert on public.fares_pending_sync to authenticated;

create or replace function public.approve_fares_progress(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare req public.fares_pending_sync%rowtype; reviewer uuid := auth.uid(); role_name text := public.current_role_name(); reviewer_class text; safe_psalms integer[]; safe_hours text[];
begin
  if reviewer is null or role_name not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  select church_class into reviewer_class from public.users where id = reviewer;
  select * into req from public.fares_pending_sync where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'الطلب غير موجود أو تمت مراجعته بالفعل'; end if;
  if role_name <> 'admin' and not exists (
    select 1 from public.users target where target.id = req.user_id and target.role = 'member' and target.status = 'active' and target.church_class = reviewer_class
  ) then raise exception 'لا يمكنك اعتماد طلب عضو خارج فصلك'; end if;
  select coalesce(array_agg(distinct n order by n), '{}') into safe_psalms from unnest(coalesce(req.psalms_list, '{}')) n where n between 1 and 151;
  select coalesce(array_agg(distinct h order by h), '{}') into safe_hours from unnest(coalesce(req.hours_list, '{}')) h where h = any(array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل']::text[]);
  insert into public.psalms_agpeya_progress(user_id, completed_psalms, completed_hours, updated_at)
    values(req.user_id, safe_psalms, safe_hours, now())
    on conflict(user_id) do update set completed_psalms = excluded.completed_psalms, completed_hours = excluded.completed_hours, updated_at = now();
  insert into public.fares_scores(user_id, psalms_points, agpeya_points, updated_at)
    values(req.user_id, cardinality(safe_psalms) * 5, cardinality(safe_hours) * 10, now())
    on conflict(user_id) do update set psalms_points = excluded.psalms_points, agpeya_points = excluded.agpeya_points, updated_at = now();
  update public.fares_pending_sync set status = 'approved', reviewed_at = now(), reviewed_by = reviewer where id = req.id;
end;
$$;
revoke all on function public.approve_fares_progress(uuid) from public, anon;
grant execute on function public.approve_fares_progress(uuid) to authenticated;
-- Disable the old immediate-award RPC so members cannot bypass servant review.
revoke all on function public.save_my_fares_progress(integer[], text[]) from public, anon, authenticated;
