import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // تركيز داخل النافذة، وEscape بيقفلها، وبيرجّع التركيز لما تتقفل
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative card-dark w-full ${sizeClass} p-6 animate-slide-up outline-none`}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 id={titleId} className="text-xl font-serif font-semibold gold-text">{title}</h3>
            <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:gold-text transition-colors" aria-label="إغلاق">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
