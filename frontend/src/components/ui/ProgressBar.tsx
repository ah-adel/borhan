interface ProgressBarProps {
  value: number;
  label: string;
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({ value, label, showValue = false, className = '' }: ProgressBarProps) {
  const progress = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-content-main">{label}</span>
        {showValue && <span className="text-sm text-content-muted">{progress}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div className="h-full rounded-full bg-primary-600 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}