/*
  الرسائل (الجرس) + رسالة الترحيب + رسائل الفصل + استعادة كلمة السر بكلمة مؤقتة (30 دقيقة)

  1) جدول messages: كل رسالة لمستخدم واحد. المخدوم والخادم يقروا رسايلهم بس. الكتابة من دوال السيرفر بس.
  2) رسالة ترحيب تلقائية لما حساب الخادم يتعتمد من الأدمن أو لما مخدوم جديد يسجّل.
  3) send_class_message: الخادم يبعت لمخدومين فصله بس (اختبار، هدية، غائب، آية، رسالة عادية).
  4) استعادة كلمة السر:
     - المستخدم يطلب من صفحة الدخول، والطلب بيوصل للأدمن (رسالة + قايمة طلبات).
     - الأدمن يوافق ويحدد كلمة مؤقتة (أو تتولّد تلقائي).
     - المستخدم يفتح الرسالة من نفس الجهاز اللي طلب منه (برمز سري محفوظ في الجهاز) فتتفعّل الكلمة 30 دقيقة.
     - لما يدخل بيها لازم يغيّر كلمة السر علطول. بعد 30 دقيقة الكلمة المؤقتة بتبطل.
  ⚠️ شغّله بعد كل الملفات اللي قبله (آخرها 20261021100000_confession_day_time.sql).
  ⚠️ عشان الانتهاء ينفّذ نفسه كل دقيقة فعّل pg_cron من Database ثم Extensions. من غيره الانتهاء بيتنفّذ لما حد يستخدم الدوال، والحماية اللي في current_role_name بتفضل شغالة.
*/
create extension if not exists pgcrypto with schema extensions;

-- امسح أي نسخة قديمة من الدوال دي (لو كانت موجودة بنوع رجوع مختلف) قبل إنشائها من جديد
drop function if exists public.mark_messages_read(uuid[]);
drop function if exists public.send_class_message(text, text, text, text, text);
drop function if exists public.expire_temp_passwords();
drop function if exists public.request_password_reset(text);
drop function if exists public.reset_status(text);
drop function if exists public.open_reset_message(text);
drop function if exists public.admin_list_reset_requests();
drop function if exists public.admin_approve_reset(uuid, text);
drop function if exists public.admin_reject_reset(uuid);
drop function if exists public.my_security_state();
drop function if exists public.change_my_password(text);

-- ============ 1) الرسائل ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'info' check (kind in ('welcome','quiz','reward','absent','verse','reset_request','info')),
  title text not null,
  body text not null,
  icon text not null default 'Bell',
  sender_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_user_idx on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' loop
    execute format('drop policy %I on public.messages', pol.policyname);
  end loop;
end $$;
create policy messages_select on public.messages for select to authenticated using (user_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (user_id = auth.uid());
revoke all on public.messages from anon, authenticated;
grant select, delete on public.messages to authenticated;

create or replace function public.mark_messages_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;
revoke all on function public.mark_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_messages_read(uuid[]) to authenticated;

-- الرسائل توصل لحظيًا (لو الـ Realtime مش متاح التطبيق بيحدّث كل دقيقة)
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null;
end $$;

-- ============ 2) رسالة الترحيب ============
create or replace function public.send_welcome_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text := coalesce(nullif(btrim(new.full_name), ''), 'يا غالي');
begin
  if new.status <> 'active' or new.role not in ('member','servant') then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  if exists (select 1 from public.messages where user_id = new.id and kind = 'welcome') then return new; end if;

  if new.role = 'servant' then
    insert into public.messages (user_id, kind, title, body, icon) values (
      new.id, 'welcome',
      'أهلًا بيك يا ' || nm || ' 🕊️',
      E'تم قبول حسابك كخادم في الميل الثاني. 🌿\nفرحانين إنك معانا في خدمة كنيسة ماريوحنا الحبيب، وربنا يبارك خدمتك ويديك محبة ونعمة لكل مخدوم في فصلك.\n\n«فَإِنَّنَا نَحْنُ عَامِلاَنِ مَعَ ٱللهِ» (١ كو ٣: ٩)\n\nتقدر دلوقتي تبدأ خدمتك: سجّل الحضور، ضيف اختبارات وهدايا، وتابع مخدومينك. ربنا معاك. ✨',
      'Crown');
  else
    insert into public.messages (user_id, kind, title, body, icon) values (
      new.id, 'welcome',
      'نورت الميل الثاني يا ' || nm || ' 🎉',
      E'فرحانين بيك معانا في كنيسة ماريوحنا الحبيب! 🌟\nهنا هتلاقي اختبارات وهدايا ونجوم وفارس الإنجيل، وكل أسبوع فرصة جديدة تكسب فيها وتتقدم.\n\n«فَرِحْتُ بِٱلْقَائِلِينَ لِي: إِلَى بَيْتِ ٱلرَّبِّ نَذْهَبُ» (مز ١٢٢: ١)\n\nابدأ بجولة سريعة في التطبيق، وهات أخوك معاك. ربنا يفرّح قلبك. 🕊️',
      'Crown');
  end if;
  return new;
