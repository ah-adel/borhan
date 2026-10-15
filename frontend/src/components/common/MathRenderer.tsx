import { BlockMath, InlineMath } from 'react-katex';

interface MathRendererProps {
  math: string;
  displayMode?: boolean;
  className?: string;
}

export function MathRenderer({ math, displayMode = false, className = '' }: MathRendererProps) {
  const wrapperClassName = `math-renderer ${displayMode ? 'block' : 'inline-block align-middle'} ${className}`.trim();

  return displayMode ? (
    <div dir="ltr" className={wrapperClassName}>
      <BlockMath math={math} />
    </div>
  ) : (
    <span dir="ltr" className={wrapperClassName}>
      <InlineMath math={math} />
    </span>
  );
}