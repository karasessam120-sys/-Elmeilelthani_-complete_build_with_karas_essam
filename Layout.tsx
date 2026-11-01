import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useAppearance } from '@/lib/appearance';
import SyncBanner from '@/components/shared/SyncBanner';
import MessageCenter from '@/components/shared/MessageCenter';
import EmailPrompt from '@/components/shared/EmailPrompt';
import { LogOut, Crown } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  navItems: { id: string; label: string; icon: typeof Crown }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const roleLabels: Record<string, string> = {
  member: 'عضو',
  servant: 'خادم',
  admin: 'سوبر أدمن',
};

export default function Layout({ children, navItems, activeTab, onTabChange }: LayoutProps) {
  const { user, logout } = useAuth();
  const { navPosition } = useAppearance();
  const bottom = navPosition === 'bottom';

  return (
    <div className={`min-h-screen bg-dark-500 flex flex-col ${bottom ? '' : 'lg:flex-row'}`} dir="rtl">
      {/* Sidebar (desktop) */}
      <aside className={`hidden ${bottom ? '' : 'lg:flex'} w-64 bg-dark-400 border-l border-gold-300/10 flex-col`}>
        <div className="p-6 flex items-center gap-3 border-b border-gold-300/10">
          <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center">
            <Crown className="text-dark-500" size={20} />
          </div>
          <div>
            <p className="font-serif font-bold gold-text">الميل الثاني</p>
            <p className="text-xs text-gray-400">{user ? roleLabels[user.role] : ''}</p>
          </div>
          <div className="mr-auto flex items-center"><MessageCenter /></div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  active
                    ? 'bg-gold-300/10 text-gold-300 border border-gold-300/20'
                    : 'text-gray-400 hover:text-gold-300 hover:bg-gold-300/5 border border-transparent'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gold-300/10">
          <div className="mb-3 px-4">
            <p className="text-sm font-medium text-gray-300 truncate">{user?.full_name}</p>
            <p className="text-xs text-gray-400 truncate">@{user?.username}</p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-950/30 transition-all"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className={`${bottom ? '' : 'lg:hidden'} bg-dark-400 border-b border-gold-300/10 px-4 py-3 flex items-center justify-between sticky top-0 z-40`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center">
            <Crown className="text-dark-500" size={16} />
          </div>
          <span className="font-serif font-bold gold-text">الميل الثاني</span>
        </div>
        <div className="flex items-center gap-3">
          <MessageCenter />
          <button onClick={logout} className="text-red-400" aria-label="تسجيل الخروج">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Tab bar: فوق (موبايل) أو تحت (كل الشاشات) */}
      {bottom ? (
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-dark-400 border-t border-gold-300/10 overflow-x-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex gap-1 px-2 py-1.5 min-w-max mx-auto w-fit">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                    active ? 'bg-gold-300/10 text-gold-300' : 'text-gray-400'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="lg:hidden bg-dark-400 border-b border-gold-300/10 overflow-x-auto">
          <div className="flex gap-1 px-2 py-2 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                    active ? 'bg-gold-300/10 text-gold-300' : 'text-gray-400'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto p-4 lg:p-8 ${bottom ? 'pb-28' : ''}`}>
        <div className="max-w-6xl mx-auto">
          <EmailPrompt />
          <SyncBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
