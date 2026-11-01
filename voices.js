// قايمة الأصوات: الأصوات المصرية من مكتبة Gemini أولًا، وبعدها أصوات جاهزة
import { requireStaff } from './_auth.js';

const FALLBACK = [
  { id: 'Kore', label: 'Kore — ثابت وواضح' },
  { id: 'Aoede', label: 'Aoede — هادي ولطيف' },
  { id: 'Sulafat', label: 'Sulafat — دافئ' },
  { id: 'Achird', label: 'Achird — ودود' },
  { id: 'Leda', label: 'Leda — شبابي' },
  { id: 'Zephyr', label: 'Zephyr — مشرق' },
  { id: 'Puck', label: 'Puck — مرح' },
  { id: 'Charon', label: 'Charon — واضح ورسمي' },
  { id: 'Fenrir', label: 'Fenrir — حماسي' },
  { id: 'Gacrux', label: 'Gacrux — ناضج' },
];

async function list(query) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?${query}`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return j.voices || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireStaff(req, res))) return;
  let found = [];
  if (process.env.GEMINI_API_KEY) {
    found = await list('language_code=ar-EG&page_size=40');
    if (!found.length) found = await list('region_code=EG&page_size=40');
  }
  const egyptian = found
    .filter((x) => x && x.id)
    .map((x) => ({
      id: String(x.id),
      label: `${x.display_name || x.id}${x.gender === 'female' ? ' (أنثى)' : x.gender === 'male' ? ' (ذكر)' : ''} · مصري`,
    }));
  const seen = new Set(egyptian.map((x) => x.id));
  const voices = [...egyptian, ...FALLBACK.filter((x) => !seen.has(x.id))];
  return res.status(200).json({ voices, egyptianCount: egyptian.length });
}
