/*
  إنشاء حساب أدمن (مرة واحدة، يدويًا). ما بيشتغلش تلقائيًا مع الـ migrations.
  1) غيّر القيمتين تحت: اسم المستخدم وكلمة سر قوية (12 حرف على الأقل).
  2) شغّله من SQL Editor، وبعدين امسح كلمة السر من الملف ومتحفظهاش في الكود.
*/
do $$
declare
  uid uuid; uname text := 'CHANGE_ME_USERNAME'; pw text := 'CHANGE_ME_STRONG_PASSWORD'; fname text := 'اسم الأدمن';
begin
  if uname like 'CHANGE_ME%' or pw like 'CHANGE_ME%' then raise exception 'غيّر اسم المستخدم وكلمة السر الأول'; end if;
  if length(pw) < 12 then raise exception 'كلمة السر لازم تكون 12 حرف على الأقل'; end if;
  select id into uid from public.users where username = uname;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated','authenticated', public.username_email(uname),
      extensions.crypt(pw, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', uname, 'full_name', fname), now(), now(), '', '', '', '');
    insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
    values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', public.username_email(uname), 'email_verified', true), 'email', uid::text, now(), now(), now());
  else
    update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  end if;
  update public.users set role = 'admin', status = 'active', full_name = fname where id = uid;
end $$;
