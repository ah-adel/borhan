import type { HTMLAttributes } from 'react';

type SkeletonVariant = 'text' | 'card' | 'table-row';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

const variants: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-card',
  'table-row': 'grid grid-cols-4 gap-4 py-4',
};

export function Skeleton({ variant = 'text', className = '', ...props }: SkeletonProps) {
  if (variant === 'table-row') {
    return (
      <div {...props} aria-hidden="true" className={`${variants[variant]} ${className}`}>
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="h-4 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div
      {...props}
      aria-hidden="true"
      className={`animate-pulse bg-gray-200 motion-reduce:animate-none dark:bg-gray-700 ${variants[variant]} ${className}`}
    />
  );
}