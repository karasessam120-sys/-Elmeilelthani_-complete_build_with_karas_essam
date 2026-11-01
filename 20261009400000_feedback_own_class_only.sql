/*
  صفحة الدعم: الخادم يشوف رسائل مخدومين فصله فقط (والأدمن الكل).
*/
drop policy if exists staff_all on public.feedback;

create policy admin_all on public.feedback for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy servant_own_class on public.feedback for all to authenticated
  using (public.current_role_name() = 'servant' and public.my_class() <> '' and church_class = public.my_class())
  with check (public.current_role_name() = 'servant' and public.my_class() <> '' and church_class = public.my_class());
