import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'accent' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-badge-success text-badge-success-text',
  warning: 'bg-badge-warning text-badge-warning-text',
  danger: 'bg-badge-danger text-badge-danger-text',
  info: 'bg-badge-info text-badge-info-text',
  primary: 'bg-badge-primary text-badge-primary-text',
  accent: 'bg-badge-accent text-badge-accent-text',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function Badge({ variant = 'neutral', className = '', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${variants[variant]} ${className}`}
    />
  );
}