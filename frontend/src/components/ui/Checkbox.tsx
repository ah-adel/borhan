import type { InputHTMLAttributes, ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Checkbox({ label, className = '', ...props }: CheckboxProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-content-main">
      <input
        {...props}
        type="checkbox"
        className={`h-5 w-5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 ${className}`}
      />
      <span>{label}</span>
    </label>
  );
}