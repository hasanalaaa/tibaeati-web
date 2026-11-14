import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; icon-only controls have no visible text. */
  label: string;
  children: ReactNode;
}

export function IconButton({
  label,
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-transparent text-fg transition-colors hover:bg-input active:bg-input ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
