import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Check, Search } from 'lucide-react';

/* ─── TimezonePicker ──────────────────────────────────────
 * Reusable popover for picking an IANA timezone. Used in the
 * booking-card meta line (participant) and in admin "view as"
 * surfaces. Defaults to the detected timezone, surfaces a small
 * Common group, and falls back to a searchable full list.
 *
 * Visual: a tight trigger pill with Globe icon + current zone
 * in mono. Click → popover with the detected zone pinned at the
 * top, then Common list, then a search box that filters the
 * full IANA list. */

const COMMON_ZONES = [
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Helsinki',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Australia/Sydney',
  'UTC',
];

/* Pull the full IANA list from the runtime when supported.
 *  Falls back to COMMON_ZONES if the API isn't available. */
function listIanaTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') return fn('timeZone');
  } catch {
    /* fall through */
  }
  return COMMON_ZONES;
}

export interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
  /** The system-detected zone. Pinned at the top of the popover
   *  for one-tap return-to-default. */
  detected?: string;
  /** Optional trigger label override. Defaults to the icon-only
   *  pill rendering the current zone in mono. */
  triggerClassName?: string;
  /** Compact (mono only) vs labelled trigger. */
  showLabel?: boolean;
}

export function TimezonePicker({
  value,
  onChange,
  detected,
  triggerClassName,
  showLabel = false,
}: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const allZones = useMemo(() => listIanaTimezones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allZones
      .filter((z) => z.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allZones, query]);

  /* Click-outside + Esc to dismiss. Same pattern as the
   *  SpinPill popout. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    /* Focus the search input on open. */
    setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (tz: string) => {
    onChange(tz);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="tz-picker" ref={wrapRef}>
      <button
        type="button"
        className={`tz-picker__trigger${open ? ' is-open' : ''}${
          triggerClassName ? ` ${triggerClassName}` : ''
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Globe size={14} strokeWidth={1.6} aria-hidden="true" />
        {showLabel && <span className="tz-picker__trigger-label">Times in</span>}
        <span className="tz-picker__trigger-value mono">{value}</span>
      </button>

      {open && (
        <div className="tz-picker__pop" role="dialog" aria-label="Pick timezone">
          {detected && detected !== value && (
            <button
              type="button"
              className="tz-picker__pop-item tz-picker__pop-item--detected"
              onClick={() => pick(detected)}
            >
              <span className="tz-picker__pop-eyebrow">Detected on your device</span>
              <span className="tz-picker__pop-zone mono">{detected}</span>
            </button>
          )}

          <div className="tz-picker__pop-search">
            <Search size={13} strokeWidth={1.6} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or region…"
              className="tz-picker__pop-search-input"
              aria-label="Search timezone"
            />
          </div>

          <div className="tz-picker__pop-list">
            {(query ? filtered : COMMON_ZONES).map((tz) => {
              const isActive = tz === value;
              return (
                <button
                  key={tz}
                  type="button"
                  className={`tz-picker__pop-item${isActive ? ' is-active' : ''}`}
                  onClick={() => pick(tz)}
                >
                  <span className="tz-picker__pop-zone mono">{tz}</span>
                  {isActive && (
                    <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                  )}
                </button>
              );
            })}
            {query && filtered.length === 0 && (
              <p className="tz-picker__pop-empty">
                No timezones match "{query}".
              </p>
            )}
          </div>

          {!query && (
            <p className="tz-picker__pop-foot">
              {allZones.length > COMMON_ZONES.length
                ? `Search ${allZones.length} timezones`
                : 'Common timezones'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
