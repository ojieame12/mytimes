import type { ReactNode } from 'react';

/* ─── InfoPanel ───────────────────────────────────────────
 * Letterpress mini-card used in the booking page side rail.
 * Pairs a mono uppercase eyebrow with a panel-mini surface.
 * Accepts arbitrary children. */

export interface InfoPanelProps {
  eyebrow: string;
  /** Optional small mono detail to the right of the eyebrow. */
  meta?: string;
  children: ReactNode;
  /** Animation stagger order; passed as a CSS var to compose
   *  with the stamp-in keyframe. */
  index?: number;
}

export function InfoPanel({ eyebrow, meta, children, index = 0 }: InfoPanelProps) {
  return (
    <section
      className="info-panel"
      style={{ ['--row-index' as never]: index } as React.CSSProperties}
    >
      <header className="info-panel__head">
        <span className="info-panel__eyebrow">{eyebrow}</span>
        {meta && <span className="info-panel__meta">{meta}</span>}
      </header>
      <div className="info-panel__body">{children}</div>
    </section>
  );
}
