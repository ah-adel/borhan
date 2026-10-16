import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface ErrorStateProps {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  icon?: ReactNode;
  className?: string;
}

export function ErrorState({ title, description, retryLabel, onRetry, icon, className = '' }: ErrorStateProps) {
  return (
    <div role="alert" className={`card flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-badge-danger text-badge-danger-text">
        {icon ?? <CircleAlert className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-content-main">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-content-muted">{description}</p>
      <Button type="button" variant="secondary" onClick={onRetry} className="mt-5">
        {retryLabel}
      </Button>
    </div>
  );
}