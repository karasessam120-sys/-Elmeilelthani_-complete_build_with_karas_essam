/*
  1) المتصدرون: ترتيب النجوم / فارس الإنجيل / الاختبارات / الحضور / هات أخوك (دالة واحدة)
  2) حلم المخدوم (اختياري) + حماية حجم الصورة والحلم
  3) فارس الإنجيل: تعديل أي نوع نقاط + تحديد بداية ونهاية المسابقة
  ⚠️ شغّله بعد integrity_and_security.sql
*/

-- 2) الحلم والصورة
alter table public.users add column if not exists dream text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_dream_len') then
    alter table public.users add constraint users_dream_len check (dream is null or char_length(dream) <= 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_avatar_len') then
    alter table public.users add constraint users_avatar_len check (avatar_url is null or char_length(avatar_url) <= 60000) not valid;
  end if;
end $$;

-- 3) مواعيد المسابقة
alter table public.fares_scores add column if not exists adjust_psalms int not null default 0;
alter table public.fares_scores add column if not exists adjust_agpeya int not null default 0;

create table if not exists public.fares_contest (
  id int primary key check (id = 1),
  start_date date,
  end_date date,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.fares_contest enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'fares_contest' loop
    execute format('drop policy %I on public.fares_contest', pol.policyname);
  end loop;
end $$;
create policy contest_read on public.fares_contest for select to authenticated using (true);
revoke insert, update, delete on public.fares_contest from anon, authenticated;
grant select on public.fares_contest to authenticated;

-- هل المسابقة شغالة النهاردة؟ (لو مفيش مواعيد = مفتوحة)
create or replace function public.fares_contest_open() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.fares_contest c
    where c.start_date is not null and c.end_date is not null
      and ((now() at time zone 'Africa/Cairo')::date < c.start_date or (now() at time zone 'Africa/Cairo')::date > c.end_date));
$$;

