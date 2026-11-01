/*
  استمارة وتصويت داخل الصفحات الديناميكية:
  - عنصر form في بنية الصفحة: حقول (نص قصير/طويل، اختيار، رقم، تقييم) وخيارات: مرة واحدة لكل مستخدم، وعرض نتائج التصويت.
  - الردود في جدول مقفول: الإرسال والفحص بدالة df_submit على السيرفر (بتتحقق من الحقول زي ما اتعرّفت في الصفحة، مش من اللي المتصفح بيقوله).
  - الأدمن بس هو اللي بيشوف الردود (df_list_responses). الباقي بيشوف نتائج التصويت المجمّعة لو الصفحة سامحة.
  ⚠️ شغّله بعد 20261025100000_dynamic_quiz.sql
*/

-- ============ 1) السماح بعنصر form في فحص البنية ============
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
      when 'form' then array['title','submit_label','once','results','fields']
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
      elsif k in ('rows', 'fields') then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) > (case when k = 'fields' then 12 else 30 end) then return false; end if;
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

-- ============ 2) الجدول ============
create table if not exists public.dynamic_form_responses (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.dynamic_pages(id) on delete cascade,
  block_id text not null check (block_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  fields jsonb not null,    -- أنواع وأسماء الحقول وقت الإرسال [[النوع, الاسم], ...] (عشان التصدير يفضل صح لو الأدمن عدّل الاستمارة بعدين)
  answers jsonb not null,   -- { "رقم الحقل": "الإجابة" }
  created_at timestamptz not null default now(),
  check (octet_length(answers::text) <= 8000)
);
create index if not exists df_responses_block_idx on public.dynamic_form_responses (page_id, block_id, created_at desc);
create index if not exists df_responses_user_idx on public.dynamic_form_responses (user_id, page_id, block_id);
alter table public.dynamic_form_responses enable row level security;
revoke all on public.dynamic_form_responses from anon, authenticated;

-- ============ 3) الدوال ============
-- مين يقدر يشوف الصفحة (نفس قاعدة العرض): مستخدم نشط، صفحة منشورة وغير محذوفة ومسموحة لدوره، والأدمن يجرّب دايمًا
create or replace function public.dp_can_view(p_page uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u join public.dynamic_pages d on d.id = p_page
    where u.id = auth.uid() and u.status = 'active' and u.role in ('member','servant','admin')
      and d.is_deleted = false and (d.status = 'published' or u.role = 'admin')
      and (d.target_role = 'all' or d.target_role = u.role or u.role = 'admin'));
$$;
revoke all on function public.dp_can_view(uuid) from public, anon;
grant execute on function public.dp_can_view(uuid) to authenticated;

-- بيلاقي عنصر الاستمارة جوه بنية الصفحة
create or replace function public.df_find(p_page uuid, p_block text) returns jsonb
language sql stable security definer set search_path = public as $$
  select c from public.dynamic_pages d, jsonb_array_elements(d.ui_structure->'components') c
  where d.id = p_page and c->>'type' = 'form' and c->>'id' = p_block limit 1;
$$;
revoke all on function public.df_find(uuid, text) from public, anon, authenticated;

