import { cloneElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface FieldControlProps {
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<FieldControlProps>;
}

export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children, {
    id,
    required: required || children.props.required,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : children.props['aria-invalid'],
  });

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="label-text">
        {label}
        {required && <span className="ms-1 text-error-600" aria-hidden="true">*</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="text-sm text-content-muted">{hint}</p>}
      {error && <p id={errorId} className="text-sm text-error-700 dark:text-error-300" role="alert">{error}</p>}
    </div>
  );
}