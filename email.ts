import { supabase } from './supabase';

// الإرسال الفعلي من Edge Function اسمها send-email (السيرفر بيتأكد من الصلاحية)
export type EmailResult = 'sent' | 'skipped' | 'failed';
export async function sendEmail(type: 'welcome' | 'approved' | 'temp_password', payload: Record<string, string> = {}): Promise<EmailResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'failed';
  try {
    const { data, error } = await supabase.functions.invoke('send-email', { body: { type, ...payload } });
    if (error) return 'failed';
    return (data as { skipped?: string } | null)?.skipped ? 'skipped' : 'sent';
  } catch {
    return 'failed';
  }
}
