import { useId, type ReactNode } from 'react';

/* ─── FormField ──────────────────────────────────────────
 * Wraps a control with its label, hint, and (when present)
 * error message. Generates an id and exposes it via render
 * prop so children can wire htmlFor / aria-describedby. */

export interface FormFieldProps {
  label: string;
  /** Mark as optional in the label corner. */
  optional?: boolean;
  /** Helper text below the control. Hidden when an error is shown. */
  hint?: ReactNode;
  /** Error message — when present, the control should add .is-error. */
  error?: string;
  /** Render prop — receives the generated id + describedBy. */
  children: (ctx: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function FormField({ label, optional, hint, error, children }: FormFieldProps) {
  const reactId = useId();
  const id = `ff-${reactId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = errorId ?? hintId;

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
        {optional && <span className="form-field__optional">OPTIONAL</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {!error && hint && (
        <span id={hintId} className="form-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="form-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
