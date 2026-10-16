import type { TextareaHTMLAttributes } from 'react';

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-28 w-full resize-y rounded-lg border border-border bg-surface-card px-3.5 py-2.5 text-sm text-content-main placeholder-gray-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70 dark:placeholder-gray-500 dark:disabled:bg-gray-800 ${className}`}
    />
  );
}