/*
  تأمين التطبيق: Supabase Auth + سياسات RLS حقيقية.
  ⚠️ خذ نسخة احتياطية قبل التشغيل. شغّله مرة واحدة من SQL Editor.
  ⚠️ من Authentication > Providers > Email: أوقف "Confirm email".
*/
create extension if not exists pgcrypto with schema extensions;

create or replace function public.username_email(u text) returns text
language sql immutable set search_path = public, extensions as $$
  select left(encode(extensions.digest(convert_to(btrim(u),'UTF8'),'sha256'),'hex'),40) || '@users.elmeilelthani.app'
$$;

-- 1) نقل الحسابات الحالية إلى Supabase Auth بنفس الـ id (كلمات السر تتشفر)
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',u.id,'authenticated','authenticated',public.username_email(u.username),
  extensions.crypt(u.password, extensions.gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('username',u.username),now(),now(),'','','',''
from public.users u where not exists (select 1 from auth.users a where a.id=u.id);

insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
select gen_random_uuid(),u.id,jsonb_build_object('sub',u.id::text,'email',public.username_email(u.username),'email_verified',true),
  'email',u.id::text,now(),now(),now()
from public.users u where not exists (select 1 from auth.identities i where i.user_id=u.id);

-- 2) حذف كلمات السر النصية نهائيًا
alter table public.users drop column if exists password;
alter table public.password_resets drop column if exists resolved_password;

-- 3) دوال مساعدة
create or replace function public.current_role_name() returns text language sql stable security definer set search_path=public as $$
  select role from public.users where id = auth.uid() and status = 'active' $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role_name() in ('servant','admin'), false) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role_name() = 'admin', false) $$;
create or replace function public.username_taken(u text) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.users where username = btrim(u)) $$;
grant execute on function public.username_taken(text) to anon, authenticated;

-- 4) إنشاء الملف الشخصي تلقائيًا: الدور يحدده السيرفر (عضو أو خادم معلّق فقط، لا أدمن)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare m jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb); r text;
begin
  if exists (select 1 from public.users where id = new.id) then return new; end if;
  r := case when m->>'role' = 'servant' then 'servant' else 'member' end;
  insert into public.users (id,username,full_name,role,status,education_stage,school_year,church_class,parent_phone,home_address,date_of_birth)
  values (new.id, btrim(m->>'username'), coalesce(m->>'full_name',''), r, case when r='servant' then 'pending' else 'active' end,
    coalesce(m->>'education_stage',''), coalesce(m->>'school_year',''), coalesce(m->>'church_class',''),
    coalesce(m->>'parent_phone',''), coalesce(m->>'home_address',''), nullif(m->>'date_of_birth','')::date);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- منع غير الأدمن من تغيير الدور/الحالة/اسم المستخدم
create or replace function public.guard_user_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role
     or new.status is distinct from old.status or new.username is distinct from old.username then
    raise exception 'غير مسموح';
  end if;
  return new;
end $$;
drop trigger if exists guard_user_update on public.users;
create trigger guard_user_update before update on public.users for each row execute function public.guard_user_update();

-- حذف الحساب من public.users يحذفه من Auth أيضًا
create or replace function public.delete_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from auth.users where id = old.id; return old; end $$;
drop trigger if exists on_profile_deleted on public.users;
create trigger on_profile_deleted after delete on public.users for each row execute function public.delete_auth_user();

-- 5) الأدمن يغيّر كلمة سر أي مستخدم (بديل ميزة عرض كلمة السر)
create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path=public, extensions as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if length(new_password) < 6 then raise exception 'كلمة السر قصيرة'; end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
end $$;
revoke all on function public.admin_set_password(uuid,text) from public, anon;
grant execute on function public.admin_set_password(uuid,text) to authenticated;

-- 6) عرض آمن للوحات المتصدرين (بدون تليفونات أو عناوين)
create or replace view public.leaderboard_members as
  select id,username,full_name,church_class,education_stage,school_year,stars,avatar_url,attendance_present,
         attendance_total,brought_back_count,last_quiz_score,last_quiz_total,role,status,created_at
  from public.users where role='member' and status='active';
grant select on public.leaderboard_members to authenticated;

-- 7) سياسات RLS الجديدة (حذف المفتوحة للجميع)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.users enable row level security;
create policy users_select on public.users for select to authenticated using (id = auth.uid() or public.is_staff());
create policy users_update on public.users for update to authenticated using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());
create policy users_delete on public.users for delete to authenticated using (id = auth.uid() or public.is_admin());

do $$ declare t text; begin
  foreach t in array array['church_config','verse_of_day','feedback','password_resets','ai_chats','quizzes','quiz_attempts',
    'rewards','reward_redemptions','attendance','absent_peers','hat_akhook_uploads','notifications','verse_schedule',
    'star_adjustments','classes','education_stages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
  foreach t in array array['church_config','verse_of_day','verse_schedule','quizzes','rewards','notifications','absent_peers'] loop
    execute format('create policy read_auth on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['classes','education_stages'] loop
    execute format('create policy read_all on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['quiz_attempts','reward_redemptions','attendance','ai_chats','feedback'] loop
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
  end loop;
end $$;
create policy own_select on public.hat_akhook_uploads for select to authenticated using (member_id = auth.uid());
create policy own_insert on public.hat_akhook_uploads for insert to authenticated with check (member_id = auth.uid());
create policy own_select on public.star_adjustments for select to authenticated using (user_id = auth.uid());
create policy peers_insert on public.absent_peers for insert to authenticated with check (true);
create policy reset_request on public.password_resets for insert to anon, authenticated with check (status = 'pending');
