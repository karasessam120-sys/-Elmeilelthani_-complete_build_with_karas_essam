import { createClient } from '@supabase/supabase-js';
import { createOfflineFetch, initOfflineSync } from './offline';

// بيقرا من متغيرات Vercel (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) لو موجودة، وإلا بيستخدم المشروع الحالي.
// المفتاح هنا عام (publishable) وده طبيعي، الأمان بيتحكم فيه الـ RLS ودوال السيرفر.
const env = import.meta.env as Record<string, string | undefined>;
const supabaseUrl = (env.VITE_SUPABASE_URL || 'https://wsfokyryygdejepjvhym.supabase.co').trim().replace(/\/+$/, '');
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_j60iHnmTvv-evZdlERVpIA_DoYnY_Fs').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createOfflineFetch() },
  auth: { persistSession: true, autoRefreshToken: true },
});

initOfflineSync({
  url: supabaseUrl,
  key: supabaseAnonKey,
  getSession: () => supabase.auth.getSession() as never,
  refreshSession: () => supabase.auth.refreshSession(),
});
