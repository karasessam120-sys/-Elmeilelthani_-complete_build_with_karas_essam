import { useEffect, useState } from 'react';
import { answerQuery } from './snapshot';

// طبقة الأوفلاين: كل طلبات Supabase بتعدّي من هنا.
// - القراءة: لو النت فاصل بنرجّع آخر نسخة اتحمّلت قبل كده.
// - الكتابة: لو النت فاصل بتتحفظ في الجهاز وبتتبعت لوحدها لما النت يرجع (بالترتيب).
// - العمليات اللي محتاجة نت (تسجيل الدخول وتغيير اسم المستخدم وكلمة السر) بتفشل برسالة واضحة.

type StoredOp = { id?: number; userId: string; method: string; url: string; headers: Record<string, string>; body: string | null; label: string; created: number };
type FailedOp = { id?: number; label: string; message: string; created: number };
type CacheRow = { key: string; status: number; body: string; contentType: string; contentRange: string; ts: number };
export type OfflineStatus = { online: boolean; pending: number; failed: FailedOp[]; syncing: boolean; snapshotAt: number | null; snapshotting: boolean };
type SnapRow = { key: string; rows: unknown[]; ts: number };

const READ_RPCS = new Set(['get_fares_leaderboard', 'get_leaderboards', 'username_taken', 'my_security_state', 'am_status', 'am_my_suggestions', 'am_dev_requests']);
const NO_QUEUE_RPCS = new Set(['change_my_username', 'admin_reset_credentials', 'admin_set_password', 'request_password_reset', 'reset_status', 'open_reset_message', 'change_my_password', 'admin_list_reset_requests', 'admin_approve_reset', 'admin_reject_reset', 'set_my_email', 'admin_list_suggestions', 'admin_update_suggestion', 'admin_set_app_maker', 'admin_app_makers', 'admin_list_app_makers', 'admin_list_dev_requests', 'admin_cancel_dev_request']);
const MAX_CACHE = 400;
const MAX_BODY = 1_500_000;

// نسخة كاملة من بيانات السيرفر بتتحفظ على الجهاز (اللي الحساب مسموح له يقراه بس، بنفس صلاحيات RLS)
const SNAP_TABLES = ['users', 'classes', 'education_stages', 'church_config', 'rewards', 'quizzes', 'quiz_attempts', 'attendance', 'fares_scores', 'fares_award_log', 'fares_settings', 'fares_contest', 'psalms_agpeya_progress', 'agpeya_log', 'absent_peers', 'hat_akhook_uploads', 'reward_redemptions', 'feedback', 'ai_chats', 'lesson_preps', 'class_transfers', 'messages'];
const SNAP_SET = new Set(SNAP_TABLES);
const SNAP_TTL = 10 * 60 * 1000; // نحدّث النسخة كل 10 دقايق والنت شغال
const SNAP_MAX_BYTES = 6_000_000; // أي جدول أكبر من كده بنسيبه للتخزين العادي بدل نسخة ناقصة
const PAGE = 1000;

const nativeFetch: typeof fetch = (...a) => window.fetch(...a);

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
      const r = indexedDB.open('elmeil-offline', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('failed')) db.createObjectStore('failed', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('snap')) db.createObjectStore('snap', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
};
async function idb<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const rq = fn(db.transaction(store, mode).objectStore(store));
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

// ---- الحالة للواجهة
let status: OfflineStatus = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pending: 0, failed: [], syncing: false, snapshotAt: null, snapshotting: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setStatus = (patch: Partial<OfflineStatus>) => { status = { ...status, ...patch }; emit(); };
export const getOfflineStatus = () => status;

async function refreshCounts() {
  const pending = await safe(idb<number>('queue', 'readonly', (s) => s.count()), 0);
  const failed = await safe(idb<FailedOp[]>('failed', 'readonly', (s) => s.getAll()), []);
  setStatus({ pending, failed });
}

export function useOfflineStatus(): OfflineStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    const l = () => setS(status);
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);
  return s;
}

