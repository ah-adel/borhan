import { ChevronDown } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  startIcon?: ReactNode;
}

export function Select({ startIcon, className = '', children, ...props }: SelectProps) {
  return (
    <span className="relative block min-w-0">
      {startIcon && <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted" aria-hidden="true">{startIcon}</span>}
      <select
        {...props}
        className={`min-h-11 w-full appearance-none rounded-lg border border-border bg-surface-card py-2.5 ps-3.5 pe-10 text-sm text-content-main transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70 dark:disabled:bg-gray-800 ${startIcon ? 'ps-10' : ''} ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-content-muted" aria-hidden="true" />
    </span>
  );
}