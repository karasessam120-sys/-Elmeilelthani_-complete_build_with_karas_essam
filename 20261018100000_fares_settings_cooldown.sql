/*
  نظام نقاط فارس الإنجيل:
  1) "تعديل النقاط" بقى بيضبط قيمة النقاط لكل نشاط (قداس / اعتراف / مزمور / ساعة أجبية) مش زيادة وخصم
  2) الاعتراف: بعد ما يتسجّل لمخدوم ما ينفعش يتسجّل تاني غير بعد مدة (الافتراضي 30 يوم بالأيام)
  3) سجل تسجيلات القداس والاعتراف + تراجع عن الغلط (الخادم بتاعه لحد 48 ساعة، والأدمن أي وقت)
  ⚠️ شغّله بعد leaderboards_dream_contest.sql
*/

-- الإعدادات
create table if not exists public.fares_settings (
  id int primary key check (id = 1),
  liturgy_points int not null default 5 check (liturgy_points between 0 and 100),
  confession_points int not null default 10 check (confession_points between 0 and 100),
  psalm_points int not null default 5 check (psalm_points between 0 and 100),
  agpeya_hour_points int not null default 10 check (agpeya_hour_points between 0 and 100),
  confession_cooldown_days int not null default 30 check (confession_cooldown_days between 0 and 365),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.fares_settings (id) values (1) on conflict (id) do nothing;
alter table public.fares_settings enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'fares_settings' loop
    execute format('drop policy %I on public.fares_settings', pol.policyname);
  end loop;
end $$;
create policy settings_read on public.fares_settings for select to authenticated using (true);
revoke insert, update, delete on public.fares_settings from anon, authenticated;
grant select on public.fares_settings to authenticated;

-- سجل القداس والاعتراف
create table if not exists public.fares_award_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('liturgy','confession')),
  points int not null check (points >= 0),
  day date not null default ((now() at time zone 'Africa/Cairo')::date),
  by_user uuid default auth.uid() references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fares_award_log_idx on public.fares_award_log (user_id, kind, day desc);
alter table public.fares_award_log enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'fares_award_log' loop
    execute format('drop policy %I on public.fares_award_log', pol.policyname);
  end loop;
end $$;
create policy award_log_select on public.fares_award_log for select to authenticated using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and public.my_class() <> '' and exists (
      select 1 from public.users u where u.id = fares_award_log.user_id and u.church_class = public.my_class())));
revoke insert, update, delete on public.fares_award_log from anon, authenticated;
grant select on public.fares_award_log to authenticated;

-- حذف التعديل اليدوي (+/-) لأنه كان بيتخطى قاعدة الانتظار
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'award_fares_points'
  loop execute 'drop function ' || r.sig; end loop;
end $$;

