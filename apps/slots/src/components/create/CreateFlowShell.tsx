import type { ReactNode } from 'react';
import { AppShell } from '../AppShell';
import { Stepper, type StepKey, stepIndex } from './Stepper';
import { navigate } from '../../lib/routing';

/* ─── CreateFlowShell ─────────────────────────────────
 * Wraps each wizard step. Reuses AppShell (top bar +
 * footer) but constrains content to the narrower wizard
 * column and renders the peach-editorial hero (eyebrow +
 * display title + body + stepper) above the step's body. */

export interface CreateFlowShellProps {
  step: StepKey;
  /** Display title for the step, e.g. "Tell us about the event". */
  title: string;
  /** Eyebrow above the title, e.g. "DETAILS". The numeric "STEP 1 OF 4"
   *  prefix is added automatically from the current step. */
  eyebrow?: string;
  /** Optional body paragraph rendered under the title. */
  body?: ReactNode;
  /** Optional exit-to-home button shown top-right. */
  showExit?: boolean;
  /** Use the wider 1180px column — for the review step's full-fidelity preview. */
  wide?: boolean;
  children: ReactNode;
}

const TOTAL_STEPS = 4;

export function CreateFlowShell({
  step,
  title,
  eyebrow,
  body,
  showExit = true,
  wide = false,
  children,
}: CreateFlowShellProps) {
  const stepNum = stepIndex(step) + 1;

  return (
    <AppShell>
      <div className={`create-flow${wide ? ' create-flow--wide' : ''}`}>
        <header className="create-shell__head">
          <div className="create-shell__head-text">
            <p className="create-shell__eyebrow">
              <span className="create-shell__eyebrow-step">
                STEP {stepNum} OF {TOTAL_STEPS}
              </span>
              {eyebrow && (
                <>
                  <span className="create-shell__eyebrow-sep" aria-hidden="true" />
                  <span>{eyebrow}</span>
                </>
              )}
            </p>
            <h1 className="create-shell__title">{title}</h1>
            {body && <p className="create-shell__body">{body}</p>}
          </div>
          {showExit && (
            <button
              type="button"
              className="create-shell__exit"
              onClick={() => {
                const confirmed = window.confirm(
                  'Leave the setup? Your draft is saved on this device. You can come back to /new.',
                );
                if (confirmed) navigate('/');
              }}
            >
              Save & exit
            </button>
          )}
        </header>

        <Stepper current={step} />

        {children}
      </div>
    </AppShell>
  );
}
