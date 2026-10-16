import type { InputHTMLAttributes, ReactNode } from 'react';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Switch({ label, className = '', ...props }: SwitchProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-content-main">
      <input {...props} type="checkbox" role="switch" className={`peer sr-only ${className}`} />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary-600 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600 rtl:peer-checked:after:-translate-x-5 dark:bg-gray-700"
      />
      <span>{label}</span>
    </label>
  );
}