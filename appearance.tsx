import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type NavPosition = 'top' | 'bottom';

export const THEMES = [
  { id: 'gold', label: 'ذهبي', color: '#D4AF37' },
  { id: 'blue', label: 'أزرق', color: '#4F8EF7' },
  { id: 'green', label: 'أخضر', color: '#3DBE7A' },
  { id: 'purple', label: 'بنفسجي', color: '#A78BFA' },
  { id: 'red', label: 'أحمر', color: '#E5566B' },
  { id: 'teal', label: 'فيروزي', color: '#2CC5C0' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];

interface Appearance {
  navPosition: NavPosition;
  theme: ThemeId;
}

interface AppearanceContextType extends Appearance {
  setNavPosition: (p: NavPosition) => void;
  setTheme: (t: ThemeId) => void;
}

const KEY = 'elmeilelthani_appearance';
const DEFAULT: Appearance = { navPosition: 'top', theme: 'gold' };

function read(): Appearance {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        navPosition: p.navPosition === 'bottom' ? 'bottom' : 'top',
        theme: THEMES.some((t) => t.id === p.theme) ? p.theme : 'gold',
      };
    }
  } catch {
    // التخزين غير متاح: نستخدم الإعدادات الافتراضية
  }
  return DEFAULT;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Appearance>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'gold') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // تجاهل
    }
  }, [state]);

  return (
    <AppearanceContext.Provider
      value={{
        ...state,
        setNavPosition: (navPosition) => setState((s) => ({ ...s, navPosition })),
        setTheme: (theme) => setState((s) => ({ ...s, theme })),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
}
