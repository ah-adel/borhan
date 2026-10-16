import { BlockMath, InlineMath } from 'react-katex';
import type { ReactNode } from 'react';

interface MathRendererProps {
  math: string;
  displayMode?: boolean;
  className?: string;
  renderError?: (error: Error) => ReactNode;
}

export function MathRenderer({ math, displayMode = false, className = '', renderError }: MathRendererProps) {
  const wrapperClassName = `math-renderer ${displayMode ? 'block' : 'inline-block align-middle'} ${className}`.trim();

  return displayMode ? (
    <div dir="ltr" className={wrapperClassName}>
      <BlockMath math={math} renderError={renderError} />
    </div>
  ) : (
    <span dir="ltr" className={wrapperClassName}>
      <InlineMath math={math} renderError={renderError} />
    </span>
  );
}