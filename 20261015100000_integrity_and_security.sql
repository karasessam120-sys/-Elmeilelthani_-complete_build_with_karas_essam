/*
  تقوية الأمان وحساب النقاط على السيرفر:
  1) حذف الدوال/الجداول القديمة اللي كان ممكن المخدوم يستغلها
  2) الأجبية يومية (agpeya_log) + الخادم يقرا سجل مخدومين فصله (كان ممنوع بالغلط)
  3) النجوم: المخدوم مبقاش يكتبها من المتصفح. الاختبار والاستبدال و"هات أخوك" بقوا دوال على السيرفر
  4) الخادم يشوف ويعدّل مخدومين فصله فقط
  5) حد استخدام يومي للذكاء الاصطناعي لكل خادم
  ⚠️ خد نسخة احتياطية قبل التشغيل. شغّله مرة واحدة (آمن لو اتشغّل تاني).
*/

-- 0) متطلبات (بتتعمل لو مش موجودة، فالملف يشتغل على أي حالة للقاعدة)
create table if not exists public.fares_scores (
  user_id uuid primary key references public.users(id) on delete cascade,
  liturgy_points int not null default 0,
  confession_points int not null default 0,
  psalms_points int not null default 0,
  agpeya_points int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.fares_scores add column if not exists liturgy_points int not null default 0;
alter table public.fares_scores add column if not exists confession_points int not null default 0;
alter table public.fares_scores add column if not exists psalms_points int not null default 0;
alter table public.fares_scores add column if not exists agpeya_points int not null default 0;
alter table public.fares_scores add column if not exists updated_at timestamptz not null default now();
alter table public.fares_scores enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'fares_scores' loop
    execute format('drop policy %I on public.fares_scores', pol.policyname);
  end loop;
end $$;
create policy scores_select on public.fares_scores for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
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
revoke insert, update, delete on public.psalms_agpeya_progress from anon, authenticated;
grant select on public.psalms_agpeya_progress to authenticated;

-- حذف نظام فارس القديم (fares_checks / fares_awards) لأن المخدوم كان يقدر يكتب فيه
-- (النقاط الحالية في fares_scores بتفضل زي ما هي)
drop table if exists public.fares_checks cascade;
drop table if exists public.fares_awards cascade;
drop view if exists public.fares_leaderboard;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('fares_recalc','fares_checks_validate','fares_after_change','fares_award','fares_award_remove')
  loop execute 'drop function ' || r.sig; end loop;
end $$;

-- ترتيب فارس الإنجيل (اسم + فصل + مجموع فقط)
create or replace function public.get_fares_leaderboard()
returns table(user_id uuid, full_name text, church_class text, total_points bigint)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(btrim(u.full_name), ''), 'مخدوم'), u.church_class,
         (coalesce(s.liturgy_points, 0)::bigint + coalesce(s.confession_points, 0)::bigint
          + coalesce(s.psalms_points, 0)::bigint + coalesce(s.agpeya_points, 0)::bigint) as total_points
  from public.users u left join public.fares_scores s on s.user_id = u.id
  where u.role = 'member' and u.status = 'active'
  order by total_points desc, 2 asc;
$$;
revoke all on function public.get_fares_leaderboard() from public, anon;
grant execute on function public.get_fares_leaderboard() to authenticated;

-- 1) حذف القديم (كل النسخ بنفس الاسم)
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('save_my_fares_progress','approve_fares_progress','servant_save_progress','award_fares_points')
  loop execute 'drop function ' || r.sig; end loop;
end $$;
drop table if exists public.fares_pending_sync;

-- 2) الأجبية اليومية
create table if not exists public.agpeya_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  hour text not null check (hour in ('باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل')),
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, hour)
);
alter table public.agpeya_log enable row level security;
drop policy if exists agpeya_log_read on public.agpeya_log;
create policy agpeya_log_read on public.agpeya_log for select to authenticated using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and public.my_class() <> '' and exists (
      select 1 from public.users u where u.id = agpeya_log.user_id and u.church_class = public.my_class())));
revoke insert, update, delete on public.agpeya_log from anon, authenticated;
grant select on public.agpeya_log to authenticated;

