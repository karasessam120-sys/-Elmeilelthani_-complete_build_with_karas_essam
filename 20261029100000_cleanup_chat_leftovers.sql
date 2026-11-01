/*
  تنظيف بقايا الشات والحرمان القديمين (اتلغوا من التطبيق). آمن لإعادة التشغيل ولقواعد من غير شات (كله drop if exists).
  بيمسح: جداول الشات والأصدقاء والبلاغات ودوالها وتريجر الفحص (moderate_chat_hook)،
         ونظام الحرمان القديم (user_restrictions) وتريجراته لأنه مفيش شاشة تتحكم فيه دلوقتي.
  بيحافظ على: كمية الهدايا (trigger b_consume_reward_quantity) وكل باقي التطبيق.
  ملاحظة: الـ bucket اسمه chat-media امسحه من Storage في لوحة Supabase لو موجود (مش بنمسحه بـ SQL).
*/
-- الشات والأصدقاء
drop trigger if exists chat_messages_moderation on public.chat_messages;
drop function if exists public.moderate_chat_hook();
drop table if exists public.chat_reports cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.friendships cascade;
drop function if exists public.chat_contacts();
drop function if exists public.chat_search_people(text);
drop function if exists public.friend_requests();
drop function if exists public.friend_request(uuid);
drop function if exists public.friend_respond(uuid, boolean);
drop function if exists public.friend_remove(uuid);
drop function if exists public.send_chat_message(uuid, text, text, text, integer);
drop function if exists public.mark_chat_read(uuid);
drop function if exists public.report_chat_message(uuid, text);
drop function if exists public.admin_list_chat_reports(text);
drop function if exists public.admin_resolve_chat_report(uuid, text, text[], integer, integer, text);
drop function if exists public.can_chat(uuid, uuid);
drop function if exists public.chat_guard();
drop function if exists public.notify_admins(text, text, text);

do $$ begin
  drop policy if exists chat_media_insert on storage.objects;
  drop policy if exists chat_media_select on storage.objects;
exception when others then
  raise notice 'تعذر مسح سياسات chat-media. امسحها من Storage Policies لو موجودة.';
end $$;

-- الحرمان القديم
drop trigger if exists a_enforce_restrictions on public.quiz_attempts;
drop trigger if exists a_enforce_restrictions on public.reward_redemptions;
drop function if exists public.enforce_restrictions();
drop function if exists public.admin_list_restrictions();
drop function if exists public.admin_lift_restriction(uuid);
drop table if exists public.user_restrictions cascade;
drop function if exists public.is_restricted(uuid, text);
