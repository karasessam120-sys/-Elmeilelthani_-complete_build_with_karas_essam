/*
  تقوية أمان الصفحات الديناميكية (آمن لإعادة التشغيل):
  1) فحص بنية الصفحة داخل قاعدة البيانات نفسها (مش بس في الواجهة): أنواع مسموحة، خصائص مسموحة، أطوال، بدون محارف تحكم.
  2) منع الحذف النهائي (الحذف دايمًا "آمن" بعلامة is_deleted) عشان سجل التدقيق يفضل كامل.
  3) سجل التدقيق مقفول: مفيش تعديل ولا حذف من أي مستخدم.
  4) تفعيل التحديث اللحظي لجدول الصفحات.
  ⚠️ شغّله بعد 20261023123000_dynamic_pages_prompt_used.sql
*/

-- ============ 1) فحص البنية ============
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

-- NOT VALID: يُطبَّق على أي حفظ جديد. لو الصفحات القديمة سليمة بيتفعّل على الكل.
do $$ begin
  alter table public.dynamic_pages add constraint dynamic_pages_ui_valid check (public.dynamic_ui_is_valid(ui_structure)) not valid;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.dynamic_pages validate constraint dynamic_pages_ui_valid;
exception when others then
  raise notice 'فيه صفحات قديمة بنيتها مش مطابقة للقواعد الجديدة. القاعدة هتتطبق على أي حفظ جديد، وعدّل القديمة من منشئ الصفحات.';
end $$;

-- ============ 2) لا حذف نهائي ============
revoke delete on public.dynamic_pages from anon, authenticated;
revoke all on public.dynamic_pages from anon;
create or replace function public.dynamic_pages_block_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'الحذف النهائي غير مسموح. استخدم "حذف آمن" (سلة المحذوفات).';
end $$;
drop trigger if exists dynamic_pages_no_delete on public.dynamic_pages;
create trigger dynamic_pages_no_delete before delete on public.dynamic_pages for each row execute function public.dynamic_pages_block_delete();

-- ============ 3) سجل التدقيق مقفول ============
revoke all on public.pages_audit_logs from anon;
revoke insert, update, delete on public.pages_audit_logs from authenticated;
create or replace function public.pages_audit_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- السماح الوحيد: لما حساب أدمن يتمسح، قاعدة البيانات بتفضّي actor_id تلقائيًا
  if tg_op = 'UPDATE' and new.actor_id is null
     and (new.id, new.page_id, new.page_title, new.actor_name, new.action, new.details, new.created_at)
         is not distinct from (old.id, old.page_id, old.page_title, old.actor_name, old.action, old.details, old.created_at) then
    return new;
  end if;
  raise exception 'سجل التدقيق لا يمكن تعديله أو حذفه';
end $$;
drop trigger if exists pages_audit_immutable_trg on public.pages_audit_logs;
create trigger pages_audit_immutable_trg before update or delete on public.pages_audit_logs for each row execute function public.pages_audit_immutable();

-- ============ 4) التحديث اللحظي ============
do $$ begin
  alter publication supabase_realtime add table public.dynamic_pages;
exception when others then null;
end $$;
