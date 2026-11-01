// تحويل الكلام لصوت بـ Gemini TTS (يدعم العربية المصرية) — للخدام والأدمن فقط
import { requireStaff, consumeQuota } from './_auth.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'مفتاح Gemini غير مضبوط على السيرفر' });
  if (!(await requireStaff(req, res))) return;
  if (!(await consumeQuota(req, res, 1))) return;

  const { text, voice, style } = req.body || {};
  const clean = String(text || '').trim().slice(0, 900);
  if (!clean) return res.status(400).json({ error: 'مفيش كلام للقراءة' });
  const v = /^[\w-]{2,80}$/.test(String(voice || '')) ? String(voice) : 'Kore';
  const st = String(style || 'warm and friendly').slice(0, 120);
  const model = process.env.TTS_MODEL || 'gemini-3.8-flash-lite-tts';

  const body = JSON.stringify({
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text: clean, annotations: [{ type: 'speech_metadata', style: st }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: v }] },
  });

  try {
    let resp;
    let j = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
      });
      j = await resp.json().catch(() => ({}));
      if (resp.status !== 503 && resp.status !== 500) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!resp.ok) {
      if (resp.status === 429) return res.status(429).json({ error: 'الحد المجاني للصوت خلص مؤقتًا. جرّب بعد دقيقة.' });
      if (resp.status === 503 || resp.status === 500) return res.status(503).json({ error: 'خدمة الصوت مشغولة دلوقتي. جرّب بعد دقيقة.' });
      return res.status(502).json({ error: 'تعذر توليد الصوت' });
    }
    let audio = null;
    for (const s of j.steps || []) for (const c of s.content || []) if (c.type === 'audio' && c.data) audio = c;
    if (!audio) return res.status(502).json({ error: 'الخدمة مرجّعتش صوت. جرّب تاني.' });
    return res.status(200).json({ audio: audio.data, mime: audio.mime_type || 'audio/wav' });
  } catch {
    return res.status(500).json({ error: 'حصل خطأ في السيرفر' });
  }
}
