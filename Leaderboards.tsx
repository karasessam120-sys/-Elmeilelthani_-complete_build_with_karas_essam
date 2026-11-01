import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Trophy, RefreshCw, Star, Award, BookOpen, CalendarCheck, HeartHandshake } from 'lucide-react';

type Row = {
  user_id: string; full_name: string; church_class: string | null; avatar_url: string | null; dream: string | null;
  stars: number; fares_points: number; quiz_points: number; attendance_present: number; attendance_total: number; hat_count: number;
};
type BoardId = 'stars' | 'fares' | 'quiz' | 'attendance' | 'hat';

const BOARDS: { id: BoardId; label: string; unit: string; icon: typeof Star; value: (r: Row) => number; sub?: (r: Row) => string }[] = [
  { id: 'stars', label: 'النجوم', unit: 'نجمة', icon: Star, value: (r) => r.stars },
  { id: 'fares', label: 'فارس الإنجيل', unit: 'نقطة', icon: Award, value: (r) => r.fares_points },
  { id: 'quiz', label: 'الاختبارات', unit: 'درجة', icon: BookOpen, value: (r) => r.quiz_points },
  { id: 'attendance', label: 'الحضور', unit: 'حضور', icon: CalendarCheck, value: (r) => r.attendance_present, sub: (r) => `من ${r.attendance_total}` },
  { id: 'hat', label: 'هات أخوك', unit: 'أخ', icon: HeartHandshake, value: (r) => r.hat_count },
];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function Avatar({ row, size }: { row: Row; size: number }) {
  return (
    <div className="rb-border flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/40 font-black text-white" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" /> : <span>{row.full_name.charAt(0)}</span>}
    </div>
  );
}

export default function Leaderboards() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [board, setBoard] = useState<BoardId>('stars');
  const [scope, setScope] = useState<'all' | 'class'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('get_leaderboards');
    if (err) {
      setError('تعذر تحميل الترتيب. تأكد من تشغيل ملف SQL الخاص بالمتصدرين.');
      setRows([]);
    } else {
      setRows(((data ?? []) as Row[]).map((r) => ({
        ...r, stars: num(r.stars), fares_points: num(r.fares_points), quiz_points: num(r.quiz_points),
        attendance_present: num(r.attendance_present), attendance_total: num(r.attendance_total), hat_count: num(r.hat_count),
      })));
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const cfg = BOARDS.find((b) => b.id === board)!;
  const ranked = useMemo(() => {
    const list = scope === 'class' && user?.church_class ? rows.filter((r) => r.church_class === user.church_class) : rows;
    return [...list].sort((a, b) => cfg.value(b) - cfg.value(a) || (board === 'attendance' ? a.attendance_total - b.attendance_total : 0) || a.full_name.localeCompare(b.full_name, 'ar'));
  }, [rows, scope, board, user?.church_class]);

  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const podium = [top[1], top[0], top[2]]; // 2 - 1 - 3
  const heights = ['h-20', 'h-28', 'h-14'];
  const places = [2, 1, 3];
  const myRank = ranked.findIndex((r) => r.user_id === user?.id) + 1;

  return (
    <section className="rb-root mx-auto max-w-3xl space-y-4 text-right" dir="rtl">
      <div className="rb-stage space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-black text-white"><Trophy className="rb-text" size={26} /> المتصدرون</h1>
          <button onClick={() => void load()} disabled={loading} aria-label="تحديث الترتيب" className="rb-border flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
        </header>

        <div role="tablist" aria-label="نوع الترتيب" className="flex gap-2 overflow-x-auto pb-1">
          {BOARDS.map((b) => {
            const Icon = b.icon;
            const on = b.id === board;
            return (
              <button key={b.id} role="tab" aria-selected={on} onClick={() => setBoard(b.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all ${on ? 'rb-border bg-white/10 text-white' : 'border border-white/10 text-gray-300'}`}>
                <Icon size={15} /> {b.label}
              </button>
            );
          })}
        </div>

        {user?.church_class && (
          <div className="flex gap-2 text-xs">
            {([['all', 'كل الفصول'], ['class', `فصلي (${user.church_class})`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setScope(id)} className={`rounded-full px-3 py-1.5 ${scope === id ? 'bg-white/15 text-white' : 'text-gray-300'}`}>{label}</button>
            ))}
          </div>
        )}

        {loading ? <p role="status" className="py-10 text-center text-gray-300">جاري تحميل الترتيب...</p>
          : error ? <div role="alert" className="py-8 text-center text-red-300"><p>{error}</p><button onClick={() => void load()} className="mt-2 underline">إعادة المحاولة</button></div>
          : ranked.length === 0 ? <p className="py-10 text-center text-gray-300">مفيش نتايج لسه.</p>
          : (
            <>
              <div dir="ltr" className="flex items-end justify-center gap-3 pt-6">
                {podium.map((r, i) => r && (
                  <div key={r.user_id} className="flex w-1/3 max-w-[160px] flex-col items-center">
                    <div className="relative">
                      <Avatar row={r} size={i === 1 ? 84 : 64} />
                      <span className="rb-border absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white">{places[i]}</span>
                    </div>
                    <p className="rb-text mt-2 text-xl font-black">{cfg.value(r)}</p>
                    <p className="max-w-full truncate text-center text-xs text-white" dir="rtl">{r.full_name}</p>
                    <div className={`rb-block mt-2 w-full rounded-t-xl ${heights[i]}`} />
                  </div>
                ))}
              </div>

              <ol className="space-y-2">
                {rest.map((r, i) => (
                  <li key={r.user_id} className={`rb-border flex items-center gap-3 rounded-2xl bg-black/30 px-3 py-2.5 ${r.user_id === user?.id ? 'ring-2 ring-white/60' : ''}`}>
                    <span className="w-6 text-center text-sm font-black text-gray-200">{i + 4}</span>
                    <Avatar row={r} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white">{r.full_name}</p>
                      <p className="truncate text-xs text-gray-300">{r.church_class || ''}{r.dream ? ` · حلمي: ${r.dream}` : ''}</p>
                    </div>
                    <div className="text-left">
                      <p className="rb-text text-lg font-black">{cfg.value(r)}</p>
                      {cfg.sub && <p className="text-[11px] text-gray-300">{cfg.sub(r)}</p>}
                    </div>
                  </li>
                ))}
              </ol>
              {myRank > 0 && <p className="text-center text-sm text-gray-200">ترتيبك في {cfg.label}: <strong className="rb-text">#{myRank}</strong> من {ranked.length}</p>}
            </>
          )}
      </div>
    </section>
  );
}
