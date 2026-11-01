-- Secure global Fares leaderboard: exposes only active members' display names,
-- class names, and computed totals to authenticated app users.
create or replace function public.get_fares_leaderboard()
returns table(user_id uuid, full_name text, church_class text, total_points bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(nullif(btrim(u.full_name), ''), 'مخدوم') as full_name,
         u.church_class,
         (coalesce(s.liturgy_points, 0)::bigint
          + coalesce(s.confession_points, 0)::bigint
          + coalesce(s.psalms_points, 0)::bigint
          + coalesce(s.agpeya_points, 0)::bigint) as total_points
  from public.users u
  left join public.fares_scores s on s.user_id = u.id
  where u.role = 'member' and u.status = 'active'
  order by total_points desc, full_name asc;
$$;
revoke all on function public.get_fares_leaderboard() from public, anon;
grant execute on function public.get_fares_leaderboard() to authenticated;
