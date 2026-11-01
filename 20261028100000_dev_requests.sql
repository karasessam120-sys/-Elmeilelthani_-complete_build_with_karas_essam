/*
  طلبات التطوير: الأدمن يجهّز صفحة (أو فكرة) ويبعتها لـ«صانع تطبيق» بيختاره.
  - الطلب فيه وصف المطلوب + نسخة من مواصفات الصفحة (عنوان، جمهور، بنية JSON المفحوصة).
  - صانع التطبيق يشوف الطلبات المبعوتة له بس، وبيغيّر حالتها (قيد التنفيذ / خلصت) مع ملاحظة، والأدمن بيوصله إشعار.
  - كل حاجة بدوال على السيرفر والجداول مقفولة.
  ⚠️ شغّله بعد 20261027100000_app_makers_suggestions.sql
*/

create table if not exists public.dev_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users(id) on delete cascade,
  assigned_to uuid not null references public.users(id) on delete cascade,
  page_id uuid references public.dynamic_pages(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 5 and 2000),
  spec jsonb not null default '{}'::jsonb check (octet_length(spec::text) <= 150000),
  status text not null default 'sent' check (status in ('sent','in_progress','done','cancelled')),
  maker_note text check (maker_note is null or char_length(maker_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dev_requests_assigned_idx on public.dev_requests (assigned_to, created_at desc);
create index if not exists dev_requests_created_idx on public.dev_requests (created_by, created_at desc);
alter table public.dev_requests enable row level security;
revoke all on public.dev_requests from anon, authenticated;

-- الأدمن: صنّاع التطبيق المتاحين
drop function if exists public.admin_list_app_makers();
create or replace function public.admin_list_app_makers() returns table (
  user_id uuid, full_name text, username text, role text, church_class text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query
    select u.id, u.full_name, u.username, u.role, u.church_class
    from public.app_makers m join public.users u on u.id = m.user_id
    where u.status = 'active' order by u.full_name;
end $$;
revoke all on function public.admin_list_app_makers() from public, anon;
grant execute on function public.admin_list_app_makers() to authenticated;

-- الأدمن: إرسال طلب تطوير لصانع تطبيق
create or replace function public.admin_send_dev_request(p_to uuid, p_title text, p_body text, p_spec jsonb default null, p_page uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); new_id uuid; t text; b text; ui jsonb; role_t text; clean_spec jsonb;
  bad text := '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
              || chr(8203) || chr(8288) || chr(65279) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if not exists (select 1 from public.app_makers m join public.users u on u.id = m.user_id where m.user_id = p_to and u.status = 'active') then
    raise exception 'اختار صانع تطبيق نشط';
  end if;
  t := btrim(regexp_replace(coalesce(p_title, ''), bad, '', 'g'));
  b := btrim(regexp_replace(coalesce(p_body, ''), bad, '', 'g'));
  if char_length(t) < 3 or char_length(t) > 120 then raise exception 'العنوان لازم يكون من 3 إلى 120 حرف'; end if;
  if char_length(b) < 5 or char_length(b) > 2000 then raise exception 'اكتب المطلوب (من 5 إلى 2000 حرف)'; end if;
  if (select count(*) from public.dev_requests r where r.created_by = me and r.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'وصلت للحد اليومي للطلبات';
  end if;

  -- بنخزّن مفاتيح معروفة بس من المواصفات، وبنفحص بنية الصفحة بنفس قواعد قاعدة البيانات
  clean_spec := '{}'::jsonb;
  if p_spec is not null and jsonb_typeof(p_spec) = 'object' then
    ui := p_spec->'ui_structure';
    if ui is not null and jsonb_typeof(ui) <> 'null' then
      if not public.dynamic_ui_is_valid(ui) then raise exception 'بنية الصفحة غير صالحة'; end if;
    else
      ui := null;
    end if;
    role_t := p_spec->>'target_role';
    if role_t is not null and role_t not in ('all','member','servant','admin') then role_t := null; end if;
    clean_spec := jsonb_strip_nulls(jsonb_build_object(
      'title', left(btrim(regexp_replace(coalesce(p_spec->>'title', ''), bad, '', 'g')), 120),
      'description', left(btrim(regexp_replace(coalesce(p_spec->>'description', ''), bad, '', 'g')), 500),
      'target_role', role_t,
      'ui_structure', ui));
  end if;

  insert into public.dev_requests (created_by, assigned_to, page_id, title, body, spec)
    values (me, p_to, p_page, t, b, clean_spec) returning id into new_id;
  insert into public.messages (user_id, kind, title, body, icon, sender_id)
    values (p_to, 'info', 'طلب تطوير جديد 🛠️', E'الأدمن بعتلك طلب: «' || left(t, 80) || E'»\nافتح «اقتراحات التطبيق» وهتلاقي المطلوب والمواصفات.', 'Wrench', me);
  return new_id;
end $$;
revoke all on function public.admin_send_dev_request(uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.admin_send_dev_request(uuid, text, text, jsonb, uuid) to authenticated;

-- صانع التطبيق: الطلبات المبعوتة لي
drop function if exists public.am_dev_requests();
create or replace function public.am_dev_requests() returns table (
  id uuid, title text, body text, spec jsonb, status text, maker_note text, created_at timestamptz, from_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.am_status() then raise exception 'غير مسموح'; end if;
  return query
    select r.id, r.title, r.body, r.spec, r.status, r.maker_note, r.created_at, u.full_name
    from public.dev_requests r join public.users u on u.id = r.created_by
    where r.assigned_to = auth.uid() and r.status <> 'cancelled'
    order by (r.status = 'sent') desc, r.created_at desc limit 100;
end $$;
revoke all on function public.am_dev_requests() from public, anon;
grant execute on function public.am_dev_requests() to authenticated;

-- صانع التطبيق: تغيير حالة طلب (قيد التنفيذ / خلصت) مع ملاحظة
create or replace function public.am_update_dev_request(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; note text := left(btrim(coalesce(p_note, '')), 500); lbl text;
begin
  if me is null or not public.am_status() then raise exception 'غير مسموح'; end if;
  if p_status not in ('in_progress','done') then raise exception 'حالة غير صالحة'; end if;
  select * into r from public.dev_requests where id = p_id and assigned_to = me and status <> 'cancelled' for update;
  if not found then raise exception 'الطلب مش موجود'; end if;
  update public.dev_requests set status = p_status, maker_note = nullif(note, ''), updated_at = now() where id = p_id;
  lbl := case p_status when 'done' then 'خلصت ✅' else 'قيد التنفيذ' end;
  insert into public.messages (user_id, kind, title, body, icon, sender_id)
    values (r.created_by, 'info', 'تحديث على طلب التطوير 🛠️', 'طلبك «' || left(r.title, 80) || '» حالته: ' || lbl || case when note <> '' then E'\nملاحظة: ' || note else '' end, 'Wrench', me);
end $$;
revoke all on function public.am_update_dev_request(uuid, text, text) from public, anon;
grant execute on function public.am_update_dev_request(uuid, text, text) to authenticated;

-- الأدمن: الطلبات اللي بعتها
drop function if exists public.admin_list_dev_requests();
create or replace function public.admin_list_dev_requests() returns table (
  id uuid, title text, body text, status text, maker_note text, created_at timestamptz, updated_at timestamptz, maker_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query
    select r.id, r.title, r.body, r.status, r.maker_note, r.created_at, r.updated_at, u.full_name
    from public.dev_requests r join public.users u on u.id = r.assigned_to
    order by r.created_at desc limit 100;
end $$;
revoke all on function public.admin_list_dev_requests() from public, anon;
grant execute on function public.admin_list_dev_requests() to authenticated;

create or replace function public.admin_cancel_dev_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select * into r from public.dev_requests where id = p_id and status in ('sent','in_progress') for update;
  if not found then raise exception 'الطلب مش موجود أو اتقفل'; end if;
  update public.dev_requests set status = 'cancelled', updated_at = now() where id = p_id;
  insert into public.messages (user_id, kind, title, body, icon, sender_id)
    values (r.assigned_to, 'info', 'اتلغى طلب تطوير', 'الأدمن لغى الطلب «' || left(r.title, 80) || '». مش محتاج تعمل فيه حاجة.', 'Wrench', auth.uid());
end $$;
revoke all on function public.admin_cancel_dev_request(uuid) from public, anon;
grant execute on function public.admin_cancel_dev_request(uuid) to authenticated;
