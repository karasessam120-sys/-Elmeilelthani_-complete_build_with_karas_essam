import { useAppearance, THEMES } from '@/lib/appearance';
import { Palette, PanelTop, PanelBottom, Check } from 'lucide-react';

export default function AppearanceSettings() {
  const { navPosition, setNavPosition, theme, setTheme } = useAppearance();

  const navOption = (id: 'top' | 'bottom', label: string, Icon: typeof PanelTop) => (
    <button
      onClick={() => setNavPosition(id)}
      className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-sm transition-all border ${
        navPosition === id
          ? 'bg-gold-300/10 text-gold-300 border-gold-300/40'
          : 'text-gray-400 border-white/10 hover:text-gold-300'
      }`}
    >
      <Icon size={22} />
      {label}
    </button>
  );

  return (
    <div className="card-dark p-5 space-y-4" dir="rtl">
      <h3 className="font-semibold gold-text flex items-center gap-2"><Palette size={18} /> شكل التطبيق</h3>

      <div className="space-y-2">
        <p className="text-sm text-gray-400">مكان الصفحات</p>
        <div className="flex gap-2">
          {navOption('top', 'الصفحات فوق', PanelTop)}
          {navOption('bottom', 'الصفحات تحت', PanelBottom)}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-400">لون التطبيق</p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all border ${
                theme === t.id ? 'border-gold-300/60 text-gold-300 bg-gold-300/10' : 'border-white/10 text-gray-400'
              }`}
            >
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              {t.label}
              {theme === t.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">الإعدادات دي بتتحفظ على جهازك بس.</p>
    </div>
  );
}
