import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BookOpen, Star, Award, Calendar, Trophy, Target, RefreshCw, AlertCircle } from 'lucide-react';

type Scores = { liturgy: number; confession: number; psalms: number; agpeya: number; total: number };
type RankRow = { user_id: string; full_name: string; church_class: string; total_points: number };

const zero: Scores = { liturgy: 0, confession: 0, psalms: 0, agpeya: 0, total: 0 };
const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export default function MemberFaresElAngeel() {
  const { user } = useAuth();
  const [scores, setScores] = useState<Scores>(zero);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rules, setRules] = useState<{ liturgy_points: number; confession_points: number; psalm_points: number; agpeya_hour_points: number; confession_cooldown_days: number } | null>(null);
  const [nextConfession, setNextConfession] = useState('');
  const [contest, setContest] = useState<{ start_date: string | null; end_date: string | null } | null>(null);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('fares_scores')
      .select('liturgy_points, confession_points, psalms_points, agpeya_points')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: rl } = await supabase.from('fares_settings').select('liturgy_points, confession_points, psalm_points, agpeya_hour_points, confession_cooldown_days').eq('id', 1).maybeSingle();
    setRules(rl || null);
    const { data: lastC } = await supabase.from('fares_award_log').select('day').eq('user_id', user.id).eq('kind', 'confession').order('day', { ascending: false }).limit(1);
    if (rl && lastC && lastC[0]) {
      const d = new Date(`${lastC[0].day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + rl.confession_cooldown_days);
      setNextConfession(d.toISOString().slice(0, 10));
    } else setNextConfession('');
    const { data: cdata } = await supabase.from('fares_contest').select('start_date, end_date').eq('id', 1).maybeSingle();
    setContest(cdata || null);
    if (err) { setError('تعذر تحميل النقاط. تأكد من تشغيل ملفات SQL الخاصة بفارس الإنجيل.'); setLoading(false); return; }
    const l = n(data?.liturgy_points), c = n(data?.confession_points), p = n(data?.psalms_points), a = n(data?.agpeya_points);
    setScores({ liturgy: l, confession: c, psalms: p, agpeya: a, total: l + c + p + a });
    const { data: board } = await supabase.rpc('get_fares_leaderboard');
    setRanking(((board as RankRow[]) || []).slice().sort((x, y) => Number(y.total_points) - Number(x.total_points)));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user?.id]);

  const rank = useMemo(() => {
    const i = ranking.findIndex((r) => r.user_id === user?.id);
    return i >= 0 ? i + 1 : null;
  }, [ranking, user?.id]);

  const levelSize = 100;
  const level = Math.floor(scores.total / levelSize) + 1;
  const progress = scores.total % levelSize;

  const cards = [
    { title: 'القداسات والتناول', score: scores.liturgy, icon: Calendar },
    { title: 'سر الاعتراف', score: scores.confession, icon: Award },
    { title: 'تسميع المزامير', score: scores.psalms, icon: BookOpen },
    { title: 'تسميع الأجبية', score: scores.agpeya, icon: Star },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-right animate-fade-in" dir="rtl">
      <header className="card-dark flex items-center gap-3 p-5">
        <div className="rounded-xl bg-gold-300/10 p-3 text-gold-300"><Trophy size={28} /></div>
        <div>
          <h1 className="text-xl font-bold gold-text">برنامج فارس الإنجيل</h1>
          <p className="mt-1 text-sm text-gray-400">تابع تقدمك في كل قسم. الخادم هو اللي بيسجّل التسميع والقداس والاعتراف.</p>
        </div>
      </header>

      {contest?.start_date && contest?.end_date && (() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        const state = today < contest.start_date ? 'لسه ماتبدأتش' : today > contest.end_date ? 'خلصت' : 'شغّالة دلوقتي';
        const color = state === 'شغّالة دلوقتي' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-amber-800/40 bg-amber-950/40 text-amber-300';
        return (
          <div role="status" className={`rounded-xl border p-3 text-sm ${color}`}>
            مسابقة الفارس {state}: من <strong>{contest.start_date}</strong> إلى <strong>{contest.end_date}</strong>
          </div>
        );
      })()}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-800/40 bg-red-950/40 p-4 text-red-300">
          <AlertCircle className="mt-0.5 shrink-0" size={20} />
          <div className="flex-1 text-sm">{error}</div>
          <button onClick={() => void load()} className="text-sm font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      {rules && (
        <section className="card-dark p-4 text-sm text-gray-300">
          <h2 className="mb-2 font-bold gold-text">نظام النقاط</h2>
          <p>القداس والتناول: <strong className="text-gold-300">{rules.liturgy_points}</strong> · الاعتراف: <strong className="text-gold-300">{rules.confession_points}</strong> (مرة كل {rules.confession_cooldown_days} يوم) · المزمور: <strong className="text-gold-300">{rules.psalm_points}</strong> · ساعة الأجبية: <strong className="text-gold-300">{rules.agpeya_hour_points}</strong></p>
          {nextConfession && nextConfession > new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) && <p className="mt-2 text-xs text-gray-400">اعترافك الجاي بنقاط من يوم {nextConfession}.</p>}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        {cards.map(({ title, score, icon: Icon }) => (
          <div key={title} className="card-dark p-4">
            <div className="flex items-center gap-2 text-gold-300"><Icon size={18} /><h2 className="text-sm font-semibold text-gray-200">{title}</h2></div>
            <p className="mt-2 text-2xl font-black text-gold-100">{score}</p>
            <p className="text-xs text-gray-400">نقطة</p>
          </div>
        ))}
      </section>

      <section className="card-dark p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">المجموع الكلي</p>
            <p className="mt-1 text-4xl font-black text-gold-300">{scores.total} <span className="text-base font-medium text-gray-400">نقطة</span></p>
          </div>
          <div className="rounded-2xl bg-gold-300/10 p-3 text-gold-300"><Target size={28} /></div>
        </div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-bold text-gray-200">المستوى {level}</span>
          <span className="text-gray-400">{progress} / {levelSize}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-dark-300" role="progressbar" aria-label="تقدم المستوى" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={levelSize}>
          <div className="h-full rounded-full bg-gold-300 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-400">فاضلك {levelSize - progress} نقطة للمستوى التالي.</p>
      </section>

      <section className="card-dark p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold gold-text"><Trophy size={18} /> الترتيب</h2>
          <button onClick={() => void load()} disabled={loading} aria-label="تحديث الترتيب" className="btn-outline-gold flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
        </div>
        {loading && <p className="text-sm text-gray-400">جاري التحميل...</p>}
        {!loading && rank && <p className="mb-3 text-sm text-gray-300">ترتيبك <strong className="text-gold-300">#{rank}</strong> من {ranking.length} مشترك.</p>}
        <ol className="space-y-1.5">
          {ranking.slice(0, 5).map((r, i) => (
            <li key={r.user_id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${r.user_id === user?.id ? 'bg-gold-300/10 text-gold-300' : 'bg-dark-300 text-gray-300'}`}>
              <span>{i + 1}. {r.full_name}</span>
              <span className="font-bold">{Number(r.total_points)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
