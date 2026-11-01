import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

let toastId = 0;
let pushToastFn: ((type: ToastType, message: string) => void) | null = null;

export function toast(type: ToastType, message: string) {
  if (pushToastFn) pushToastFn(type, message);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    pushToastFn = (type: ToastType, message: string) => {
      const id = `toast-${++toastId}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    return () => { pushToastFn = null; };
  }, []);

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card-dark px-4 py-3 flex items-center gap-3 animate-slide-up min-w-[280px]"
        >
          {t.type === 'success' && <CheckCircle className="text-gold-300 flex-shrink-0" size={20} />}
          {t.type === 'error' && <AlertCircle className="text-red-400 flex-shrink-0" size={20} />}
          {t.type === 'info' && <Info className="text-blue-400 flex-shrink-0" size={20} />}
          <span className="text-sm text-gray-200 flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-300" aria-label="إغلاق">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