create or replace function public.set_fares_contest(p_start date, p_end date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  if (p_start is null) <> (p_end is null) then raise exception 'حدد تاريخ البداية والنهاية مع بعض'; end if;
  if p_start is not null and p_end < p_start then raise exception 'تاريخ النهاية لازم يبقى بعد البداية'; end if;
  insert into public.fares_contest (id, start_date, end_date, updated_by, updated_at)
  values (1, p_start, p_end, auth.uid(), now())
  on conflict (id) do update set start_date = excluded.start_date, end_date = excluded.end_date, updated_by = auth.uid(), updated_at = now();
end $$;

-- تسجيل التسميع (المزامير والأجبية بتتحسب + أي تعديل يدوي)
create or replace function public.servant_save_progress(p_target_user_id uuid, p_psalms integer[], p_hours text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  staff_role text := public.current_role_name();
  mclass text;
  safe_psalms integer[];
  safe_hours text[];
  today date := (now() at time zone 'Africa/Cairo')::date;
  valid_hours text[] := array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل'];
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if staff_role <> 'admin' and not public.fares_contest_open() then raise exception 'مسابقة فارس الإنجيل مش شغالة دلوقتي (خارج مواعيدها)'; end if;
  select church_class into mclass from public.users where id = p_target_user_id and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;

  select coalesce(array_agg(distinct n order by n), '{}') into safe_psalms from unnest(coalesce(p_psalms, '{}')) n where n between 1 and 151;
  select coalesce(array_agg(distinct h), '{}') into safe_hours from unnest(coalesce(p_hours, '{}')) h where h = any(valid_hours);

  insert into public.psalms_agpeya_progress (user_id, completed_psalms, completed_hours, updated_at)
  values (p_target_user_id, safe_psalms, safe_hours, now())
  on conflict (user_id) do update set completed_psalms = excluded.completed_psalms, completed_hours = excluded.completed_hours, updated_at = now();

  delete from public.agpeya_log where user_id = p_target_user_id and day = today and not (hour = any(safe_hours));
  insert into public.agpeya_log (user_id, day, hour, recorded_by)
    select p_target_user_id, today, h, auth.uid() from unnest(safe_hours) h on conflict do nothing;

  insert into public.fares_scores (user_id) values (p_target_user_id) on conflict (user_id) do nothing;
  update public.fares_scores set
    psalms_points = greatest(0, 5 * cardinality(safe_psalms) + adjust_psalms),
    agpeya_points = greatest(0, 10 * (select count(*) from public.agpeya_log where user_id = p_target_user_id) + adjust_agpeya),
    updated_at = now()
  where user_id = p_target_user_id;
end $$;

-- تعديل نقاط فارس الإنجيل (أي نوع، + أو -)
create or replace function public.award_fares_points(target_user uuid, point_field text, delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare staff_role text := public.current_role_name(); mclass text;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if point_field not in ('liturgy_points','confession_points','psalms_points','agpeya_points') then raise exception 'نوع نقاط غير صالح'; end if;
  if delta = 0 or abs(delta) > 100 then raise exception 'قيمة غير صالحة (من 1 إلى 100)'; end if;
  if staff_role <> 'admin' and not public.fares_contest_open() then raise exception 'مسابقة فارس الإنجيل مش شغالة دلوقتي (خارج مواعيدها)'; end if;
  select church_class into mclass from public.users where id = target_user and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;
  insert into public.fares_scores (user_id) values (target_user) on conflict (user_id) do nothing;
  if point_field = 'liturgy_points' then
    update public.fares_scores set liturgy_points = greatest(0, liturgy_points + delta), updated_at = now() where user_id = target_user;
  elsif point_field = 'confession_points' then
    update public.fares_scores set confession_points = greatest(0, confession_points + delta), updated_at = now() where user_id = target_user;
  elsif point_field = 'psalms_points' then
    update public.fares_scores set adjust_psalms = adjust_psalms + (greatest(0, psalms_points + delta) - psalms_points),
      psalms_points = greatest(0, psalms_points + delta), updated_at = now() where user_id = target_user;
  else
    update public.fares_scores set adjust_agpeya = adjust_agpeya + (greatest(0, agpeya_points + delta) - agpeya_points),
      agpeya_points = greatest(0, agpeya_points + delta), updated_at = now() where user_id = target_user;
  end if;
end $$;

-- 1) المتصدرون (كل الأنواع في استدعاء واحد؛ الصورة بتتبعت لأول 10 في أي ترتيب بس)
create or replace function public.get_leaderboards()
returns table(user_id uuid, full_name text, church_class text, avatar_url text, dream text,
              stars int, fares_points bigint, quiz_points bigint, attendance_present int, attendance_total int, hat_count int)
language sql stable security definer set search_path = public as $$
  with base as (
    select u.id as uid, coalesce(nullif(btrim(u.full_name), ''), 'مخدوم') as fname, u.church_class as cls, u.avatar_url as av, u.dream as dr,
           coalesce(u.stars, 0)::int as st,
           (coalesce(s.liturgy_points, 0) + coalesce(s.confession_points, 0) + coalesce(s.psalms_points, 0) + coalesce(s.agpeya_points, 0))::bigint as fp,
           coalesce((select sum(b.best) from (select max(qa.score) as best from public.quiz_attempts qa where qa.user_id = u.id group by qa.quiz_id) b), 0)::bigint as qp,
           coalesce(u.attendance_present, 0)::int as ap, coalesce(u.attendance_total, 0)::int as atot, coalesce(u.brought_back_count, 0)::int as hc
    from public.users u left join public.fares_scores s on s.user_id = u.id
    where u.role = 'member' and u.status = 'active'
  ), ranked as (
    select base.*,
      row_number() over (order by st desc) r1, row_number() over (order by fp desc) r2, row_number() over (order by qp desc) r3,
      row_number() over (order by ap desc, atot asc) r4, row_number() over (order by hc desc) r5
    from base)
  select uid, fname, cls, case when least(r1, r2, r3, r4, r5) <= 10 then av end, dr, st, fp, qp, ap, atot, hc from ranked;
$$;

revoke all on function public.fares_contest_open() from public, anon;
revoke all on function public.set_fares_contest(date, date) from public, anon;
revoke all on function public.servant_save_progress(uuid, integer[], text[]) from public, anon;
revoke all on function public.award_fares_points(uuid, text, integer) from public, anon;
revoke all on function public.get_leaderboards() from public, anon;
grant execute on function public.fares_contest_open() to authenticated;
grant execute on function public.set_fares_contest(date, date) to authenticated;
grant execute on function public.servant_save_progress(uuid, integer[], text[]) to authenticated;
grant execute on function public.award_fares_points(uuid, text, integer) to authenticated;
grant execute on function public.get_leaderboards() to authenticated;
