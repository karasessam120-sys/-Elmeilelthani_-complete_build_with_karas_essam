/*
  اختياري: مسح بيانات الصفحات الديناميكية القديمة (اتلغت من التطبيق).
  ⚠️ بيمسح نهائيًا: الصفحات وأسئلة المسابقات وإجابات الناس وردود الاستمارات وسجل التدقيق. اعمل نسخة احتياطية الأول لو محتاجها.
  مش بيمس: اقتراحات التطوير وصنّاع التطبيق وباقي التطبيق. الملف ده مش جوه migrations عن قصد عشان ما يتشغّلش لوحده.
*/
drop table if exists public.dynamic_form_responses cascade;
drop table if exists public.dynamic_quiz_answers cascade;
drop table if exists public.dynamic_quiz_questions cascade;
drop table if exists public.pages_audit_logs cascade;
drop table if exists public.dynamic_pages cascade;

drop function if exists public.df_submit(uuid, text, jsonb);
drop function if exists public.df_state(uuid, text);
drop function if exists public.df_list_responses(uuid, text);
drop function if exists public.df_find(uuid, text);
drop function if exists public.dp_can_view(uuid);
drop function if exists public.dq_next_question(uuid, text);
drop function if exists public.dq_answer(uuid, integer);
drop function if exists public.dq_state(uuid, text);
drop function if exists public.dq_leaderboard(uuid, text);
drop function if exists public.dq_can_play(uuid);
drop function if exists public.dq_options_valid(jsonb);
drop function if exists public.dynamic_pages_touch_and_audit();
drop function if exists public.dynamic_pages_block_delete();
drop function if exists public.pages_audit_immutable();
-- (دالة dynamic_ui_is_valid بنسيبها لأن admin_send_dev_request بتعتمد عليها لو اتبعتت بنية صفحة)
