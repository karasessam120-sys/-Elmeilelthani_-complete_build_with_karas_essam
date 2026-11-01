/*
  الإيميل بدل رسالة التطبيق في: ترحيب الخادم/المخدوم، وكلمة السر المؤقتة.
  - إيميل التواصل بيتسجّل مع الحساب (contact_email). الحسابات القديمة بتتطلب منها مرة واحدة من التطبيق.
  - كلمة السر المؤقتة بتتفعّل لحظة موافقة الأدمن وبتشتغل 30 دقيقة، وبعدها لازم تتغيّر أول ما يدخل بيها.
  - الإرسال الفعلي من Edge Function اسمها send-email (شوف README).
  ⚠️ شغّله بعد 20261021200000_inbox_messages_and_temp_password.sql
*/
create extension if not exists pgcrypto with schema extensions;

alter table public.users
  add column if not exists contact_email text,
  add column if not exists welcome_emailed_at timestamptz;
do $$ begin
  alter table public.users add constraint users_contact_email_format
    check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
exception when duplicate_object then null;
end $$;

-- الإيميل ييجي مع التسجيل
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); r text; em text := lower(btrim(coalesce(m->>'email', '')));
begin
  if exists (select 1 from public.users where id = new.id) then return new; end if;
  r := case when m->>'role' = 'servant' then 'servant' else 'member' end;
  insert into public.users (id, username, full_name, role, status, education_stage, school_year, church_class, parent_phone, home_address, date_of_birth, contact_email)
  values (new.id, btrim(m->>'username'), coalesce(m->>'full_name', ''), r, case when r = 'servant' then 'pending' else 'active' end,
    coalesce(m->>'education_stage', ''), coalesce(m->>'school_year', ''), coalesce(m->>'church_class', ''),
    coalesce(m->>'parent_phone', ''), coalesce(m->>'home_address', ''), nullif(m->>'date_of_birth', '')::date,
    case when em ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then em else null end);
  return new;
end $$;

-- الترحيب بقى بالإيميل، مش رسالة جوه التطبيق
drop trigger if exists send_welcome_message on public.users;
drop function if exists public.send_welcome_message();

-- المستخدم يضيف/يغيّر إيميله
create or replace function public.set_my_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'غير مسموح'; end if;
  if length(e) > 200 or e !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'الإيميل غير صحيح'; end if;
  update public.users set contact_email = e where id = auth.uid();
end $$;
revoke all on function public.set_my_email(text) from public, anon;
grant execute on function public.set_my_email(text) to authenticated;

-- مفيش رسالة تتفتح من الجهاز: الكلمة بتوصل بالإيميل
drop function if exists public.open_reset_message(text);
drop function if exists public.reset_status(text);

-- طلب الاستعادة (بدون رمز سري)
drop function if exists public.request_password_reset(text);
create or replace function public.request_password_reset(p_username text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u record; recent integer; uname text := btrim(coalesce(p_username, ''));
begin
  perform public.expire_temp_passwords();
  if uname = '' then raise exception 'اكتب اسم المستخدم'; end if;
  select id, full_name, role, contact_email into u from public.users where username = uname and role in ('member','servant') and status = 'active';
  if found then
    select count(*) into recent from public.password_resets where user_id = u.id and created_at > now() - interval '1 hour';
    if recent >= 5 then raise exception 'طلبات كتير. جرّب بعد ساعة.'; end if;
    update public.password_resets set status = 'cancelled', temp_password = null where user_id = u.id and status in ('pending','approved');
    insert into public.password_resets (username, user_id, status) values (uname, u.id, 'pending');
    insert into public.messages (user_id, kind, title, body, icon)
      select a.id, 'reset_request', 'طلب استعادة كلمة السر 🔑',
             u.full_name || ' (@' || uname || ') ' || case when u.role = 'servant' then 'خادم' else 'مخدوم' end ||
             case when u.contact_email is null then E' طلب كلمة سر جديدة. ⚠️ مفيش إيميل مسجّل له.' else E' طلب كلمة سر جديدة.' end ||
             E'\nافتح «طلبات كلمة السر» ووافق عليه.', 'KeyRound'
      from public.users a where a.role = 'admin' and a.status = 'active';
  end if;
  return true; -- نفس الرد سواء الاسم موجود أو لا
end $$;
revoke all on function public.request_password_reset(text) from public;
grant execute on function public.request_password_reset(text) to anon, authenticated;

-- موافقة الأدمن: الكلمة المؤقتة بتتفعّل فورًا لمدة 30 دقيقة (والإيميل بيتبعت من الـ Edge Function)
create or replace function public.admin_approve_reset(p_id uuid, p_temp text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r record; t text := nullif(btrim(coalesce(p_temp, '')), ''); alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; i integer; expiry timestamptz;
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
  expiry := now() + interval '30 minutes';
  update public.password_resets
    set status = 'opened', temp_password = t, approved_by = auth.uid(), approved_at = now(), opened_at = now(), expires_at = expiry
    where id = p_id;
  update auth.users set encrypted_password = crypt(t, gen_salt('bf')), updated_at = now() where id = r.user_id;
  insert into public.account_security (user_id, must_change, temp_expires_at) values (r.user_id, true, expiry)
    on conflict (user_id) do update set must_change = true, temp_expires_at = expiry, updated_at = now();
  return t;
end $$;
revoke all on function public.admin_approve_reset(uuid, text) from public, anon;
grant execute on function public.admin_approve_reset(uuid, text) to authenticated;

-- قايمة الطلبات للأدمن (مع تلميح الإيميل بدون كشفه كله)
drop function if exists public.admin_list_reset_requests();
create or replace function public.admin_list_reset_requests() returns table (
  id uuid, username text, full_name text, role text, church_class text, status text,
  created_at timestamptz, approved_at timestamptz, opened_at timestamptz, expires_at timestamptz, temp_password text,
  has_email boolean, email_hint text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  perform public.expire_temp_passwords();
  return query
    select pr.id, pr.username, u.full_name, u.role, u.church_class, pr.status,
           pr.created_at, pr.approved_at, pr.opened_at, pr.expires_at,
           case when pr.status in ('approved','opened') then pr.temp_password else null end,
           u.contact_email is not null,
           case when u.contact_email is null then null
                else left(split_part(u.contact_email, '@', 1), 2) || '***@' || split_part(u.contact_email, '@', 2) end
    from public.password_resets pr join public.users u on u.id = pr.user_id
    where pr.created_at > now() - interval '14 days'
    order by (pr.status = 'pending') desc, pr.created_at desc
    limit 100;
end $$;
revoke all on function public.admin_list_reset_requests() from public, anon;
grant execute on function public.admin_list_reset_requests() to authenticated;
