import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/context/I18nContext';
import { useScrollLock } from '@/hooks/useScrollLock';

interface DialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
  closeOnEscape = true,
  closeOnBackdrop = true,
  showCloseButton = true,
}: DialogProps) {
  const { t } = useTranslation();
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    (initialFocusRef?.current ?? focusableElements[0] ?? dialogRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    function keepFocusInside(event: FocusEvent) {
      if (dialogRef.current?.contains(event.target as Node)) return;
      const firstFocusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])[0];
      (firstFocusable ?? dialogRef.current)?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', keepFocusInside);
      const restoreTarget = returnFocusRef?.current?.isConnected
        ? returnFocusRef.current
        : fallbackFocusRef?.current?.isConnected
          ? fallbackFocusRef.current
          : previousFocus;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [fallbackFocusRef, initialFocusRef, open, returnFocusRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-gray-950/60 p-4"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={description ? `${dialogId}-description` : undefined}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-card text-content-main shadow-2xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${dialogId}-title`} className="text-lg font-semibold">{title}</h2>
            {description && <p id={`${dialogId}-description`} className="mt-2 text-sm text-content-muted">{description}</p>}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-content-muted hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        {children != null && <div className="px-5 py-4">{children}</div>}
        {footer != null && <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}