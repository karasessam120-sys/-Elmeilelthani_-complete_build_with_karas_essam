import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { usernameTaken, registerAccount, signUpErrorMessage } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import type { ChurchClass, EducationStage } from '@/lib/types';
import { ArrowRight, Sparkles, UserPlus, CheckCircle } from 'lucide-react';

interface RegisterProps {
  onBack: () => void;
}

function generateUsername(fullName: string): string {
  const cleanName = fullName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanName) return '';
  const prefix = cleanName.substring(0, Math.min(4, cleanName.length));
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

export default function Register({ onBack }: RegisterProps) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [educationStage, setEducationStage] = useState('');
  const [schoolYear, setSchoolYear] = useState('');
  const [churchClass, setChurchClass] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedUsername, setGeneratedUsername] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [classes, setClasses] = useState<ChurchClass[]>([]);
  const [stages, setStages] = useState<EducationStage[]>([]);

  useEffect(() => {
    supabase.from('classes').select('*').order('name', { ascending: true }).then(({ data }) => {
      if (data) setClasses(data as ChurchClass[]);
    });
    supabase.from('education_stages').select('*').order('name', { ascending: true }).then(({ data }) => {
      if (data) setStages(data as EducationStage[]);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let finalUsername = username.trim();
    let generatedThisSubmit = false;
    if (!finalUsername) {
      finalUsername = generateUsername(fullName);
      if (!finalUsername) {
        toast('error', 'من فضلك أدخل اسمك الكامل أو اسم مستخدم');
        setLoading(false);
        return;
      }
      let attempts = 0;
      while (await usernameTaken(finalUsername) && attempts < 8) {
        finalUsername = generateUsername(fullName);
        attempts += 1;
      }
      if (await usernameTaken(finalUsername)) {
        toast('error', 'تعذر توليد اسم مستخدم متاح. اكتب اسم مستخدم بنفسك.');
        setLoading(false);
        return;
      }
      generatedThisSubmit = true;
      setGeneratedUsername(finalUsername);
    }

    const existingUser = await usernameTaken(finalUsername);

    if (existingUser) {
      toast('error', 'اسم المستخدم محجوز. اختر اسماً آخر.');
      setLoading(false);
      return;
    }

    const { error } = await registerAccount({
      username: finalUsername,
      password,
      email: email.trim().toLowerCase(),
      full_name: fullName,
      role: 'member',
      status: 'active',
      education_stage: educationStage,
      school_year: schoolYear,
      church_class: churchClass,
      parent_phone: parentPhone,
      home_address: homeAddress,
      date_of_birth: dateOfBirth || null,
    });

    setLoading(false);

    if (error) {
      toast('error', signUpErrorMessage(error));
      return;
    }

    if (generatedThisSubmit) {
      setShowSuccessModal(true);
    } else {
      toast('success', 'تم إنشاء الحساب! يمكنك الآن تسجيل الدخول.');
      onBack();
    }
  };

  return (
    <div className="min-h-screen bg-dark-500 flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gold-300 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg animate-slide-up">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:gold-text transition-colors mb-6">
          <ArrowRight size={18} />
          العودة لتسجيل الدخول
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gold-gradient mb-3">
            <UserPlus className="text-dark-500" size={28} />
          </div>
          <h2 className="text-2xl font-serif font-bold gold-text">تسجيل عضو جديد</h2>
          <p className="text-sm text-gray-400 mt-1">انضم إلى مجتمع الميل الثاني</p>
        </div>

        <div className="card-dark p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">الاسم الكامل *</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-dark" placeholder="اسمك الكامل" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                اسم المستخدم <span className="text-gray-400">(اتركه فارغاً للتوليد التلقائي)</span>
              </label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-dark" placeholder="يُولّد تلقائياً إذا تركته فارغاً" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">الإيميل * <span className="text-gray-400">(عشان توصلك رسائل كلمة السر)</span></label>
              <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" placeholder="name@example.com" autoComplete="email" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">كلمة السر *</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark" placeholder="اختر كلمة سر" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">المرحلة الدراسية *</label>
              <select value={educationStage} onChange={(e) => setEducationStage(e.target.value)} className="input-dark" required>
                <option value="">اختر المرحلة...</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">السنة الدراسية *</label>
              <input type="text" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} className="input-dark" placeholder="مثال: أولى ثانوي" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">اسم الفصل الكنسي *</label>
              <select value={churchClass} onChange={(e) => setChurchClass(e.target.value)} className="input-dark" required>
                <option value="">اختر الفصل...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">هاتف ولي الأمر *</label>
              <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="input-dark" placeholder="رقم هاتف ولي الأمر" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">عنوان المنزل *</label>
              <input type="text" value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} className="input-dark" placeholder="عنوان منزلك" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">تاريخ الميلاد *</label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="input-dark" required />
            </div>

            <button type="submit" disabled={loading} className="btn-gold w-full py-3 rounded-lg flex items-center justify-center gap-2">
              {loading ? <span className="animate-pulse">جاري إنشاء الحساب...</span> : (
                <>
                  <Sparkles size={18} />
                  إنشاء الحساب
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Generated Username Modal */}
      <Modal open={showSuccessModal} onClose={() => {}} title="تم إنشاء الحساب!" size="sm">
        <div className="text-center space-y-4 py-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gold-300/10 border border-gold-300/30 animate-glow">
            <CheckCircle className="text-gold-300" size={32} />
          </div>
          <div>
            <p className="text-gray-300 mb-2">من فضلك احفظ بيانات تسجيل الدخول:</p>
            <div className="bg-dark-300 border border-gold-300/30 rounded-lg px-4 py-3 inline-block">
              <p className="text-lg font-bold gold-text font-mono">{generatedUsername}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            اكتب هذا! ستحتاجه لتسجيل الدخول. يمكنك تغيير كلمة السر لاحقاً من ملفك الشخصي.
          </p>
          <button onClick={() => { setShowSuccessModal(false); onBack(); }} className="btn-gold w-full py-2.5 rounded-lg text-sm">
            الذهاب لتسجيل الدخول
          </button>
        </div>
      </Modal>
    </div>
  );
}
