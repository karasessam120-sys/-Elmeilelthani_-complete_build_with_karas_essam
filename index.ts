// Edge Function: بتبعت إيميلات الترحيب وكلمة السر المؤقتة.
// الأسرار المطلوبة: RESEND_API_KEY و MAIL_FROM (واختياري APP_URL). باقي المتغيرات بيحطها Supabase لوحده.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const GOLD = '#d4af37';
function shell(heading: string, inner: string, appUrl: string) {
  const button = appUrl
    ? `<p style="text-align:center;margin:28px 0 4px"><a href="${esc(appUrl)}" style="background:${GOLD};color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:10px;display:inline-block">افتح التطبيق</a></p>`
    : '';
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#0f0f14;padding:24px 12px;font-family:Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#1a1a22;border:1px solid ${GOLD}55;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,${GOLD},#f1d77a);padding:22px;text-align:center;color:#1a1a1a">
<div style="font-size:22px;font-weight:bold">الميل الثاني</div><div style="font-size:12px;margin-top:4px">كنيسة ماريوحنا الحبيب بحلمية الزيتون</div></td></tr>
<tr><td style="padding:28px 24px;color:#e8e8ee;font-size:15px;line-height:1.9">
<h2 style="margin:0 0 14px;color:${GOLD};font-size:20px;text-align:center">${heading}</h2>${inner}${button}</td></tr>
<tr><td style="padding:14px;text-align:center;color:#888;font-size:11px;border-top:1px solid #ffffff14">رسالة تلقائية من تطبيق الميل الثاني</td></tr></table></body></html>`;
}

const verse = (text: string) => `<p style="margin:18px 0;padding:12px 14px;border-right:3px solid ${GOLD};background:#ffffff0a;color:#f1e3a8">${text}</p>`;

function servantWelcome(name: string, appUrl: string) {
  return {
    subject: 'تم قبول حسابك كخادم في الميل الثاني 🕊️',
    html: shell(`أهلًا بيك يا ${esc(name)} 🕊️`,
      `<p>تم قبول حسابك كخادم في الميل الثاني. 🌿<br>فرحانين إنك معانا في خدمة كنيسة ماريوحنا الحبيب، وربنا يبارك خدمتك ويديك محبة ونعمة لكل مخدوم في فصلك.</p>${verse('«فَإِنَّنَا نَحْنُ عَامِلاَنِ مَعَ ٱللهِ» (١ كو ٣: ٩)')}<p>تقدر دلوقتي تدخل بحسابك وتبدأ خدمتك. ربنا معاك ✨</p>`, appUrl),
  };
}
function memberWelcome(name: string, appUrl: string) {
  return {
    subject: 'نورت الميل الثاني 🎉',
    html: shell(`نورت الميل الثاني يا ${esc(name)} 🎉`,
      `<p>فرحانين بيك معانا في كنيسة ماريوحنا الحبيب! 🌟<br>هنا هتلاقي اختبارات وهدايا ونجوم وفارس الإنجيل، وكل أسبوع فرصة جديدة تكسب فيها وتتقدم.</p>${verse('«فَرِحْتُ بِٱلْقَائِلِينَ لِي: إِلَى بَيْتِ ٱلرَّبِّ نَذْهَبُ» (مز ١٢٢: ١)')}<p>ربنا يفرّح قلبك ويبارك حياتك. 🕊️</p>`, appUrl),
  };
}
function tempPassword(name: string, username: string, pw: string, minutes: number, appUrl: string) {
  return {
    subject: 'كلمة السر المؤقتة — الميل الثاني 🔑',
    html: shell('كلمة السر المؤقتة 🔑',
      `<p>أهلًا ${esc(name)}،<br>الأدمن وافق على طلبك. دي كلمة السر المؤقتة بتاعتك:</p>
<p style="text-align:center;margin:18px 0"><span dir="ltr" style="display:inline-block;font-family:Consolas,monospace;font-size:26px;letter-spacing:3px;font-weight:bold;color:${GOLD};background:#00000040;border:1px solid ${GOLD}66;border-radius:10px;padding:12px 22px">${esc(pw)}</span></p>
<p>اسم المستخدم: <b dir="ltr" style="color:${GOLD}">${esc(username)}</b></p>
<p style="color:#f5c26b">⏳ صالحة لمدة <b>${minutes} دقيقة</b> بس. ادخل بيها دلوقتي، وهيطلب منك تختار كلمة سر جديدة علطول.</p>
<p style="font-size:12px;color:#999">لو ما طلبتش ده، تجاهل الرسالة وبلّغ الأدمن.</p>`, appUrl),
  };
}

async function sendMail(to: string, mail: { subject: string; html: string }) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!key || !from) throw new Error('إعدادات الإيميل ناقصة (RESEND_API_KEY / MAIL_FROM)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html }),
  });
  if (!res.ok) throw new Error(`فشل الإرسال (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const appUrl = Deno.env.get('APP_URL') || '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: 'غير مسموح' }, 401);

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: me } = await db.from('users').select('id, role, status, full_name, contact_email, welcome_emailed_at').eq('id', auth.user.id).maybeSingle();
    if (!me || me.status !== 'active') return json({ error: 'غير مسموح' }, 403);

    const body = await req.json().catch(() => ({}));
    const type = String(body.type || '');

    // ترحيب المخدوم بعد التسجيل (لنفسه بس ومرة واحدة)
    if (type === 'welcome') {
      if (me.role !== 'member') return json({ error: 'غير مسموح' }, 403);
      if (!me.contact_email) return json({ skipped: 'no_email' });
      if (me.welcome_emailed_at) return json({ skipped: 'already' });
      await sendMail(me.contact_email, memberWelcome(me.full_name || '', appUrl));
      await db.from('users').update({ welcome_emailed_at: new Date().toISOString() }).eq('id', me.id);
      return json({ ok: true });
    }

    if (me.role !== 'admin') return json({ error: 'غير مسموح' }, 403);

    // ترحيب الخادم بعد اعتماد الأدمن له
    if (type === 'approved') {
      const { data: t } = await db.from('users').select('id, role, status, full_name, contact_email, welcome_emailed_at').eq('id', String(body.user_id || '')).maybeSingle();
      if (!t || t.role !== 'servant' || t.status !== 'active') return json({ error: 'الخادم مش معتمد' }, 400);
      if (!t.contact_email) return json({ skipped: 'no_email' });
      if (t.welcome_emailed_at) return json({ skipped: 'already' });
      await sendMail(t.contact_email, servantWelcome(t.full_name || '', appUrl));
      await db.from('users').update({ welcome_emailed_at: new Date().toISOString() }).eq('id', t.id);
      return json({ ok: true });
    }

    // كلمة السر المؤقتة بعد موافقة الأدمن (السيرفر هو اللي بيقرا الكلمة، مش المتصفح)
    if (type === 'temp_password') {
      const { data: r } = await db.from('password_resets').select('id, user_id, username, status, temp_password, expires_at').eq('id', String(body.request_id || '')).maybeSingle();
      if (!r || r.status !== 'opened' || !r.temp_password || !r.expires_at || new Date(r.expires_at).getTime() <= Date.now()) return json({ error: 'الطلب مش جاهز للإرسال أو انتهت صلاحيته' }, 400);
      const { data: t } = await db.from('users').select('full_name, contact_email').eq('id', r.user_id).maybeSingle();
      if (!t?.contact_email) return json({ skipped: 'no_email' });
      const minutes = Math.max(1, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 60000));
      await sendMail(t.contact_email, tempPassword(t.full_name || '', r.username, r.temp_password, minutes, appUrl));
      return json({ ok: true });
    }

    return json({ error: 'نوع غير معروف' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'خطأ غير متوقع' }, 500);
  }
});
