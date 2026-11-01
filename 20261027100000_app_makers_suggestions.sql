/*
  «صانع التطبيق» واقتراحات التطبيق:
  - الأدمن يضغط على اسم مستخدم (خادم أو مخدوم) ويجعله «صانع تطبيق». ده بيفتح له صفحة «اقتراحات التطبيق» هو بس.
  - صانع التطبيق يكتب أفكار (صفحة جديدة، ميزة، مشكلة...) وبتوصل للأدمن. مفيش أي صلاحية على الكود أو البيانات.
  - الأدمن يغيّر حالة كل اقتراح (جديد / قيد الدراسة / اتنفذ / مرفوض) ويكتب ملاحظة، والصانع بيوصله إشعار.
  - كل حاجة بدوال على السيرفر: الجداول مقفولة، والصلاحية مش في جدول المستخدمين (فمحدش يقدر يرقّي نفسه).
  ⚠️ شغّله بعد 20261026100000_dynamic_forms.sql (ويحتاج جدول messages من ملف الرسائل)
*/

create table if not exists public.app_makers (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.app_makers enable row level security;
revoke all on public.app_makers from anon, authenticated;

create table if not exists public.app_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'feature' check (kind in ('page','feature','fix','other')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  status text not null default 'new' check (status in ('new','review','done','rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_suggestions_user_idx on public.app_suggestions (user_id, created_at desc);
create index if not exists app_suggestions_status_idx on public.app_suggestions (status, created_at desc);
alter table public.app_suggestions enable row level security;
revoke all on public.app_suggestions from anon, authenticated;

-- هل أنا صانع تطبيق؟
create or replace function public.am_status() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_makers m join public.users u on u.id = m.user_id
                 where m.user_id = auth.uid() and u.status = 'active' and u.role in ('member','servant'));
$$;
revoke all on function public.am_status() from public, anon;
grant execute on function public.am_status() to authenticated;

-- إرسال اقتراح
create or replace function public.am_submit(p_kind text, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); new_id uuid; nm text; t text; b text;
  bad text := '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
              || chr(8203) || chr(8288) || chr(65279) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  if me is null or not public.am_status() then raise exception 'غير مسموح. الصفحة دي لصنّاع التطبيق فقط.'; end if;
  if p_kind is null or p_kind not in ('page','feature','fix','other') then raise exception 'نوع الاقتراح غير صالح'; end if;
  t := btrim(regexp_replace(coalesce(p_title, ''), bad, '', 'g'));
  b := btrim(regexp_replace(coalesce(p_body, ''), bad, '', 'g'));
  if char_length(t) < 3 or char_length(t) > 120 then raise exception 'العنوان لازم يكون من 3 إلى 120 حرف'; end if;
  if char_length(b) < 10 or char_length(b) > 2000 then raise exception 'الوصف لازم يكون من 10 إلى 2000 حرف'; end if;
  if (select count(*) from public.app_suggestions s where s.user_id = me and s.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'وصلت للحد اليومي (10 اقتراحات). كمّل بكرة.';
  end if;
  insert into public.app_suggestions (user_id, kind, title, body) values (me, p_kind, t, b) returning id into new_id;
  select full_name into nm from public.users where id = me;
  insert into public.messages (user_id, kind, title, body, icon, sender_id)
    select a.id, 'info', 'اقتراح جديد للتطبيق 💡', coalesce(nm, 'صانع تطبيق') || E' كتب اقتراح: «' || left(t, 80) || E'»\nافتح «اقتراحات التطبيق» في لوحة الأدمن.', 'Lightbulb', me
    from public.users a where a.role = 'admin' and a.status = 'active';
  return new_id;
end $$;
revoke all on function public.am_submit(text, text, text) from public, anon;
grant execute on function public.am_submit(text, text, text) to authenticated;

-- اقتراحاتي
drop function if exists public.am_my_suggestions();
create or replace function public.am_my_suggestions() returns table (
  id uuid, kind text, title text, body text, status text, admin_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.am_status() then raise exception 'غير مسموح'; end if;
  return query
    select s.id, s.kind, s.title, s.body, s.status, s.admin_note, s.created_at
    from public.app_suggestions s where s.user_id = auth.uid() order by s.created_at desc limit 100;
end $$;
revoke all on function public.am_my_suggestions() from public, anon;
grant execute on function public.am_my_suggestions() to authenticated;

-- الأدمن: قايمة الاقتراحات
drop function if exists public.admin_list_suggestions(text);
create or replace function public.admin_list_suggestions(p_status text default 'all') returns table (
  id uuid, kind text, title text, body text, status text, admin_note text, created_at timestamptz,
  full_name text, username text, role text, church_class text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query
    select s.id, s.kind, s.title, s.body, s.status, s.admin_note, s.created_at, u.full_name, u.username, u.role, u.church_class
    from public.app_suggestions s join public.users u on u.id = s.user_id
    where p_status = 'all' or s.status = p_status
    order by (s.status = 'new') desc, s.created_at desc limit 200;
end $$;
revoke all on function public.admin_list_suggestions(text) from public, anon;
grant execute on function public.admin_list_suggestions(text) to authenticated;

-- الأدمن: تغيير حالة اقتراح مع ملاحظة (وإشعار لصاحبه)
create or replace function public.admin_update_suggestion(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s record; note text := left(btrim(coalesce(p_note, '')), 500); lbl text;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if p_status not in ('new','review','done','rejected') then raise exception 'حالة غير صالحة'; end if;
  select * into s from public.app_suggestions where id = p_id for update;
  if not found then raise exception 'الاقتراح مش موجود'; end if;
  update public.app_suggestions set status = p_status, admin_note = nullif(note, ''), updated_at = now() where id = p_id;
  if p_status is distinct from s.status or coalesce(note, '') <> coalesce(s.admin_note, '') then
    lbl := case p_status when 'review' then 'قيد الدراسة' when 'done' then 'اتنفذ 🎉' when 'rejected' then 'مش هيتنفذ حاليًا' else 'جديد' end;
    insert into public.messages (user_id, kind, title, body, icon, sender_id)
      values (s.user_id, 'info', 'تحديث على اقتراحك 💡', 'اقتراحك «' || left(s.title, 80) || '» حالته: ' || lbl || case when note <> '' then E'\nملاحظة الأدمن: ' || note else '' end, 'Lightbulb', auth.uid());
  end if;
end $$;
revoke all on function public.admin_update_suggestion(uuid, text, text) from public, anon;
grant execute on function public.admin_update_suggestion(uuid, text, text) to authenticated;

-- الأدمن: جعل مستخدم صانع تطبيق أو إلغاؤه
create or replace function public.admin_set_app_maker(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select id, role, status, full_name into u from public.users where id = p_user;
  if not found or u.role not in ('member','servant') or u.status <> 'active' then raise exception 'المستخدم لازم يكون خادم أو مخدوم نشط'; end if;
  if p_on then
    insert into public.app_makers (user_id, granted_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
    if found then
      insert into public.messages (user_id, kind, title, body, icon, sender_id)
        values (p_user, 'info', 'بقيت صانع تطبيق 🛠️', E'الأدمن عيّنك «صانع تطبيق»!\nهتلاقي صفحة «اقتراحات التطبيق» في القايمة. اكتب فيها أي فكرة لتطوير التطبيق (صفحة جديدة، ميزة، أو مشكلة) وهتوصل للأدمن.', 'Lightbulb', auth.uid());
    end if;
  else
    delete from public.app_makers where user_id = p_user;
  end if;
end $$;
revoke all on function public.admin_set_app_maker(uuid, boolean) from public, anon;
grant execute on function public.admin_set_app_maker(uuid, boolean) to authenticated;

drop function if exists public.admin_app_makers();
create or replace function public.admin_app_makers() returns table (user_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query select m.user_id from public.app_makers m;
end $$;
revoke all on function public.admin_app_makers() from public, anon;
grant execute on function public.admin_app_makers() to authenticated;
