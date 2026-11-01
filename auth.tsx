import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { clearOfflineCache, flushQueue, getOfflineStatus, syncSnapshots } from './offline';
import { toast } from '@/components/ui/Toast';
import { sendEmail } from './email';
import type { User, UserRole } from './types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  mustChange: boolean;
  passwordChanged: () => void;
  login: (username: string, password: string, expectedRole?: UserRole) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// اسم المستخدم يتحول إلى بريد داخلي ثابت (SHA-256) ليعمل مع Supabase Auth
export async function usernameEmail(username: string): Promise<string> {
  const bytes = new TextEncoder().encode(username.trim());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 40)}@users.elmeilelthani.app`;
}

export async function usernameTaken(username: string): Promise<boolean> {
  const { data } = await supabase.rpc('username_taken', { u: username.trim() });
  return !!data;
}

// الدور والحالة يحددهما السيرفر (trigger) ولا يمكن للمتصفح اختيارهما
export async function registerAccount(fields: Record<string, unknown>) {
  const { password, username, ...meta } = fields as Record<string, string>;
  const { error } = await supabase.auth.signUp({
    email: await usernameEmail(username),
    password,
    options: { data: { username: username.trim(), ...meta } },
  });
  if (!error && meta.role === 'servant') await supabase.auth.signOut();
  if (!error && meta.role !== 'servant') void sendEmail('welcome'); // ترحيب المخدوم بالإيميل
  return { error };
}

const PROFILE_KEY = 'elmeilelthani_profile_cache';
const readProfile = (): User | null => {
  try { const r = window.localStorage.getItem(PROFILE_KEY); return r ? (JSON.parse(r) as User) : null; } catch { return null; }
};
const saveProfile = (u: User) => { try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(u)); } catch { /* تجاهل */ } };
const clearProfile = () => { try { window.localStorage.removeItem(PROFILE_KEY); } catch { /* تجاهل */ } };

// لو الاتصال فشل نستخدم النسخة المحفوظة بدل ما نخرّج المستخدم
async function loadProfile(id: string): Promise<User | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error && !error.code) {
    const cached = readProfile();
    return cached && cached.id === id ? cached : null;
  }
  if (!data || data.status !== 'active') { clearProfile(); return null; }
  saveProfile(data as User);
  return data as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChange, setMustChange] = useState(false);

  // بعد الدخول بكلمة مؤقتة: لازم تغيير كلمة السر. ولو المؤقتة انتهت (30 دقيقة) بنخرّج المستخدم.
  const refreshSecurity = async () => {
    if (!navigator.onLine) return;
    const { data, error } = await supabase.rpc('my_security_state');
    if (error || !data) return;
    const s = data as { must_change?: boolean; expired?: boolean };
    if (s.expired) {
      clearProfile();
      setMustChange(false);
      setUser(null);
      void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      toast('error', 'انتهت صلاحية كلمة السر المؤقتة. اطلب كلمة سر جديدة.');
      return;
    }
    setMustChange(!!s.must_change);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const p = await loadProfile(data.session.user.id);
        if (!cancelled) setUser(p);
        if (p && !cancelled) void refreshSecurity();
      } else if (!navigator.onLine) {
        // أوفلاين والجلسة محتاجة تجديد: نفتح بالنسخة المحفوظة
        const cached = readProfile();
        if (cached && !cancelled) setUser(cached);
      } else {
        clearProfile();
      }
      if (!cancelled) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // انقطاع النت مش معناه تسجيل خروج
        if (!navigator.onLine && readProfile()) return;
        setUser(null);
        return;
      }
      setTimeout(async () => {
        const p = await loadProfile(session.user.id);
        if (p) { setUser(p); void refreshSecurity(); }
      }, 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const login = async (username: string, password: string, expectedRole?: UserRole) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: await usernameEmail(username),
      password,
    });
    if (error || !data.user) {
      if (!navigator.onLine || (error && /fetch|network/i.test(error.message))) return { success: false, error: 'محتاج اتصال بالنت لتسجيل الدخول.' };
      return { success: false, error: 'اسم المستخدم أو كلمة السر غير صحيحة.' };
    }
    const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      return { success: false, error: 'خطأ في الاتصال. حاول مرة أخرى.' };
    }
    if (profile.status !== 'active') {
      await supabase.auth.signOut();
      return { success: false, error: profile.status === 'pending' ? 'حسابك بانتظار موافقة الأدمن. انتظر التفعيل.' : 'هذا الحساب غير مفعّل. تواصل مع الأدمن.' };
    }
    if (expectedRole && profile.role !== expectedRole) {
      await supabase.auth.signOut();
      const roleNames: Record<string, string> = { member: 'عضو', servant: 'خادم', admin: 'أدمن' };
      return { success: false, error: `هذا الحساب ليس ${roleNames[expectedRole] || expectedRole}. اختر الدور الصحيح.` };
    }
    saveProfile(profile as User);
    setUser(profile as User);
    void refreshSecurity();
    void flushQueue().then(() => syncSnapshots());
    return { success: true, user: profile as User };
  };

  const logout = () => {
    const pending = getOfflineStatus().pending;
    if (pending > 0 && !window.confirm(`فيه ${pending} عملية لسه ماتبعتتش. لو خرجت هتفضل محفوظة لحد ما تدخل بنفس الحساب وتفتح التطبيق بالنت. تخرج؟`)) return;
    clearProfile();
    void clearOfflineCache();
    setMustChange(false);
    setUser(null);
    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    try {
      Object.keys(window.localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach((k) => window.localStorage.removeItem(k));
    } catch { /* تجاهل */ }
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) { const next = { ...user, ...updates }; saveProfile(next); setUser(next); }
  };

  return (
    <AuthContext.Provider value={{ user, loading, mustChange, passwordChanged: () => setMustChange(false), login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isRole(user: User | null, ...roles: UserRole[]): boolean {
  return !!user && roles.includes(user.role);
}

export function signUpErrorMessage(error: { message?: string } | null | undefined): string {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('already')) return 'اسم المستخدم محجوز. اختر اسماً آخر.';
  if (m.includes('rate limit')) return 'طلبات التسجيل كثيرة مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.';
  if (m.includes('confirmation') || m.includes('email not confirmed')) return 'تأكيد البريد الإلكتروني مطلوب في إعدادات Supabase. راجع إعدادات التسجيل أو أكّد البريد.';
  if (m.includes('sending')) return 'تعذر إرسال رسالة التسجيل حاليًا. راجع إعدادات البريد في Supabase ثم حاول مرة أخرى.';
  if (m.includes('database error')) return 'خطأ في قاعدة البيانات أثناء إنشاء الحساب.';
  if (m.includes('not allowed') || m.includes('disabled')) return 'التسجيل مقفول في إعدادات Supabase.';
  if (m.includes('password')) return 'كلمة السر قصيرة أو ضعيفة: لازم 6 حروف على الأقل.';
  return `فشل إنشاء الحساب: ${error?.message || 'خطأ غير معروف'}`;
}
