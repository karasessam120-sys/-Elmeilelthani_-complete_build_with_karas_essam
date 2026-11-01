import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { toast } from '@/components/ui/Toast';
import type { InboxMessage } from './types';

// مخزن واحد للرسائل لكل التطبيق: تحميل أولي + Realtime + تحديث كل دقيقة (لو الـ Realtime مش شغال)
type Snap = { messages: InboxMessage[]; loaded: boolean };
let snap: Snap = { messages: [], loaded: false };
let uid: string | null = null;
let users = 0;
let channel: RealtimeChannel | null = null;
let timer: number | undefined;
let seen = new Set<string>();
const subs = new Set<() => void>();

const set = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const getSnap = () => snap;

// أي رسالة جديدة لسه ماتقرتش بتظهر كإشعار صغير مرة واحدة
function ingest(list: InboxMessage[], notify: boolean) {
  const fresh = list.filter((m) => !seen.has(m.id));
  fresh.forEach((m) => seen.add(m.id));
  if (notify) fresh.filter((m) => !m.read_at).slice(0, 3).forEach((m) => toast('info', `📬 ${m.title}`));
}

export async function reloadInbox() {
  if (!uid) return;
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
  if (error || !data) return;
  const list = data as InboxMessage[];
  ingest(list, snap.loaded);
  set({ messages: list, loaded: true });
}

function start(userId: string) {
  stop();
  if (uid !== userId) {
    uid = userId;
    seen = new Set();
    snap = { messages: [], loaded: false };
  }
  void reloadInbox();
  if (!channel) {
    channel = supabase
      .channel(`inbox-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` }, (payload) => {
        const m = payload.new as InboxMessage;
        ingest([m], true);
        set({ messages: [m, ...snap.messages.filter((x) => x.id !== m.id)] });
      })
      .subscribe();
  }
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reloadInbox(); }, 60000);
  window.addEventListener('online', onOnline);
}
const onOnline = () => { void reloadInbox(); };

function stop() {
  if (channel) { void supabase.removeChannel(channel); channel = null; }
  window.clearInterval(timer);
  window.removeEventListener('online', onOnline);
}

export function useInbox(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    users += 1;
    if (users === 1 || uid !== userId) start(userId);
    return () => { users -= 1; if (users === 0) stop(); };
  }, [userId]);
  return useSyncExternalStore(subscribe, getSnap);
}

export async function markAllRead() {
  const ids = snap.messages.filter((m) => !m.read_at).map((m) => m.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  set({ messages: snap.messages.map((m) => (m.read_at ? m : { ...m, read_at: now })) });
  await supabase.rpc('mark_messages_read', { p_ids: ids });
}

export async function removeMessage(id: string) {
  set({ messages: snap.messages.filter((m) => m.id !== id) });
  await supabase.from('messages').delete().eq('id', id);
}
