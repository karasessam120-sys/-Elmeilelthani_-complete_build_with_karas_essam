/*
  حفظ التحضيرات (بوربوينت / فيديو) لكل خادم، وتظهر في "التحضيرات القديمة".
*/
create table if not exists public.lesson_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  mode text not null check (mode in ('ppt','video')),
  title text not null default '',
  choice text,
  messages jsonb not null default '[]'::jsonb,
  slides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lesson_preps_user_idx on public.lesson_preps (user_id, created_at desc);

alter table public.lesson_preps enable row level security;
drop policy if exists owner_staff_all on public.lesson_preps;
create policy owner_staff_all on public.lesson_preps for all to authenticated
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());
