-- Additive migration: preserve existing dynamic page data.
-- Stores the admin's prompt for later editing/audit; never stores API secrets.
alter table public.dynamic_pages
  add column if not exists prompt_used text;

comment on column public.dynamic_pages.prompt_used is
  'Optional AI prompt entered by an admin when generating or revising this page.';
