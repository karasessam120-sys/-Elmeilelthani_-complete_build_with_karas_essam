import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// هل المستخدم الحالي «صانع تطبيق»؟ (الصلاحية على السيرفر، والواجهة بس بتسأل)
export function useAppMaker(userId: string | undefined, role: string | undefined): boolean {
  const [maker, setMaker] = useState(false);
  useEffect(() => {
    if (!userId || (role !== 'member' && role !== 'servant')) { setMaker(false); return; }
    let alive = true;
    const check = async () => {
      const { data, error } = await supabase.rpc('am_status');
      if (alive && !error) setMaker(data === true);
    };
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [userId, role]);
  return maker;
}