end $$;
drop trigger if exists send_welcome_message on public.users;
create trigger send_welcome_message after insert or update of status on public.users
  for each row execute function public.send_welcome_message();

-- ============ 3) رسائل الفصل ============
create or replace function public.send_class_message(p_kind text, p_title text, p_body text, p_icon text default 'Bell', p_class text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare r text := public.current_role_name(); cls text; n integer;
begin
  if auth.uid() is null or r not in ('servant','admin') then raise exception 'غير مسموح'; end if;
  if p_kind not in ('quiz','reward','absent','verse','info') then raise exception 'نوع رسالة غير صالح'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'الرسالة فاضية'; end if;
  if length(p_title) > 120 or length(p_body) > 1000 then raise exception 'الرسالة طويلة'; end if;
  if r = 'servant' then
    cls := public.my_class();
    if coalesce(cls, '') = '' then raise exception 'لم يتم تعيين فصل لك'; end if;
  else
    cls := nullif(btrim(coalesce(p_class, '')), '');
  end if;
  insert into public.messages (user_id, kind, title, body, icon, sender_id)
    select u.id, p_kind, btrim(p_title), btrim(p_body), coalesce(nullif(p_icon, ''), 'Bell'), auth.uid()
    from public.users u
    where u.role = 'member' and u.status = 'active' and (cls is null or u.church_class = cls);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.send_class_message(text, text, text, text, text) from public, anon;
grant execute on function public.send_class_message(text, text, text, text, text) to authenticated;

-- ============ 4) كلمة السر المؤقتة ============
alter table public.password_resets
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists token_hash text,
  add column if not exists temp_password text,
  add column if not exists approved_by uuid references public.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists expires_at timestamptz;
create index if not exists password_resets_token_idx on public.password_resets (token_hash);

-- الجدول مقفول: الكل بيتعامل معاه من الدوال بس (الخدام ما يشوفوش كلمات السر المؤقتة)
alter table public.password_resets enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'password_resets' loop
    execute format('drop policy %I on public.password_resets', pol.policyname);
  end loop;
end $$;
revoke all on public.password_resets from anon, authenticated;