export const isQueuedResult = (d: unknown) => !!d && typeof d === 'object' && (d as { queued?: boolean }).queued === true;

export async function dismissFailed() {
  await safe(idb('failed', 'readwrite', (s) => s.clear()), undefined);
  await refreshCounts();
}

export async function clearOfflineCache() {
  await safe(idb('cache', 'readwrite', (s) => s.clear()), undefined);
  await safe(idb('snap', 'readwrite', (s) => s.clear()), undefined);
  setStatus({ snapshotAt: null });
}

// ---- مساعدات
const userIdFromAuth = (auth: string | null) => {
  try {
    const t = (auth || '').replace(/^Bearer\s+/i, '');
    const p = t.split('.')[1];
    if (!p) return 'anon';
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).sub || 'anon';
  } catch { return 'anon'; }
};

const describe = (method: string, url: string) => {
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.split('/').pop() || '');
  const verb = method === 'POST' ? 'إضافة/تنفيذ' : method === 'PATCH' ? 'تعديل' : method === 'DELETE' ? 'حذف' : method;
  return `${verb}: ${name}`;
};

async function cachePut(key: string, res: Response) {
  try {
    const body = await res.text();
    if (body.length > MAX_BODY) return;
    await idb('cache', 'readwrite', (s) => s.put({ key, status: res.status, body, contentType: res.headers.get('content-type') || 'application/json', contentRange: res.headers.get('content-range') || '', ts: Date.now() } as CacheRow));
    const n = await idb<number>('cache', 'readonly', (s) => s.count());
    if (n > MAX_CACHE) {
      const all = await idb<CacheRow[]>('cache', 'readonly', (s) => s.getAll());
      all.sort((a, b) => a.ts - b.ts).slice(0, n - MAX_CACHE + 40).forEach((r) => { void idb('cache', 'readwrite', (s) => s.delete(r.key)); });
    }
  } catch { /* تجاهل */ }
}

const cacheRow = (key: string) => safe(idb<CacheRow | undefined>('cache', 'readonly', (s) => s.get(key)), undefined);
function rowToResponse(row: CacheRow): Response {
  const h: Record<string, string> = { 'Content-Type': row.contentType };
  if (row.contentRange) h['Content-Range'] = row.contentRange;
  return new Response(row.body, { status: row.status, headers: h });
}

// ---- نسخة الجداول على الجهاز
const snapGet = (uid: string, table: string) => safe(idb<SnapRow | undefined>('snap', 'readonly', (s) => s.get(`${uid}|${table}`)), undefined);

async function answerFromSnapshot(uid: string, method: string, url: string, headers: Headers): Promise<{ response: Response; ts: number } | null> {
  if (url.includes('/rest/v1/rpc/')) return null;
  const u = new URL(url);
  const table = decodeURIComponent(u.pathname.split('/rest/v1/')[1] || '');
  if (!SNAP_SET.has(table)) return null;
  const snap = await snapGet(uid, table);
  if (!snap) return null;
  const a = answerQuery(snap.rows as Record<string, unknown>[], u.searchParams, method, headers.get('accept') || '', headers.get('prefer') || '');
  if (!a) return null;
  const h: Record<string, string> = { 'Content-Type': a.contentType };
  if (a.contentRange) h['Content-Range'] = a.contentRange;
  return { response: new Response(a.body === '' ? null : a.body, { status: a.status, headers: h }), ts: snap.ts };
}

