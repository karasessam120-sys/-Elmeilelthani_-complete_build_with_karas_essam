import { useState, useEffect } from 'react';
import { useAuth, usernameTaken, registerAccount, signUpErrorMessage } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import ForgotPassword from '@/components/auth/ForgotPassword';
import type { ChurchClass } from '@/lib/types';
import { Crown, User, Users, KeyRound, Sparkles, Eye, EyeOff, UserPlus, CheckCircle } from 'lucide-react';

type LoginMode = 'member' | 'servant' | 'admin';

function generateUsername(fullName: string): string {
  const cleanName = fullName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanName) return '';
  const prefix = cleanName.substring(0, Math.min(4, cleanName.length));
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

interface LoginProps {
  onNavigateRegister: () => void;
}

export default function Login({ onNavigateRegister }: LoginProps) {
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>('member');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Servant registration state
  const [servantRegisterOpen, setServantRegisterOpen] = useState(false);
  const [servantForm, setServantForm] = useState({ fullName: '', churchClass: '', username: '', password: '', email: '' });
  const [servantLoading, setServantLoading] = useState(false);
  const [servantError, setServantError] = useState('');
  const [servantGeneratedUsername, setServantGeneratedUsername] = useState<string | null>(null);
  const [servantSuccess, setServantSuccess] = useState(false);
  const [classes, setClasses] = useState<ChurchClass[]>([]);

  useEffect(() => {
    supabase.from('classes').select('*').order('name', { ascending: true }).then(({ data }) => {
      if (data) setClasses(data as ChurchClass[]);
    });
  }, []);

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);

  const modeConfig: Record<LoginMode, { icon: typeof Crown; label: string; desc: string }> = {
    member: { icon: User, label: 'عضو', desc: 'أعضاء الكنيسة الشباب' },
    servant: { icon: Users, label: 'خادم', desc: 'خدام ورؤساء الكنيسة' },
    admin: { icon: Crown, label: 'سوبر أدمن', desc: 'المسؤول الأعلى للمنصة' },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password, mode);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'فشل تسجيل الدخول');
    }
  };

  const handleServantRegister = async () => {
    setServantError('');
    setServantLoading(true);

    let finalUsername = servantForm.username.trim();
    if (!finalUsername) {
      finalUsername = generateUsername(servantForm.fullName);
      if (!finalUsername) {
        setServantError('من فضلك أدخل اسمك الكامل أو اسم مستخدم');
        setServantLoading(false);
        return;
      }
      const existing = await usernameTaken(finalUsername);
      if (existing) {
        finalUsername = `${finalUsername}${Math.floor(Math.random() * 100)}`;
      }
      setServantGeneratedUsername(finalUsername);
    }

    const existingUser = await usernameTaken(finalUsername);
    if (existingUser) {
      setServantError('اسم المستخدم محجوز. اختر اسماً آخر.');
      setServantLoading(false);
      return;
    }

    const { error } = await registerAccount({
      username: finalUsername,
      password: servantForm.password,
      email: servantForm.email.trim().toLowerCase(),
      full_name: servantForm.fullName,
      role: 'servant',
      status: 'pending',
      church_class: servantForm.churchClass,
    });

    if (error) {
      setServantError(signUpErrorMessage(error));
      setServantLoading(false);
      return;
    }

    setServantLoading(false);
    setServantSuccess(true);
  };

  return (
    <div className="min-h-screen bg-dark-500 flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      {/* Background ornament */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gold-300 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-gold-300 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full gold-gradient mb-4 animate-glow">
            <Crown className="text-dark-500" size={36} />
          </div>
          <h1 className="text-3xl font-serif font-bold shimmer-gold">الميل الثاني</h1>
          <p className="text-sm text-gray-400 mt-1 tracking-widest">كنيسة ماريوحنا الحبيب بحلمية الزيتون</p>
        </div>

        <div className="card-dark p-8">
          {/* Role selector */}
          <div className="flex gap-2 mb-6">
            {(Object.keys(modeConfig) as LoginMode[]).map((key) => {
              const cfg = modeConfig[key];
              const Icon = cfg.icon;
              const active = mode === key;
              return (
                <button
                  key={key}
                  onClick={() => { setMode(key); setError(''); }}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg transition-all ${
                    active
                      ? 'bg-gold-300/10 border border-gold-300 text-gold-300'
                      : 'border border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-400 mb-6">{modeConfig[mode].desc}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-dark"
                placeholder="أدخل اسم المستخدم"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm text-gray-400 mb-1.5">كلمة السر</label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-dark pr-12 min-h-12"
                  placeholder="أدخل كلمة السر"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-300 hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                >
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-pulse">جاري تسجيل الدخول...</span>
              ) : (
                <>
                  <Sparkles size={18} />
                  دخول كـ {modeConfig[mode].label}
                </>
              )}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {mode === 'member' && (
              <button
                onClick={onNavigateRegister}
                className="w-full text-center text-sm text-gold-300 hover:text-gold-200 transition-colors"
              >
                عضو جديد؟ إنشاء حساب
              </button>
            )}
            {mode === 'servant' && (
              <button
                onClick={() => { setServantRegisterOpen(true); setServantForm({ fullName: '', churchClass: '', username: '', password: '', email: '' }); setServantGeneratedUsername(null); }}
                className="w-full text-center text-sm text-gold-300 hover:text-gold-200 transition-colors"
              >
                خادم جديد؟ أنشئ حساباً
              </button>
            )}
            <button
              onClick={() => setForgotOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gold-300 transition-colors"
            >
              <KeyRound size={14} />
              نسيت كلمة السر؟
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          الميل الثاني &middot; كنيسة ماريوحنا الحبيب بحلمية الزيتون
        </p>
      </div>

      {/* Servant Registration Modal */}
      <Modal open={servantRegisterOpen} onClose={() => setServantRegisterOpen(false)} title="تسجيل خادم جديد" size="sm">
        {servantSuccess ? (
          <div className="text-center space-y-4 py-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gold-300/10 border border-gold-300/30 animate-glow">
              <CheckCircle className="text-gold-300" size={32} />
            </div>
            <div>
              <p className="text-gray-300 mb-2">تم إنشاء حسابك بنجاح! اسم المستخدم الخاص بك:</p>
              <div className="bg-dark-300 border border-gold-300/30 rounded-lg px-4 py-3 inline-block">
                <p className="text-lg font-bold gold-text font-mono">{servantGeneratedUsername || servantForm.username}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              حسابك الآن في حالة «بانتظار الموافقة». لن تتمكن من تسجيل الدخول حتى يعتمدك السوبر أدمن، وهتوصلك رسالة ترحيب على الإيميل لما يتعتمد.
            </p>
            <button onClick={() => setServantRegisterOpen(false)} className="btn-gold w-full py-2.5 rounded-lg text-sm">
              حسناً
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              املأ البيانات التالية. سيبقى حسابك في حالة «بانتظار الموافقة» حتى يعتمده السوبر أدمن.
            </p>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">الاسم الكامل *</label>
              <input type="text" value={servantForm.fullName} onChange={(e) => setServantForm({ ...servantForm, fullName: e.target.value })} className="input-dark" placeholder="اسمك الكامل" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">اختر الفصل المسئول عنه *</label>
              <select value={servantForm.churchClass} onChange={(e) => setServantForm({ ...servantForm, churchClass: e.target.value })} className="input-dark">
                <option value="">اختر الفصل...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                اسم المستخدم <span className="text-gray-400">(اتركه فارغاً للتوليد التلقائي)</span>
              </label>
              <input type="text" value={servantForm.username} onChange={(e) => setServantForm({ ...servantForm, username: e.target.value })} className="input-dark" placeholder="يُولّد تلقائياً إذا تركته فارغاً" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">الإيميل * <span className="text-gray-400">(هيوصلك عليه ترحيب لما يتعتمد حسابك)</span></label>
              <input type="email" dir="ltr" value={servantForm.email} onChange={(e) => setServantForm({ ...servantForm, email: e.target.value })} className="input-dark" placeholder="name@example.com" autoComplete="email" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">كلمة السر *</label>
              <input type="password" value={servantForm.password} onChange={(e) => setServantForm({ ...servantForm, password: e.target.value })} className="input-dark" placeholder="اختر كلمة سر" />
            </div>
            {servantError && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">
                {servantError}
              </div>
            )}
            <button onClick={handleServantRegister} disabled={servantLoading || !servantForm.fullName || !servantForm.churchClass || !servantForm.password || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(servantForm.email.trim())} className="btn-gold w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
              {servantLoading ? <span className="animate-pulse">جاري إنشاء الحساب...</span> : (
                <>
                  <UserPlus size={16} />
                  إنشاء حساب الخادم
                </>
              )}
            </button>
          </div>
        )}
      </Modal>

      {/* Forgot Password Modal */}
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="استعادة كلمة السر" size="sm">
        <ForgotPassword />
      </Modal>
    </div>
  );
}
