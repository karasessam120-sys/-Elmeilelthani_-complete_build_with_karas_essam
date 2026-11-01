// يجهّز طلب التطوير كنص واحد جاهز للنسخ واللصق (للمطوّر أو لـ Claude).
export type DevSpec = { title?: string; description?: string };

export function buildSpec(r: { title: string; body: string; from_name?: string; spec?: DevSpec | null }): string {
  const lines = [
    'ابنِ الميزة دي في تطبيق «الميل الثاني» (React + TypeScript + Supabase). التطبيق بالعربي RTL، وبيشتغل أوفلاين، وكل التحقق والصلاحيات على السيرفر (RLS ودوال RPC).',
    '',
    `# ${r.title}`,
    r.from_name ? `طلب من: ${r.from_name}` : '',
    '',
    '## المطلوب',
    r.body,
  ];
  const s = r.spec || {};
  if (s.title || s.description) {
    lines.push('', '## تفاصيل إضافية');
    if (s.title) lines.push(`- العنوان: ${s.title}`);
    if (s.description) lines.push(`- الوصف: ${s.description}`);
  }
  return lines.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}