function synthetic(method: string, headers: Headers, body: string | null, isRpc: boolean): Response {
  if (isRpc) return new Response(JSON.stringify({ queued: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const prefer = headers.get('prefer') || '';
  const accept = headers.get('accept') || '';
  if (prefer.includes('return=representation')) {
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const single = accept.includes('vnd.pgrst.object');
    return new Response(JSON.stringify(single ? rows[0] ?? null : rows), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': single ? 'application/vnd.pgrst.object+json' : 'application/json' } });
  }
  return new Response(null, { status: method === 'POST' ? 201 : 204 });
}

export function createOfflineFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/rest/v1/')) return nativeFetch(input, init);

    const method = (init?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const body = typeof init?.body === 'string' ? init.body : null;
    const isRpc = url.includes('/rest/v1/rpc/');
    const rpcName = isRpc ? decodeURIComponent(new URL(url).pathname.split('/').pop() || '') : '';
    const isRead = method === 'GET' || method === 'HEAD' || (isRpc && READ_RPCS.has(rpcName));
    const userId = userIdFromAuth(headers.get('authorization'));
    const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

    if (isRead) {
      const key = [userId, method, url, headers.get('accept') || '', headers.get('range') || '', body || ''].join('|');
      // بنرجّع الأحدث: النسخة المحفوظة لنفس الطلب بالظبط، أو نسخة الجدول الكاملة
      const fromDevice = async (): Promise<Response | null> => {
        const row = await cacheRow(key);
        const snap = await answerFromSnapshot(userId, method, url, headers);
        if (row && (!snap || row.ts >= snap.ts)) return rowToResponse(row);
        return snap ? snap.response : null;
      };
      if (!offlineNow()) {
        try {
          const res = await nativeFetch(input, init);
          if (res.ok) void cachePut(key, res.clone());
          return res;
        } catch (e) {
          const hit = await fromDevice();
          if (hit) return hit;
          throw e;
        }
      }
      const hit = await fromDevice();
      if (hit) return hit;
      throw new TypeError('Failed to fetch');
    }

    if (isRpc && NO_QUEUE_RPCS.has(rpcName)) return nativeFetch(input, init);

    const queue = async (): Promise<Response> => {
      const keep: Record<string, string> = {};
      headers.forEach((v, k) => { if (k !== 'authorization') keep[k] = v; });
      const op: StoredOp = { userId, method, url, headers: keep, body, label: describe(method, url), created: Date.now() };
      try {
        await idb('queue', 'readwrite', (s) => s.add(op));
      } catch {
        throw new TypeError('Failed to fetch'); // التخزين مش متاح: نرجع الخطأ العادي
      }
      await refreshCounts();
      return synthetic(method, headers, body, isRpc);
    };

    if (offlineNow()) return queue();
    try {
      return await nativeFetch(input, init);
    } catch {
      return queue();
    }
  };
}

// ---- المزامنة
type SessionApi = { url: string; key: string; getSession: () => Promise<{ data: { session: { user: { id: string }; access_token: string } | null } }>; refreshSession: () => Promise<unknown> };
let sessionApi: SessionApi | null = null;
let flushing = false;
let syncingSnap = false;

export async function flushQueue() {
  if (flushing || !sessionApi || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  flushing = true;
  let hadOps = false;
  setStatus({ syncing: true });
  try {
    const ops = await safe(idb<StoredOp[]>('queue', 'readonly', (s) => s.getAll()), []);
    if (!ops.length) return;
    hadOps = true;
    let { data } = await sessionApi.getSession();
    if (!data.session) { await sessionApi.refreshSession().catch(() => undefined); data = (await sessionApi.getSession()).data; }
    const session = data.session;
    if (!session) return;
    for (const op of ops) {
      if (op.userId !== session.user.id) continue; // بتاعة حساب تاني: تستنى صاحبها
      let res: Response;
      try {
        res = await nativeFetch(op.url, { method: op.method, headers: { ...op.headers, Authorization: `Bearer ${session.access_token}` }, body: op.body });
      } catch { break; } // لسه مفيش نت
      if (res.status === 401) { await sessionApi.refreshSession().catch(() => undefined); break; }
      if (res.status === 429 || res.status >= 500) break;
      if (!res.ok) {
        let msg = `رفض السيرفر (${res.status})`;
        let code = '';
        try { const j = await res.json(); msg = j.message || msg; code = j.code || ''; } catch { /* تجاهل */ }
        if (!(res.status === 409 && code === '23505')) {
          await safe(idb('failed', 'readwrite', (s) => s.add({ label: op.label, message: msg, created: Date.now() } as FailedOp)), undefined);
        }
      }
      await safe(idb('queue', 'readwrite', (s) => s.delete(op.id as number)), undefined);
      await refreshCounts();
    }
  } finally {
    flushing = false;
    await refreshCounts();
    setStatus({ syncing: false });
    if (hadOps && status.pending === 0) void syncSnapshots(); // بعد ما اللي اتسجّل أوفلاين يوصل، نجيب نسخة جديدة من السيرفر
  }
}

// نزّل جدول كامل (صفحات من 1000). null = الجدول مش مسموح أو أكبر من الحد، 'net' = النت فصل في النص
async function downloadTable(table: string, token: string): Promise<unknown[] | null | 'net'> {
  const api = sessionApi;
  if (!api) return 'net';
  const rows: unknown[] = [];
  let bytes = 0;
  let total = -1;
  for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
    let res: Response;
    try {
      res = await nativeFetch(`${api.url}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`, {
        headers: { apikey: api.key, Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'count=exact' },
      });
    } catch { return 'net'; }
    if (!res.ok) return res.status >= 500 || res.status === 429 || res.status === 401 ? 'net' : null;
    const text = await res.text();
    bytes += text.length;
    if (bytes > SNAP_MAX_BYTES) return null;
    let page: unknown[];
    try { page = JSON.parse(text); } catch { return null; }
    rows.push(...page);
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
    if (m) total = Number(m[1]);
    if (page.length < PAGE) break;
  }
  if (total >= 0 && rows.length !== total) return null; // نسخة ناقصة أسوأ من مفيش نسخة
  return rows;
}

// نسخة كاملة من كل جداول التطبيق على الجهاز عشان الأوفلاين يشتغل في أي صفحة حتى لو ما اتفتحتش قبل كده
export async function syncSnapshots() {
  if (syncingSnap || !sessionApi || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  syncingSnap = true;
  setStatus({ snapshotting: true });
  try {
    const { data } = await sessionApi.getSession();
    const session = data.session;
    if (!session) return;
    const uid = session.user.id;
    for (const table of SNAP_TABLES) {
      const rows = await downloadTable(table, session.access_token);
      if (rows === 'net') return; // نسيب النسخة القديمة زي ما هي
      if (rows === null) { await safe(idb('snap', 'readwrite', (s) => s.delete(`${uid}|${table}`)), undefined); continue; }
      await safe(idb('snap', 'readwrite', (s) => s.put({ key: `${uid}|${table}`, rows, ts: Date.now() } as SnapRow)), undefined);
    }
    const now = Date.now();
    await safe(idb('snap', 'readwrite', (s) => s.put({ key: `${uid}|__meta`, rows: [], ts: now } as SnapRow)), undefined);
    setStatus({ snapshotAt: now });
  } finally {
    syncingSnap = false;
    setStatus({ snapshotting: false });
  }
}

async function maybeSyncSnapshots() {
  if (!sessionApi || !status.online || status.pending > 0 || status.syncing) return;
  const { data } = await sessionApi.getSession();
  if (!data.session) { if (status.snapshotAt !== null) setStatus({ snapshotAt: null }); return; }
  const meta = await snapGet(data.session.user.id, '__meta');
  if ((meta?.ts ?? null) !== status.snapshotAt) setStatus({ snapshotAt: meta?.ts ?? null });
  if (!meta || Date.now() - meta.ts > SNAP_TTL) await syncSnapshots();
}

export function initOfflineSync(api: SessionApi) {
  sessionApi = api;
  void refreshCounts().then(() => flushQueue()).then(() => maybeSyncSnapshots());
  window.addEventListener('online', () => { setStatus({ online: true }); void flushQueue().then(() => maybeSyncSnapshots()); });
  window.addEventListener('offline', () => setStatus({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void maybeSyncSnapshots(); });
  window.setInterval(() => { if (status.pending > 0) void flushQueue(); else void maybeSyncSnapshots(); }, 30000);
}
