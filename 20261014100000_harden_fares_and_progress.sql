-- Harden Fares scoring and persist Psalms/Agpeya progress.
-- Review this migration in Supabase SQL Editor before applying to production.
create table if not exists public.fares_scores (
  user_id uuid primary key references public.users(id) on delete cascade,
  liturgy_points integer not null default 0 check (liturgy_points >= 0),
  confession_points integer not null default 0 check (confession_points >= 0),
  psalms_points integer not null default 0 check (psalms_points >= 0),
  agpeya_points integer not null default 0 check (agpeya_points >= 0),
  updated_at timestamptz not null default now()
);
alter table public.fares_scores add column if not exists liturgy_points integer not null default 0;
alter table public.fares_scores add column if not exists confession_points integer not null default 0;
alter table public.fares_scores add column if not exists psalms_points integer not null default 0;
alter table public.fares_scores add column if not exists agpeya_points integer not null default 0;
alter table public.fares_scores add column if not exists updated_at timestamptz not null default now();
create unique index if not exists fares_scores_user_id_uidx on public.fares_scores(user_id);
alter table public.fares_scores enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='fares_scores' loop
    execute format('drop policy %I on public.fares_scores', pol.policyname);
  end loop;
end $$;
drop policy if exists fares_scores_read on public.fares_scores;
drop policy if exists scores_select on public.fares_scores;
drop policy if exists scores_update on public.fares_scores;
drop policy if exists scores_insert on public.fares_scores;
drop policy if exists scores_select on public.fares_scores;
create policy fares_scores_read on public.fares_scores for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or (public.current_role_name() = 'servant' and exists (
    select 1 from public.users target where target.id = fares_scores.user_id and target.church_class = (
      select me.church_class from public.users me where me.id = auth.uid()
    )
  )));
-- Clients may read allowed scores, but may not write scores directly.
revoke insert, update, delete on public.fares_scores from anon, authenticated;
grant select on public.fares_scores to authenticated;

create table if not exists public.psalms_agpeya_progress (
  user_id uuid primary key references public.users(id) on delete cascade,
  completed_psalms integer[] not null default '{}',
  completed_hours text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint valid_psalms check (0 < all(completed_psalms) and 151 >= all(completed_psalms)),
  constraint valid_hours check (completed_hours <@ array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل']::text[])
);
alter table public.psalms_agpeya_progress enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='psalms_agpeya_progress' loop
    execute format('drop policy %I on public.psalms_agpeya_progress', pol.policyname);
  end loop;
end $$;
drop policy if exists progress_own_read on public.psalms_agpeya_progress;
create policy progress_own_read on public.psalms_agpeya_progress for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.psalms_agpeya_progress from anon, authenticated;
grant select on public.psalms_agpeya_progress to authenticated;

create or replace function public.save_my_fares_progress(p_psalms integer[], p_hours text[])
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); safe_psalms integer[]; safe_hours text[];
begin
  if uid is null or public.current_role_name() <> 'member' then raise exception 'غير مسموح'; end if;
  select coalesce(array_agg(distinct n order by n), '{}') into safe_psalms
    from unnest(coalesce(p_psalms, '{}')) n where n between 1 and 151;
  select coalesce(array_agg(distinct h order by h), '{}') into safe_hours
    from unnest(coalesce(p_hours, '{}')) h where h = any(array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل']::text[]);
  insert into public.psalms_agpeya_progress(user_id, completed_psalms, completed_hours, updated_at)
    values(uid, safe_psalms, safe_hours, now())
    on conflict(user_id) do update set completed_psalms = excluded.completed_psalms,
      completed_hours = excluded.completed_hours, updated_at = now();
  insert into public.fares_scores(user_id, psalms_points, agpeya_points, updated_at)
    values(uid, cardinality(safe_psalms) * 5, cardinality(safe_hours) * 10, now())
    on conflict(user_id) do update set psalms_points = excluded.psalms_points,
      agpeya_points = excluded.agpeya_points, updated_at = now();
end $$;
revoke all on function public.save_my_fares_progress(integer[], text[]) from public, anon;
grant execute on function public.save_my_fares_progress(integer[], text[]) to authenticated;

create or replace function public.award_fares_points(target_user uuid, point_field text, delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare staff_role text := public.current_role_name(); staff_class text;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if delta not between -100 and 100 then raise exception 'قيمة النقاط غير مسموحة'; end if;
  if point_field not in ('liturgy_points','confession_points','psalms_points','agpeya_points') then raise exception 'نوع النقاط غير صحيح'; end if;
  select church_class into staff_class from public.users where id = auth.uid();
  if staff_role <> 'admin' and not exists (select 1 from public.users where id = target_user and role='member' and status='active' and church_class = staff_class) then
    raise exception 'لا يمكنك تعديل نقاط عضو خارج فصلك';
  end if;
  if not exists (select 1 from public.users where id = target_user and role='member' and status='active') then raise exception 'العضو غير موجود أو غير نشط'; end if;
  insert into public.fares_scores(user_id) values(target_user) on conflict(user_id) do nothing;
  if point_field = 'liturgy_points' then update public.fares_scores set liturgy_points = greatest(0,liturgy_points+delta), updated_at=now() where user_id=target_user;
  elsif point_field = 'confession_points' then update public.fares_scores set confession_points = greatest(0,confession_points+delta), updated_at=now() where user_id=target_user;
  elsif point_field = 'psalms_points' then update public.fares_scores set psalms_points = greatest(0,psalms_points+delta), updated_at=now() where user_id=target_user;
  else update public.fares_scores set agpeya_points = greatest(0,agpeya_points+delta), updated_at=now() where user_id=target_user;
  end if;
end $$;
revoke all on function public.award_fares_points(uuid,text,integer) from public, anon;
grant execute on function public.award_fares_points(uuid,text,integer) to authenticated;
