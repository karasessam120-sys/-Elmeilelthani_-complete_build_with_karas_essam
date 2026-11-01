import { useState, useEffect, useRef } from 'react';
import LessonPrep from '@/components/servant/LessonPrep';
import ClassTransfer from '@/components/shared/ClassTransfer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import type { Quiz, Feedback, RewardRedemption, Reward, User, AttendanceRecord, QuizQuestion, AbsentPeer, HatAkhookUpload } from '@/lib/types';
import { generateNotification } from '@/lib/ai';
import {
  BookOpen, Plus, Trash2, MessageSquare, Gift, Package,
  Users, CheckCircle, XCircle, Star, StarIcon, Camera, Phone, PhoneCall, UserIcon,
  Wifi, WifiOff, RefreshCw, Search, Minus,
  Sparkles,
} from 'lucide-react';

type MainTab = 'members' | 'stars' | 'transfer' | 'prep' | 'quizzes' | 'peers' | 'attendance' | 'rewards' | 'delivery' | 'store' | 'support';
type ServantToolTab = 'quizzes' | 'peers' | 'attendance' | 'rewards' | 'delivery' | 'store';

interface CachedMember {
  id: string;
  full_name: string;
  stars: number;
}

interface PendingStarAdjustment {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  createdAt: string;
  phase: 'queued' | 'balance_updated';
}

interface LocalStarNote {
  id: string;
  user_id: string;
  user_name: string;
  adjusted_by: string;
  amount: number;
  reason: string;
  created_at: string;
  status: 'pending' | 'synced';
}

interface ServantPanelCache {
  members: CachedMember[];
  pendingAdjustments: PendingStarAdjustment[];
  history: LocalStarNote[];
}

const EMPTY_PANEL_CACHE: ServantPanelCache = { members: [], pendingAdjustments: [], history: [] };
const PANEL_CACHE_PREFIX = 'elmeilelthani:servant-panel:v1';

function panelCacheKey(userId: string) {
  return `${PANEL_CACHE_PREFIX}:${userId}`;
}

function readPanelCache(userId: string): ServantPanelCache {
  if (typeof window === 'undefined' || !userId) return EMPTY_PANEL_CACHE;
  try {
    const raw = window.localStorage.getItem(panelCacheKey(userId));
    if (!raw) return EMPTY_PANEL_CACHE;
    const parsed = JSON.parse(raw) as Partial<ServantPanelCache>;
    return {
      members: Array.isArray(parsed.members) ? parsed.members.filter((m): m is CachedMember =>
        !!m && typeof m.id === 'string' && typeof m.full_name === 'string',
      ).map((m) => ({ id: m.id, full_name: m.full_name, stars: Number(m.stars) || 0 })) : [],
      pendingAdjustments: Array.isArray(parsed.pendingAdjustments) ? parsed.pendingAdjustments.filter((a): a is PendingStarAdjustment =>
        !!a && typeof a.id === 'string' && typeof a.memberId === 'string' && typeof a.amount === 'number',
      ) : [],
      history: Array.isArray(parsed.history) ? parsed.history.filter((h): h is LocalStarNote =>
        !!h && typeof h.id === 'string' && typeof h.user_id === 'string' && typeof h.user_name === 'string',
      ).slice(0, 50) : [],
    };
  } catch {
    return EMPTY_PANEL_CACHE;
  }
}

function newOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export default function ServantPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<MainTab>('members');
  const [toolTab, setToolTab] = useState<ServantToolTab>('quizzes');
  const [showExistingTools, setShowExistingTools] = useState(false);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState(false);
  const [memberLoadMessage, setMemberLoadMessage] = useState('');
  const [syncError, setSyncError] = useState(false);
  const [panelCache, setPanelCache] = useState<ServantPanelCache>(() => user ? readPanelCache(user.id) : EMPTY_PANEL_CACHE);
  const panelCacheRef = useRef(panelCache);
  const syncLockRef = useRef(false);

  const savePanelCache = (next: ServantPanelCache) => {
    panelCacheRef.current = next;
    setPanelCache(next);
    if (user?.id && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(panelCacheKey(user.id), JSON.stringify(next));
      } catch {
        toast('error', 'تعذر حفظ البيانات دون اتصال. مساحة التخزين قد تكون ممتلئة.');
      }
    }
  };

  const updatePanelCache = (update: (current: ServantPanelCache) => ServantPanelCache) => {
    savePanelCache(update(panelCacheRef.current));
  };

  const refreshMembers = async () => {
    if (!user?.id || typeof navigator !== 'undefined' && !navigator.onLine) return;
    const myClass = user.church_class || '';
    if (!myClass && user.role !== 'admin') {
      // خادم بدون فصل: لا تظهر أسماء
      setMemberLoadError(false);
      setMemberLoadMessage('');
      updatePanelCache((current) => ({ ...current, members: [] }));
      return;
    }
    let membersQuery = supabase.from('users')
      .select('id, full_name, stars')
      .eq('role', 'member')
      .eq('status', 'active');
    if (myClass) membersQuery = membersQuery.eq('church_class', myClass);
    const { data, error } = await membersQuery.order('full_name', { ascending: true });
    if (error || !data) {
      setMemberLoadError(true);
      setMemberLoadMessage(error?.message || 'خطأ غير معروف');
      return;
    }

    const freshMembers = data.map((member) => ({
      id: member.id,
      full_name: member.full_name || 'عضو',
      stars: Number(member.stars) || 0,
    }));
    const freshIds = new Set(freshMembers.map((member) => member.id));
    const queuedMemberIds = new Set(panelCacheRef.current.pendingAdjustments.map((adjustment) => adjustment.memberId));
    const retainedQueuedMembers = panelCacheRef.current.members.filter(
      (member) => queuedMemberIds.has(member.id) && !freshIds.has(member.id),
    );
    updatePanelCache((current) => ({
      ...current,
      members: [...freshMembers, ...retainedQueuedMembers],
    }));
    setMemberLoadError(false);
    setMemberLoadMessage('');
  };

  const syncPendingAdjustments = async () => {
    if (!user?.id || typeof navigator !== 'undefined' && !navigator.onLine || syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncing(true);
    setSyncError(false);

    try {
      const worklist = [...panelCacheRef.current.pendingAdjustments];
      for (const queued of worklist) {
        const current = panelCacheRef.current.pendingAdjustments.find((item) => item.id === queued.id);
        if (!current) continue;

        if (current.phase === 'queued') {
          const { data: member, error: readError } = await supabase.from('users')
            .select('stars')
            .eq('id', current.memberId)
            .maybeSingle();
          if (readError || !member) throw new Error('تعذر قراءة رصيد العضو');

          const serverStars = Number(member.stars) || 0;
          const nextStars = Math.max(0, serverStars + current.amount);
          const appliedAmount = nextStars - serverStars;
          if (appliedAmount === 0) {
            updatePanelCache((cache) => ({
              ...cache,
              pendingAdjustments: cache.pendingAdjustments.filter((item) => item.id !== current.id),
              history: cache.history.map((item) => item.id === current.id
                ? { ...item, amount: 0, status: 'synced' }
                : item),
            }));
            continue;
          }
          const { error: updateError } = await supabase.from('users')
            .update({ stars: nextStars })
            .eq('id', current.memberId);
          if (updateError) throw updateError;

          updatePanelCache((cache) => ({
            ...cache,
            members: cache.members.map((item) => item.id === current.memberId ? { ...item, stars: nextStars } : item),
            pendingAdjustments: cache.pendingAdjustments.map((item) =>
              item.id === current.id ? { ...item, amount: appliedAmount, phase: 'balance_updated' } : item,
            ),
            history: cache.history.map((item) => item.id === current.id ? { ...item, amount: appliedAmount } : item),
          }));
        }

        const auditItem = panelCacheRef.current.pendingAdjustments.find((item) => item.id === current.id);
        if (!auditItem) continue;
        const { error: auditError } = await supabase.from('star_adjustments').upsert({
          id: auditItem.id,
          user_id: auditItem.memberId,
          user_name: auditItem.memberName,
          adjusted_by: auditItem.adjustedBy,
          amount: auditItem.amount,
          reason: auditItem.reason,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (auditError) throw auditError;

        updatePanelCache((cache) => ({
          ...cache,
          pendingAdjustments: cache.pendingAdjustments.filter((item) => item.id !== auditItem.id),
          history: cache.history.map((item) => item.id === auditItem.id ? { ...item, status: 'synced' } : item),
        }));
      }
    } catch {
      setSyncError(true);
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void refreshMembers();
      }
    }
  };

  useEffect(() => {
    const cached = user?.id ? readPanelCache(user.id) : EMPTY_PANEL_CACHE;
    panelCacheRef.current = cached;
    setPanelCache(cached);
    if (user?.id) {
      try {
        window.localStorage.setItem(panelCacheKey(user.id), JSON.stringify(cached));
      } catch {
        // Continue with in-memory cache if browser storage is unavailable.
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshMembers();
    if (isOnline) void syncPendingAdjustments();
  // Refresh when connectivity changes or the active staff account changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.church_class, isOnline]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void refreshMembers();
      void syncPendingAdjustments();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refreshMembers();
        void syncPendingAdjustments();
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    const retryTimer = window.setInterval(() => {
      if (navigator.onLine && panelCacheRef.current.pendingAdjustments.length > 0) {
        void syncPendingAdjustments();
      }
    }, 15000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(retryTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleMembers = panelCache.members.map((member) => {
    const pendingDelta = panelCache.pendingAdjustments
      .filter((adjustment) => adjustment.memberId === member.id && adjustment.phase === 'queued')
      .reduce((total, adjustment) => total + adjustment.amount, 0);
    return { ...member, stars: Math.max(0, member.stars + pendingDelta) };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));

  const addStarAdjustment = (member: CachedMember, delta: number) => {
    const cachedMember = panelCacheRef.current.members.find((item) => item.id === member.id);
    if (!cachedMember) return;
    const pendingDelta = panelCacheRef.current.pendingAdjustments
      .filter((item) => item.memberId === member.id && item.phase === 'queued')
      .reduce((total, item) => total + item.amount, 0);
    const currentStars = Math.max(0, cachedMember.stars + pendingDelta);
    const nextStars = Math.max(0, currentStars + delta);
    const appliedAmount = nextStars - currentStars;
    if (appliedAmount === 0) {
      toast('info', 'لا يمكن سحب نجوم أكثر من الرصيد الحالي');
      return;
    }

    const id = newOperationId();
    const createdAt = new Date().toISOString();
    const note = reason.trim() || (appliedAmount > 0 ? 'إضافة نجوم' : 'سحب نجوم');
    const adjustment: PendingStarAdjustment = {
      id,
      memberId: member.id,
      memberName: member.full_name,
      amount: appliedAmount,
      reason: note,
      adjustedBy: user?.full_name || '',
      createdAt,
      phase: 'queued',
    };
    const historyItem: LocalStarNote = {
      id,
      user_id: member.id,
      user_name: member.full_name,
      adjusted_by: user?.full_name || '',
      amount: appliedAmount,
      reason: note,
      created_at: createdAt,
      status: 'pending',
    };

    updatePanelCache((cache) => ({
      ...cache,
      pendingAdjustments: [...cache.pendingAdjustments, adjustment],
      history: [historyItem, ...cache.history].slice(0, 50),
    }));
    toast('success', `${appliedAmount > 0 ? 'أضيفت' : 'سُحبت'} ${Math.abs(appliedAmount)} نجمة ${isOnline ? 'وسيتم مزامنتها' : 'وحُفظت دون اتصال'}`);
    if (isOnline) void syncPendingAdjustments();
  };

  const mainTabs: { id: MainTab; label: string; icon: typeof BookOpen }[] = [
    { id: 'members', label: 'المخدومين', icon: Users },
    { id: 'stars', label: 'النجوم', icon: StarIcon },
    { id: 'attendance', label: 'الحضور', icon: CheckCircle },
    { id: 'peers', label: 'الغياب', icon: Users },
    { id: 'quizzes', label: 'الاختبارات', icon: BookOpen },
    { id: 'rewards', label: 'هات أخوك', icon: Gift },
    { id: 'delivery', label: 'التسليمات', icon: Package },
    { id: 'store', label: 'المتجر', icon: Gift },
    { id: 'transfer', label: 'نقل الفصول', icon: Users },
    { id: 'prep', label: 'التحضير', icon: Sparkles },
    { id: 'support', label: 'الدعم', icon: MessageSquare },
  ];

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold gold-text">لوحة إدارة الخادم</h1>
          <p className="text-sm text-gray-400 mt-1">
            {user?.church_class ? `الفصل: ${user.church_class}` : 'كل الفصول'} &middot; مرحباً، {user?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${isOnline ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-300'}`}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? 'متصل' : 'دون اتصال'}
          </span>
          {panelCache.pendingAdjustments.length > 0 && (
            <span className="rounded-full bg-gold-300/10 text-gold-300 px-3 py-1.5">
              {panelCache.pendingAdjustments.length} تعديل بانتظار المزامنة
            </span>
          )}
          {syncing && <RefreshCw size={14} className="animate-spin text-gold-300" aria-label="جاري المزامنة" />}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {mainTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap text-sm transition-all ${
                active ? 'bg-gold-300/10 text-gold-300 border border-gold-300/20' : 'text-gray-400 hover:text-gold-300'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'members' && (
        <section className="space-y-4">
          <div className="card-dark p-4">
            <h2 className="font-semibold gold-text">{user?.church_class ? `مخدومين ${user.church_class}` : 'حسابات الأعضاء'}</h2>
            <p className="text-sm text-gray-400 mt-1">الأسماء المحفوظة على هذا الجهاز تبقى متاحة دون اتصال.</p>
            <div className="relative mt-4">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-dark pr-9" placeholder="ابحث عن عضو" />
            </div>
            {memberLoadError && (
              <p className="text-xs text-amber-300 mt-3">تعذر تحديث قائمة الأعضاء؛ يتم عرض آخر نسخة محفوظة. السبب: {memberLoadMessage}</p>
            )}
          </div>
          <div className="space-y-2">
            {visibleMembers.filter((member) => member.full_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((member) => (
              <button key={member.id} onClick={() => setTab('stars')} className="card-dark p-4 w-full flex items-center justify-between text-right hover:border-gold-300/30 border border-transparent transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 font-bold">
                    {member.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-200">{member.full_name}</span>
                </div>
                <span className="text-xs text-gray-400"><Star size={13} className="inline text-gold-300" fill="currentColor" /> {member.stars}</span>
              </button>
            ))}
            {visibleMembers.length === 0 && (
              <p className="text-center text-gray-400 py-8">
                {memberLoadError || !isOnline ? 'لا توجد أسماء محفوظة على هذا الجهاز بعد. اتصل بالإنترنت مرة واحدة لتحميل الحسابات.' : 'جاري تحميل الأعضاء...'}
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'stars' && (
        <section className="space-y-4">
          <div className="card-dark p-4 space-y-3">
            <div>
              <h2 className="font-semibold gold-text flex items-center gap-2"><StarIcon size={18} /> إدارة النجوم</h2>
              <p className="text-sm text-gray-400 mt-1">تُحفظ التعديلات محلياً فوراً، ثم تُرسل تلقائياً عند عودة الاتصال.</p>
            </div>
            {memberLoadError && <p className="text-xs text-amber-300">تعذر تحميل الأعضاء من السيرفر ({memberLoadMessage}). يتم عرض آخر نسخة محفوظة.</p>}
            <button onClick={() => { void refreshMembers(); void syncPendingAdjustments(); }} className="btn-outline-gold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 w-fit">
              <RefreshCw size={13} /> تحديث وإرسال التعديلات الآن
            </button>
            {syncError && <p className="text-xs text-amber-300">تعذرت المزامنة الآن. سيُعاد المحاولة تلقائياً عند عودة الاتصال.</p>}
          </div>

          <div className="space-y-2">
            {visibleMembers.map((member) => (
              <div key={member.id} className="card-dark p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-200">{member.full_name}</p>
                  <p className="text-xs text-gray-400 mt-1"><Star size={13} className="inline text-gold-300" fill="currentColor" /> {member.stars} نجمة</p>
                </div>
                <div className="flex items-center gap-2" aria-label={`تعديل نجوم ${member.full_name}`}>
                  <button onClick={() => addStarAdjustment(member, -5)} disabled={member.stars === 0} className="btn-outline-gold min-w-12 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1 disabled:opacity-40" aria-label={`سحب 5 نجوم من ${member.full_name}`}>
                    <Minus size={14} />5
                  </button>
                  <button onClick={() => addStarAdjustment(member, -1)} disabled={member.stars === 0} className="btn-outline-gold min-w-12 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1 disabled:opacity-40" aria-label={`سحب نجمة من ${member.full_name}`}>
                    <Minus size={14} />1
                  </button>
                  <button onClick={() => addStarAdjustment(member, 1)} className="btn-gold min-w-12 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1" aria-label={`إضافة نجمة إلى ${member.full_name}`}>
                    <Plus size={14} />1
                  </button>
                  <button onClick={() => addStarAdjustment(member, 5)} className="btn-gold min-w-12 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1" aria-label={`إضافة 5 نجوم إلى ${member.full_name}`}>
                    <Plus size={14} />5
                  </button>
                </div>
              </div>
            ))}
            {visibleMembers.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد حسابات محفوظة لعرضها.</p>}
          </div>

          <div className="card-dark p-4 space-y-3">
            <h3 className="font-semibold gold-text">آخر التعديلات المحفوظة على هذا الجهاز</h3>
            {panelCache.history.slice(0, 10).map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-white/5 pt-3 text-sm">
                <div>
                  <p className="text-gray-200">{item.user_name} · {item.amount > 0 ? '+' : ''}{item.amount} نجمة</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-xs ${item.status === 'synced' ? 'text-green-400' : 'text-amber-300'}`}>
                  {item.status === 'synced' ? 'تمت المزامنة' : 'بانتظار المزامنة'}
                </span>
              </div>
            ))}
            {panelCache.history.length === 0 && <p className="text-sm text-gray-400">لا توجد تعديلات بعد.</p>}
          </div>
        </section>
      )}

      {tab === 'attendance' && <AttendanceManager churchClass={user?.church_class || ''} />}
      {tab === 'peers' && <PeerManager churchClass={user?.church_class || ''} />}
      {tab === 'quizzes' && <QuizManager churchClass={user?.church_class || ''} createdBy={user?.full_name || ''} />}
      {tab === 'rewards' && <HatAkhookReview />}
      {tab === 'delivery' && <DeliveryBoard />}
      {tab === 'store' && <StoreManager />}
      {tab === 'transfer' && <ClassTransfer />}
      {tab === 'prep' && <LessonPrep />}
      {tab === 'support' && (
        <section className="space-y-3">
          <h3 className="font-semibold gold-text">رسائل الدعم والمساعدة من المخدومين</h3>
          <FeedbackManager churchClass={user?.church_class || ''} />
        </section>
      )}
    </div>
  );
}

function QuizManager({ churchClass, createdBy }: { churchClass: string; createdBy: string }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [quizType, setQuizType] = useState<'general'>('general');
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [expiryDays, setExpiryDays] = useState(7);
  const [starsPerQuestion, setStarsPerQuestion] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[]>([{
    question: '', question_type: 'mcq', options: ['', '', '', ''], correct_answer: '',
  }]);

  useEffect(() => { loadQuizzes(); }, []);

  const loadQuizzes = async () => {
    const { data } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
    if (data) setQuizzes(data as Quiz[]);
  };

  const addQuestion = () => {
    if (questions.length >= 40) {
      toast('error', 'الحد الأقصى 40 سؤال');
      return;
    }
    setQuestions([...questions, { question: '', question_type: 'mcq', options: ['', '', '', ''], correct_answer: '' }]);
  };

  const updateQuestion = (idx: number, field: keyof QuizQuestion, value: string | string[]) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } as QuizQuestion : q));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[optIdx] = value;
      return { ...q, options: opts };
    }));
  };

  const removeQuestion = (idx: number) => {
    if (questions.length === 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const createQuiz = async () => {
    const validQuestions = questions.filter(q => q.question.trim());
    if (!title.trim() || validQuestions.length === 0) {
      toast('error', 'أدخل عنواناً وسؤالاً واحداً على الأقل');
      return;
    }
    const firstQ = validQuestions[0];
    const { error } = await supabase.from('quizzes').insert({
      title: title.trim(),
      quiz_type: quizType,
      question_type: firstQ.question_type,
      question: firstQ.question,
      options: firstQ.question_type === 'mcq' ? firstQ.options.filter(o => o.trim()) : [],
      correct_answer: firstQ.correct_answer,
      questions: validQuestions,
      duration_minutes: durationMinutes,
      expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      church_class: churchClass,
      created_by: createdBy,
      stars_per_question: starsPerQuestion,
    });

    if (error) {
      toast('error', 'فشل إنشاء الاختبار');
      return;
    }
    toast('success', `تم إنشاء الاختبار بـ ${validQuestions.length} سؤال`);
    const notif = generateNotification('quiz', title.trim());
    await supabase.rpc('send_class_message', { p_kind: 'quiz', p_title: notif.title, p_body: notif.body, p_icon: notif.icon });
    setShowForm(false);
    setTitle('');
    setQuizType('general');
    setDurationMinutes(10);
    setExpiryDays(7);
    setStarsPerQuestion(10);
    setQuestions([{ question: '', question_type: 'mcq', options: ['', '', '', ''], correct_answer: '' }]);
    loadQuizzes();
  };

  const deleteQuiz = async (id: string) => {
    await supabase.from('quiz_attempts').delete().eq('quiz_id', id);
    await supabase.from('quizzes').delete().eq('id', id);
    toast('success', 'تم حذف الاختبار');
    loadQuizzes();
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(!showForm)} className="btn-gold px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <Plus size={16} />
        {showForm ? 'إلغاء' : 'اختبار جديد'}
      </button>

      {showForm && (
        <div className="card-dark p-5 space-y-4">
          <input type="text" placeholder="عنوان الاختبار" value={title} onChange={(e) => setTitle(e.target.value)} className="input-dark" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">عدد الأسئلة: {questions.length}</label>
              <div className="text-xs text-gray-400 mt-1">الحد الأقصى 40 سؤال</div>
            </div>
            <div>
              <label className="text-xs text-gray-400">النجوم لكل سؤال</label>
              <input type="number" value={starsPerQuestion} onChange={(e) => setStarsPerQuestion(+e.target.value)} className="input-dark" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">المدة (دقائق)</label>
              <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(+e.target.value)} className="input-dark" />
            </div>
            <div>
              <label className="text-xs text-gray-400">الانتهاء (أيام)</label>
              <input type="number" value={expiryDays} onChange={(e) => setExpiryDays(+e.target.value)} className="input-dark" />
            </div>
          </div>

          {/* Questions list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold gold-text flex items-center gap-2">
                <Plus size={16} /> الأسئلة
              </h4>
              <button onClick={addQuestion} className="btn-outline-gold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5">
                <Plus size={14} /> إضافة سؤال
              </button>
            </div>

            {questions.map((q, qi) => (
              <div key={qi} className="bg-dark-300 rounded-lg p-4 space-y-3 border border-gold-300/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs gold-text font-bold">سؤال {qi + 1}</span>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(qi)} className="text-red-400 hover:text-red-300" aria-label={`حذف السؤال ${qi + 1}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <textarea placeholder="نص السؤال" value={q.question} onChange={(e) => updateQuestion(qi, 'question', e.target.value)} className="input-dark min-h-[60px]" />
                <select value={q.question_type} onChange={(e) => updateQuestion(qi, 'question_type', e.target.value)} className="input-dark">
                  <option value="mcq">اختيار من متعدد</option>
                  <option value="truefalse">صحيح / خطأ</option>
                  <option value="fillblank">أكمل الفراغ</option>
                </select>

                {q.question_type === 'mcq' && (
                  <>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <input key={oi} type="text" placeholder={`الخيار ${String.fromCharCode(65 + oi)}`} value={opt}
                          onChange={(e) => updateOption(qi, oi, e.target.value)} className="input-dark" />
                      ))}
                    </div>
                    <select value={q.correct_answer} onChange={(e) => updateQuestion(qi, 'correct_answer', e.target.value)} className="input-dark">
                      <option value="">اختر الخيار الصحيح</option>
                      {q.options.filter(o => o.trim()).map((opt, oi) => (
                        <option key={oi} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </>
                )}

                {q.question_type === 'truefalse' && (
                  <select value={q.correct_answer} onChange={(e) => updateQuestion(qi, 'correct_answer', e.target.value)} className="input-dark">
                    <option value="">اختر الإجابة الصحيحة</option>
                    <option value="true">صحيح</option>
                    <option value="false">خطأ</option>
                  </select>
                )}

                {q.question_type === 'fillblank' && (
                  <input type="text" placeholder="الكلمة المفتاحية للإجابة الصحيحة" value={q.correct_answer}
                    onChange={(e) => updateQuestion(qi, 'correct_answer', e.target.value)} className="input-dark" />
                )}
              </div>
            ))}
          </div>

          <button onClick={createQuiz} className="btn-gold w-full py-2.5 rounded-lg text-sm">إنشاء الاختبار ({questions.filter(q => q.question.trim()).length} سؤال)</button>
        </div>
      )}

      <div className="space-y-2">
        {quizzes.map((q) => {
          return (
            <div key={q.id} className="card-dark p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">{q.title}</p>
                <p className="text-xs text-gray-400">{q.questions?.length || 1} سؤال &middot; {q.duration_minutes} دقيقة &middot; {q.stars_per_question || 10} نجمة/سؤال</p>
              </div>
              <button onClick={() => deleteQuiz(q.id)} className="text-red-400 hover:text-red-300" aria-label={`حذف الاختبار ${q.title}`}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        {quizzes.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد اختبارات بعد.</p>}
      </div>
    </div>
  );
}

function PeerManager({ churchClass }: { churchClass: string }) {
  const [peers, setPeers] = useState<AbsentPeer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', member_phone: '', parent_phone: '', member_photo: '' });

  useEffect(() => { loadPeers(); }, []);

  const loadPeers = async () => {
    const { data } = await supabase.from('absent_peers').select('*').order('created_at', { ascending: false });
    if (data) setPeers(data as AbsentPeer[]);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('error', 'حجم الصورة كبير جداً. الحد الأقصى 2 ميجا.'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, member_photo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const addPeer = async () => {
    if (!form.name.trim()) { toast('error', 'أدخل اسم العضو'); return; }
    const { error } = await supabase.from('absent_peers').insert({
      name: form.name.trim(),
      member_phone: form.member_phone,
      parent_phone: form.parent_phone,
      member_photo: form.member_photo,
      church_class: churchClass,
      status: 'absent',
    });
    if (error) { toast('error', 'فشل إضافة العضو'); return; }
    toast('success', 'تمت إضافة العضو الغائب');
    await supabase.rpc('send_class_message', { p_kind: 'absent', p_title: 'زميل غايب 💛', p_body: `«${form.name.trim()}» غاب عننا الفترة اللي فاتت. كلّمه واسأل عليه وهاته معاك المرة الجاية (هات أخوك).`, p_icon: 'Heart' });
    setShowForm(false);
    setForm({ name: '', member_phone: '', parent_phone: '', member_photo: '' });
    loadPeers();
  };

  const deletePeer = async (id: string) => {
    await supabase.from('absent_peers').delete().eq('id', id);
    toast('success', 'تم حذف العضو');
    loadPeers();
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(!showForm)} className="btn-gold px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <Plus size={16} /> {showForm ? 'إلغاء' : 'إضافة عضو غائب'}
      </button>

      {showForm && (
        <div className="card-dark p-5 space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5"><UserIcon size={14} /> اسم العضو</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-dark" placeholder="اسم العضو الغائب" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5"><Phone size={14} /> رقم موبايل العضو</label>
            <input type="tel" value={form.member_phone} onChange={(e) => setForm({ ...form, member_phone: e.target.value })} className="input-dark" placeholder="رقم موبايل العضو" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5"><PhoneCall size={14} /> رقم ولي الأمر</label>
            <input type="tel" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="input-dark" placeholder="رقم ولي الأمر" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5"><Camera size={14} /> صورة العضو</label>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="input-dark" />
            {form.member_photo && (
              <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
                <img src={form.member_photo} alt="معاينة" className="w-full h-32 object-cover" />
              </div>
            )}
          </div>
          <button onClick={addPeer} className="btn-gold w-full py-2.5 rounded-lg text-sm">إضافة العضو</button>
        </div>
      )}

      <div className="space-y-2">
        {peers.map((p) => (
          <div key={p.id} className="card-dark p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {p.member_photo ? (
                <img src={p.member_photo} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-200">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.status === 'absent' ? 'غائب' : 'عاد'} &middot;
                  {p.member_phone && ` موبايل: ${p.member_phone}`}
                  {p.parent_phone && ` &middot; ولي الأمر: ${p.parent_phone}`}
                </p>
              </div>
            </div>
            <button onClick={() => deletePeer(p.id)} className="text-red-400 hover:text-red-300" aria-label={`حذف سجل ${p.name}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {peers.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد أعضاء غائبون.</p>}
      </div>
    </div>
  );
}

function FeedbackManager({ churchClass }: { churchClass: string }) {
  const { user: me } = useAuth();
  const [feedback, setFeedback] = useState<Feedback[]>([]);

  useEffect(() => {
    if (!churchClass && me?.role !== 'admin') return;
    let query = supabase.from('feedback').select('*').eq('user_role', 'member').order('created_at', { ascending: false });
    if (churchClass) query = query.eq('church_class', churchClass);
    query.then(({ data }) => { if (data) setFeedback(data as Feedback[]); });
  }, [churchClass, me?.role]);

  const resolve = async (id: string) => {
    await supabase.from('feedback').update({ status: 'resolved' }).eq('id', id);
    setFeedback((prev) => prev.map((f) => f.id === id ? { ...f, status: 'resolved' } : f));
    toast('success', 'تم حل الملاحظة');
  };

  return (
    <div className="space-y-3">
      {feedback.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد ملاحظات بعد.</p>}
      {feedback.map((f) => (
        <div key={f.id} className="card-dark p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-200">{f.user_name}</p>
              <p className="text-xs text-gray-400">{f.church_class} &middot; {new Date(f.created_at).toLocaleDateString()}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded ${f.status === 'open' ? 'bg-gold-300/10 text-gold-300' : 'bg-green-900/20 text-green-400'}`}>
              {f.status === 'open' ? 'مفتوح' : 'تم الحل'}
            </span>
          </div>
          <p className="text-sm text-gray-300">{f.message}</p>
          {f.status === 'open' && (
            <button onClick={() => resolve(f.id)} className="btn-outline-gold px-3 py-1.5 rounded-lg text-xs mt-3">تحديد كمحلول</button>
          )}
        </div>
      ))}
    </div>
  );
}

function AttendanceManager({ churchClass }: { churchClass: string }) {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const noClass = !churchClass && !isAdmin;
  const [members, setMembers] = useState<User[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    if (noClass) return;
    let q = supabase.from('users').select('*').eq('role', 'member').eq('status', 'active').order('full_name');
    if (churchClass) q = q.eq('church_class', churchClass);
    q.then(({ data }) => { if (data) setMembers(data as User[]); });

    let q2 = supabase.from('attendance').select('*').eq('attendance_date', today);
    if (churchClass) q2 = q2.eq('church_class', churchClass);
    q2.then(({ data }) => { if (data) setRecords(data as AttendanceRecord[]); });
  }, [churchClass, today, noClass]);

  const statusOf = (userId: string) => records.find((r) => r.user_id === userId)?.status;

  const mark = async (m: User, status: 'present' | 'absent') => {
    if (statusOf(m.id) === status) return;
    setBusyId(m.id);
    const existing = records.find((r) => r.user_id === m.id);
    const now = new Date();
    let saved: AttendanceRecord | null = null;
    let error;
    if (existing) {
      const res = await supabase.from('attendance').update({ status }).eq('id', existing.id).select().single();
      saved = res.data as AttendanceRecord | null; error = res.error;
    } else {
      const res = await supabase.from('attendance').insert({
        user_id: m.id,
        user_name: m.full_name,
        church_class: m.church_class,
        status,
        attendance_date: today,
        attendance_day: now.toLocaleDateString('ar-EG', { weekday: 'long' }),
        attendance_time: now.toTimeString().slice(0, 5),
      }).select().single();
      saved = res.data as AttendanceRecord | null; error = res.error;
    }
    if (error || !saved) {
      setBusyId(null);
      toast('error', 'فشل تسجيل الحضور. حاول مرة أخرى.');
      return;
    }
    setRecords((prev) => [...prev.filter((r) => r.user_id !== m.id), saved as AttendanceRecord]);

    // تحديث عدّادات الحضور في ملف العضو من السجلات الفعلية
    const { count: total } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', m.id);
    const { count: present } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', m.id).eq('status', 'present');
    await supabase.from('users').update({ attendance_present: present || 0, attendance_total: total || 0 }).eq('id', m.id);
    setBusyId(null);
  };

  if (noClass) {
    return (
      <div className="card-dark p-4">
        <p className="text-center text-gray-400 py-4">لم يتم تعيين فصل لك بعد. اطلب من الأدمن تحديد فصلك لتسجيل الحضور.</p>
      </div>
    );
  }

  const presentCount = members.filter((m) => statusOf(m.id) === 'present').length;
  const absentCount = members.filter((m) => statusOf(m.id) === 'absent').length;

  return (
    <div className="card-dark p-4 space-y-2">
      <h3 className="font-semibold gold-text">كشف حضور اليوم{churchClass ? ` - ${churchClass}` : ''}</h3>
      <p className="text-xs text-gray-400 mb-2">
        حاضر {presentCount} &middot; غائب {absentCount} &middot; لم يُسجَّل {members.length - presentCount - absentCount}
      </p>
      {members.map((m) => {
        const st = statusOf(m.id);
        return (
          <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-dark-300">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 text-sm font-bold">
                {m.full_name.charAt(0)}
              </div>
              <span className="text-sm text-gray-200 truncate">{m.full_name}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => mark(m, 'present')}
                disabled={busyId === m.id}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${st === 'present' ? 'bg-green-600 text-white' : 'bg-green-950/40 text-green-400 border border-green-800/40 hover:bg-green-900/40'}`}
              >
                <CheckCircle size={14} /> حضور
              </button>
              <button
                onClick={() => mark(m, 'absent')}
                disabled={busyId === m.id}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${st === 'absent' ? 'bg-red-600 text-white' : 'bg-red-950/40 text-red-400 border border-red-800/40 hover:bg-red-900/40'}`}
              >
                <XCircle size={14} /> غياب
              </button>
            </div>
          </div>
        );
      })}
      {members.length === 0 && <p className="text-center text-gray-400 py-4">لا يوجد أعضاء في هذا الفصل.</p>}
    </div>
  );
}

function HatAkhookReview() {
  const [uploads, setUploads] = useState<HatAkhookUpload[]>([]);

  useEffect(() => {
    supabase.from('hat_akhook_uploads').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setUploads(data); });
  }, []);

  const approve = async (upload: HatAkhookUpload) => {
    const { error } = await supabase.rpc('review_hat_akhook', { p_upload_id: upload.id, p_approve: true });
    if (error) { toast('error', error.message || 'تعذر الاعتماد'); return; }
    setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    toast('success', 'تم الاعتماد! +20 نجمة للمساعد.');
  };

  const reject = async (id: string) => {
    const { error } = await supabase.rpc('review_hat_akhook', { p_upload_id: id, p_approve: false });
    if (error) { toast('error', error.message || 'تعذر الرفض'); return; }
    setUploads((prev) => prev.filter((u) => u.id !== id));
    toast('info', 'تم رفض الرفع');
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold gold-text">رفعات هات أخوك — بانتظار المراجعة</h3>
      {uploads.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد رفعات معلقة.</p>}
      {uploads.map((u) => (
        <div key={u.id} className="card-dark p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-200">{u.member_name} أحضر {u.peer_name}</p>
              <p className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString()}</p>
            </div>
          </div>
          {u.photo_data && (
            <div className="rounded-lg overflow-hidden bg-black max-w-xs mb-3">
              <img src={u.photo_data} alt="سيلفي مشترك" className="w-full" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => approve(u)} className="btn-gold px-4 py-2 rounded-lg text-sm flex items-center gap-1.5">
              <CheckCircle size={16} /> اعتماد (+20 نجمة)
            </button>
            <button onClick={() => reject(u.id)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1.5">
              <XCircle size={16} /> رفض
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeliveryBoard() {
  const [orders, setOrders] = useState<RewardRedemption[]>([]);

  useEffect(() => {
    supabase.from('reward_redemptions').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setOrders(data as RewardRedemption[]); });
  }, []);

  const markDelivered = async (id: string) => {
    await supabase.from('reward_redemptions').update({ status: 'delivered' }).eq('id', id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    toast('success', 'تم تحديد الطلب كمُسلَّم');
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold gold-text">لوحة متابعة تسليم الهدايا</h3>
      {orders.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد تسليمات معلقة.</p>}
      {orders.map((o) => (
        <div key={o.id} className="card-dark p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">{o.user_name}</p>
            <p className="text-xs text-gray-400">{o.reward_title} — {o.price_stars} نجمة</p>
          </div>
          <button onClick={() => markDelivered(o.id)} className="btn-gold px-4 py-2 rounded-lg text-sm flex items-center gap-1.5">
            <Package size={16} /> تحديد كمُسلَّم
          </button>
        </div>
      ))}
    </div>
  );
}

function StoreManager() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', image_url: '', price_stars: 0, in_stock: true, quantity: '' });

  useEffect(() => {
    supabase.from('rewards').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setRewards(data as Reward[]); });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('error', 'حجم الصورة كبير جداً. الحد الأقصى 2 ميجا.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, image_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const addReward = async () => {
    const { error } = await supabase.from('rewards').insert({
      title: form.title,
      image_url: form.image_url,
      price_stars: form.price_stars,
      in_stock: form.in_stock,
      quantity: form.quantity.trim() === '' ? null : Math.max(0, Math.floor(Number(form.quantity)) || 0),
    });
    if (error) { toast('error', 'فشل إضافة الهدية'); return; }
    toast('success', 'تمت إضافة الهدية للمتجر');
    // Send notification
    const notif = generateNotification('reward', form.title);
    await supabase.rpc('send_class_message', { p_kind: 'reward', p_title: notif.title, p_body: notif.body, p_icon: notif.icon });
    setShowForm(false);
    setForm({ title: '', image_url: '', price_stars: 0, in_stock: true, quantity: '' });
    const { data } = await supabase.from('rewards').select('*').order('created_at', { ascending: false });
    if (data) setRewards(data as Reward[]);
  };

  const updatePrice = async (id: string, price: number) => {
    await supabase.from('rewards').update({ price_stars: price }).eq('id', id);
    setRewards((prev) => prev.map((r) => r.id === id ? { ...r, price_stars: price } : r));
    toast('success', 'تم تحديث السعر');
  };

  const deleteReward = async (id: string) => {
    await supabase.from('rewards').delete().eq('id', id);
    setRewards((prev) => prev.filter((r) => r.id !== id));
    toast('success', 'تم حذف الهدية');
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(!showForm)} className="btn-gold px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <Plus size={16} /> {showForm ? 'إلغاء' : 'إضافة هدية'}
      </button>

      {showForm && (
        <div className="card-dark p-5 space-y-3">
          <input type="text" placeholder="اسم الهدية" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-dark" />
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">صورة الهدية</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="input-dark" />
            {form.image_url && (
              <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
                <img src={form.image_url} alt="معاينة" className="w-full h-32 object-cover" />
              </div>
            )}
          </div>
          <input type="number" placeholder="السعر بالنجوم" value={form.price_stars} onChange={(e) => setForm({ ...form, price_stars: +e.target.value })} className="input-dark" />
          <input type="number" min={0} placeholder="الكمية المتوفرة (اختياري، سيبها فاضية لو مفتوحة)" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input-dark" />
          <button onClick={addReward} className="btn-gold w-full py-2.5 rounded-lg text-sm">إضافة للمتجر</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((r) => (
          <div key={r.id} className="card-dark p-4">
            <div className="w-full h-32 rounded-lg overflow-hidden bg-dark-300 flex items-center justify-center mb-3">
              {r.image_url ? (
                <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
              ) : (
                <Gift className="text-gold-300/50" size={40} />
              )}
            </div>
            <p className="text-sm font-medium text-gray-200 mb-2">{r.title}</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={r.price_stars}
                onChange={(e) => updatePrice(r.id, +e.target.value)}
                className="input-dark w-20 text-sm"
              />
              <Star className="text-gold-300" size={16} fill="currentColor" />
              <button onClick={() => deleteReward(r.id)} className="text-red-400 hover:text-red-300 mr-auto" aria-label={`حذف المكافأة ${r.title}`}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {rewards.length === 0 && <p className="text-center text-gray-400 py-8 col-span-full">لا توجد هدايا في المتجر.</p>}
      </div>
    </div>
  );
}

