/*
  مسابقة تفاعلية حقيقية داخل الصفحات الديناميكية:
  - عنصر جديد اسمه quiz في بنية الصفحة (للعنوان فقط). الأسئلة والإجابات الصحيحة في جداول منفصلة مقفولة.
  - الأدمن يضيف الأسئلة (مع الإجابة الصحيحة والصعوبة والنقاط). المستخدم ما بيشوفش الإجابة الصحيحة قبل ما يجاوب.
  - التصحيح وحساب النقاط ولوحة الشرف كلها على السيرفر عن طريق دوال (RPC). كل سؤال يتجاوب مرة واحدة لكل مستخدم.
  ⚠️ شغّله بعد 20261024100000_dynamic_pages_hardening.sql
*/

-- ============ 1) السماح بعنصر quiz في فحص البنية (نفس الدالة السابقة + quiz) ============
create or replace function public.dynamic_ui_is_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  comp jsonb; t text; k text; v jsonb; allowed text[]; el jsonb; cell jsonb; s text;
  -- محارف تحكم وإخفاء واتجاه (Bidi) بتتبني بـ chr() عشان ما نعتمدش على escapes في الـ regex
  bad text := '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
              || chr(8203) || chr(8288) || chr(65279) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if coalesce(p->>'version', '') <> '1' or jsonb_typeof(p->'components') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'components') > 40 or octet_length(p::text) > 150000 then return false; end if;

  for comp in select value from jsonb_array_elements(p->'components') loop
    if jsonb_typeof(comp) is distinct from 'object' then return false; end if;
    for k in select jsonb_object_keys(comp) loop
      if k not in ('type', 'id', 'props') then return false; end if;
    end loop;
    t := comp->>'type';
    allowed := case t
      when 'heading' then array['title','text'] when 'text' then array['text'] when 'button' then array['label']
      when 'stat_card' then array['title','value','description'] when 'input' then array['label','placeholder']
      when 'select' then array['label','options'] when 'table' then array['columns','rows'] when 'divider' then array[]::text[]
      when 'quiz' then array['title']
      else null end;
    if allowed is null then return false; end if;
    if jsonb_typeof(comp->'props') is distinct from 'object' then return false; end if;
    if (comp->'id') is not null and (jsonb_typeof(comp->'id') is distinct from 'string' or (comp->>'id') !~ '^[A-Za-z0-9_-]{1,60}$') then return false; end if;

    for k, v in select key, value from jsonb_each(comp->'props') loop
      if not (k = any(allowed)) then return false; end if;
      if k in ('options', 'columns') then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) > 30 then return false; end if;
        for el in select value from jsonb_array_elements(v) loop
          if jsonb_typeof(el) is distinct from 'string' then return false; end if;
          s := el #>> '{}';
          if char_length(s) > 100 or s ~ bad then return false; end if;
        end loop;
      elsif k = 'rows' then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) > 30 then return false; end if;
        for el in select value from jsonb_array_elements(v) loop
          if jsonb_typeof(el) is distinct from 'array' or jsonb_array_length(el) > 12 then return false; end if;
          for cell in select value from jsonb_array_elements(el) loop
            if jsonb_typeof(cell) is distinct from 'string' then return false; end if;
            s := cell #>> '{}';
            if char_length(s) > 200 or s ~ bad then return false; end if;
          end loop;
        end loop;
      else
        if jsonb_typeof(v) is distinct from 'string' then return false; end if;
        s := v #>> '{}';
        if char_length(s) > 500 or s ~ bad then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- ============ 2) الجداول ============
create or replace function public.dq_options_valid(o jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  el jsonb; s text;
  bad text := '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
              || chr(8203) || chr(8288) || chr(65279) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  if o is null or jsonb_typeof(o) is distinct from 'array' then return false; end if;
  if jsonb_array_length(o) < 2 or jsonb_array_length(o) > 6 then return false; end if;
  for el in select value from jsonb_array_elements(o) loop
    if jsonb_typeof(el) is distinct from 'string' then return false; end if;
    s := el #>> '{}';
    if char_length(btrim(s)) = 0 or char_length(s) > 150 or s ~ bad then return false; end if;
  end loop;
  return true;
end $$;

create table if not exists public.dynamic_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.dynamic_pages(id) on delete cascade,
  block_id text not null check (block_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  question text not null check (char_length(btrim(question)) between 3 and 300),
  options jsonb not null check (public.dq_options_valid(options)),
  correct_index integer not null check (correct_index >= 0),
  difficulty text not null default 'easy' check (difficulty in ('easy','medium','hard')),
  points integer not null default 10 check (points between 1 and 100),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (correct_index < jsonb_array_length(options))
);
create index if not exists dq_questions_block_idx on public.dynamic_quiz_questions (page_id, block_id);
alter table public.dynamic_quiz_questions enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'dynamic_quiz_questions' loop
    execute format('drop policy %I on public.dynamic_quiz_questions', pol.policyname);
  end loop;
end $$;
-- الأسئلة (ومعاها الإجابة الصحيحة) للأدمن بس
create policy dq_questions_admin on public.dynamic_quiz_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.dynamic_quiz_questions from anon;
grant select, insert, update, delete on public.dynamic_quiz_questions to authenticated;

create table if not exists public.dynamic_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.dynamic_quiz_questions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  choice integer not null,
  correct boolean not null,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists dq_answers_user_idx on public.dynamic_quiz_answers (user_id);
alter table public.dynamic_quiz_answers enable row level security;
revoke all on public.dynamic_quiz_answers from anon, authenticated;

-- ============ 3) الدوال ============
-- مين يقدر يلعب: مستخدم نشط، والصفحة منشورة وغير محذوفة ومسموحة لدوره (الأدمن يجرّب حتى لو مسودة)
create or replace function public.dq_can_play(p_page uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u join public.dynamic_pages d on d.id = p_page
    where u.id = auth.uid() and u.status = 'active' and u.role in ('member','servant','admin')
      and d.is_deleted = false and (d.status = 'published' or u.role = 'admin')
      and (d.target_role = 'all' or d.target_role = u.role or u.role = 'admin'));
