import { useEffect, useRef, useState } from 'react';
import { Bell, Crown, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useInbox, markAllRead, removeMessage } from '@/lib/inbox';
import Modal from '@/components/ui/Modal';
import type { InboxKind, InboxMessage } from '@/lib/types';

const EMOJI: Record<InboxKind, string> = { welcome: '🕊️', quiz: '📝', reward: '🎁', absent: '💛', verse: '📖', reset_request: '🔑', info: '🔔' };
const TZ = 'Africa/Cairo';
const cairoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (cairoDay(d) === cairoDay(today)) return 'النهاردة';
  if (cairoDay(d) === cairoDay(yesterday)) return 'امبارح';
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', timeZone: TZ });
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

function WelcomeCard({ m }: { m: InboxMessage }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold-300/50 bg-gradient-to-br from-gold-300/15 via-dark-300 to-dark-400 p-5 text-center shadow-lg">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full gold-gradient animate-glow"><Crown className="text-dark-500" size={26} /></div>
      <h4 className="font-serif text-lg font-bold shimmer-gold">{m.title}</h4>
      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-200">{m.body}</p>
      <p className="mt-3 text-[11px] text-gray-500">{timeLabel(m.created_at)}</p>
    </div>
  );
}

function Bubble({ m }: { m: InboxMessage }) {
  return (
    <div className={`max-w-[94%] rounded-2xl rounded-tr-sm border p-3 ${m.read_at ? 'border-white/10 bg-dark-300' : 'border-gold-300/40 bg-gold-300/10'}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg" aria-hidden="true">{EMOJI[m.kind] || '🔔'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-100">{m.title}</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-gray-300">{m.body}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <button type="button" onClick={() => void removeMessage(m.id)} aria-label="حذف الرسالة" className="hover:text-red-400"><Trash2 size={12} /></button>
        <span>{timeLabel(m.created_at)}{!m.read_at ? ' · جديدة' : ''}</span>
      </div>
    </div>
  );
}

// الجرس: عدّاد الرسائل الجديدة + قايمة الرسائل. رسالة الترحيب شكلها خاص، والباقي فقاعات عادية زي الواتساب.
export default function MessageCenter() {
  const { user } = useAuth();
  const { messages, loaded } = useInbox(user?.id);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const unread = messages.filter((m) => !m.read_at).length;
  const unreadWelcome = messages.some((m) => m.kind === 'welcome' && !m.read_at);

  // أول ما رسالة الترحيب توصل بتتفتح لوحدها (في الجرس اللي ظاهر بس)
  useEffect(() => {
    if (unreadWelcome && btnRef.current && btnRef.current.offsetParent !== null) setOpen(true);
  }, [unreadWelcome]);

  // بعد ثواني من فتح القايمة الرسائل بتتعلّم مقروءة
  useEffect(() => {
    if (!open || unread === 0 || !btnRef.current || btnRef.current.offsetParent === null) return;
    const t = window.setTimeout(() => void markAllRead(), 2500);
    return () => window.clearTimeout(t);
  }, [open, unread]);

  let lastDay = '';
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(true)} aria-label={unread ? `الرسائل (${unread} جديدة)` : 'الرسائل'} className="relative rounded-lg p-2 text-gray-300 transition-colors hover:text-gold-300">
        <Bell size={20} className={unread ? 'animate-pulse text-gold-300' : ''} />
        {unread > 0 && <span className="absolute -left-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="الرسائل" size="md">
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pl-1" dir="rtl">
          {!loaded && <p role="status" className="py-8 text-center text-sm text-gray-400">جاري تحميل الرسائل...</p>}
          {loaded && messages.length === 0 && <p className="py-10 text-center text-sm text-gray-400">📭 مفيش رسائل لسه.</p>}
          {messages.map((m) => {
            const label = dayLabel(m.created_at);
            const header = label !== lastDay ? <p key={`d-${m.id}`} className="pt-1 text-center text-xs text-gray-500"><span className="rounded-full bg-dark-300 px-3 py-1">{label}</span></p> : null;
            lastDay = label;
            return (
              <div key={m.id} className="space-y-3">
                {header}
                {m.kind === 'welcome' ? <WelcomeCard m={m} /> : <Bubble m={m} />}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
