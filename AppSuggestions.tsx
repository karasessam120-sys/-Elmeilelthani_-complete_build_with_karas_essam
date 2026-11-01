import { useCallback, useEffect, useState } from 'react';
import { Clipboard, Lightbulb, Send, Wrench } from 'lucide-react';
import { buildSpec, type DevSpec } from '@/lib/devSpec';
import { supabase } from '@/lib/supabase';
import { isQueuedResult, useOfflineStatus } from '@/lib/offline';
import { toast } from '@/components/ui/Toast';

type Item = { id: string; kind: string; title: string; body: string; status: string; admin_note: string | null; created_at: string };
type DevReq = { id: string; title: string; body: string; spec: DevSpec | null; status: string; maker_note: string | null; created_at: string; from_name: string };
const DEV_STATUS: Record<string, string> = { sent: 'جديد', in_progress: 'قيد التنفيذ', done: 'خلصت ✅' };

// طلبات التطوير اللي الأدمن بعتها لصانع التطبيق
function DevRequests() {
  const [rows, setRows] = useState<DevReq[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('am_dev_requests');
    if (!error && Array.isArray(data)) setRows(data as DevReq[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const copy = async (r: DevReq) => {
    const text = buildSpec({ title: r.title, body: r.body, from_name: r.from_name, spec: r.spec });
    try { await navigator.clipboard.writeText(text); toast('success', 'تم نسخ المواصفات. الصقها في Claude أو ابعتها للمطوّر.'); }
    catch { toast('error', 'تعذر النسخ. جرّب من متصفح تاني.'); }
  };
  const setStatus = async (r: DevReq, status: 'in_progress' | 'done') => {
    setBusy(r.id);
    const { error } = await supabase.rpc('am_update_dev_request', { p_id: r.id, p_status: status, p_note: notes[r.id] ?? r.maker_note ?? '' });
    setBusy('');
    if (error) return toast('error', error.message || 'تعذر التحديث');
    toast('success', 'تم التحديث وبعتنا إشعار للأدمن');
    void load();
  };

  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-200"><Wrench size={15} /> طلبات من الأدمن ({rows.filter((r) => r.status !== 'done').length} مفتوحة)</h2>
      {rows.map((r) => (
        <div key={r.id} className="card-dark space-y-2 rounded-xl border border-amber-300/20 p-3">
          <div className="flex items-start justify-between gap-2">
            <b className="text-sm text-gray-100">{r.title}</b>
            <span className="shrink-0 rounded bg-amber-300/10 px-2 py-0.5 text-xs text-amber-200">{DEV_STATUS[r.status] || r.status}</span>
          </div>
          <p className="text-xs text-gray-400">من {r.from_name} · {new Date(r.created_at).toLocaleDateString('ar-EG')}</p>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{r.body}</p>
          {r.spec?.title && <p className="text-xs text-gray-400">الصفحة المقترحة: {r.spec.title}</p>}
          <input value={notes[r.id] ?? r.maker_note ?? ''} maxLength={500} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} className="input-dark w-full" placeholder="ملاحظة للأدمن (اختياري)" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy(r)} className="btn-outline-gold flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"><Clipboard size={13} /> نسخ المواصفات</button>
            {r.status === 'sent' && <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, 'in_progress')} className="btn-outline-gold rounded-lg px-3 py-1.5 text-xs">قيد التنفيذ</button>}
            {r.status !== 'done' && <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, 'done')} className="btn-gold rounded-lg px-3 py-1.5 text-xs">خلصت ✅</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export const KIND_LABEL: Record<string, string> = { page: 'صفحة جديدة', feature: 'ميزة جديدة', fix: 'مشكلة تحتاج إصلاح', other: 'أخرى' };
export const STATUS_LABEL: Record<string, string> = { new: 'جديد', review: 'قيد الدراسة', done: 'اتنفذ 🎉', rejected: 'مش هيتنفذ حاليًا' };

// صفحة «اقتراحات التطبيق»: بتظهر لصنّاع التطبيق بس (الأدمن هو اللي بيعيّنهم)
export default function AppSuggestions() {
  const { online, pending } = useOfflineStatus();
  const [items, setItems] = useState<Item[]>([]);
  const [queued, setQueued] = useState<Array<{ id: string; title: string }>>([]);
  const [kind, setKind] = useState('feature');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('am_my_suggestions');
    if (!error && data) setItems(data as Item[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (online && pending === 0) { setQueued([]); void load(); } }, [online, pending, load]);

  const submit = async () => {
    const t = title.trim(), b = body.trim();
    if (t.length < 3) return toast('error', 'اكتب عنوان للفكرة (3 حروف على الأقل)');
    if (b.length < 10) return toast('error', 'اشرح فكرتك أكتر (10 حروف على الأقل)');
    setBusy(true);
    const { data, error } = await supabase.rpc('am_submit', { p_kind: kind, p_title: t, p_body: b });
    setBusy(false);
    if (error) return toast('error', error.message || 'تعذر إرسال الاقتراح');
    if (isQueuedResult(data)) { setQueued((q) => [...q, { id: `q${Date.now()}`, title: t }]); toast('info', 'أنت أوفلاين. الاقتراح اتحفظ وهيتبعت لما النت يرجع.'); }
    else { toast('success', 'وصل اقتراحك للأدمن. شكرًا لك! 🌟'); void load(); }
    setTitle(''); setBody('');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gold-300"><Lightbulb size={24} /> اقتراحات التطبيق</h1>
        <p className="mt-1 text-sm text-gray-400">إنت «صانع تطبيق» 🛠️ اكتب أي فكرة لتطوير التطبيق (صفحة جديدة، ميزة، أو مشكلة) وهتوصل للأدمن، وهتعرف هنا إيه اللي حصل فيها.</p>
      </div>

      <DevRequests />

      <div className="card-dark space-y-3 rounded-xl p-4">
        <label className="block text-sm text-gray-300">نوع الفكرة
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input-dark mt-1 w-full">
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-sm text-gray-300">عنوان الفكرة
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="input-dark mt-1 w-full" placeholder="مثال: صفحة لمواعيد الرحلات" />
        </label>
        <label className="block text-sm text-gray-300">اشرحها
          <textarea value={body} maxLength={2000} rows={5} onChange={(e) => setBody(e.target.value)} className="input-dark mt-1 w-full" placeholder="إيه الفكرة وإزاي هتفيد الناس؟" />
        </label>
        <button type="button" disabled={busy} onClick={() => void submit()} className="btn-gold flex items-center gap-2 rounded-lg px-4 py-2 text-sm"><Send size={15} /> {busy ? 'جاري الإرسال…' : 'إرسال للأدمن'}</button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-gray-200">اقتراحاتي</h2>
        {queued.map((q) => <div key={q.id} className="card-dark rounded-xl p-3 text-sm opacity-70">{q.title} <span className="text-xs text-gray-400">· ⏳ في انتظار النت</span></div>)}
        {items.map((s) => (
          <div key={s.id} className="card-dark space-y-1 rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <b className="text-sm text-gray-100">{s.title}</b>
              <span className="shrink-0 rounded bg-gold-300/10 px-2 py-0.5 text-xs text-gold-300">{STATUS_LABEL[s.status] || s.status}</span>
            </div>
            <p className="text-xs text-gray-400">{KIND_LABEL[s.kind] || s.kind} · {new Date(s.created_at).toLocaleDateString('ar-EG')}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{s.body}</p>
            {s.admin_note && <p className="rounded-lg bg-white/5 p-2 text-xs text-amber-200">ملاحظة الأدمن: {s.admin_note}</p>}
          </div>
        ))}
        {!items.length && !queued.length && <p className="py-4 text-center text-sm text-gray-500">لسه ما بعتش اقتراحات.</p>}
      </div>
    </div>
  );
}