$$;
revoke all on function public.dq_can_play(uuid) from public, anon;
grant execute on function public.dq_can_play(uuid) to authenticated;

drop function if exists public.dq_next_question(uuid, text);
create or replace function public.dq_next_question(p_page uuid, p_block text) returns table (
  id uuid, question text, options jsonb, difficulty text, points integer, remaining integer)
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.dq_can_play(p_page) then raise exception 'غير مسموح'; end if;
  return query
    select q.id, q.question, q.options, q.difficulty, q.points,
           (select count(*)::integer from public.dynamic_quiz_questions q2
             where q2.page_id = p_page and q2.block_id = p_block and q2.active
               and not exists (select 1 from public.dynamic_quiz_answers a2 where a2.question_id = q2.id and a2.user_id = me))
    from public.dynamic_quiz_questions q
    where q.page_id = p_page and q.block_id = p_block and q.active
      and not exists (select 1 from public.dynamic_quiz_answers a where a.question_id = q.id and a.user_id = me)
    order by random() limit 1;
end $$;
revoke all on function public.dq_next_question(uuid, text) from public, anon;
grant execute on function public.dq_next_question(uuid, text) to authenticated;

create or replace function public.dq_answer(p_question uuid, p_choice integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); q record; is_ok boolean; awarded integer; total integer;
begin
  if me is null then raise exception 'غير مسموح'; end if;
  select * into q from public.dynamic_quiz_questions where id = p_question and active;
  if not found or not public.dq_can_play(q.page_id) then raise exception 'السؤال غير متاح'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then raise exception 'اختيار غير صالح'; end if;
  is_ok := (p_choice = q.correct_index);
  awarded := case when is_ok then q.points else 0 end;
  begin
    insert into public.dynamic_quiz_answers (question_id, user_id, choice, correct, points) values (q.id, me, p_choice, is_ok, awarded);
  exception when unique_violation then
    raise exception 'جاوبت على السؤال ده قبل كده';
  end;
  select coalesce(sum(a.points), 0)::integer into total
    from public.dynamic_quiz_answers a join public.dynamic_quiz_questions z on z.id = a.question_id
    where a.user_id = me and z.page_id = q.page_id and z.block_id = q.block_id;
  return jsonb_build_object('correct', is_ok, 'correct_index', q.correct_index, 'points_awarded', awarded, 'total_points', total);
end $$;
revoke all on function public.dq_answer(uuid, integer) from public, anon;
grant execute on function public.dq_answer(uuid, integer) to authenticated;

create or replace function public.dq_state(p_page uuid, p_block text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); pts integer; done integer; tot integer;
begin
  if me is null or not public.dq_can_play(p_page) then raise exception 'غير مسموح'; end if;
  select coalesce(sum(a.points), 0)::integer, count(*)::integer into pts, done
    from public.dynamic_quiz_answers a join public.dynamic_quiz_questions z on z.id = a.question_id
    where a.user_id = me and z.page_id = p_page and z.block_id = p_block;
  select count(*)::integer into tot from public.dynamic_quiz_questions z where z.page_id = p_page and z.block_id = p_block and z.active;
  return jsonb_build_object('points', pts, 'answered', done, 'total', tot);
end $$;
revoke all on function public.dq_state(uuid, text) from public, anon;
grant execute on function public.dq_state(uuid, text) to authenticated;

drop function if exists public.dq_leaderboard(uuid, text);
create or replace function public.dq_leaderboard(p_page uuid, p_block text) returns table (
  rank integer, full_name text, points integer, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.dq_can_play(p_page) then raise exception 'غير مسموح'; end if;
  return query
    with s as (
      select a.user_id as uid, sum(a.points)::integer as pts
      from public.dynamic_quiz_answers a join public.dynamic_quiz_questions z on z.id = a.question_id
      where z.page_id = p_page and z.block_id = p_block group by a.user_id),
    r as (select s.uid, s.pts, (rank() over (order by s.pts desc))::integer as rk from s)
    select r.rk, u.full_name, r.pts, (r.uid = me)
    from r join public.users u on u.id = r.uid
    where r.rk <= 10 or r.uid = me
    order by r.rk, u.full_name limit 15;
end $$;
revoke all on function public.dq_leaderboard(uuid, text) from public, anon;
grant execute on function public.dq_leaderboard(uuid, text) to authenticated;
