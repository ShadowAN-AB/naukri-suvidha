import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const TONES = {
  success: ['border-success-line bg-success-soft text-success', CheckCircle2],
  danger: ['border-danger-line bg-danger-soft text-danger', AlertCircle],
  info: ['border-info-line bg-info-soft text-info-strong', Info],
};

/* A failure is worth reading twice; a confirmation is not. */
const LIFETIME = { success: 4000, info: 4000, danger: 8000 };

function Toast({ toast, onDismiss }) {
  const [tone, Icon] = TONES[toast.tone] ?? TONES.info;

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), LIFETIME[toast.tone] ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <li
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-lg ${tone}`}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded opacity-60 transition-opacity hover:opacity-100"
      >
        <X size={16} strokeWidth={1.5} aria-hidden />
      </button>
    </li>
  );
}

export default function Toaster({ toasts, onDismiss }) {
  return (
    /* Clear of the mobile tab bar, which is fixed to the bottom too. */
    <ul
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col gap-2 sm:left-auto sm:right-6 sm:w-80 lg:bottom-6"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ul>
  );
}
