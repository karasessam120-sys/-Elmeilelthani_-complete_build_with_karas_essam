import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, usernameEmail } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import { KeyRound, UserCog } from 'lucide-react';

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState('');
  const [usernamePw, setUsernamePw] = useState('');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState<'name' | 'pw' | null>(null);

  if (!user) return null;

  const verifyPassword = async (pw: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: await usernameEmail(user.username),
      password: pw,
    });
    return !error;
  };

  const changeUsername = async () => {
    const u = newUsername.trim();
    if (u.length < 3) return toast('error', 'اسم المستخدم لازم 3 حروف على الأقل');
    if (!usernamePw) return toast('error', 'اكتب كلمة السر الحالية للتأكيد');
    setBusy('name');
    if (!(await verifyPassword(usernamePw))) {
      setBusy(null);
      return toast('error', 'كلمة السر الحالية غير صحيحة');
    }
    const { error } = await supabase.rpc('change_my_username', { new_username: u });
    setBusy(null);
    if (error) return toast('error', error.message || 'فشل تغيير اسم المستخدم');
    updateUser({ username: u });
    setNewUsername('');
    setUsernamePw('');
    toast('success', 'تم تغيير اسم المستخدم. استخدمه في الدخول من الآن.');
  };

  const changePassword = async () => {
    if (!oldPw) return toast('error', 'اكتب كلمة السر الحالية');
    if (newPw.length < 6) return toast('error', 'كلمة السر الجديدة لازم 6 حروف على الأقل');
    if (newPw !== newPw2) return toast('error', 'تأكيد كلمة السر غير مطابق');
    setBusy('pw');
    if (!(await verifyPassword(oldPw))) {
      setBusy(null);
      return toast('error', 'كلمة السر الحالية غير صحيحة');
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(null);
    if (error) return toast('error', error.message || 'فشل تغيير كلمة السر');
    setOldPw('');
    setNewPw('');
    setNewPw2('');
    toast('success', 'تم تغيير كلمة السر.');
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="card-dark p-5 space-y-3">
        <h3 className="font-semibold gold-text flex items-center gap-2"><UserCog size={18} /> تغيير اسم المستخدم</h3>
        <p className="text-xs text-gray-400">الاسم الحالي: @{user.username}</p>
        <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="input-dark" placeholder="اسم المستخدم الجديد" />
        <input type="password" value={usernamePw} onChange={(e) => setUsernamePw(e.target.value)} className="input-dark" placeholder="كلمة السر الحالية (للتأكيد)" />
        <button onClick={changeUsername} disabled={busy !== null} className="btn-gold w-full">
          {busy === 'name' ? 'جاري الحفظ...' : 'حفظ اسم المستخدم'}
        </button>
      </div>

      <div className="card-dark p-5 space-y-3">
        <h3 className="font-semibold gold-text flex items-center gap-2"><KeyRound size={18} /> تغيير كلمة السر</h3>
        <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className="input-dark" placeholder="كلمة السر الحالية" />
        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input-dark" placeholder="كلمة السر الجديدة (6 حروف على الأقل)" />
        <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className="input-dark" placeholder="أعد كتابة كلمة السر الجديدة" />
        <button onClick={changePassword} disabled={busy !== null} className="btn-gold w-full">
          {busy === 'pw' ? 'جاري الحفظ...' : 'حفظ كلمة السر'}
        </button>
      </div>
    </div>
  );
}
