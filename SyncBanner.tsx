import { useOfflineStatus, flushQueue, dismissFailed, syncSnapshots } from '@/lib/offline';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

// شريط حالة الاتصال والمزامنة
export default function SyncBanner() {
  const s = useOfflineStatus();
  const when = s.snapshotAt ? new Date(s.snapshotAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'numeric' }) : '';
  const idle = s.online && s.pending === 0 && s.failed.length === 0;
  if (idle && !s.snapshotting && !s.snapshotAt) return null;

  return (
    <div className="mb-4 space-y-2" dir="rtl">
      {idle && (
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>{s.snapshotting ? 'جاري حفظ نسخة من البيانات على الجهاز للأوفلاين...' : `بياناتك محفوظة للأوفلاين · آخر تحديث ${when}`}</span>
          {!s.snapshotting && <button type="button" onClick={() => void syncSnapshots()} className="underline">تحديث</button>}
        </div>
      )}
      {!s.online && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-800/40 bg-amber-950/40 p-3 text-sm text-amber-300">
          <WifiOff size={18} className="shrink-0" />
          <span>أنت أوفلاين. بتشتغل على آخر نسخة محفوظة{when ? ` (${when})` : ''}، وشغلك بيتحفظ على الجهاز وهيتبعت لوحده لما النت يرجع{s.pending > 0 ? ` (${s.pending} في الانتظار)` : ''}.</span>
        </div>
      )}
      {s.online && s.pending > 0 && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-gold-300/30 bg-gold-300/10 p-3 text-sm text-gold-300">
          <span className="flex items-center gap-2"><RefreshCw size={16} className={s.syncing ? 'animate-spin' : ''} /> {s.syncing ? 'جاري المزامنة...' : `${s.pending} عملية في انتظار المزامنة`}</span>
          {!s.syncing && <button type="button" onClick={() => void flushQueue()} className="underline">زامن الآن</button>}
        </div>
      )}
      {s.failed.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-800/40 bg-red-950/40 p-3 text-sm text-red-300">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 font-bold"><AlertCircle size={16} /> {s.failed.length} عملية ماتنفذتش بعد المزامنة:</span>
            <button type="button" onClick={() => void dismissFailed()} className="underline">تجاهل</button>
          </div>
          <ul className="mt-2 list-disc space-y-1 pr-5 text-xs">
            {s.failed.slice(0, 5).map((f, i) => <li key={i}>{f.label} ← {f.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
