import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-gray-300 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="btn-outline-gold px-5 py-2 rounded-lg text-sm">
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            danger
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'btn-gold'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
