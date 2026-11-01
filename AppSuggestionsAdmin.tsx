import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { KIND_LABEL, STATUS_LABEL } from '@/components/shared/AppSuggestions';

type Maker = { user_id: string; full_name: string; username: string; role: string; church_class: string | null };
type DevRow = { id: string; title: string; body: string; status: string; maker_note: string | null; created_at: string; updated_at: string; maker_name: string };
type Row = { id: string; kind: string; title: string; body: string; status: string; admin_note: string | null; created_at: string; full_name: string; username: string; role: string; church_class: string | null };
const DEV_STATUS: Record<string, string> = { sent: 'مبعوت', in_progress: 'قيد التنفيذ', done: 'خلصت ✅', cancelled: 'اتلغى' };

// اقتراح جديد للتطوير: الأدمن يكتب الفكرة ويبعتها لصانع/صاحب التطبيق اللي بيختاره
function NewSuggestion({ onSent }: { onSent: () => void }) {
  const [makers, setMakers] = useState<Maker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [to, setTo] = useState('');
  const [kind, setKind] = useState('feature');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('admin_list_app_makers');
      if (!error && Array.isArray(data)) { setMakers(data as Maker[]); setTo((data as Maker[])[0]?.user_id ?? ''); }
      setLoaded(true);
    })();
  }, []);

  const send = async () => {
    if (busy) return;
    if (!to) return toast('error', 'اختار صانع التطبيق');
    if (title.trim().length < 3) return toast('error', 'اكتب عنوان للاقتراح (3 حروف على الأقل)');
    if (body.trim().length < 5) return toast('error', 'اشرح الفكرة (5 حروف على الأقل)');
    setBusy(true);
    const { error } = await supabase.rpc('admin_send_dev_request', { p_to: to, p_title: title.trim(), p_body: `النوع: ${KIND_LABEL[kind] || kind}\n\n${body.trim()}` });
    setBusy(false);
    if (error) return toast('error', error.message || 'تعذر إرسال الاقتراح');
    toast('success', 'اتبعت الاقتراح لصانع التطبيق 🛠️');
    setTitle(''); setBody('');
    onSent();
  };

  if (loaded && makers.length === 0) {
    return <p className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-200">مفيش صانع تطبيق لسه. من «دليل المستخدمين» اضغط على اسم خادم أو مخدوم واختار «جعله صانع تطبيق»، وبعدين ارجع هنا وابعت اقتراحك.</p>;
  }
  return (
    <div className="card-dark space-y-3 rounded-xl p-4">
      <label className="block text-sm text-gray-300">يوصل لمين؟
        <select value={to} onChange={(e) => setTo(e.target.value)} className="input-dark mt-1 w-full">
          {makers.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.role === 'servant' ? 'خادم' : 'مخدوم'}{m.church_class ? ` · ${m.church_class}` : ''})</option>)}
        </select>
      </label>
      <label className="block text-sm text-gray-300">نوع الاقتراح
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="input-dark mt-1 w-full">
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block text-sm text-gray-300">العنوان
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="input-dark mt-1 w-full" placeholder="مثال: لعبة أسئلة دينية بنقاط" />
      </label>
      <label className="block text-sm text-gray-300">اشرح الفكرة
        <textarea value={body} maxLength={1900} rows={6} onChange={(e) => setBody(e.target.value)} className="input-dark mt-1 w-full" placeholder="إيه اللي المفروض يعمله؟ مين يستخدمه (مخدومين/خدام)؟ إيه اللي بيظهر وإيه اللي بيتسجّل؟" />
      </label>
      <button type="button" disabled={busy || !loaded} onClick={() => void send()} className="btn-gold flex items-center gap-2 rounded-lg px-4 py-2 text-sm"><Send size={15} /> {busy ? 'جاري الإرسال…' : 'إرسال الاقتراح'}</button>
    </div>
  );
}

