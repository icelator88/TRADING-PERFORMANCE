import type { TranslationSet } from '../i18n/translations';

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  t: TranslationSet;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  isOpen,
  message,
  t,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#263042] bg-[#121721] p-6 shadow-2xl">
        <h3 id="confirm-modal-title" className="text-base font-semibold text-slate-100">
          {t.confirm.deleteTitle}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#1E2634] pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#263042] px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-[#1B2230]"
          >
            {t.confirm.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
          >
            {t.confirm.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
