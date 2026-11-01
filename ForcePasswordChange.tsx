import { useState } from 'react';
import { Crown, Eye, EyeOff, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

// بعد الدخول بكلمة سر مؤقتة: لازم تتغيّر علطول قبل أي حاجة تانية
export default function ForcePasswordChange() {
  const { user, passwordChanged, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast('error', 'كلمة السر الجديدة لازم 6 حروف على الأقل');
    if (pw !== pw2) return toast('error', 'كلمتين السر مش متطابقين');
    setBusy(true);
    const { error } = await supabase.rpc('change_my_password', { p_new: pw });
    setBusy(false);
    if (error) return toast('error', navigator.onLine ? (error.message || 'تعذر تغيير كلمة السر') : 'محتاج اتصال بالنت لتغيير كلمة السر.');
    toast('success', 'تم تغيير كلمة السر ✅ أهلاً بيك.');
    passwordChanged();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-dark-500 p-4" dir="rtl">
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full gold-gradient animate-glow"><Crown className="text-dark-500" size={36} /></div>
          <h1 className="font-serif text-2xl font-bold shimmer-gold">غيّر كلمة السر</h1>
          <p className="mt-2 text-sm text-gray-400">أهلاً {user?.full_name}. دخلت بكلمة سر مؤقتة، اختار كلمة سر جديدة بتاعتك دلوقتي.</p>
        </div>
        <form onSubmit={submit} className="card-dark space-y-4 p-8">
          <label className="block text-sm text-gray-400">كلمة السر الجديدة
            <div className="relative mt-1.5">
              <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className="input-dark pl-10" autoComplete="new-password" placeholder="6 حروف على الأقل" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء' : 'إظهار'} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <label className="block text-sm text-gray-400">أكّد كلمة السر
            <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} className="input-dark mt-1.5" autoComplete="new-password" />
          </label>
          <button type="submit" disabled={busy || !pw || !pw2} className="btn-gold flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold">
            <ShieldCheck size={16} /> {busy ? 'جاري الحفظ...' : 'حفظ كلمة السر والدخول'}
          </button>
          <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-400"><LogOut size={13} /> تسجيل الخروج</button>
        </form>
      </div>
    </div>
  );
}
