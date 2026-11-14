import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Visually hides the label; it stays the accessible name. */
  hideLabel?: boolean;
  error?: string;
}

export function TextField({
  label,
  hideLabel = false,
  error,
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-semibold'}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="focus-ring min-h-11 w-full rounded-md border border-border bg-input px-3 text-fg placeholder:text-fg-subtle"
        {...rest}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
