import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover/press feedback for cards that sit inside a link or button. */
  interactive?: boolean;
}

export function Card({ interactive = false, className = '', ...rest }: CardProps) {
  const feedback = interactive ? 'transition-transform active:scale-[0.99] hover:shadow-md' : '';
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${feedback} ${className}`}
      {...rest}
    />
  );
}
