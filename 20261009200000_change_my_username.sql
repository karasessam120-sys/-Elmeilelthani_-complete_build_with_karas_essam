/*
  تغيير اسم المستخدم من صفحة الشخص نفسه (عضو / خادم / أدمن)
  شغّله بعد الملفات السابقة.
*/
create or replace function public.guard_user_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.is_admin() or current_setting('app.allow_username_change', true) = 'on' then
    return new;
  end if;
  if new.id is distinct from old.id or new.role is distinct from old.role
     or new.status is distinct from old.status or new.username is distinct from old.username then
    raise exception 'غير مسموح';
  end if;
  return new;
end $$;

create or replace function public.change_my_username(new_username text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text := btrim(coalesce(new_username,'')); me uuid := auth.uid();
begin
  if me is null then raise exception 'غير مسموح'; end if;
  if length(u) < 3 then raise exception 'اسم المستخدم لازم 3 حروف على الأقل'; end if;
  if exists (select 1 from public.users where username = u and id <> me) then
    raise exception 'اسم المستخدم مستخدم بالفعل';
  end if;
  perform set_config('app.allow_username_change', 'on', true);
  update public.users set username = u where id = me;
  perform set_config('app.allow_username_change', 'off', true);
  update auth.users set email = public.username_email(u),
    raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('username', u),
    updated_at = now() where id = me;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', public.username_email(u)),
    updated_at = now() where user_id = me and provider = 'email';
end $$;
revoke all on function public.change_my_username(text) from public, anon;
grant execute on function public.change_my_username(text) to authenticated;
