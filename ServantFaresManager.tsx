import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { isQueuedResult } from '@/lib/offline';
import { toast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import { RefreshCw, Trophy, Users, Award, ChevronDown, Undo2 } from 'lucide-react';

type Score = { user_id: string; liturgy_points: number | null; confession_points: number | null; psalms_points: number | null; agpeya_points: number | null };
type Row = { id: string; name: string; cls: string; liturgy: number; confession: number; psalms: number; agpeya: number; total: number };
type Log = { id: string; user_id: string; kind: 'liturgy' | 'confession'; points: number; day: string; by_user: string | null; created_at: string; confession_time: string | null };
type AgpeyaDay = { day: string; hour: string };
type Settings = { liturgy: number; confession: number; psalm: number; agpeya: number; cooldown: number };

const DEFAULTS: Settings = { liturgy: 5, confession: 10, psalm: 5, agpeya: 10, cooldown: 30 };
const HOURS = ['باكر', 'الثالثة', 'السادسة', 'التاسعة', 'الغروب', 'النوم', 'الستار', 'نصف الليل'];
const cairoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const num = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const clampN = (v: string, max: number) => Math.min(max, Math.max(0, Number(v) || 0));

// الخادم يسجّل القداس والاعتراف والتسميع لمخدومين فصله، ويضبط نظام النقاط ومواعيد المسابقة
export default function ServantFaresManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const noClass = !isAdmin && !user?.church_class;
  const today = cairoToday();

  const [rows, setRows] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState('');
  const [psalms, setPsalms] = useState<number[]>([]);
  const [hours, setHours] = useState<string[]>([]);
  const [history, setHistory] = useState<AgpeyaDay[]>([]);
  const [confRow, setConfRow] = useState<Row | null>(null);
  const [confDay, setConfDay] = useState('');
  const [confTime, setConfTime] = useState('');
  const [progLoading, setProgLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<'points' | 'contest' | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [sBusy, setSBusy] = useState(false);
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [contestSet, setContestSet] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id || noClass) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('users').select('id, full_name, username, church_class').eq('role', 'member').eq('status', 'active').order('full_name');
    if (!isAdmin) q = q.eq('church_class', user.church_class || '');
    const { data: people, error } = await q;
    if (error) { toast('error', `تعذر تحميل المخدومين: ${error.message}`); setRows([]); setLoading(false); return; }
    const ids = (people ?? []).map((p: { id: string }) => p.id);
    const { data: sc } = ids.length
      ? await supabase.from('fares_scores').select('user_id, liturgy_points, confession_points, psalms_points, agpeya_points').in('user_id', ids)
      : { data: [] as Score[] };
    const byUser = new Map((sc ?? []).map((r: Score) => [r.user_id, r]));
    setRows((people ?? []).map((p: { id: string; full_name: string; username?: string; church_class?: string | null }) => {
      const s = byUser.get(p.id);
      const r = { id: p.id, name: p.full_name || p.username || 'مخدوم', cls: p.church_class || '', liturgy: num(s?.liturgy_points), confession: num(s?.confession_points), psalms: num(s?.psalms_points), agpeya: num(s?.agpeya_points), total: 0 };
      r.total = r.liturgy + r.confession + r.psalms + r.agpeya;
      return r;
    }));
    const { data: lg } = await supabase.from('fares_award_log').select('id, user_id, kind, points, day, by_user, created_at, confession_time').order('created_at', { ascending: false }).limit(400);
    setLogs((lg as Log[]) || []);
    setLoading(false);
  }, [user?.id, user?.church_class, isAdmin, noClass]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    (async () => {
      const [c, st] = await Promise.all([
        supabase.from('fares_contest').select('start_date, end_date').eq('id', 1).maybeSingle(),
        supabase.from('fares_settings').select('liturgy_points, confession_points, psalm_points, agpeya_hour_points, confession_cooldown_days').eq('id', 1).maybeSingle(),
      ]);
      setCStart(c.data?.start_date || '');
      setCEnd(c.data?.end_date || '');
      setContestSet(!!(c.data?.start_date && c.data?.end_date));
      if (st.data) {
        const v: Settings = { liturgy: st.data.liturgy_points, confession: st.data.confession_points, psalm: st.data.psalm_points, agpeya: st.data.agpeya_hour_points, cooldown: st.data.confession_cooldown_days };
        setSettings(v);
        setForm(v);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected) { setPsalms([]); setHours([]); setHistory([]); return; }
      setProgLoading(true);
      const [p, h, hist] = await Promise.all([
        supabase.from('psalms_agpeya_progress').select('completed_psalms').eq('user_id', selected).maybeSingle(),
        supabase.from('agpeya_log').select('hour').eq('user_id', selected).eq('day', cairoToday()),
        supabase.from('agpeya_log').select('day, hour').eq('user_id', selected).gte('day', addDays(cairoToday(), -13)).order('day', { ascending: false }),
      ]);
      if (cancelled) return;
      if (p.error || h.error || hist.error) toast('error', 'تعذر تحميل سجل التسميع');
      setHistory((hist.data as AgpeyaDay[]) || []);
      setPsalms(Array.isArray(p.data?.completed_psalms) ? p.data.completed_psalms : []);
      setHours((h.data || []).map((r: { hour: string }) => r.hour));
      setProgLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const done = (data: unknown, okMsg: string) => toast('success', isQueuedResult(data) ? 'أنت أوفلاين. الطلب اتحفظ وهيتنفّذ لما النت يرجع.' : okMsg);

  const saveSettings = async () => {
    setSBusy(true);
    const { data, error } = await supabase.rpc('set_fares_settings', { p_liturgy: form.liturgy, p_confession: form.confession, p_psalm: form.psalm, p_agpeya: form.agpeya, p_cooldown: form.cooldown });
    setSBusy(false);
    if (error) return toast('error', error.message || 'تعذر حفظ نظام النقاط');
    setSettings(form);
    done(data, 'تم حفظ نظام النقاط. المزامير والأجبية اتحسبت من جديد.');
    void fetchData();
  };

  const saveContest = async (clear = false) => {
    if (!clear && (!cStart || !cEnd)) return toast('error', 'حدد تاريخ البداية والنهاية.');
    setCBusy(true);
    const { data, error } = await supabase.rpc('set_fares_contest', { p_start: clear ? null : cStart, p_end: clear ? null : cEnd });
    setCBusy(false);
    if (error) return toast('error', error.message || 'تعذر حفظ مواعيد المسابقة');
    if (clear) { setCStart(''); setCEnd(''); }
    setContestSet(!clear);
    done(data, clear ? 'تم إلغاء المواعيد: المسابقة مفتوحة دايمًا.' : 'تم حفظ مواعيد المسابقة.');
  };

  const saveProgress = async () => {
    if (!selected) return toast('error', 'اختار المخدوم الأول.');
    setSaving(true);
    const { data, error } = await supabase.rpc('servant_save_progress', { p_target_user_id: selected, p_psalms: psalms, p_hours: hours });
    setSaving(false);
    if (error) return toast('error', `تعذر حفظ التسميع: ${error.message}`);
    done(data, 'تم تسجيل التسميع واحتساب النقاط.');
    void fetchData();
  };

  const record = async (row: Row, kind: 'liturgy' | 'confession', day?: string, time?: string) => {
    if (busy) return false;
    setBusy(row.id + kind);
    const args: Record<string, unknown> = { p_member: row.id, p_kind: kind };
    if (kind === 'confession') { args.p_day = day || today; args.p_time = time || null; }
    const { data, error } = await supabase.rpc('record_fares_activity', args);
    setBusy('');
    if (error) { toast('error', error.message || 'لم يتم التسجيل'); return false; }
    const pts = (data as { points?: number } | null)?.points;
    done(data, `تم تسجيل ${kind === 'liturgy' ? 'القداس' : 'الاعتراف'} لـ ${row.name}${pts ? ` (+${pts})` : ''}`);
    void fetchData();
    return true;
  };

  const openConfession = (row: Row) => { setConfRow(row); setConfDay(today); setConfTime(''); };
  const submitConfession = async () => {
    if (!confRow) return;
    if (!confDay) return toast('error', 'اكتب راح يوم إيه.');
    if (confDay > today) return toast('error', 'اليوم ما ينفعش يكون في المستقبل.');
    if (await record(confRow, 'confession', confDay, confTime)) setConfRow(null);
  };

  const undo = async (log: Log) => {
    if (!window.confirm('تتراجع عن التسجيل ده؟ النقاط هتتخصم.')) return;
    const { data, error } = await supabase.rpc('undo_fares_activity', { p_id: log.id });
    if (error) return toast('error', error.message || 'تعذر التراجع');
    done(data, 'تم التراجع.');
    void fetchData();
  };

  if (noClass) return <div className="card-dark p-4"><p className="py-4 text-center text-gray-400">لم يتم تعيين فصل لك بعد. اطلب من الأدمن تحديد فصلك.</p></div>;

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  const leaders = [...rows].sort((a, b) => b.total - a.total);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const myRecent = (id: string) => logs.filter((l) => l.user_id === id && (isAdmin || l.by_user === user?.id) && Date.now() - new Date(l.created_at).getTime() < 48 * 3600 * 1000);
  const confessionInfo = (id: string) => {
    const all = logs.filter((l) => l.user_id === id && l.kind === 'confession').sort((a, b) => (a.day === b.day ? a.created_at.localeCompare(b.created_at) : a.day.localeCompare(b.day)));
    const lastLog = all[all.length - 1];
    if (!lastLog) return { last: '', time: '', next: '', locked: false };
    const last = lastLog.day;
    const next = addDays(last, settings.cooldown);
    return { last, time: hhmm(lastLog.confession_time), next, locked: settings.cooldown > 0 && !isAdmin && today < next };
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 text-right" dir="rtl">
      <header className="card-dark flex items-center gap-3 p-5">
        <div className="rounded-xl bg-gold-300/10 p-3 text-gold-300"><Award size={28} /></div>
        <div>
          <h1 className="text-xl font-black gold-text">إدارة فارس الإنجيل</h1>
          <p className="mt-1 text-sm text-gray-400">تسجيل التسميع والقداس والاعتراف لمخدومين {isAdmin ? 'كل الفصول' : 'فصلك'}.</p>
        </div>
      </header>

      <section className="card-dark overflow-hidden">
        <button type="button" onClick={() => setOpen(open === 'points' ? null : 'points')} aria-expanded={open === 'points'} className="flex w-full items-center justify-between p-4 text-right">
          <span className="font-black gold-text">تعديل النقاط (نظام النقاط)</span>
          <ChevronDown size={20} className={`text-gold-300 transition-transform ${open === 'points' ? 'rotate-180' : ''}`} />
        </button>
        {open === 'points' && (
          <div className="space-y-3 border-t border-white/10 p-4">
            <p className="text-xs text-gray-400">حدّد كام نقطة كل نشاط. المزامير والأجبية بتتحسب من جديد لكل المخدومين، والقداس والاعتراف بيسري على التسجيلات الجاية.</p>
            <div className="grid grid-cols-2 gap-3">
              {([['liturgy', 'نقاط القداس والتناول', 100], ['confession', 'نقاط الاعتراف', 100], ['psalm', 'نقاط كل مزمور', 100], ['agpeya', 'نقاط كل ساعة أجبية', 100]] as const).map(([k, label, max]) => (
                <label key={k} className="text-sm text-gray-200">{label}
                  <input type="number" min={0} max={max} value={form[k]} onChange={(e) => setForm({ ...form, [k]: clampN(e.target.value, max) })} className="input-dark mt-1 text-center" />
                </label>
              ))}
            </div>
            <label className="block text-sm text-gray-200">مدة الانتظار بين اعترافين (بالأيام، 0 = بدون انتظار)
              <input type="number" min={0} max={365} value={form.cooldown} onChange={(e) => setForm({ ...form, cooldown: clampN(e.target.value, 365) })} className="input-dark mt-1 text-center" />
            </label>
            <p className="text-xs text-gray-400">الاعتراف: بعد ما يتسجّل لمخدوم، ما ينفعش يتسجّل له تاني غير لما تعدّي {form.cooldown} يوم (بالأيام مش بالشهر).</p>
            <button type="button" disabled={sBusy} onClick={() => void saveSettings()} className="btn-gold w-full rounded-xl p-3 font-bold">{sBusy ? 'جاري الحفظ...' : 'حفظ نظام النقاط'}</button>
          </div>
        )}
      </section>

      <section className="card-dark overflow-hidden">
        <button type="button" onClick={() => setOpen(open === 'contest' ? null : 'contest')} aria-expanded={open === 'contest'} className="flex w-full items-center justify-between p-4 text-right">
          <span className="font-black gold-text">مواعيد المسابقة {contestSet ? `(${cStart} ← ${cEnd})` : '(مفتوحة دايمًا)'}</span>
          <ChevronDown size={20} className={`text-gold-300 transition-transform ${open === 'contest' ? 'rotate-180' : ''}`} />
        </button>
        {open === 'contest' && (
          <div className="space-y-3 border-t border-white/10 p-4">
            <p className="text-xs text-gray-400">خارج المواعيد دي، الخدام مش بيقدروا يسجّلوا تسميع أو نقاط (الأدمن بيقدر). سيبهم فاضيين لو عايزها مفتوحة دايمًا.</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 text-sm text-gray-200">تبدأ يوم
                <input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className="input-dark mt-1" />
              </label>
              <label className="flex-1 text-sm text-gray-200">وتنتهي يوم
                <input type="date" value={cEnd} min={cStart || undefined} onChange={(e) => setCEnd(e.target.value)} className="input-dark mt-1" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={cBusy} onClick={() => void saveContest(false)} className="btn-gold flex-1 rounded-xl p-3 font-bold">{cBusy ? 'جاري الحفظ...' : 'حفظ المواعيد'}</button>
              <button type="button" disabled={cBusy || !contestSet} onClick={() => void saveContest(true)} className="btn-outline-gold rounded-xl px-4 py-3 text-sm">إلغاء المواعيد</button>
            </div>
          </div>
        )}
      </section>

      <section className="card-dark space-y-4 p-5">
        <h2 className="text-lg font-black gold-text">📖 تسجيل التسميع</h2>
        <label className="block text-sm font-bold text-gray-200">اسم المخدوم
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input-dark mt-2">
            <option value="">{isAdmin ? '-- اختار اسم المخدوم --' : '-- اختار من مخدومين الفصل --'}</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}{isAdmin && r.cls ? ` — ${r.cls}` : ''}</option>)}
          </select>
        </label>
        {!selected ? <p className="rounded-xl bg-dark-300 p-4 text-sm text-gray-400">اختار مخدوم لإظهار سجله.</p> : (
          <>
            {progLoading && <p role="status" className="text-sm text-gray-400">جاري تحميل السجل...</p>}
            {!progLoading && (() => {
              const who = rows.find((r) => r.id === selected);
              const byDay = new Map<string, string[]>();
              history.forEach((h) => byDay.set(h.day, [...(byDay.get(h.day) || []), h.hour]));
              const order = (h: string) => HOURS.indexOf(h);
              return (
                <div className="space-y-3 rounded-xl border border-gold-300/30 bg-dark-400 p-4">
                  <h3 className="font-black gold-text">سمّع إيه{who ? ` — ${who.name}` : ''}</h3>
                  <div>
                    <p className="text-sm font-bold text-gray-200">المزامير ({psalms.length})</p>
                    {psalms.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">{[...psalms].sort((a, b) => a - b).map((n) => <span key={n} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white">{n}</span>)}</div>
                    ) : <p className="mt-1 text-xs text-gray-400">لسه ما سمّعش مزامير.</p>}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-200">الأجبية (آخر 14 يوم)</p>
                    {byDay.size ? (
                      <ul className="mt-2 space-y-1.5">
                        {[...byDay.entries()].map(([day, hs]) => (
                          <li key={day} className="flex flex-wrap items-center gap-1.5 text-xs text-gray-300">
                            <span className="min-w-[88px] font-bold">{day}{day === today ? ' (النهاردة)' : ''}</span>
                            {[...hs].sort((a, b) => order(a) - order(b)).map((h) => <span key={h} className="rounded-full bg-gold-300 px-2 py-0.5 font-bold text-dark-500">{h}</span>)}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-xs text-gray-400">مفيش ساعات أجبية متسجّلة في آخر 14 يوم.</p>}
                  </div>
                </div>
              );
            })()}
            <div>
              <h3 className="mb-1 font-bold text-gray-200">أجبية النهاردة ({settings.agpeya} نقاط لكل ساعة)</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {HOURS.map((h) => (
                  <button type="button" key={h} aria-pressed={hours.includes(h)} aria-label={`${hours.includes(h) ? 'إلغاء تحديد' : 'تحديد'} صلاة ${h}`} onClick={() => setHours((p) => toggle(p, h))}
                    className={`rounded-xl border p-3 text-sm font-bold ${hours.includes(h) ? 'border-gold-300 bg-gold-300 text-dark-500' : 'border-white/10 bg-dark-300 text-gray-300'}`}>{h}</button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1 font-bold text-gray-200">المزامير ({settings.psalm} نقاط لكل مزمور)</h3>
              <div className="mt-2 grid max-h-72 grid-cols-6 gap-2 overflow-y-auto rounded-xl bg-dark-400 p-3 sm:grid-cols-10">
                {Array.from({ length: 151 }, (_, i) => i + 1).map((n) => (
                  <button type="button" key={n} aria-pressed={psalms.includes(n)} aria-label={`${psalms.includes(n) ? 'إلغاء تحديد' : 'تحديد'} المزمور ${n}`} onClick={() => setPsalms((p) => toggle(p, n))}
                    className={`min-h-[40px] rounded-lg text-xs font-bold ${psalms.includes(n) ? 'bg-emerald-700 text-white' : 'border border-white/10 bg-dark-300 text-gray-300'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-sm text-gray-400"><span>{psalms.length} مزمور</span><span>{hours.length} ساعة النهاردة</span></div>
            <button type="button" disabled={saving || progLoading} onClick={() => void saveProgress()} className="btn-gold w-full rounded-xl p-3 font-bold">{saving ? 'جاري الحفظ...' : '💾 حفظ التسميع واحتساب النقاط'}</button>
          </>
        )}
      </section>

      <section className="card-dark overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <h2 className="flex items-center gap-2 font-black gold-text"><Users size={18} /> القداس والاعتراف</h2>
          <div className="flex gap-2">
            <input aria-label="بحث عن مخدوم" placeholder="ابحث بالاسم..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-dark w-44 text-sm" />
            <button aria-label="تحديث" onClick={() => void fetchData()} className="btn-outline-gold flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"><RefreshCw size={15} /> تحديث</button>
          </div>
        </div>
        {loading ? <p className="p-8 text-center text-gray-400">جاري التحميل...</p> : filtered.length === 0 ? <p className="p-8 text-center text-gray-400">مفيش مخدومين.</p> : (
          <div className="divide-y divide-white/10">
            {filtered.map((r) => {
              const c = confessionInfo(r.id);
              const liturgyToday = logs.some((l) => l.user_id === r.id && l.kind === 'liturgy' && l.day === today);
              const recent = myRecent(r.id);
              return (
                <div key={r.id} className="space-y-2 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-bold text-gray-100">{r.name}</h3>
                      <p className="mt-1 text-xs text-gray-400">القداسات {r.liturgy} · الاعتراف {r.confession} · المزامير {r.psalms} · الأجبية {r.agpeya}</p>
                      <p className="mt-1 font-black text-gold-300">المجموع: {r.total} نقطة</p>
                      {c.last && <p className="mt-1 text-xs text-gray-400">آخر اعتراف: {c.last}{c.time ? ` الساعة ${c.time}` : ''}{c.locked ? ` · التسجيل الجاي من ${c.next}` : ''}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={!!busy || liturgyToday} onClick={() => void record(r, 'liturgy')} className="btn-outline-gold rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">{liturgyToday ? 'القداس اتسجّل النهاردة' : `قداس +${settings.liturgy}`}</button>
                      <button disabled={!!busy || c.locked} onClick={() => openConfession(r)} className="btn-outline-gold rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">{c.locked ? `اعتراف من ${c.next}` : `اعتراف +${settings.confession}`}</button>
                    </div>
                  </div>
                  {recent.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recent.map((l) => (
                        <button key={l.id} type="button" onClick={() => void undo(l)} className="flex items-center gap-1 rounded-full bg-dark-300 px-3 py-1 text-xs text-gray-300">
                          <Undo2 size={12} /> تراجع: {l.kind === 'liturgy' ? 'قداس' : 'اعتراف'} ({l.day}{l.kind === 'confession' && l.confession_time ? ` ${hhmm(l.confession_time)}` : ''})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card-dark p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black gold-text"><Trophy size={18} /> ترتيب المخدومين</h2>
        {leaders.length ? (
          <ol className="space-y-2">
            {leaders.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-dark-300 p-3"><span className="font-semibold text-gray-200">#{i + 1} — {r.name}</span><span className="font-black text-gold-300">{r.total} نقطة</span></li>
            ))}
          </ol>
        ) : <p className="text-sm text-gray-400">هيظهر الترتيب بعد تحميل المخدومين.</p>}
      </section>

      <Modal open={!!confRow} onClose={() => setConfRow(null)} title={`تسجيل اعتراف${confRow ? ` — ${confRow.name}` : ''}`} size="sm">
        <div className="space-y-4 text-right" dir="rtl">
          <label className="block text-sm font-bold text-gray-200">راح يوم إيه؟
            <input type="date" value={confDay} max={today} min={confRow && !isAdmin ? (confessionInfo(confRow.id).next || undefined) : undefined} onChange={(e) => setConfDay(e.target.value)} className="input-dark mt-2" />
          </label>
          <label className="block text-sm font-bold text-gray-200">الساعة كام؟ <span className="font-normal text-gray-400">(اختياري)</span>
            <input type="time" value={confTime} onChange={(e) => setConfTime(e.target.value)} className="input-dark mt-2" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy || !confDay} onClick={() => void submitConfession()} className="btn-gold flex-1 rounded-xl p-3 font-bold disabled:opacity-50">{busy ? 'جاري التسجيل...' : `تسجيل الاعتراف +${settings.confession}`}</button>
            <button type="button" onClick={() => setConfRow(null)} className="btn-outline-gold rounded-xl px-4 py-3 text-sm">إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