drop policy if exists progress_own_read on public.psalms_agpeya_progress;
create policy progress_own_read on public.psalms_agpeya_progress for select to authenticated using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and public.my_class() <> '' and exists (
      select 1 from public.users u where u.id = psalms_agpeya_progress.user_id and u.church_class = public.my_class())));

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
  select church_class into mclass from public.users where id = p_target_user_id and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;

  select coalesce(array_agg(distinct n order by n), '{}') into safe_psalms from unnest(coalesce(p_psalms, '{}')) n where n between 1 and 151;
  select coalesce(array_agg(distinct h), '{}') into safe_hours from unnest(coalesce(p_hours, '{}')) h where h = any(valid_hours);

  insert into public.psalms_agpeya_progress (user_id, completed_psalms, completed_hours, updated_at)
  values (p_target_user_id, safe_psalms, safe_hours, now())
  on conflict (user_id) do update set completed_psalms = excluded.completed_psalms, completed_hours = excluded.completed_hours, updated_at = now();

  -- ساعات النهاردة بس: كل ساعة بـ 10 نقاط في اليوم
  delete from public.agpeya_log where user_id = p_target_user_id and day = today and not (hour = any(safe_hours));
  insert into public.agpeya_log (user_id, day, hour, recorded_by)
    select p_target_user_id, today, h, auth.uid() from unnest(safe_hours) h on conflict do nothing;

  insert into public.fares_scores (user_id, psalms_points, agpeya_points, updated_at)
  values (p_target_user_id, 5 * cardinality(safe_psalms), 10 * (select count(*) from public.agpeya_log where user_id = p_target_user_id), now())
  on conflict (user_id) do update set psalms_points = excluded.psalms_points, agpeya_points = excluded.agpeya_points, updated_at = now();
end $$;

-- تعديل نقاط القداس والاعتراف فقط (المزامير والأجبية بتتحسب من التسميع)
create or replace function public.award_fares_points(target_user uuid, point_field text, delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare staff_role text := public.current_role_name(); mclass text;
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if point_field not in ('liturgy_points','confession_points') then raise exception 'نقاط المزامير والأجبية بتتحسب من التسميع'; end if;
  if delta = 0 or abs(delta) > 100 then raise exception 'قيمة غير صالحة'; end if;
  select church_class into mclass from public.users where id = target_user and role = 'member' and status = 'active';
  if not found then raise exception 'المخدوم غير موجود'; end if;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass <> public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;
  insert into public.fares_scores (user_id) values (target_user) on conflict (user_id) do nothing;
  if point_field = 'liturgy_points' then
    update public.fares_scores set liturgy_points = greatest(0, liturgy_points + delta), updated_at = now() where user_id = target_user;
  else
    update public.fares_scores set confession_points = greatest(0, confession_points + delta), updated_at = now() where user_id = target_user;
  end if;
end $$;

-- 3) النجوم: تعديل من السيرفر فقط
create or replace function public.guard_user_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if current_setting('app.system_update', true) = 'on' or current_setting('app.allow_username_change', true) = 'on' then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role
     or new.status is distinct from old.status or new.username is distinct from old.username then
    raise exception 'غير مسموح';
  end if;
  if not public.is_staff() and (
       new.stars is distinct from old.stars or new.attendance_present is distinct from old.attendance_present
    or new.attendance_total is distinct from old.attendance_total or new.brought_back_count is distinct from old.brought_back_count
    or new.last_quiz_score is distinct from old.last_quiz_score or new.last_quiz_total is distinct from old.last_quiz_total) then
    raise exception 'النجوم بتتعدل من السيرفر فقط';
  end if;
  return new;
end $$;

create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); u record; q record; qs jsonb; i int; total int; correct int := 0;
  prev_best int; gain int; new_stars int; a text; c text;
begin
  select * into u from public.users where id = me and role = 'member' and status = 'active';
  if not found then raise exception 'غير مسموح'; end if;
  select * into q from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'الاختبار غير موجود'; end if;
  if coalesce(q.church_class, '') <> '' and q.church_class <> u.church_class then raise exception 'الاختبار مش لفصلك'; end if;
  if q.expiry_date is not null and q.expiry_date < now() then raise exception 'الاختبار انتهى'; end if;

  qs := coalesce(q.questions, '[]'::jsonb);
  if jsonb_typeof(qs) <> 'array' or jsonb_array_length(qs) = 0 then
    qs := jsonb_build_array(jsonb_build_object('correct_answer', q.correct_answer));
  end if;
  total := jsonb_array_length(qs);
  for i in 0 .. total - 1 loop
    c := qs -> i ->> 'correct_answer';
    a := p_answers ->> ('q' || i);
    if lower(btrim(coalesce(a, ''))) = lower(btrim(coalesce(c, ''))) then correct := correct + 1; end if;
  end loop;

  select coalesce(max(score), 0) into prev_best from public.quiz_attempts where quiz_id = p_quiz_id and user_id = me;
  insert into public.quiz_attempts (quiz_id, user_id, score, total, answers) values (p_quiz_id, me, correct, total, coalesce(p_answers, '{}'::jsonb));
  -- النجوم بتتدّي على التحسّن بس، فإعادة الاختبار مش بتكرر نفس النجوم
  gain := greatest(0, correct - prev_best) * coalesce(q.stars_per_question, 10);

  perform set_config('app.system_update', 'on', true);
  update public.users set stars = coalesce(stars, 0) + gain, last_quiz_score = correct, last_quiz_total = total
   where id = me returning stars into new_stars;
  perform set_config('app.system_update', 'off', true);
  return jsonb_build_object('score', correct, 'total', total, 'earned', gain, 'stars', new_stars);
