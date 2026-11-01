// محرك بسيط بيجاوب على طلبات PostgREST (اللي بيبعتها supabase-js) من نسخة جدول محفوظة على الجهاز.
// بيتستخدم بس لما النت فاصل ومفيش نسخة جاهزة لنفس الطلب بالظبط.
// لو الطلب فيه حاجة مش مدعومة (or / and / embedded select / عامل غريب) بيرجّع null ونرجع للسلوك العادي.

type Row = Record<string, unknown>;
export type SnapAnswer = { status: number; body: string; contentType: string; contentRange?: string };

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
const ISO = /^\d{4}-\d{2}-\d{2}T/;
const COL = /^[A-Za-z0-9_]+$/;

const splitTop = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
};

const parseList = (v: string): string[] => {
  const inner = v.startsWith('(') && v.endsWith(')') ? v.slice(1, -1) : v;
  return splitTop(inner).map((x) => (x.startsWith('"') && x.endsWith('"') ? x.slice(1, -1) : x));
};

// -1 / 0 / 1، أو null لو مش قابلين للمقارنة
const cmp = (a: unknown, b: string): number | null => {
  if (typeof a === 'number') { const n = Number(b); return Number.isNaN(n) ? null : a === n ? 0 : a < n ? -1 : 1; }
  if (typeof a === 'boolean') return String(a) === b ? 0 : 1;
  if (typeof a === 'string') {
    if (ISO.test(a) && ISO.test(b)) { const x = Date.parse(a), y = Date.parse(b); return x === y ? 0 : x < y ? -1 : 1; }
    return a === b ? 0 : a < b ? -1 : 1;
  }
  return null;
};

const likeToRe = (p: string, ci: boolean) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.') + '$', ci ? 'is' : 's');

// null = عامل مش مدعوم
function makeFilter(col: string, spec: string): ((r: Row) => boolean) | null {
  let neg = false;
  let s = spec;
  if (s.startsWith('not.')) { neg = true; s = s.slice(4); }
  const dot = s.indexOf('.');
  if (dot < 0) return null;
  const op = s.slice(0, dot);
  const val = s.slice(dot + 1);
  let test: ((v: unknown) => boolean) | null = null;
  if (op === 'is') {
    test = (v) => (val === 'null' ? v == null : val === 'true' ? v === true : val === 'false' ? v === false : false);
    return (r) => { const t = test!(r[col]); return neg ? !t : t; };
  }
  if (op === 'eq') test = (v) => cmp(v, val) === 0;
  else if (op === 'neq') test = (v) => { const c = cmp(v, val); return c !== null && c !== 0; };
  else if (op === 'gt') test = (v) => (cmp(v, val) ?? -2) > 0;
  else if (op === 'gte') test = (v) => (cmp(v, val) ?? -2) >= 0;
  else if (op === 'lt') test = (v) => { const c = cmp(v, val); return c !== null && c < 0; };
  else if (op === 'lte') test = (v) => { const c = cmp(v, val); return c !== null && c <= 0; };
  else if (op === 'in') { const items = parseList(val); test = (v) => items.some((i) => cmp(v, i) === 0); }
  else if (op === 'like' || op === 'ilike') { const re = likeToRe(val, op === 'ilike'); test = (v) => typeof v === 'string' && re.test(v); }
  else return null;
  // في SQL أي مقارنة مع NULL بتطلع "مش معروف" فالصف بيستبعد (حتى مع not)
  return (r) => { const v = r[col]; if (v == null) return false; const t = test!(v); return neg ? !t : t; };
}

const cmpOrder = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a), y = String(b);
  if (ISO.test(x) && ISO.test(y)) return Date.parse(x) - Date.parse(y);
  return x === y ? 0 : x < y ? -1 : 1;
};

export function answerQuery(rows: Row[], search: URLSearchParams, method: string, accept: string, prefer: string): SnapAnswer | null {
  if (search.has('or') || search.has('and')) return null;

  const filters: ((r: Row) => boolean)[] = [];
  for (const [k, v] of search.entries()) {
    if (RESERVED.has(k)) continue;
    if (!COL.test(k)) return null;
    const f = makeFilter(k, v);
    if (!f) return null;
    filters.push(f);
  }

  const select = search.get('select') || '*';
  let cols: string[] | null = null;
  if (select !== '*') {
    cols = splitTop(select).map((c) => c.trim());
    if (cols.some((c) => !COL.test(c))) return null; // embedded/alias/cast مش مدعومين
  }

  let out = rows.filter((r) => filters.every((f) => f(r)));

  const order = search.get('order');
  if (order) {
    const keys = splitTop(order).map((o) => {
      const [col, ...mods] = o.split('.');
      const desc = mods.includes('desc');
      const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc; // Postgres: asc → nulls last، desc → nulls first
      return { col, desc, nullsFirst };
    });
    if (keys.some((k) => !COL.test(k.col))) return null;
    out = [...out].sort((a, b) => {
      for (const k of keys) {
        const x = a[k.col], y = b[k.col];
        if (x == null && y == null) continue;
        if (x == null) return k.nullsFirst ? -1 : 1;
        if (y == null) return k.nullsFirst ? 1 : -1;
        const c = cmpOrder(x, y);
        if (c !== 0) return k.desc ? -c : c;
      }
      return 0;
    });
  }

  const total = out.length;
  const offset = Math.max(0, Number(search.get('offset')) || 0);
  const limitRaw = search.get('limit');
  const limit = limitRaw === null ? Infinity : Math.max(0, Number(limitRaw) || 0);
  out = out.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);

  const wantsCount = /count=(exact|planned|estimated)/.test(prefer);
  const contentRange = wantsCount ? `${out.length ? `${offset}-${offset + out.length - 1}` : '*'}/${total}` : undefined;

  if (method === 'HEAD') return { status: 200, body: '', contentType: 'application/json', contentRange };

  const projected = cols ? out.map((r) => Object.fromEntries(cols!.filter((c) => c in r).map((c) => [c, r[c]]))) : out;

  if (accept.includes('vnd.pgrst.object')) {
    if (projected.length === 1) return { status: 200, body: JSON.stringify(projected[0]), contentType: 'application/vnd.pgrst.object+json', contentRange };
    return {
      status: 406,
      body: JSON.stringify({ code: 'PGRST116', details: `The result contains ${projected.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }),
      contentType: 'application/json',
    };
  }
  return { status: 200, body: JSON.stringify(projected), contentType: 'application/json', contentRange };
}
