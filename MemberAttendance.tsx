import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { AttendanceRecord } from '@/lib/types';
import { CalendarDays, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';

export default function MemberAttendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadAttendance = async () => {
      if (!user?.id) {
        setRecords([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from('attendance')
        .select('id, user_id, user_name, church_class, status, attendance_day, attendance_time, attendance_date, created_at')
        .eq('user_id', user.id)
        .order('attendance_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        setLoadError(true);
        setRecords([]);
      } else {
        setRecords((data || []) as AttendanceRecord[]);
      }
      setLoading(false);
    };

    void loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto" dir="rtl">
      <div role="note" className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300">
        تسجيل الحضور يتم برصد خادم الفصل فقط
      </div>

      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">سجل الحضور</h1>
        <p className="text-sm text-gray-400 mt-1">عرض سجلات الحضور السابقة فقط.</p>
      </div>

      <div className="card-dark overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400" role="status">
            <Loader2 className="animate-spin" size={18} />
            جاري تحميل سجل الحضور...
          </div>
        ) : loadError ? (
          <p className="text-center text-red-300 py-10">تعذر تحميل سجل الحضور. حاول مرة أخرى لاحقاً.</p>
        ) : records.length === 0 ? (
          <p className="text-center text-gray-400 py-10">لا توجد سجلات حضور سابقة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-right">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400">
                  <th scope="col" className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> التاريخ</span></th>
                  <th scope="col" className="px-4 py-3 font-medium">اليوم</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-1.5"><Clock size={14} /> الوقت</span></th>
                  <th scope="col" className="px-4 py-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const present = record.status === 'present';
                  const date = record.attendance_date
                    ? new Date(`${record.attendance_date}T00:00:00`).toLocaleDateString('ar-EG')
                    : '—';

                  return (
                    <tr key={record.id} className="border-b border-white/5 last:border-0 text-sm">
                      <td className="px-4 py-3 text-gray-200">{date}</td>
                      <td className="px-4 py-3 text-gray-300">{record.attendance_day || '—'}</td>
                      <td className="px-4 py-3 text-gray-300">{record.attendance_time || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 ${present ? 'text-green-400' : 'text-gray-400'}`}>
                          {present ? <CheckCircle size={15} /> : <XCircle size={15} />}
                          {present ? 'حاضر' : 'غائب'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
