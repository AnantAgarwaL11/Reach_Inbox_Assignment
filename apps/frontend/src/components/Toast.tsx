import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { Toast as ToastType } from '../hooks/useToast';
import { cn } from '../utils/cn';

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  info: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
};

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  const Icon = icons[toast.type];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
        'animate-in slide-in-from-right',
        styles[toast.type]
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
