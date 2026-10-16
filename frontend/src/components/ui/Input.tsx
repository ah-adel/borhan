import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export function Input({ startIcon, endIcon, className = '', ...props }: InputProps) {
  return (
    <span className="relative block min-w-0">
      {startIcon && <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted" aria-hidden="true">{startIcon}</span>}
      <input
        {...props}
        className={`min-h-11 w-full rounded-lg border border-border bg-surface-card px-3.5 py-2.5 text-sm text-content-main placeholder-gray-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70 dark:placeholder-gray-500 dark:disabled:bg-gray-800 ${startIcon ? 'ps-10' : ''} ${endIcon ? 'pe-10' : ''} ${className}`}
      />
      {endIcon && <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-content-muted" aria-hidden="true">{endIcon}</span>}
    </span>
  );
}