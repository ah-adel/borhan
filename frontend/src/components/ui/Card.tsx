import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  hoverElevation?: boolean;
  children?: ReactNode;
}

export function Card({ header, footer, hoverElevation = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`card overflow-hidden ${hoverElevation ? 'transition-shadow hover:shadow-md' : ''} ${className}`}
    >
      {header != null && <div className="border-b border-border px-5 py-4">{header}</div>}
      {children != null && <div className="p-5">{children}</div>}
      {footer != null && <div className="border-t border-border px-5 py-4">{footer}</div>}
    </div>
  );
}