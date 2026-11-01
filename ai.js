import { consumeQuota, requireStaff } from './_auth.js';

// دالة سيرفر على Vercel: تخبّي مفتاح الذكاء الاصطناعي ولا تقبل غير الخدام والأدمن
export const config = { maxDuration: 60 };

const CHAT = (mode) => `أنت "رفيق التحضير"، مساعد ودود لخدام مدارس الأحد. تتكلم بالعامية المصرية البسيطة وبردود قصيرة ومشجعة.
بتساعد الخادم يحضّر ${mode === 'ppt' ? 'عرض بوربوينت' : 'فيديو قصير'} لدرس لمخدوميه.
- اسأل سؤال واحد بس في كل رد (الفئة العمرية، الآية أو القصة، النقاط المهمة، المدة).
- اقترح أفكار قصيرة للشرائح أو المشاهد، من غير ما تكتب التحضير كامل.
- المحتوى مسيحي مناسب للأطفال ودقيق كتابيًا. لو مش متأكد من نص آية اذكر رقمها بس.
- اكتب نص عادي بدون رموز تنسيق (لا تستخدم ** ولا # ولا -).
- لما الخادم يبقى جاهز، قوله يختار مصدر الصور ويدوس زرار "جهّز التحضير".`;

const PLAN = (mode) => `أنت مساعد تحضير لخدام مدارس الأحد. اكتب ${mode === 'ppt' ? 'عرض بوربوينت من 5 إلى 7 شرائح' : 'سيناريو فيديو قصير من 4 إلى 6 مشاهد'} بناءً على المحادثة.
ارجع JSON فقط، بدون أي نص خارجه وبدون علامات \`\`\`، بالشكل ده بالظبط:
{"title":"عنوان الدرس","slides":[{"title":"عنوان قصير","bullets":["نقطة قصيرة","نقطة قصيرة"],"narration":"جملتين أو تلات بالعامية المصرية للقراءة بصوت عالي","imagePrompt":"short English description of a child-friendly illustration, no text in the image"}]}
القواعد: من 2 إلى 4 نقاط في كل شريحة، الأولى شريحة العنوان والأخيرة خلاصة أو صلاة، المحتوى دقيق كتابيًا، ولا تخترع نصوص آيات (لو مش متأكد اذكر الرقم بس).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'مفتاح الذكاء الاصطناعي غير مضبوط على السيرفر' });

  try {
    // تحقق إن المستخدم خادم أو أدمن مفعّل
    if (!(await requireStaff(req, res))) return;

    const { kind, mode, messages } = req.body || {};
    if (!(await consumeQuota(req, res, kind === 'plan' ? 3 : 1))) return;
    const m = mode === 'video' ? 'video' : 'ppt';
    let msgs = (Array.isArray(messages) ? messages : [])
      .filter((x) => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
      .map((x) => ({ role: x.role, content: x.content.slice(0, 3000) }))
      .slice(-12);
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (msgs.reduce((sum, item) => sum + item.content.length, 0) > 24000) return res.status(413).json({ error: 'المحادثة طويلة جدًا. ابدأ محادثة جديدة.' });
    if (!msgs.length) return res.status(400).json({ error: 'اكتب رسالة الأول' });

    const system = kind === 'plan' ? PLAN(m) : CHAT(m);

    // مجاني: Google Gemini (لو GEMINI_API_KEY موجود)، وإلا Anthropic
    if (process.env.GEMINI_API_KEY) {
      const merged = [];
      for (const x of msgs) {
        const role = x.role === 'assistant' ? 'model' : 'user';
        if (merged.length && merged[merged.length - 1].role === role) merged[merged.length - 1].parts[0].text += '\n' + x.content;
        else merged.push({ role, parts: [{ text: x.content }] });
      }
      const gm = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const reqBody = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: merged,
        generationConfig: {
          maxOutputTokens: kind === 'plan' ? 8192 : 2048,
          temperature: 0.7,
          ...(kind === 'plan' ? { responseMimeType: 'application/json' } : {}),
        },
      });
      let resp;
      let j = {};
      // لو الموديل مشغول (500/503) نحاول تاني لحد 3 مرات
      for (let attempt = 0; attempt < 3; attempt++) {
        resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: reqBody,
        });
        j = await resp.json().catch(() => ({}));
        if (resp.status !== 503 && resp.status !== 500) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!resp.ok) {
        if (resp.status === 503 || resp.status === 500) return res.status(503).json({ error: 'الموديل مشغول دلوقتي عند Google. جرّب بعد دقيقة.' });
        if (resp.status === 429) return res.status(429).json({ error: 'الحد المجاني خلص مؤقتًا. جرّب بعد دقيقة.' });
        if (resp.status === 400 || resp.status === 403) return res.status(502).json({ error: 'مفتاح Gemini غير صحيح أو الموديل غير متاح.' });
        return res.status(502).json({ error: 'خطأ من خدمة الذكاء الاصطناعي' });
      }
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) return res.status(502).json({ error: 'الرد اتحجب. جرّب صياغة تانية.' });
      return res.status(200).json({ text });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5-5',
        max_tokens: kind === 'plan' ? 4000 : 700,
        system,
        messages: msgs,
      }),
    });
    const j = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: 'خطأ من خدمة الذكاء الاصطناعي' });
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'حصل خطأ في السيرفر' });
  }
}
