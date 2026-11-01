import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import ClassTransfer from '@/components/shared/ClassTransfer';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { sendEmail } from '@/lib/email';
import AppSuggestionsAdmin from '@/components/admin/AppSuggestionsAdmin';
import Modal from '@/components/ui/Modal';
import type { User, ChurchConfig, Reward, ChurchClass, EducationStage } from '@/lib/types';
import {
  Users, Trash2, MapPin, CheckCircle, Clock, Gift, Plus,
  Search, KeyRound, Lightbulb, ShieldCheck, Settings, UserCheck, BookOpen, GraduationCap, Server,
} from 'lucide-react';

type AdminTab = 'servants' | 'resets' | 'suggestions' | 'users' | 'config' | 'store' | 'classes' | 'stages' | 'transfer';

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('servants');

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'servants', label: 'اعتماد الخدام', icon: UserCheck },
    { id: 'resets', label: 'طلبات كلمة السر', icon: KeyRound },
    { id: 'suggestions', label: 'اقتراحات للتطوير', icon: Lightbulb },
    { id: 'users', label: 'دليل المستخدمين', icon: Users },
    { id: 'classes', label: 'الفصول والسيرفرات', icon: Server },
    { id: 'stages', label: 'المراحل الدراسية', icon: GraduationCap },
    { id: 'transfer', label: 'نقل الفصول', icon: Users },
    { id: 'store', label: 'المتجر العالمي', icon: Gift },
  ];

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-2xl font-serif font-bold gold-text">لوحة تحكم السوبر أدمن</h1>
        <p className="text-sm text-gray-400 mt-1">التحكم الكامل في منصة الميل الثاني</p>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {tabs.map((t) => {
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

      {tab === 'servants' && <ServantApproval />}
      {tab === 'resets' && <ResetRequests />}
      {tab === 'suggestions' && <AppSuggestionsAdmin />}
      {tab === 'users' && <UserDirectory />}
      {tab === 'classes' && <ClassManager />}
      {tab === 'stages' && <StageManager />}
      {tab === 'transfer' && <ClassTransfer />}
      {tab === 'store' && <GlobalStoreManager />}
    </div>
  );
}

// --- Servant Approval ---
function ServantApproval() {
  const [pending, setPending] = useState<User[]>([]);
  const [allServants, setAllServants] = useState<User[]>([]);

  useEffect(() => {
    loadServants();
  }, []);

  const loadServants = async () => {
    const { data: pend } = await supabase.from('users').select('*').eq('role', 'servant').eq('status', 'pending');
    if (pend) setPending(pend as User[]);
    const { data: active } = await supabase.from('users').select('*').eq('role', 'servant').eq('status', 'active');
    if (active) setAllServants(active as User[]);
  };

  const activate = async (s: User) => {
    const { error } = await supabase.from('users').update({ status: 'active' }).eq('id', s.id);
    if (error) { toast('error', 'تعذر اعتماد الخادم'); return; }
    const r = await sendEmail('approved', { user_id: s.id });
    toast(r === 'sent' ? 'success' : 'info',
      r === 'sent' ? 'تم اعتماد الخادم وبعتنا له إيميل ترحيب 📧'
        : r === 'skipped' ? 'تم اعتماد الخادم. مفيش إيميل مسجّل له فما اتبعتش ترحيب.'
        : 'تم اعتماد الخادم لكن إيميل الترحيب ماتبعتش (راجع إعداد الإرسال).');
    loadServants();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold gold-text mb-3">خدام في انتظار الاعتماد</h3>
        {pending.length === 0 && <p className="text-center text-gray-400 py-6">لا يوجد خدام في الانتظار.</p>}
        <div className="space-y-2">
          {pending.map((s) => (
            <div key={s.id} className="card-dark p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">{s.full_name}</p>
                <p className="text-xs text-gray-400">@{s.username} &middot; الفصل: {s.church_class || 'غير محدد'}</p>
                <p dir="ltr" className="text-right text-xs text-gray-500">{s.contact_email || 'بدون إيميل'}</p>
              </div>
              <button onClick={() => activate(s)} className="btn-gold px-4 py-2 rounded-lg text-sm flex items-center gap-1.5">
                <CheckCircle size={16} /> اعتماد
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold gold-text mb-3">الخدام النشطون</h3>
        <div className="space-y-2">
          {allServants.map((s) => (
            <div key={s.id} className="card-dark p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">{s.full_name}</p>
                <p className="text-xs text-gray-400">@{s.username} &middot; الفصل: {s.church_class || 'غير محدد'}</p>
              </div>
              <span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded">نشط</span>
            </div>
          ))}
          {allServants.length === 0 && <p className="text-center text-gray-400 py-4">لا يوجد خدام نشطون.</p>}
        </div>
      </div>
    </div>
  );
}

type ResetRow = {
  id: string; username: string; full_name: string; role: string; church_class: string | null; status: string;
  created_at: string; approved_at: string | null; opened_at: string | null; expires_at: string | null; temp_password: string | null;
  has_email: boolean; email_hint: string | null;
};
const RESET_STATUS: Record<string, string> = {
  pending: 'بانتظار موافقتك', approved: 'اتوافق عليه', opened: 'اتبعتت له كلمة مؤقتة (شغالة)',
  used: 'تم تغيير كلمة السر', expired: 'انتهت صلاحيته', rejected: 'مرفوض', cancelled: 'اتلغى',
};

function ResetRequests() {
  const [rows, setRows] = useState<ResetRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_list_reset_requests');
    if (!error && data) setRows(data as ResetRow[]);
    setLoaded(true);
  };
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    return () => window.clearInterval(t);
  }, []);

  const approve = async (r: ResetRow) => {
    setBusy(r.id);
    const { data, error } = await supabase.rpc('admin_approve_reset', { p_id: r.id, p_temp: (temps[r.id] || '').trim() || null });
    setBusy('');
    if (error) return toast('error', error.message || 'تعذرت الموافقة');
    const mail = await sendEmail('temp_password', { request_id: r.id });
    toast(mail === 'sent' ? 'success' : 'info', mail === 'sent'
      ? `تم إرسال الكلمة المؤقتة على إيميل ${r.full_name} 📧 (شغالة 30 دقيقة)`
      : `الإيميل ماتبعتش. بلّغ ${r.full_name} بالكلمة دي: ${String(data)} (شغالة 30 دقيقة)`);
    void load();
  };
  const reject = async (r: ResetRow) => {
    setBusy(r.id);
    const { error } = await supabase.rpc('admin_reject_reset', { p_id: r.id });
    setBusy('');
    if (error) return toast('error', error.message || 'تعذر الرفض');
    void load();
  };
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '');

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">لما توافق، الكلمة المؤقتة بتتفعّل فورًا وبتوصل على إيميل المستخدم. بتشتغل 30 دقيقة، وبعد ما يدخل بيها لازم يغيّرها.</p>
      {!loaded && <p role="status" className="py-6 text-center text-sm text-gray-400">جاري التحميل...</p>}
      {loaded && rows.length === 0 && <p className="py-8 text-center text-sm text-gray-400">مفيش طلبات.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card-dark space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-200">{r.full_name} <span className="text-xs text-gray-400">({r.role === 'servant' ? 'خادم' : 'مخدوم'}{r.church_class ? ` · ${r.church_class}` : ''})</span></p>
              <p className="text-xs text-gray-400">@{r.username} · {fmt(r.created_at)}</p>
              <p dir="ltr" className="text-right text-xs text-gray-500">{r.has_email ? r.email_hint : '⚠️ مفيش إيميل مسجّل (هتبلّغه بالكلمة بنفسك)'}</p>
            </div>
            <span className={`rounded px-2 py-1 text-xs ${r.status === 'pending' ? 'bg-gold-300/10 text-gold-300' : 'bg-dark-300 text-gray-300'}`}>{RESET_STATUS[r.status] || r.status}</span>
          </div>
          {r.status === 'pending' && (
            <div className="space-y-2">
              <input type="text" dir="ltr" value={temps[r.id] || ''} onChange={(e) => setTemps({ ...temps, [r.id]: e.target.value })} className="input-dark" placeholder="كلمة سر مؤقتة (اتركها فاضية للتوليد التلقائي)" />
              <div className="flex gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => void approve(r)} className="btn-gold flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm"><CheckCircle size={16} /> موافقة وإرسال بالإيميل</button>
                <button type="button" disabled={busy === r.id} onClick={() => void reject(r)} className="btn-outline-gold rounded-lg px-4 py-2 text-sm">رفض</button>
              </div>
            </div>
          )}
          {(r.status === 'approved' || r.status === 'opened') && r.temp_password && (
            <p className="text-xs text-gray-300">الكلمة المؤقتة: <span dir="ltr" className="select-all font-mono text-gold-300">{r.temp_password}</span>{r.status === 'opened' && r.expires_at ? ` · تنتهي ${fmt(r.expires_at)}` : ''}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- User Directory ---
function UserDirectory() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [makers, setMakers] = useState<Set<string>>(new Set());
  const [infoTarget, setInfoTarget] = useState<User | null>(null);

  const toggleMaker = async (u: User) => {
    const on = !makers.has(u.id);
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_app_maker', { p_user: u.id, p_on: on });
    setSaving(false);
    if (error) { toast('error', error.message || 'تعذر التعديل'); return; }
    setMakers((s) => { const n = new Set(s); if (on) n.add(u.id); else n.delete(u.id); return n; });
    toast('success', on ? `${u.full_name} بقى صانع تطبيق وظهرتله صفحة الاقتراحات` : `تم إلغاء صانع التطبيق عن ${u.full_name}`);
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (!newUsername.trim() && !newPassword) {
      toast('error', 'اكتب اسم مستخدم جديد أو كلمة سر جديدة');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('admin_reset_credentials', {
      target: resetTarget.id,
      new_username: newUsername.trim() || null,
      new_password: newPassword || null,
    });
    setSaving(false);
    if (error) {
      toast('error', error.message || 'فشل التعديل');
      return;
    }
    toast('success', 'تم التعديل. بلّغ المستخدم بالبيانات الجديدة.');
    setResetTarget(null);
    setNewUsername('');
    setNewPassword('');
    loadUsers();
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data as User[]);
    const m = await supabase.rpc('admin_app_makers');
    if (!m.error && Array.isArray(m.data)) setMakers(new Set((m.data as Array<{ user_id: string }>).map((x) => x.user_id)));
  };

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.church_class || '').toLowerCase().includes(search.toLowerCase())
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('attendance').delete().eq('user_id', deleteTarget.id);
    await supabase.from('quiz_attempts').delete().eq('user_id', deleteTarget.id);
    await supabase.from('reward_redemptions').delete().eq('user_id', deleteTarget.id);
    await supabase.from('ai_chats').delete().eq('user_id', deleteTarget.id);
    await supabase.from('hat_akhook_uploads').delete().eq('member_id', deleteTarget.id);
    await supabase.from('feedback').delete().eq('user_id', deleteTarget.id);
    await supabase.from('users').delete().eq('id', deleteTarget.id);
    toast('success', 'تم حذف الحساب نهائياً');
    setDeleteTarget(null);
    loadUsers();
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="ابحث بالاسم أو اسم المستخدم أو الفصل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-dark pl-10"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((u) => (
          <div key={u.id} className="card-dark p-4 flex items-center justify-between">
            <button type="button" onClick={() => setInfoTarget(u)} className="flex items-center gap-3 text-right" aria-label={`خيارات ${u.full_name}`}>
              <div className="w-10 h-10 rounded-full bg-gold-300/10 flex items-center justify-center text-gold-300 font-bold">
                {u.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">{u.full_name}{makers.has(u.id) && <span className="mr-1 text-xs text-amber-300"> 🛠️ صانع تطبيق</span>}</p>
                <p className="text-xs text-gray-400">
                  @{u.username} &middot; <span className="capitalize">{u.role}</span>
                  {u.church_class && ` &middot; ${u.church_class}`}
                  {u.status === 'pending' && <span className="text-yellow-400 mr-1">(في الانتظار)</span>}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setResetTarget(u); setNewUsername(''); setNewPassword(''); }}
                title="إعادة تعيين اسم المستخدم وكلمة السر"
                className="text-gold-300 hover:bg-gold-300/10 p-2 rounded-lg transition-all"
               aria-label="إعادة تعيين اسم المستخدم وكلمة السر">
                <KeyRound size={18} />
              </button>
              {u.role !== 'admin' && (
                <button onClick={() => setDeleteTarget(u)} className="text-red-400 hover:text-red-300 hover:bg-red-950/30 p-2 rounded-lg transition-all" aria-label="حذف">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد مستخدمون.</p>}
      </div>

      <Modal open={!!infoTarget} onClose={() => setInfoTarget(null)} title={infoTarget?.full_name || 'المستخدم'}>
        {infoTarget && (
          <div className="space-y-4" dir="rtl">
            <div className="space-y-1 text-sm text-gray-300">
              <p>اسم المستخدم: <span dir="ltr" className="font-mono">@{infoTarget.username}</span></p>
              <p>الدور: {infoTarget.role === 'servant' ? 'خادم' : infoTarget.role === 'admin' ? 'أدمن' : 'مخدوم'}{infoTarget.church_class ? ` · ${infoTarget.church_class}` : ''}</p>
              <p>الحالة: {infoTarget.status === 'active' ? 'نشط' : 'في الانتظار'}</p>
            </div>
            {(infoTarget.role === 'member' || infoTarget.role === 'servant') && infoTarget.status === 'active' ? (
              <div className="space-y-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3">
                <p className="text-sm font-bold text-amber-200">🛠️ صانع التطبيق</p>
                <p className="text-xs text-gray-400">بيظهر له في القايمة صفحة «اقتراحات التطبيق» هو بس، يكتب فيها أفكاره وبتوصلك. مفيش أي صلاحية على البيانات أو الكود.</p>
                <button type="button" disabled={saving} onClick={() => void toggleMaker(infoTarget)} className={`${makers.has(infoTarget.id) ? 'btn-outline-gold' : 'btn-gold'} rounded-lg px-4 py-2 text-sm`}>
                  {makers.has(infoTarget.id) ? 'إلغاء «صانع تطبيق»' : 'جعله صانع تطبيق'}
                </button>
              </div>
            ) : <p className="text-xs text-gray-500">«صانع التطبيق» متاح للخدام والمخدومين النشطين فقط.</p>}
            <button type="button" onClick={() => { const u = infoTarget; setInfoTarget(null); setResetTarget(u); setNewUsername(''); setNewPassword(''); }} className="btn-outline-gold flex items-center gap-2 rounded-lg px-4 py-2 text-sm"><KeyRound size={15} /> إعادة تعيين بيانات الدخول</button>
          </div>
        )}
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="إعادة تعيين بيانات الدخول">
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            {resetTarget?.full_name} (@{resetTarget?.username}). اترك الخانة فاضية لو مش عايز تغيّرها.
          </p>
          <input
            type="text"
            placeholder="اسم المستخدم الجديد"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="input-dark"
          />
          <input
            type="text"
            placeholder="كلمة السر الجديدة (6 حروف على الأقل)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-dark"
          />
          <button onClick={submitReset} disabled={saving} className="btn-gold w-full">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف الحساب"
        message={`حذف ${deleteTarget?.full_name} نهائياً مع جميع بياناته؟ لا يمكن التراجع.`}
        confirmLabel="حذف نهائي"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Class Manager (Servers) ---
function ClassManager() {
  const [classes, setClasses] = useState<ChurchClass[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('name', { ascending: true });
    if (data) setClasses(data as ChurchClass[]);
  };

  const addClass = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('classes').insert({ name: newName.trim() });
    if (error) { toast('error', 'فشل إضافة الفصل'); return; }
    toast('success', 'تمت إضافة الفصل');
    setNewName('');
    loadClasses();
  };

  const deleteClass = async (id: string) => {
    await supabase.from('classes').delete().eq('id', id);
    toast('success', 'تم حذف الفصل');
    loadClasses();
  };

  return (
    <div className="space-y-4">
      <div className="card-dark p-5 space-y-3">
        <h3 className="font-semibold gold-text flex items-center gap-2"><Server size={18} /> إدارة الفصول (السيرفرات)</h3>
        <p className="text-sm text-gray-400">كل فصل يمثل سيرفر مستقل. أضف أو احذف الفصول التي ستظهر للأعضاء والخدام عند التسجيل.</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-dark flex-1" placeholder="مثال: فصل ماربقطر" />
          <button onClick={addClass} className="btn-gold px-4 py-2 rounded-lg flex items-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> إضافة فصل
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {classes.map((c) => (
          <div key={c.id} className="card-dark p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold-300/10 flex items-center justify-center">
                <Server className="text-gold-300" size={16} />
              </div>
              <span className="text-sm text-gray-200">{c.name}</span>
            </div>
            <button onClick={() => deleteClass(c.id)} className="text-red-400 hover:text-red-300" aria-label="حذف">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {classes.length === 0 && <p className="text-center text-gray-400 py-8 col-span-full">لا توجد فصول بعد.</p>}
      </div>
    </div>
  );
}

// --- Education Stage Manager ---
function StageManager() {
  const [stages, setStages] = useState<EducationStage[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadStages();
  }, []);

  const loadStages = async () => {
    const { data } = await supabase.from('education_stages').select('*').order('name', { ascending: true });
    if (data) setStages(data as EducationStage[]);
  };

  const addStage = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('education_stages').insert({ name: newName.trim() });
    if (error) { toast('error', 'فشل إضافة المرحلة'); return; }
    toast('success', 'تمت إضافة المرحلة');
    setNewName('');
    loadStages();
  };

  const deleteStage = async (id: string) => {
    await supabase.from('education_stages').delete().eq('id', id);
    toast('success', 'تم حذف المرحلة');
    loadStages();
  };

  return (
    <div className="space-y-4">
      <div className="card-dark p-5 space-y-3">
        <h3 className="font-semibold gold-text flex items-center gap-2"><GraduationCap size={18} /> إدارة المراحل الدراسية</h3>
        <p className="text-sm text-gray-400">أضف أو احذف المراحل الدراسية التي تظهر للأعضاء عند التسجيل.</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-dark flex-1" placeholder="مثال: الابتدائية" />
          <button onClick={addStage} className="btn-gold px-4 py-2 rounded-lg flex items-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> إضافة مرحلة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stages.map((s) => (
          <div key={s.id} className="card-dark p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold-300/10 flex items-center justify-center">
                <GraduationCap className="text-gold-300" size={16} />
              </div>
              <span className="text-sm text-gray-200">{s.name}</span>
            </div>
            <button onClick={() => deleteStage(s.id)} className="text-red-400 hover:text-red-300" aria-label="حذف">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {stages.length === 0 && <p className="text-center text-gray-400 py-8 col-span-full">لا توجد مراحل بعد.</p>}
      </div>
    </div>
  );
}

// --- Church Config Manager ---
function ChurchConfigManager() {
  const [config, setConfig] = useState<ChurchConfig | null>(null);
  const [form, setForm] = useState({
    gps_lat: 0,
    gps_lng: 0,
    gps_radius_meters: 200,
    attendance_day: 'Sunday',
    attendance_start_time: '08:00',
    attendance_end_time: '12:00',
    location_name: 'قاعة الكنيسة',
  });

  useEffect(() => {
    supabase.from('church_config').select('*').maybeSingle().then(({ data }) => {
      if (data) {
        const c = data as ChurchConfig;
        setConfig(c);
        setForm({
          gps_lat: c.gps_lat,
          gps_lng: c.gps_lng,
          gps_radius_meters: c.gps_radius_meters,
          attendance_day: c.attendance_day,
          attendance_start_time: c.attendance_start_time,
          attendance_end_time: c.attendance_end_time,
          location_name: c.location_name || 'قاعة الكنيسة',
        });
      }
    });
  }, []);

  const save = async () => {
    if (!config) return;
    const { error } = await supabase.from('church_config').update({
      ...form,
      updated_at: new Date().toISOString(),
    }).eq('id', config.id);
    if (error) { toast('error', 'فشل الحفظ'); return; }
    toast('success', 'تم تحديث إعدادات الكنيسة');
  };

  return (
    <div className="card-dark p-6 space-y-4 max-w-lg">
      <h3 className="font-semibold gold-text flex items-center gap-2"><MapPin size={18} /> إعدادات الكنيسة والحضور</h3>

      <div>
        <label className="text-xs text-gray-400">اسم المكان (يستخدمه الذكاء الاصطناعي للتحقق)</label>
        <input type="text" value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} className="input-dark" placeholder="مثال: قاعة الكنيسة - الدور الثاني" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">خط العرض</label>
          <input type="number" step="0.000001" value={form.gps_lat} onChange={(e) => setForm({ ...form, gps_lat: +e.target.value })} className="input-dark" />
        </div>
        <div>
          <label className="text-xs text-gray-400">خط الطول</label>
          <input type="number" step="0.000001" value={form.gps_lng} onChange={(e) => setForm({ ...form, gps_lng: +e.target.value })} className="input-dark" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400">نطاق GPS (متر)</label>
        <input type="number" value={form.gps_radius_meters} onChange={(e) => setForm({ ...form, gps_radius_meters: +e.target.value })} className="input-dark" />
      </div>
      <div>
        <label className="text-xs text-gray-400">يوم الحضور</label>
        <select value={form.attendance_day} onChange={(e) => setForm({ ...form, attendance_day: e.target.value })} className="input-dark">
          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">وقت البدء</label>
          <input type="time" value={form.attendance_start_time} onChange={(e) => setForm({ ...form, attendance_start_time: e.target.value })} className="input-dark" />
        </div>
        <div>
          <label className="text-xs text-gray-400">وقت الانتهاء</label>
          <input type="time" value={form.attendance_end_time} onChange={(e) => setForm({ ...form, attendance_end_time: e.target.value })} className="input-dark" />
        </div>
      </div>
      <button onClick={save} className="btn-gold w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
        <ShieldCheck size={16} /> حفظ الإعدادات
      </button>
    </div>
  );
}

// --- Global Store Manager ---
function GlobalStoreManager() {
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
    if (error) { toast('error', 'فشل الإضافة'); return; }
    toast('success', 'تمت إضافة الهدية');
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

  const toggleStock = async (id: string, inStock: boolean) => {
    await supabase.from('rewards').update({ in_stock: !inStock }).eq('id', id);
    setRewards((prev) => prev.map((r) => r.id === id ? { ...r, in_stock: !inStock } : r));
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
              <input type="number" value={r.price_stars} onChange={(e) => updatePrice(r.id, +e.target.value)} className="input-dark w-20 text-sm" />
              <button onClick={() => toggleStock(r.id, r.in_stock)} className={`text-xs px-2 py-1 rounded ${r.in_stock ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                {r.in_stock ? 'متوفر' : 'غير متوفر'}
              </button>
              <button onClick={() => deleteReward(r.id)} className="text-red-400 hover:text-red-300 mr-auto" aria-label="حذف">
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