-- ضبط قيم النقاط (الخادم أو الأدمن)
create or replace function public.set_fares_settings(p_liturgy int, p_confession int, p_psalm int, p_agpeya int, p_cooldown int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  if least(p_liturgy, p_confession, p_psalm, p_agpeya) < 0 or greatest(p_liturgy, p_confession, p_psalm, p_agpeya) > 100 then
    raise exception 'النقاط لازم تكون من 0 إلى 100';
  end if;
  if p_cooldown < 0 or p_cooldown > 365 then raise exception 'مدة الانتظار من 0 إلى 365 يوم'; end if;
  insert into public.fares_settings (id, liturgy_points, confession_points, psalm_points, agpeya_hour_points, confession_cooldown_days, updated_by, updated_at)
  values (1, p_liturgy, p_confession, p_psalm, p_agpeya, p_cooldown, auth.uid(), now())
  on conflict (id) do update set liturgy_points = excluded.liturgy_points, confession_points = excluded.confession_points,
    psalm_points = excluded.psalm_points, agpeya_hour_points = excluded.agpeya_hour_points,
    confession_cooldown_days = excluded.confession_cooldown_days, updated_by = auth.uid(), updated_at = now();
  -- المزامير والأجبية بتتحسب من جديد لكل المخدومين بالقيم الجديدة
  update public.fares_scores f set
    psalms_points = greatest(0, p_psalm * coalesce((select cardinality(pr.completed_psalms) from public.psalms_agpeya_progress pr where pr.user_id = f.user_id), 0) + f.adjust_psalms),
    agpeya_points = greatest(0, p_agpeya * (select count(*) from public.agpeya_log al where al.user_id = f.user_id) + f.adjust_agpeya),
    updated_at = now();
end $$;

-- تسجيل قداس أو اعتراف (القيمة من الإعدادات، والاعتراف له مدة انتظار)
create or replace function public.record_fares_activity(p_member uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  staff_role text := public.current_role_name();
  mclass text; s record; pts int; cool int := 0; last_day date;
  today date := (now() at time zone 'Africa/Cairo')::date;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if p_kind not in ('liturgy','confession') then raise exception 'نوع غير صالح'; end if;
  if staff_role <> 'admin' and not public.fares_contest_open() then raise exception 'مسابقة فارس الإنجيل مش شغالة دلوقتي (خارج مواعيدها)'; end if;
  select church_class into mclass from public.users where id = p_member and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;
  select * into s from public.fares_settings where id = 1;

  if p_kind = 'liturgy' then
    pts := coalesce(s.liturgy_points, 5);
    if exists (select 1 from public.fares_award_log where user_id = p_member and kind = 'liturgy' and day = today) then
      raise exception 'القداس اتسجّل للمخدوم ده النهاردة قبل كده';
    end if;
  else
    pts := coalesce(s.confession_points, 10);
    cool := coalesce(s.confession_cooldown_days, 30);
    if staff_role <> 'admin' and cool > 0 then
      select max(day) into last_day from public.fares_award_log where user_id = p_member and kind = 'confession';
      if last_day is not null and last_day + cool > today then
        raise exception 'آخر اعتراف اتسجّل يوم %. التسجيل الجاي متاح من يوم % (بعد % يوم).', last_day, last_day + cool, cool;
      end if;
    end if;
  end if;

  insert into public.fares_award_log (user_id, kind, points) values (p_member, p_kind, pts);
  insert into public.fares_scores (user_id) values (p_member) on conflict (user_id) do nothing;
  if p_kind = 'liturgy' then
    update public.fares_scores set liturgy_points = liturgy_points + pts, updated_at = now() where user_id = p_member;
  else
    update public.fares_scores set confession_points = confession_points + pts, updated_at = now() where user_id = p_member;
  end if;
  return jsonb_build_object('points', pts, 'kind', p_kind);
end $$;

-- تراجع عن تسجيل غلط
create or replace function public.undo_fares_activity(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare staff_role text := public.current_role_name(); a record; mclass text;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  select * into a from public.fares_award_log where id = p_id;
  if not found then return; end if;
  if staff_role <> 'admin' then
    select church_class into mclass from public.users where id = a.user_id;
    if public.my_class() = '' or mclass is distinct from public.my_class() then raise exception 'المخدوم لا يتبع فصلك'; end if;
    if a.by_user is distinct from auth.uid() then raise exception 'تقدر تتراجع عن تسجيلاتك انت بس'; end if;
    if a.created_at < now() - interval '48 hours' then raise exception 'عدّى أكتر من 48 ساعة على التسجيل'; end if;
  end if;
  delete from public.fares_award_log where id = p_id;
  if a.kind = 'liturgy' then
    update public.fares_scores set liturgy_points = greatest(0, liturgy_points - a.points), updated_at = now() where user_id = a.user_id;
  else
    update public.fares_scores set confession_points = greatest(0, confession_points - a.points), updated_at = now() where user_id = a.user_id;
  end if;
end $$;

-- تسجيل التسميع بقيم الإعدادات
create or replace function public.servant_save_progress(p_target_user_id uuid, p_psalms integer[], p_hours text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  staff_role text := public.current_role_name();
  mclass text; safe_psalms integer[]; safe_hours text[]; sp int; ap int;
  today date := (now() at time zone 'Africa/Cairo')::date;
  valid_hours text[] := array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل'];
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if staff_role <> 'admin' and not public.fares_contest_open() then raise exception 'مسابقة فارس الإنجيل مش شغالة دلوقتي (خارج مواعيدها)'; end if;
  select church_class into mclass from public.users where id = p_target_user_id and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;
  select coalesce(psalm_points, 5), coalesce(agpeya_hour_points, 10) into sp, ap from public.fares_settings where id = 1;
  sp := coalesce(sp, 5); ap := coalesce(ap, 10);

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
    psalms_points = greatest(0, sp * cardinality(safe_psalms) + adjust_psalms),
    agpeya_points = greatest(0, ap * (select count(*) from public.agpeya_log where user_id = p_target_user_id) + adjust_agpeya),
    updated_at = now()
  where user_id = p_target_user_id;
end $$;

revoke all on function public.set_fares_settings(int, int, int, int, int) from public, anon;
revoke all on function public.record_fares_activity(uuid, text) from public, anon;
revoke all on function public.undo_fares_activity(uuid) from public, anon;
revoke all on function public.servant_save_progress(uuid, integer[], text[]) from public, anon;
grant execute on function public.set_fares_settings(int, int, int, int, int) to authenticated;
grant execute on function public.record_fares_activity(uuid, text) to authenticated;
grant execute on function public.undo_fares_activity(uuid) to authenticated;
grant execute on function public.servant_save_progress(uuid, integer[], text[]) to authenticated;