end $$;

create or replace function public.redeem_reward(p_reward_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u record; r record; new_stars int;
begin
  select * into u from public.users where id = me and role = 'member' and status = 'active' for update;
  if not found then raise exception 'غير مسموح'; end if;
  select * into r from public.rewards where id = p_reward_id;
  if not found or not r.in_stock then raise exception 'الهدية غير متاحة'; end if;
  if coalesce(u.stars, 0) < r.price_stars then raise exception 'لا توجد نجوم كافية لاستبدال هذه الهدية'; end if;
  perform set_config('app.system_update', 'on', true);
  update public.users set stars = stars - r.price_stars where id = me returning stars into new_stars;
  perform set_config('app.system_update', 'off', true);
  insert into public.reward_redemptions (user_id, user_name, reward_id, reward_title, price_stars, status)
  values (me, u.full_name, r.id, r.title, r.price_stars, 'pending');
  return new_stars;
end $$;

create or replace function public.review_hat_akhook(p_upload_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare up record; mclass text; staff_role text := public.current_role_name();
begin
  if auth.uid() is null or staff_role not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  select * into up from public.hat_akhook_uploads where id = p_upload_id and status = 'pending';
  if not found then raise exception 'الطلب غير موجود أو اتراجع قبل كده'; end if;
  select church_class into mclass from public.users where id = up.member_id;
  if staff_role <> 'admin' and (public.my_class() = '' or mclass is distinct from public.my_class()) then raise exception 'المخدوم لا يتبع فصلك'; end if;
  if p_approve then
    perform set_config('app.system_update', 'on', true);
    update public.users set stars = coalesce(stars, 0) + 20, brought_back_count = coalesce(brought_back_count, 0) + 1 where id = up.member_id;
    perform set_config('app.system_update', 'off', true);
    update public.absent_peers set status = 'returned' where id = up.peer_id;
    update public.hat_akhook_uploads set status = 'approved' where id = p_upload_id;
  else
    update public.hat_akhook_uploads set status = 'rejected' where id = p_upload_id;
  end if;
end $$;

-- المخدوم مبقاش يكتب في نتايج الاختبار والاستبدال مباشرة
drop policy if exists own_insert on public.quiz_attempts;
drop policy if exists own_insert on public.reward_redemptions;

-- 4) الخادم يشوف ويعدّل مخدومين فصله فقط
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and role = 'member' and public.my_class() <> '' and church_class = public.my_class()));
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and role = 'member' and public.my_class() <> '' and church_class = public.my_class()))
  with check (id = auth.uid() or public.is_admin() or (
    public.current_role_name() = 'servant' and role = 'member' and public.my_class() <> '' and church_class = public.my_class()));

-- 5) حد يومي للذكاء الاصطناعي (الأدمن بدون حد)
create table if not exists public.ai_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.consume_ai_quota(p_cost int default 1) returns boolean
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Africa/Cairo')::date; used int; lim int := 120;
begin
  if not public.is_staff() then return false; end if;
  if public.is_admin() then return true; end if;
  insert into public.ai_usage (user_id, day, count) values (auth.uid(), d, 0) on conflict do nothing;
  update public.ai_usage set count = count + greatest(p_cost, 1)
   where user_id = auth.uid() and day = d and count + greatest(p_cost, 1) <= lim returning count into used;
  return used is not null;
end $$;

-- صلاحيات تنفيذ الدوال
revoke all on function public.servant_save_progress(uuid, integer[], text[]) from public, anon;
revoke all on function public.award_fares_points(uuid, text, integer) from public, anon;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
revoke all on function public.redeem_reward(uuid) from public, anon;
revoke all on function public.review_hat_akhook(uuid, boolean) from public, anon;
revoke all on function public.consume_ai_quota(int) from public, anon;
grant execute on function public.servant_save_progress(uuid, integer[], text[]) to authenticated;
grant execute on function public.award_fares_points(uuid, text, integer) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.review_hat_akhook(uuid, boolean) to authenticated;
grant execute on function public.consume_ai_quota(int) to authenticated;
