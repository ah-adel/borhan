import { MathRenderer } from '@/components/common/MathRenderer';
import { parseMathSegments } from '@/lib/mathSegments';

interface MathContentProps {
  content: string;
  className?: string;
}

export function MathContent({ content, className = '' }: MathContentProps) {
  const segments = parseMathSegments(content);
  return (
    <div dir="auto" className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') return <bdi key={index} dir="auto">{segment.value}</bdi>;
        if (segment.type === 'malformed') {
          return <bdi key={index} dir="auto" className="rounded bg-badge-warning px-1 font-mono text-badge-warning-text">{segment.value}</bdi>;
        }
        const rawFallback = <bdi dir="auto" className="rounded bg-badge-warning px-1 font-mono text-badge-warning-text">{`$${segment.displayMode ? '$' : ''}${segment.value}${segment.displayMode ? '$' : ''}$`}</bdi>;
        return <MathRenderer key={index} math={segment.value} displayMode={segment.displayMode} renderError={() => rawFallback} />;
      })}
    </div>
  );
}