-- حالة أمان الحساب: لازم يغيّر كلمة السر، وانتهاء المؤقتة
create table if not exists public.account_security (
  user_id uuid primary key references public.users(id) on delete cascade,
  must_change boolean not null default false,
  temp_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.account_security enable row level security;
revoke all on public.account_security from anon, authenticated;

-- حساب انتهت كلمته المؤقتة ما يشتغلش في صلاحيات الخادم والأدمن لحد ما يغيّر كلمة السر
create or replace function public.current_role_name() returns text language sql stable security definer set search_path = public as $$
  select u.role from public.users u
  where u.id = auth.uid() and u.status = 'active'
    and not exists (select 1 from public.account_security s where s.user_id = u.id and s.temp_expires_at is not null and s.temp_expires_at <= now())
$$;

-- تنفيذ الانتهاء: الكلمة المؤقتة بعد 30 دقيقة تتبدّل بكلمة عشوائية
create or replace function public.expire_temp_passwords() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  for r in select pr.id, pr.user_id from public.password_resets pr
           where pr.status = 'opened' and pr.expires_at is not null and pr.expires_at <= now() loop
    if r.user_id is not null then
      update auth.users set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')), updated_at = now() where id = r.user_id;
    end if;
    update public.password_resets set status = 'expired', temp_password = null where id = r.id;
  end loop;
  update public.password_resets set status = 'expired', temp_password = null where status = 'approved' and approved_at < now() - interval '24 hours';
  update public.password_resets set status = 'expired' where status = 'pending' and created_at < now() - interval '7 days';
end $$;
revoke all on function public.expire_temp_passwords() from public, anon, authenticated;

-- طلب استعادة كلمة السر (من صفحة الدخول، بدون تسجيل دخول). بيرجّع رمز سري يتحفظ في جهاز صاحب الطلب.
-- الرد نفسه سواء اسم المستخدم موجود أو لا، عشان محدش يعرف مين مسجّل.
create or replace function public.request_password_reset(p_username text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare u record; tok text := encode(gen_random_bytes(18), 'hex'); recent integer; uname text := btrim(coalesce(p_username, ''));
begin
  perform public.expire_temp_passwords();
  if uname = '' then raise exception 'اكتب اسم المستخدم'; end if;
  select id, full_name, role into u from public.users where username = uname and role in ('member','servant') and status = 'active';
  if found then
    select count(*) into recent from public.password_resets where user_id = u.id and created_at > now() - interval '1 hour';
    if recent >= 5 then raise exception 'طلبات كتير. جرّب بعد ساعة.'; end if;
    update public.password_resets set status = 'cancelled', temp_password = null where user_id = u.id and status in ('pending','approved');
    insert into public.password_resets (username, user_id, status, token_hash)
      values (uname, u.id, 'pending', encode(digest(convert_to(tok, 'UTF8'), 'sha256'), 'hex'));
    insert into public.messages (user_id, kind, title, body, icon)
      select a.id, 'reset_request', 'طلب استعادة كلمة السر 🔑',
             u.full_name || ' (@' || uname || ') ' || case when u.role = 'servant' then 'خادم' else 'مخدوم' end ||
             E' طلب كلمة سر جديدة.\nافتح لوحة الأدمن ثم «طلبات كلمة السر» ووافق عليه.', 'KeyRound'
      from public.users a where a.role = 'admin' and a.status = 'active';
  end if;
  return tok;
end $$;
revoke all on function public.request_password_reset(text) from public;
grant execute on function public.request_password_reset(text) to anon, authenticated;

-- حالة الطلب (بالرمز السري)
create or replace function public.reset_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record; nm text;
begin
  perform public.expire_temp_passwords();
  select * into r from public.password_resets
    where token_hash = encode(digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('status', 'none'); end if;
  select full_name into nm from public.users where id = r.user_id;
  return jsonb_build_object('status', r.status, 'name', nm, 'username', r.username, 'expires_at', r.expires_at, 'server_now', now());
end $$;
revoke all on function public.reset_status(text) from public;
grant execute on function public.reset_status(text) to anon, authenticated;

-- فتح الرسالة: أول مرة بتشغّل الكلمة المؤقتة لمدة 30 دقيقة وبتلزّم المستخدم يغيّرها أول ما يدخل
create or replace function public.open_reset_message(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record; nm text; expiry timestamptz;
begin
  perform public.expire_temp_passwords();
  select * into r from public.password_resets
    where token_hash = encode(digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
    order by created_at desc limit 1 for update;
  if not found or r.status not in ('approved','opened') or r.user_id is null or r.temp_password is null then
    raise exception 'مفيش رسالة متاحة. اطلب كلمة سر جديدة.';
  end if;
  if r.status = 'approved' then
    expiry := now() + interval '30 minutes';
    update public.password_resets set status = 'opened', opened_at = now(), expires_at = expiry where id = r.id;
    update auth.users set encrypted_password = crypt(r.temp_password, gen_salt('bf')), updated_at = now() where id = r.user_id;
    insert into public.account_security (user_id, must_change, temp_expires_at) values (r.user_id, true, expiry)
      on conflict (user_id) do update set must_change = true, temp_expires_at = expiry, updated_at = now();
  else
    expiry := r.expires_at;
  end if;
  select full_name into nm from public.users where id = r.user_id;
  return jsonb_build_object('temp_password', r.temp_password, 'expires_at', expiry, 'username', r.username, 'name', nm, 'server_now', now());
end $$;
revoke all on function public.open_reset_message(text) from public;
grant execute on function public.open_reset_message(text) to anon, authenticated;

-- الأدمن: قايمة الطلبات
create or replace function public.admin_list_reset_requests() returns table (
  id uuid, username text, full_name text, role text, church_class text, status text,
  created_at timestamptz, approved_at timestamptz, opened_at timestamptz, expires_at timestamptz, temp_password text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  perform public.expire_temp_passwords();
  return query
    select pr.id, pr.username, u.full_name, u.role, u.church_class, pr.status,
           pr.created_at, pr.approved_at, pr.opened_at, pr.expires_at,
           case when pr.status in ('approved','opened') then pr.temp_password else null end
    from public.password_resets pr join public.users u on u.id = pr.user_id
    where pr.created_at > now() - interval '14 days'
    order by (pr.status = 'pending') desc, pr.created_at desc
    limit 100;
end $$;
revoke all on function public.admin_list_reset_requests() from public, anon;
grant execute on function public.admin_list_reset_requests() to authenticated;

-- الأدمن: موافقة وتحديد الكلمة المؤقتة (لو سابها فاضية بتتولّد)
create or replace function public.admin_approve_reset(p_id uuid, p_temp text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r record; t text := nullif(btrim(coalesce(p_temp, '')), ''); alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; i integer;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select * into r from public.password_resets where id = p_id and status = 'pending' for update;
  if not found or r.user_id is null then raise exception 'الطلب مش موجود أو اتعالج قبل كده'; end if;
  if t is null then
    t := '';
    for i in 1..8 loop
      t := t || substr(alpha, 1 + (get_byte(gen_random_bytes(1), 0) % length(alpha)), 1);
    end loop;
  end if;
  if length(t) < 6 or length(t) > 64 then raise exception 'كلمة السر المؤقتة لازم تكون من 6 إلى 64 حرف'; end if;
  update public.password_resets set status = 'approved', temp_password = t, approved_by = auth.uid(), approved_at = now() where id = p_id;
  return t;
end $$;
revoke all on function public.admin_approve_reset(uuid, text) from public, anon;
grant execute on function public.admin_approve_reset(uuid, text) to authenticated;

create or replace function public.admin_reject_reset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.password_resets set status = 'rejected', temp_password = null where id = p_id and status in ('pending','approved');
end $$;
revoke all on function public.admin_reject_reset(uuid) from public, anon;
grant execute on function public.admin_reject_reset(uuid) to authenticated;

-- حالة أمان الحساب الحالي (التطبيق بيسأل بعد الدخول)
create or replace function public.my_security_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('must_change', s.must_change, 'expired', coalesce(s.temp_expires_at <= now(), false))
     from public.account_security s where s.user_id = auth.uid()),
    jsonb_build_object('must_change', false, 'expired', false))
$$;
revoke all on function public.my_security_state() from public, anon;
grant execute on function public.my_security_state() to authenticated;

-- تغيير كلمة السر (إجباري بعد الدخول بالمؤقتة)
create or replace function public.change_my_password(p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'غير مسموح'; end if;
  if length(coalesce(p_new, '')) < 6 then raise exception 'كلمة السر الجديدة لازم 6 حروف على الأقل'; end if;
  if exists (select 1 from public.account_security s where s.user_id = auth.uid() and s.temp_expires_at is not null and s.temp_expires_at <= now()) then
    raise exception 'انتهت صلاحية كلمة السر المؤقتة. اطلب كلمة جديدة.';
  end if;
  if exists (select 1 from public.password_resets pr where pr.user_id = auth.uid() and pr.status = 'opened' and pr.temp_password = p_new) then
    raise exception 'اختار كلمة سر مختلفة عن المؤقتة';
  end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now() where id = auth.uid();
  delete from public.account_security where user_id = auth.uid();
  update public.password_resets set status = 'used', temp_password = null where user_id = auth.uid() and status = 'opened';
end $$;
revoke all on function public.change_my_password(text) from public, anon;
grant execute on function public.change_my_password(text) to authenticated;

-- تنفيذ الانتهاء كل دقيقة (لو pg_cron متاح)
do $$ begin
  create extension if not exists pg_cron;
  begin perform cron.unschedule('expire-temp-passwords'); exception when others then null; end;
  perform cron.schedule('expire-temp-passwords', '* * * * *', 'select public.expire_temp_passwords()');
exception when others then
  raise notice 'pg_cron مش متاح. فعّله من Database ثم Extensions عشان الكلمة المؤقتة تنتهي في وقتها بالظبط.';
end $$;
