import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@/context/I18nContext';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

interface ToastProps extends Omit<ToastMessage, 'id'> {
  onDismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const variants: Record<ToastVariant, { className: string; Icon: typeof Info }> = {
  success: { className: 'bg-badge-success text-badge-success-text', Icon: CheckCircle2 },
  error: { className: 'bg-badge-danger text-badge-danger-text', Icon: CircleAlert },
  info: { className: 'bg-badge-info text-badge-info-text', Icon: Info },
};

export function Toast({ message, variant, onDismiss }: ToastProps) {
  const { t } = useTranslation();
  const { className, Icon } = variants[variant];

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={`flex max-w-sm items-start gap-3 rounded-lg border border-current/20 px-4 py-3 text-sm shadow-lg ${className}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="-my-1 -me-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={t('common.dismiss')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children, duration = 5000 }: { children: ReactNode; duration?: number }) {
  const { t } = useTranslation();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, variant });
    setPaused(false);
  }, []);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast || paused) return undefined;
    const timeout = window.setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current);
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, paused, toast]);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        role="region"
        aria-label={t('common.notifications')}
        className="pointer-events-none fixed bottom-4 start-4 z-[110] flex max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
            }}
          >
            <Toast message={toast.message} variant={toast.variant} onDismiss={dismiss} />
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}