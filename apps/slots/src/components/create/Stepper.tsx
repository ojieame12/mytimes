/* ─── Stepper ─────────────────────────────────────────
 * 4-step progress indicator for the create flow. Each step
 * gets one of: is-upcoming, is-current, is-done. The dot
 * shows either the step number or a check (when done). */

import { Fragment } from 'react';

export type StepKey = 'details' | 'availability' | 'review' | 'done';

export interface StepperStep {
  key: StepKey;
  label: string;
}

const STEPS: StepperStep[] = [
  { key: 'details', label: 'Details' },
  { key: 'availability', label: 'Availability' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key);
}

export interface StepperProps {
  current: StepKey;
}

export function Stepper({ current }: StepperProps) {
  const curIdx = stepIndex(current);
  return (
    <ol
      className="stepper"
      role="list"
      aria-label={`Wizard progress, step ${curIdx + 1} of ${STEPS.length}`}
    >
      {STEPS.map((step, i) => {
        const state = i < curIdx ? 'is-done' : i === curIdx ? 'is-current' : 'is-upcoming';
        const progress = `${i + 1} / ${STEPS.length}`;
        return (
          <li
            key={step.key}
            className={`stepper__step ${state}`}
            data-progress={progress}
            aria-current={state === 'is-current' ? 'step' : undefined}
          >
            <span className="stepper__dot" aria-hidden="true">
              {state === 'is-done' ? (
                <CheckGlyph />
              ) : (
                <Fragment>{i + 1}</Fragment>
              )}
            </span>
            <span className="stepper__label">
              <span className="stepper__label-num">Step {i + 1}</span>
              <span className="stepper__label-text">{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M3 8.5 L6.5 12 L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
