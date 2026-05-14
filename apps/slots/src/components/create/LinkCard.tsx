import { useState } from 'react';

/* ─── LinkCard ───────────────────────────────────────
 * Shows a URL with copy + (optionally) reveal/hide for
 * secret admin links. The variant="secret" form shows a
 * warning seal banner — used for the one-time admin URL
 * on the done page. */

export interface LinkCardProps {
  variant?: 'public' | 'secret';
  eyebrow: string;
  url: string;
  /** Open-in-new-tab action shown alongside the copy button. */
  openLabel?: string;
  /** Warning text shown above the URL row (secret only by default). */
  warning?: string;
}

export function LinkCard({
  variant = 'public',
  eyebrow,
  url,
  openLabel,
  warning,
}: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(variant === 'public');

  const visibleUrl = revealed ? url : maskUrl(url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be unavailable — fall back to selection */
      const range = document.createRange();
      range.selectNodeContents(document.activeElement ?? document.body);
    }
  };

  return (
    <section className={`link-card material-panel-mini link-card--${variant}`}>
      <header className="link-card__head">
        <span className="link-card__eyebrow">
          <span className="link-card__eyebrow-dot" aria-hidden="true" />
          {eyebrow}
        </span>
        {variant === 'secret' && (
          <button
            type="button"
            className="material-stamp-light is-sm"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        )}
      </header>

      {warning && <p className="link-card__warning">{warning}</p>}

      <div className="link-card__row">
        <code
          className={`link-card__url${!revealed ? ' link-card__url--masked' : ''}`}
          aria-live="polite"
        >
          {visibleUrl}
        </code>
        <div className="link-card__actions">
          <button
            type="button"
            className="material-stamp-light is-sm"
            onClick={copy}
            aria-live="polite"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          {openLabel && revealed && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="material-stamp-light is-sm"
              style={{ textDecoration: 'none' }}
            >
              {openLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function maskUrl(url: string): string {
  /* Replace the path tail (the token) with bullets while
     keeping the scheme + host visible. */
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/^\/[^/]+\//, '');
    const masked = '•'.repeat(Math.max(tail.length, 12));
    return `${u.origin}${u.pathname.slice(0, u.pathname.length - tail.length)}${masked}`;
  } catch {
    return '•'.repeat(Math.max(url.length, 24));
  }
}
