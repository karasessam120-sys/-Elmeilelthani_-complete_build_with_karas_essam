/*
  فارس الإنجيل: تسجيل يوم وساعة الاعتراف
  1) الخادم لما يسجّل اعتراف بيكتب المخدوم راح يوم إيه (إجباري) والساعة كام (اختياري)
  2) يوم الاعتراف هو اللي بيتحسب منه مدة الانتظار بين اعترافين
  3) الأدمن يقدر يشوف الأجبية في آخر أيام لأي مخدوم (القراءة متاحة له من قبل كده)
  ⚠️ شغّله بعد fares_settings_cooldown.sql
*/

alter table public.fares_award_log add column if not exists confession_time time;

-- الدالة القديمة (بدون يوم وساعة) تتشال عشان ما يحصلش تعارض
drop function if exists public.record_fares_activity(uuid, text);

create or replace function public.record_fares_activity(p_member uuid, p_kind text, p_day date default null, p_time time default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  staff_role text := public.current_role_name();
  mclass text; s record; pts int; cool int := 0; last_day date; d date;
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
    d := today;
    pts := coalesce(s.liturgy_points, 5);
    if exists (select 1 from public.fares_award_log where user_id = p_member and kind = 'liturgy' and day = today) then
      raise exception 'القداس اتسجّل للمخدوم ده النهاردة قبل كده';
    end if;
  else
    d := coalesce(p_day, today);
    if d > today then raise exception 'يوم الاعتراف لا يمكن أن يكون في المستقبل'; end if;
    if d < today - 365 then raise exception 'يوم الاعتراف قديم جدًا (أكتر من سنة)'; end if;
    pts := coalesce(s.confession_points, 10);
    cool := coalesce(s.confession_cooldown_days, 30);
    if staff_role <> 'admin' and cool > 0 then
      select max(day) into last_day from public.fares_award_log where user_id = p_member and kind = 'confession';
      if last_day is not null and last_day + cool > d then
        raise exception 'آخر اعتراف اتسجّل يوم %. التسجيل الجاي متاح من يوم % (بعد % يوم).', last_day, last_day + cool, cool;
      end if;
    end if;
  end if;

  insert into public.fares_award_log (user_id, kind, points, day, confession_time)
  values (p_member, p_kind, pts, d, case when p_kind = 'confession' then p_time else null end);
  insert into public.fares_scores (user_id) values (p_member) on conflict (user_id) do nothing;
  if p_kind = 'liturgy' then
    update public.fares_scores set liturgy_points = liturgy_points + pts, updated_at = now() where user_id = p_member;
  else
    update public.fares_scores set confession_points = confession_points + pts, updated_at = now() where user_id = p_member;
  end if;
  return jsonb_build_object('points', pts, 'kind', p_kind);
end $$;

revoke all on function public.record_fares_activity(uuid, text, date, time) from public, anon;
grant execute on function public.record_fares_activity(uuid, text, date, time) to authenticated;
