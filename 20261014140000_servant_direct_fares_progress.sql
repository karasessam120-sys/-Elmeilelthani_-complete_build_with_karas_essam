-- Allow a servant to record recitation directly for an active member in the servant's class.
-- All authorization and score updates happen server-side in this SECURITY DEFINER RPC.
create or replace function public.servant_save_progress(
  p_target_user_id uuid,
  p_psalms integer[],
  p_hours text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text := public.current_role_name();
  staff_class text;
  safe_psalms integer[];
  safe_hours text[];
begin
  if auth.uid() is null or staff_role not in ('servant', 'admin') then
    raise exception 'غير مسموح: هذه العملية للخادم أو المدير فقط';
  end if;

  select church_class into staff_class from public.users where id = auth.uid();
  if not exists (
    select 1 from public.users target
    where target.id = p_target_user_id
      and target.role = 'member'
      and target.status = 'active'
      and (staff_role = 'admin' or target.church_class = staff_class)
  ) then
    raise exception 'المخدوم غير موجود أو لا يتبع فصلك';
  end if;

  select coalesce(array_agg(distinct n order by n), '{}') into safe_psalms
  from unnest(coalesce(p_psalms, '{}')) n where n between 1 and 151;
  select coalesce(array_agg(distinct h order by h), '{}') into safe_hours
  from unnest(coalesce(p_hours, '{}')) h
  where h = any(array['باكر','الثالثة','السادسة','التاسعة','الغروب','النوم','الستار','نصف الليل']::text[]);

  insert into public.psalms_agpeya_progress(user_id, completed_psalms, completed_hours, updated_at)
  values (p_target_user_id, safe_psalms, safe_hours, now())
  on conflict (user_id) do update set
    completed_psalms = excluded.completed_psalms,
    completed_hours = excluded.completed_hours,
    updated_at = now();

  insert into public.fares_scores(user_id, psalms_points, agpeya_points, updated_at)
  values (p_target_user_id, cardinality(safe_psalms) * 5, cardinality(safe_hours) * 10, now())
  on conflict (user_id) do update set
    psalms_points = excluded.psalms_points,
    agpeya_points = excluded.agpeya_points,
    updated_at = now();
end;
$$;
revoke all on function public.servant_save_progress(uuid, integer[], text[]) from public, anon;
grant execute on function public.servant_save_progress(uuid, integer[], text[]) to authenticated;
