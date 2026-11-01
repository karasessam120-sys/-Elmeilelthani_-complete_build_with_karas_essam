import { useState } from 'react';
import { KeyRound, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

// طلب استعادة كلمة السر: بيروح للأدمن، ولما يوافق بتوصل كلمة مؤقتة (30 دقيقة) على إيميل الحساب
export default function ForgotPassword() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!username.trim()) return toast('error', 'من فضلك أدخل اسم المستخدم');
    setBusy(true);
    const { error } = await supabase.rpc('request_password_reset', { p_username: username.trim() });
    setBusy(false);
    if (error) return toast('error', navigator.onLine ? (error.message || 'فشل إرسال الطلب') : 'محتاج اتصال بالنت لإرسال الطلب.');
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-3 py-3 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-gold-300/30 bg-gold-300/10 animate-glow"><MailCheck className="text-gold-300" size={28} /></div>
        <p className="text-sm text-gray-200">طلبك وصل للأدمن ✅</p>
        <p className="text-xs leading-6 text-gray-400">لما يوافق، هتوصلك على <b>الإيميل المسجّل في حسابك</b> كلمة سر مؤقتة صالحة 30 دقيقة. ادخل بيها وهتغيّرها علطول. لو ما وصلتش راجع الـ Spam أو كلّم الأدمن.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">أدخل اسم المستخدم. هيتبعت طلب للأدمن، ولما يوافق هتوصلك كلمة سر مؤقتة على إيميلك.</p>
      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-dark" placeholder="اسم المستخدم" autoComplete="username" />
      <button type="button" onClick={() => void send()} disabled={busy} className="btn-gold flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm"><KeyRound size={15} /> {busy ? 'جاري الإرسال...' : 'إرسال طلب الاستعادة'}</button>
    </div>
  );
}