create or replace function public.df_submit(p_page uuid, p_block text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); comp jsonb; flds jsonb; fld jsonb; idx integer; ftype text; flabel text; freq boolean;
  opts text[]; v text; clean jsonb := '{}'::jsonb; once boolean;
  bad text := '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
              || chr(8203) || chr(8288) || chr(65279) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  if me is null or not public.dp_can_view(p_page) then raise exception 'غير مسموح'; end if;
  comp := public.df_find(p_page, p_block);
  if comp is null then raise exception 'الاستمارة غير موجودة'; end if;
  flds := coalesce(comp->'props'->'fields', '[]'::jsonb);
  if jsonb_typeof(flds) is distinct from 'array' or jsonb_array_length(flds) = 0 then raise exception 'الاستمارة فاضية'; end if;
  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text) > 8000 then raise exception 'إجابات غير صالحة'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > jsonb_array_length(flds) then raise exception 'إجابات غير صالحة'; end if;
  once := coalesce(comp->'props'->>'once', '1') <> '0';

  -- أقصى 10 إرسالات في الدقيقة لكل مستخدم (منع الإغراق)
  if (select count(*) from public.dynamic_form_responses r where r.user_id = me and r.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'بتبعت بسرعة. استنى شوية.';
  end if;

  for fld, idx in select f.value, (f.ord - 1)::integer from jsonb_array_elements(flds) with ordinality as f(value, ord) loop
    ftype := fld->>0; flabel := fld->>1; freq := coalesce(fld->>2, '0') = '1';
    v := null;
    if (p_answers->idx::text) is not null then
      if jsonb_typeof(p_answers->idx::text) is distinct from 'string' then raise exception 'إجابة غير صالحة في «%»', flabel; end if;
      v := btrim(regexp_replace(p_answers->>idx::text, bad, '', 'g'));
    end if;
    if v is null or v = '' then
      if freq then raise exception 'الحقل «%» مطلوب', flabel; end if;
      continue;
    end if;
    if ftype = 'text' then
      if char_length(v) > 200 then raise exception 'الحقل «%» طويل', flabel; end if;
    elsif ftype = 'long' then
      if char_length(v) > 1000 then raise exception 'الحقل «%» طويل', flabel; end if;
    elsif ftype = 'choice' then
      select coalesce(array_agg(o #>> '{}'), array[]::text[]) into opts
        from jsonb_array_elements(fld) with ordinality as t(o, n) where n > 3;
      if not (v = any(opts)) then raise exception 'اختار إجابة صحيحة في «%»', flabel; end if;
    elsif ftype = 'number' then
      if v !~ '^-?[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception '«%» لازم يكون رقم', flabel; end if;
    elsif ftype = 'rating' then
      if v !~ '^[1-5]$' then raise exception '«%» لازم تقييم من 1 إلى 5', flabel; end if;
    else
      raise exception 'نوع حقل غير مدعوم';
    end if;
    clean := clean || jsonb_build_object(idx::text, v);
  end loop;

  -- قفل بسيط يمنع إرسالين متزامنين من نفس المستخدم يعدّوا الفحص مع بعض
  perform pg_advisory_xact_lock(hashtextextended(p_page::text || ':' || p_block || ':' || me::text, 0));
  if once and exists (select 1 from public.dynamic_form_responses r where r.page_id = p_page and r.block_id = p_block and r.user_id = me) then
    raise exception 'جاوبت على الاستمارة دي قبل كده';
  end if;
  insert into public.dynamic_form_responses (page_id, block_id, user_id, fields, answers)
    values (p_page, p_block, me, (select coalesce(jsonb_agg(jsonb_build_array(x->>0, x->>1)), '[]'::jsonb) from jsonb_array_elements(flds) x), clean);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.df_submit(uuid, text, jsonb) from public, anon;
grant execute on function public.df_submit(uuid, text, jsonb) to authenticated;

-- حالة المستخدم + نتائج التصويت المجمّعة (لو الصفحة سامحة بعرضها أو لو أدمن)
create or replace function public.df_state(p_page uuid, p_block text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid(); comp jsonb; flds jsonb; fld jsonb; idx integer; opts text[]; o text; counts jsonb; res jsonb := '[]'::jsonb;
  submitted boolean; show boolean; total integer;
begin
  if me is null or not public.dp_can_view(p_page) then raise exception 'غير مسموح'; end if;
  comp := public.df_find(p_page, p_block);
  if comp is null then return jsonb_build_object('submitted', false, 'results', null); end if;
  submitted := exists (select 1 from public.dynamic_form_responses r where r.page_id = p_page and r.block_id = p_block and r.user_id = me);
  show := coalesce(comp->'props'->>'results', '0') = '1' or public.is_admin();
  if not show then return jsonb_build_object('submitted', submitted, 'results', null); end if;
  select count(*)::integer into total from public.dynamic_form_responses r where r.page_id = p_page and r.block_id = p_block;
  flds := coalesce(comp->'props'->'fields', '[]'::jsonb);
  for fld, idx in select f.value, (f.ord - 1)::integer from jsonb_array_elements(flds) with ordinality as f(value, ord) loop
    continue when fld->>0 <> 'choice';
    select coalesce(array_agg(x #>> '{}'), array[]::text[]) into opts from jsonb_array_elements(fld) with ordinality as t(x, n) where n > 3;
    counts := '{}'::jsonb;
    foreach o in array opts loop
      counts := counts || jsonb_build_object(o, (select count(*) from public.dynamic_form_responses r where r.page_id = p_page and r.block_id = p_block and r.answers->>idx::text = o));
    end loop;
    res := res || jsonb_build_array(jsonb_build_object('index', idx, 'label', fld->>1, 'counts', counts));
  end loop;
  return jsonb_build_object('submitted', submitted, 'results', jsonb_build_object('total', total, 'fields', res));
end $$;
revoke all on function public.df_state(uuid, text) from public, anon;
grant execute on function public.df_state(uuid, text) to authenticated;

-- الأدمن: كل الردود مع أسماء أصحابها
drop function if exists public.df_list_responses(uuid, text);
create or replace function public.df_list_responses(p_page uuid, p_block text) returns table (
  full_name text, username text, church_class text, created_at timestamptz, fields jsonb, answers jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query
    select u.full_name, u.username, u.church_class, r.created_at, r.fields, r.answers
    from public.dynamic_form_responses r join public.users u on u.id = r.user_id
    where r.page_id = p_page and r.block_id = p_block
    order by r.created_at desc limit 2000;
end $$;
revoke all on function public.df_list_responses(uuid, text) from public, anon;
grant execute on function public.df_list_responses(uuid, text) to authenticated;
