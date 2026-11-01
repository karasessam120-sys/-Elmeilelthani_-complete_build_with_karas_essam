import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// الحسابات اللي ما عندهاش إيميل: بنطلبه مرة واحدة عشان توصلها كلمة السر المؤقتة والترحيب
export default function EmailPrompt() {
  const { user, updateUser } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.role === 'admin' || user.contact_email) return null;

  const save = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return toast('error', 'اكتب إيميل صحيح');
    setBusy(true);
    const { error } = await supabase.rpc('set_my_email', { p_email: e });
    setBusy(false);
    if (error) return toast('error', navigator.onLine ? (error.message || 'تعذر حفظ الإيميل') : 'محتاج اتصال بالنت.');
    updateUser({ contact_email: e });
    toast('success', 'تم حفظ الإيميل ✅');
  };

  return (
    <div className="mb-4 rounded-xl border border-gold-300/30 bg-gold-300/5 p-4" dir="rtl">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gold-300"><Mail size={16} /> ضيف إيميلك</p>
      <p className="mb-3 text-xs text-gray-400">عشان توصلك كلمة السر المؤقتة لو نسيتها.</p>
      <div className="flex gap-2">
        <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark flex-1" placeholder="name@example.com" autoComplete="email" />
        <button type="button" onClick={() => void save()} disabled={busy || !email} className="btn-gold rounded-lg px-4 text-sm">{busy ? '...' : 'حفظ'}</button>
      </div>
    </div>
  );
}
