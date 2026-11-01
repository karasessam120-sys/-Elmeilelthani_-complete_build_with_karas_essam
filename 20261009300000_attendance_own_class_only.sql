/*
  الخادم يشوف ويسجّل حضور فصله فقط (والأدمن كل الفصول).
  العضو يقرأ حضوره بس ولا يقدر يسجّل لنفسه.
*/
create or replace function public.my_class() returns text language sql stable security definer set search_path = public as $$
  select coalesce(church_class, '') from public.users where id = auth.uid() $$;

drop policy if exists staff_all on public.attendance;
drop policy if exists own_insert on public.attendance;

create policy admin_all on public.attendance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy servant_own_class on public.attendance for all to authenticated
  using (public.current_role_name() = 'servant' and public.my_class() <> '' and church_class = public.my_class())
  with check (public.current_role_name() = 'servant' and public.my_class() <> '' and church_class = public.my_class());
