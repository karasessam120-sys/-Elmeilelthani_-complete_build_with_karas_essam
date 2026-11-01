/*
  1) دالة للأدمن لإعادة تعيين اسم المستخدم و/أو كلمة السر لأي حساب
  2) (إنشاء الأدمن اتنقل لملف seed_admin.example.sql)
  ⚠️ شغّله بعد ملف 20261008100000_secure_auth_and_rls.sql
*/
create or replace function public.admin_reset_credentials(target uuid, new_username text default null, new_password text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u text := nullif(btrim(coalesce(new_username,'')), '');
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if u is null and nullif(coalesce(new_password,''), '') is null then raise exception 'لم تكتب أي تغيير'; end if;
  if u is not null then
    if exists (select 1 from public.users where username = u and id <> target) then
      raise exception 'اسم المستخدم مستخدم بالفعل';
    end if;
    update public.users set username = u where id = target;
    update auth.users set email = public.username_email(u),
      raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('username', u),
      updated_at = now() where id = target;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', public.username_email(u)),
      updated_at = now() where user_id = target and provider = 'email';
  end if;
  if nullif(coalesce(new_password,''), '') is not null then
    if length(new_password) < 6 then raise exception 'كلمة السر لازم تكون 6 حروف على الأقل'; end if;
    update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
  end if;
end $$;
revoke all on function public.admin_reset_credentials(uuid,text,text) from public, anon;
grant execute on function public.admin_reset_credentials(uuid,text,text) to authenticated;

-- (اتشال إنشاء حساب الأدمن الثابت من هنا. استخدم supabase/seed_admin.example.sql بكلمة سر من عندك)
