import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { CheckCircle2, Clock, BookOpen } from 'lucide-react';

const HOURS = ['باكر', 'الثالثة', 'السادسة', 'التاسعة', 'الغروب', 'النوم', 'الستار', 'نصف الليل'];
const cairoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

// للعرض فقط: الخادم هو اللي بيسجّل التسميع
export default function PsalmsAndAgpeya() {
  const { user } = useAuth();
  const [psalms, setPsalms] = useState<number[]>([]);
  const [hours, setHours] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pts, setPts] = useState({ psalm: 5, hour: 10 });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      const [p, h] = await Promise.all([
        supabase.from('psalms_agpeya_progress').select('completed_psalms').eq('user_id', user.id).maybeSingle(),
        supabase.from('agpeya_log').select('hour').eq('user_id', user.id).eq('day', cairoToday()),
      ]);
      const { data: st } = await supabase.from('fares_settings').select('psalm_points, agpeya_hour_points').eq('id', 1).maybeSingle();
      if (!active) return;
      if (st) setPts({ psalm: st.psalm_points, hour: st.agpeya_hour_points });
      setPsalms(Array.isArray(p.data?.completed_psalms) ? p.data.completed_psalms : []);
      setHours((h.data || []).map((r: { hour: string }) => r.hour));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-right" dir="rtl">
      <div className="card-dark p-5">
        <h2 className="mb-1 flex items-center gap-2 text-xl font-black gold-text"><Clock size={20} /> صلوات الأجبية (النهاردة)</h2>
        <p className="mb-4 text-sm text-gray-400">للاطلاع فقط. الخادم هو اللي بيسجّل التسميع ويحدّث نقاطك. كل ساعة بـ {pts.hour} نقاط في اليوم.</p>
        {loading ? <p role="status" className="text-gray-400">جاري تحميل السجل...</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {HOURS.map((hour) => {
              const done = hours.includes(hour);
              return (
                <div key={hour} className={`rounded-xl border p-3 text-center font-bold ${done ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-white/10 bg-dark-300 text-gray-300'}`}>
                  <span className="block">صلاة {hour}</span>
                  <span className="mt-1 block text-xs">{done ? 'تم التسميع' : 'لم تُسجّل بعد'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-dark p-5">
        <h2 className="mb-1 flex items-center gap-2 text-xl font-black gold-text"><BookOpen size={20} /> تسميع المزامير (1–151)</h2>
        <p className="mb-4 text-sm text-gray-400">كل مزمور بـ {pts.psalm} نقاط.</p>
        {loading ? <p role="status" className="text-gray-400">جاري تحميل السجل...</p> : (
          <>
            <div className="grid grid-cols-6 gap-2 rounded-xl bg-dark-400 p-3 sm:grid-cols-10">
              {Array.from({ length: 151 }, (_, i) => i + 1).map((n) => {
                const done = psalms.includes(n);
                return (
                  <div key={n} aria-label={`المزمور ${n}: ${done ? 'تم التسميع' : 'لم يُسجل'}`} className={`flex min-h-[40px] items-center justify-center rounded-lg border text-xs font-bold ${done ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-white/10 bg-dark-300 text-gray-300'}`}>{n}</div>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-300"><CheckCircle2 size={16} className="text-emerald-400" /> {psalms.length} مزمور مسجّل، و{hours.length} ساعة أجبية النهاردة.</p>
          </>
        )}
      </div>
    </div>
  );
}
