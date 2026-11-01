import { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppearanceProvider } from '@/lib/appearance';
import { useAppMaker } from '@/lib/appMaker';
import { ToastContainer } from '@/components/ui/Toast';
import Login from '@/components/auth/Login';
const Register = lazy(() => import('@/components/auth/Register'));
const Layout = lazy(() => import('@/components/shared/Layout'));
const MemberHome = lazy(() => import('@/components/member/MemberHome'));
const MemberExams = lazy(() => import('@/components/member/MemberExams'));
const MemberStore = lazy(() => import('@/components/member/MemberStore'));
const Leaderboards = lazy(() => import('@/components/shared/Leaderboards'));
const MemberAttendance = lazy(() => import('@/components/member/MemberAttendance'));
const MemberHatAkhook = lazy(() => import('@/components/member/MemberHatAkhook'));
const MemberProfile = lazy(() => import('@/components/member/MemberProfile'));
const MemberFaresElAngeel = lazy(() => import('@/components/member/MemberFaresElAngeel'));
const PsalmsAndAgpeya = lazy(() => import('@/components/member/PsalmsAndAgpeya'));
const AccountSettings = lazy(() => import('@/components/shared/AccountSettings'));
const AppearanceSettings = lazy(() => import('@/components/shared/AppearanceSettings'));
const ServantPanel = lazy(() => import('@/components/servant/ServantPanel'));
const AdminPanel = lazy(() => import('@/components/admin/AdminPanel'));
const ForcePasswordChange = lazy(() => import('@/components/auth/ForcePasswordChange'));
const ServantFaresManager = lazy(() => import('@/components/servant/ServantFaresManager'));
const AppSuggestions = lazy(() => import('@/components/shared/AppSuggestions'));
import {
  Home, Award, Gift, Trophy, Camera, Users, User,
  Settings, ShieldCheck, Lightbulb,
} from 'lucide-react';

function AppContent() {
  const { user, loading, mustChange } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState('home');
  const appMaker = useAppMaker(user?.id, user?.role); // «صانع تطبيق» بيظهرله صفحة الاقتراحات

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-500 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gold-gradient mb-4 animate-glow">
            <ShieldCheck className="text-dark-500" size={28} />
          </div>
          <p className="text-gold-300 animate-pulse">جاري تحميل الميل الثاني...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return authView === 'login' ? (
      <Login onNavigateRegister={() => setAuthView('register')} />
    ) : (
      <Suspense fallback={<div className="min-h-screen bg-dark-500" role="status" aria-label="جاري التحميل" />}>
        <Register onBack={() => setAuthView('login')} />
      </Suspense>
    );
  }

  if (mustChange) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-dark-500" role="status" aria-label="جاري التحميل" />}>
        <ForcePasswordChange />
      </Suspense>
    );
  }

  // STRICT ROLE-BASED VIEW ISOLATION
  // Each role gets its own set of nav items and views.
  // Members can NEVER see Servant or Admin tools.
  // Servants can NEVER see Member views or Admin tools.
  // Admin dashboard is strictly exclusive to the 1 hardcoded Super Admin.

  let navItems: { id: string; label: string; icon: typeof Home }[] = [];
  let content: React.ReactNode = null;

  if (user.role === 'member') {
    navItems = [
      { id: 'home', label: 'الرئيسية', icon: Home },
      { id: 'exams', label: 'اختبارات', icon: Award },
      { id: 'store', label: 'المتجر', icon: Gift },
      { id: 'leaderboards', label: 'المتصدرون', icon: Trophy },
      { id: 'attendance', label: 'الحضور', icon: Camera },
      { id: 'hatakhook', label: 'هات أخوك', icon: Users },
      { id: 'profile', label: 'الملف', icon: User },
      { id: 'fares', label: 'فارس الإنجيل', icon: Award },
      { id: 'psalms-agpeya', label: 'المزامير والأجبية', icon: ShieldCheck },
      ...(appMaker ? [{ id: 'app-suggestions', label: 'اقتراحات التطبيق', icon: Lightbulb }] : []),
    ];

    switch (activeTab) {
      case 'home': content = <MemberHome />; break;
      case 'exams': content = <MemberExams />; break;
      case 'store': content = <MemberStore />; break;
      case 'leaderboards': content = <Leaderboards />; break;
      case 'attendance': content = <MemberAttendance />; break;
      case 'hatakhook': content = <MemberHatAkhook />; break;
      case 'profile': content = <MemberProfile />; break;
      case 'fares': content = <MemberFaresElAngeel />; break;
      case 'psalms-agpeya': content = <PsalmsAndAgpeya />; break;
      case 'app-suggestions': content = appMaker ? <AppSuggestions /> : <MemberHome />; break;
      default: content = <MemberHome />;
    }
  } else if (user.role === 'servant') {
    navItems = [
      { id: 'panel', label: 'الإدارة', icon: Settings },
      { id: 'fares-manager', label: 'فارس الإنجيل', icon: Award },
      { id: 'leaderboards', label: 'المتصدرون', icon: Trophy },
      { id: 'profile', label: 'الملف', icon: User },
      ...(appMaker ? [{ id: 'app-suggestions', label: 'اقتراحات التطبيق', icon: Lightbulb }] : []),
    ];

    switch (activeTab) {
      case 'panel': content = <ServantPanel />; break;
      case 'fares-manager': content = <ServantFaresManager />; break;
      case 'leaderboards': content = <Leaderboards />; break;
      case 'profile': content = <MemberProfile />; break;
      case 'app-suggestions': content = appMaker ? <AppSuggestions /> : <ServantPanel />; break;
      default: content = <ServantPanel />;
    }
  } else if (user.role === 'admin') {
    navItems = [
      { id: 'admin', label: 'لوحة الأدمن', icon: ShieldCheck },
      { id: 'fares-manager', label: 'فارس الإنجيل', icon: Award },
      { id: 'leaderboards', label: 'المتصدرون', icon: Trophy },
      { id: 'account', label: 'حسابي', icon: User },
    ];

    switch (activeTab) {
      case 'admin': content = <AdminPanel />; break;
      case 'fares-manager': content = <ServantFaresManager />; break;
      case 'account': content = <div className="space-y-4 max-w-lg mx-auto"><AppearanceSettings /><AccountSettings /></div>; break;
      case 'leaderboards': content = <Leaderboards />; break;
      default: content = <AdminPanel />;
    }
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-500 p-8 text-center text-gray-400" role="status">جاري التحميل...</div>}>
    <Layout navItems={navItems} activeTab={activeTab} onTabChange={setActiveTab}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400" role="status">جاري تحميل لوحة التحكم...</div>}>
        {content}
      </Suspense>
    </Layout>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppearanceProvider>
      <AuthProvider>
        <AppContent />
        <ToastContainer />
      </AuthProvider>
    </AppearanceProvider>
  );
}
