import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

/* ─── Shared types ────────────────────────────────────── */

type ControlBase = {
  id?: string;
  describedBy?: string;
  invalid?: boolean;
};

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ─── TextInput ──────────────────────────────────────── */

export type TextInputProps = ControlBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
    extraClass?: string;
  };

export function TextInput({ id, describedBy, invalid, extraClass, type = 'text', ...rest }: TextInputProps) {
  return (
    <input
      id={id}
      type={type}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={classNames('control', invalid && 'is-error', extraClass)}
      {...rest}
    />
  );
}

/* ─── Textarea ───────────────────────────────────────── */

export type TextareaProps = ControlBase &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>;

export function Textarea({ id, describedBy, invalid, ...rest }: TextareaProps) {
  return (
    <textarea
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={classNames('control textarea', invalid && 'is-error')}
      {...rest}
    />
  );
}

/* ─── Select ─────────────────────────────────────────── */

export type SelectProps = ControlBase &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> & {
    children: ReactNode;
  };

export function Select({ id, describedBy, invalid, children, ...rest }: SelectProps) {
  return (
    <span className="select-wrapper">
      <select
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={classNames('control select', invalid && 'is-error')}
        {...rest}
      >
        {children}
      </select>
    </span>
  );
}

/* ─── DateInput / TimeInput ───────────────────────────── */

export function DateInput(props: TextInputProps) {
  return <TextInput type="date" extraClass="date-input" {...props} />;
}

export function TimeInput(props: TextInputProps) {
  return <TextInput type="time" extraClass="time-input" step={300} {...props} />;
}

/* ─── Toggle ─────────────────────────────────────────── */

export interface ToggleProps {
  id?: string;
  describedBy?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ id, describedBy, checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className="toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        className="toggle__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle__track">
        <span className="toggle__thumb" aria-hidden="true" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  );
}
