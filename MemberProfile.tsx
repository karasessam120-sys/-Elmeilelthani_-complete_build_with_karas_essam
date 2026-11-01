import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AccountSettings from '@/components/shared/AccountSettings';
import AppearanceSettings from '@/components/shared/AppearanceSettings';
import { MessageSquare, Send, User, Phone, MapPin, Calendar, Trash2, Camera } from 'lucide-react';

export default function MemberProfile() {
  const { user, logout, updateUser } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showDelete2, setShowDelete2] = useState(false);
  const [parentPhone, setParentPhone] = useState(user?.parent_phone || '');
  const [homeAddress, setHomeAddress] = useState(user?.home_address || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [dream, setDream] = useState(user?.dream || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setParentPhone(user?.parent_phone || '');
    setHomeAddress(user?.home_address || '');
    setDateOfBirth(user?.date_of_birth || '');
    setAvatarUrl(user?.avatar_url || '');
    setDream(user?.dream || '');
  }, [user]);

  const sendFeedback = async () => {
    if (!feedback.trim() || !user) return;
    setSendingFeedback(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      church_class: user.church_class,
      message: feedback.trim(),
      status: 'open',
    });
    setSendingFeedback(false);
    if (error) {
      toast('error', 'فشل إرسال الملاحظات');
      return;
    }
    toast('success', 'تم إرسال الملاحظات إلى لوحة الإدارة');
    setFeedback('');
  };

  // الصورة بتتصغّر (128 بكسل) قبل الحفظ عشان ما تتقلش التطبيق
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const k = Math.max(size / img.width, size / img.height);
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
        setAvatarUrl(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => toast('error', 'تعذر قراءة الصورة');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        parent_phone: parentPhone,
        home_address: homeAddress,
        date_of_birth: dateOfBirth || null,
        avatar_url: avatarUrl,
        dream: dream.trim() || null,
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      toast('error', 'فشل حفظ الملف');
      return;
    }
    updateUser({ parent_phone: parentPhone, home_address: homeAddress, date_of_birth: dateOfBirth, avatar_url: avatarUrl, dream: dream.trim() || null });
    toast('success', 'تم تحديث الملف');
  };

  const deleteAccount = async () => {
    if (!user) return;
    await supabase.from('attendance').delete().eq('user_id', user.id);
    await supabase.from('quiz_attempts').delete().eq('user_id', user.id);
    await supabase.from('reward_redemptions').delete().eq('user_id', user.id);
    await supabase.from('ai_chats').delete().eq('user_id', user.id);
    await supabase.from('hat_akhook_uploads').delete().eq('member_id', user.id);
    await supabase.from('feedback').delete().eq('user_id', user.id);
    await supabase.from('users').delete().eq('id', user.id);

    toast('success', 'تم حذف الحساب نهائياً');
    logout();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">الملف والإعدادات</h1>
        <p className="text-sm text-gray-400 mt-1">إدارة حسابك وتفضيلاتك</p>
      </div>

      {/* Profile card */}
      <div className="card-dark p-6">
        <h3 className="font-semibold gold-text mb-4 flex items-center gap-2">
          <User size={18} />
          معلومات الملف
        </h3>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-gold-300/10 border-2 border-gold-300/30 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="صورة" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold gold-text">{user?.full_name?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <label className="btn-outline-gold px-4 py-2 rounded-lg text-sm cursor-pointer flex items-center gap-2">
            <Camera size={16} />
            تغيير الصورة
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="dream" className="block text-sm text-gray-300 mb-1.5">نفسك تكون إيه لما تكبر؟ (اختياري)</label>
            <input id="dream" type="text" maxLength={120} value={dream} onChange={(e) => setDream(e.target.value)} className="input-dark" placeholder="حلمي..." />
            {dream.trim() && user?.role === 'member' && (
              <div className="mt-2 rounded-xl bg-gold-300/10 p-3 text-sm text-gold-300">
                <p>رحلتك نحو حلمك: <strong>{dream.trim()}</strong></p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-dark-300" role="progressbar" aria-label="تقدم نحو الحلم" aria-valuenow={(user?.stars || 0) % 100} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-gold-300" style={{ width: `${(user?.stars || 0) % 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-300">كل ما تجمع نجوم أكتر، بتقرّب خطوة. ({user?.stars || 0} نجمة)</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Phone size={14} /> هاتف ولي الأمر
            </label>
            <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
              <MapPin size={14} /> عنوان المنزل
            </label>
            <input type="text" value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} /> تاريخ الميلاد
            </label>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="input-dark" />
          </div>
          <button onClick={saveProfile} disabled={saving} className="btn-gold w-full py-2.5 rounded-lg text-sm">
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>

      {/* Account info */}
      <div className="card-dark p-6">
        <h3 className="font-semibold gold-text mb-4">تفاصيل الحساب</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">اسم المستخدم</span><span className="text-gray-200">{user?.username}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">الاسم الكامل</span><span className="text-gray-200">{user?.full_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">المرحلة الدراسية</span><span className="text-gray-200">{user?.education_stage || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">فصل الكنيسة</span><span className="text-gray-200">{user?.church_class || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">النجوم</span><span className="gold-text font-bold">{user?.stars || 0}</span></div>
        </div>
      </div>

      {/* Feedback: للمخدوم فقط */}
      {user?.role === 'member' && (
      <div className="card-dark p-6">
        <h3 className="font-semibold gold-text mb-4 flex items-center gap-2">
          <MessageSquare size={18} />
          الدعم والاقتراحات
        </h3>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="input-dark min-h-[100px] resize-y"
          placeholder="أبلغ عن مشكلة تقنية أو شارك بفكرة..."
        />
        <button onClick={sendFeedback} disabled={sendingFeedback || !feedback.trim()} className="btn-gold w-full py-2.5 rounded-lg mt-3 flex items-center justify-center gap-2 text-sm">
          <Send size={16} />
          {sendingFeedback ? 'جاري الإرسال...' : 'إرسال الملاحظات'}
        </button>
      </div>
      )}

      <AppearanceSettings />
      <AccountSettings />

      {/* Danger zone */}
      <div className="card-dark p-6 border-red-800/30">
        <h3 className="font-semibold text-red-400 mb-2">منطقة الخطر</h3>
        <p className="text-sm text-gray-400 mb-4">حذف الحساب نهائي ولا يمكن التراجع عنه. سيتم مسح جميع بياناتك ونجومك وسجلاتك.</p>
        <button onClick={() => setShowDelete(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
          <Trash2 size={16} />
          حذف الحساب
        </button>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="حذف الحساب؟"
        message="هل أنت متأكد؟ سيتم حذف حسابك وجميع بياناتك نهائياً. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="نعم، احذف"
        danger
        onConfirm={() => setShowDelete2(true)}
        onCancel={() => setShowDelete(false)}
      />
      <ConfirmDialog
        open={showDelete2}
        title="التأكيد النهائي"
        message="هذا تحذيرك الأخير. سيتم مسح ملفك بالكامل وسجلاتك ونجومك نهائياً من السيرفر. هل تريد المتابعة؟"
        confirmLabel="حذف نهائي"
        danger
        onConfirm={deleteAccount}
        onCancel={() => { setShowDelete2(false); setShowDelete(false); }}
      />
    </div>
  );
}
