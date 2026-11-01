import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { isQueuedResult } from '@/lib/offline';
import { toast } from '@/components/ui/Toast';
import { ArrowLeftRight, Search, Users } from 'lucide-react';

type Person = { id: string; full_name: string; church_class: string; stars?: number };
type Transfer = { id: string; user_id: string; kind: 'member' | 'servant'; from_class: string | null; to_class: string; created_at: string };

// نقل المخدومين بين الفصول (النجوم والتسميع وكل البيانات بتفضل). الأدمن كمان بيبدّل الخدام.
export default function ClassTransfer() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const myClass = user?.church_class || '';
  const noClass = !isAdmin && !myClass;

  const [classes, setClasses] = useState<string[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [servants, setServants] = useState<Person[]>([]);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [servantA, setServantA] = useState('');
  const [servantB, setServantB] = useState('');
  const [servantClass, setServantClass] = useState('');

  const load = useCallback(async () => {
    if (noClass) return;
    const { data: cs } = await supabase.from('classes').select('name').order('name');
    setClasses(((cs as { name: string }[]) || []).map((c) => c.name));

    let mq = supabase.from('users').select('id, full_name, church_class, stars').eq('role', 'member').eq('status', 'active').order('full_name');
    if (!isAdmin) mq = mq.eq('church_class', myClass);
    const { data: ms } = await mq;
    setMembers((ms as Person[]) || []);

    if (isAdmin) {
      const { data: ss } = await supabase.from('users').select('id, full_name, church_class').eq('role', 'servant').order('full_name');
      setServants((ss as Person[]) || []);
    }
    const { data: hs } = await supabase.from('class_transfers').select('id, user_id, kind, from_class, to_class, created_at').order('created_at', { ascending: false }).limit(15);
    setHistory((hs as Transfer[]) || []);
  }, [noClass, isAdmin, myClass]);

  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.full_name || servants.find((s) => s.id === id)?.full_name || 'شخص';
  const targets = classes.filter((c) => c !== myClass || isAdmin);
  const shown = useMemo(() => members.filter((m) => m.full_name.includes(query.trim())), [members, query]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const run = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, okMsg: string) => {
    setBusy(true);
    const { data, error } = await fn();
    setBusy(false);
    if (error) return toast('error', error.message || 'تعذر التنفيذ');
    toast('success', isQueuedResult(data) ? 'أنت أوفلاين. الطلب اتحفظ وهيتنفّذ لما النت يرجع.' : okMsg);
    setPicked([]); setServantA(''); setServantB('');
    void load();
  };

  const moveMembers = () => {
    if (!picked.length) return toast('error', 'اختار مخدوم واحد على الأقل');
    if (!target) return toast('error', 'اختار الفصل الجديد');
    if (!window.confirm(`تنقل ${picked.length} مخدوم لفصل "${target}"؟ النجوم والتسميع كله بيروح معاهم.`)) return;
    void run(() => supabase.rpc('transfer_members_class', { p_members: picked, p_new_class: target }), `تم نقل ${picked.length} مخدوم إلى ${target}`);
  };

  if (noClass) return <div className="card-dark p-4"><p className="py-4 text-center text-gray-400">لم يتم تعيين فصل لك بعد. اطلب من الأدمن تحديد فصلك.</p></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-right" dir="rtl">
      <header className="card-dark flex items-center gap-3 p-5">
        <div className="rounded-xl bg-gold-300/10 p-3 text-gold-300"><ArrowLeftRight size={26} /></div>
        <div>
          <h1 className="text-xl font-black gold-text">نقل الفصول</h1>
          <p className="mt-1 text-sm text-gray-400">النقل بيغيّر الفصل بس. النجوم والتسميع والاختبارات بتفضل مع المخدوم زي ما هي.</p>
        </div>
      </header>

      <section className="card-dark space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-black gold-text"><Users size={18} /> نقل مخدومين {isAdmin ? '(كل الفصول)' : `من فصل ${myClass}`}</h2>
        <div className="relative">
          <Search size={16} className="absolute right-3 top-3 text-gray-400" />
          <input aria-label="بحث عن مخدوم" value={query} onChange={(e) => setQuery(e.target.value)} className="input-dark pr-9" placeholder="ابحث عن مخدوم" />
        </div>
        <div className="flex items-center justify-between text-sm text-gray-300">
          <button type="button" onClick={() => setPicked(picked.length === shown.length ? [] : shown.map((m) => m.id))} className="text-gold-300 underline">
            {picked.length === shown.length && shown.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
          <span>محدد: {picked.length}</span>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {shown.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${picked.includes(m.id) ? 'bg-gold-300/10 text-gold-300' : 'bg-dark-300 text-gray-200'}`}>
              <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 accent-yellow-500" />
              <span className="flex-1 truncate">{m.full_name}</span>
              {isAdmin && <span className="text-xs text-gray-400">{m.church_class || 'بدون فصل'}</span>}
              <span className="text-xs text-gray-400">★ {m.stars ?? 0}</span>
            </label>
          ))}
          {shown.length === 0 && <p className="py-4 text-center text-gray-400">مفيش مخدومين.</p>}
        </div>
        <label className="block text-sm font-bold text-gray-200">الفصل الجديد
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="input-dark mt-2">
            <option value="">-- اختار الفصل --</option>
            {targets.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" onClick={moveMembers} disabled={busy} className="btn-gold w-full rounded-xl p-3 font-bold">{busy ? 'جاري النقل...' : `نقل المحدّدين (${picked.length})`}</button>
      </section>

      {isAdmin && (
        <section className="card-dark space-y-4 p-5">
          <h2 className="font-black gold-text">تبديل الخدام بين الفصول</h2>
          <div className="space-y-2 rounded-xl bg-dark-300 p-3 text-sm text-gray-300">
            {servants.map((s) => <div key={s.id} className="flex justify-between"><span>{s.full_name}</span><span className="text-gray-400">{s.church_class || 'بدون فصل'}</span></div>)}
            {servants.length === 0 && <p className="text-gray-400">مفيش خدام.</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-200">نقل خادم لفصل</p>
            <div className="flex flex-wrap gap-2">
              <select aria-label="الخادم" value={servantA} onChange={(e) => setServantA(e.target.value)} className="input-dark flex-1">
                <option value="">-- الخادم --</option>
                {servants.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select aria-label="الفصل" value={servantClass} onChange={(e) => setServantClass(e.target.value)} className="input-dark flex-1">
                <option value="">-- الفصل --</option>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" disabled={busy || !servantA || !servantClass} onClick={() => void run(() => supabase.rpc('admin_set_servant_class', { p_servant: servantA, p_new_class: servantClass }), 'تم نقل الخادم')} className="btn-outline-gold rounded-lg px-4 py-2 text-sm">نقل</button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-200">تبديل فصلين بين خادمين</p>
            <div className="flex flex-wrap gap-2">
              <select aria-label="الخادم الأول" value={servantA} onChange={(e) => setServantA(e.target.value)} className="input-dark flex-1">
                <option value="">-- الخادم الأول --</option>
                {servants.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.church_class || 'بدون فصل'})</option>)}
              </select>
              <select aria-label="الخادم الثاني" value={servantB} onChange={(e) => setServantB(e.target.value)} className="input-dark flex-1">
                <option value="">-- الخادم الثاني --</option>
                {servants.filter((s) => s.id !== servantA).map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.church_class || 'بدون فصل'})</option>)}
              </select>
              <button type="button" disabled={busy || !servantA || !servantB} onClick={() => void run(() => supabase.rpc('admin_swap_servant_classes', { p_a: servantA, p_b: servantB }), 'تم التبديل بين الخادمين')} className="btn-gold rounded-lg px-4 py-2 text-sm">تبديل</button>
            </div>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="card-dark space-y-2 p-5">
          <h2 className="font-black gold-text">آخر عمليات النقل</h2>
          {history.map((h) => (
            <div key={h.id} className="rounded-lg bg-dark-300 px-3 py-2 text-xs text-gray-300">
              {nameOf(h.user_id)} ({h.kind === 'servant' ? 'خادم' : 'مخدوم'}): {h.from_class || 'بدون فصل'} ← {h.to_class} · {new Date(h.created_at).toLocaleDateString('ar-EG')}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