// الاقتراحات اللي الأدمن بعتها وحالتها
function SentRequests({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<DevRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_dev_requests');
    if (!error && Array.isArray(data)) setRows(data as DevRow[]);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const cancel = async (r: DevRow) => {
    const { error } = await supabase.rpc('admin_cancel_dev_request', { p_id: r.id });
    if (error) return toast('error', error.message || 'تعذر الإلغاء');
    toast('success', 'تم إلغاء الاقتراح');
    void load();
  };
  return (
    <div className="space-y-3">
      {loaded && rows.length === 0 && <p className="py-8 text-center text-sm text-gray-400">لسه ما بعتّش اقتراحات.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card-dark space-y-1 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <b className="text-gray-100">{r.title}</b>
            <span className="shrink-0 rounded bg-gold-300/10 px-2 py-0.5 text-xs text-gold-300">{DEV_STATUS[r.status] || r.status}</span>
          </div>
          <p className="text-xs text-gray-400">إلى {r.maker_name} · {new Date(r.created_at).toLocaleString('ar-EG')}</p>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{r.body}</p>
          {r.maker_note && <p className="rounded-lg bg-white/5 p-2 text-xs text-amber-200">ملاحظة {r.maker_name}: {r.maker_note}</p>}
          {(r.status === 'sent' || r.status === 'in_progress') && <button type="button" onClick={() => void cancel(r)} className="text-xs text-red-300">إلغاء الاقتراح</button>}
        </div>
      ))}
    </div>
  );
}

// الأفكار اللي صنّاع التطبيق بعتوها للأدمن
function Ideas() {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_suggestions', { p_status: filter });
    if (!error && data) setRows(data as Row[]);
    setLoaded(true);
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const update = async (r: Row, status: string) => {
    setBusy(r.id);
    const { error } = await supabase.rpc('admin_update_suggestion', { p_id: r.id, p_status: status, p_note: notes[r.id] ?? r.admin_note ?? '' });
    setBusy('');
    if (error) return toast('error', error.message || 'تعذر التحديث');
    toast('success', 'تم التحديث وبعتنا إشعار لصاحب الفكرة');
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['all', 'الكل'], ...Object.entries(STATUS_LABEL)].map(([k, v]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-lg px-3 py-2 text-sm ${filter === k ? 'bg-gold-300/10 text-gold-300' : 'text-gray-400'}`}>{v}</button>
        ))}
      </div>
      {!loaded && <p role="status" className="py-6 text-center text-sm text-gray-400">جاري التحميل…</p>}
      {loaded && rows.length === 0 && <p className="py-8 text-center text-sm text-gray-400">مفيش أفكار هنا. اعمل أي مستخدم «صانع تطبيق» من دليل المستخدمين عشان يبدأ يبعت أفكار.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card-dark space-y-2 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-gray-100">{r.title}</p>
              <p className="text-xs text-gray-400">{r.full_name} (@{r.username} · {r.role === 'servant' ? 'خادم' : 'مخدوم'}{r.church_class ? ` · ${r.church_class}` : ''}) · {KIND_LABEL[r.kind] || r.kind} · {new Date(r.created_at).toLocaleString('ar-EG')}</p>
            </div>
            <span className="shrink-0 rounded bg-gold-300/10 px-2 py-0.5 text-xs text-gold-300">{STATUS_LABEL[r.status] || r.status}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{r.body}</p>
          <input value={notes[r.id] ?? r.admin_note ?? ''} maxLength={500} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} className="input-dark w-full" placeholder="ملاحظة لصاحب الفكرة (اختياري)" />
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABEL).filter(([k]) => k !== r.status).map(([k, v]) => (
              <button key={k} type="button" disabled={busy === r.id} onClick={() => void update(r, k)} className="btn-outline-gold rounded-lg px-3 py-1.5 text-xs">{v}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// صفحة «اقتراحات للتطوير» عند الأدمن: يبعت اقتراح، يتابع اللي بعته، ويشوف أفكار الصنّاع
export default function AppSuggestionsAdmin() {
  const [view, setView] = useState<'new' | 'sent' | 'ideas'>('new');
  const [refresh, setRefresh] = useState(0);
  const tabs: Array<['new' | 'sent' | 'ideas', string]> = [['new', 'اقتراح جديد'], ['sent', 'اللي بعتّه'], ['ideas', 'أفكار الصنّاع']];
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">اكتب فكرة تطوير للتطبيق وابعتها لصانع/صاحب التطبيق. هو بيشوفها في صفحة «اقتراحات التطبيق» عنده ويكتبلك حالتها.</p>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`rounded-lg px-4 py-2 text-sm ${view === id ? 'border border-gold-300/30 bg-gold-300/10 text-gold-300' : 'text-gray-400'}`}>{label}</button>
        ))}
      </div>
      {view === 'new' && <NewSuggestion onSent={() => { setRefresh((n) => n + 1); setView('sent'); }} />}
      {view === 'sent' && <SentRequests refreshKey={refresh} />}
      {view === 'ideas' && <Ideas />}
    </div>
  );
}
