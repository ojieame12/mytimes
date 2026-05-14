import { useCallback, useEffect, useState } from 'react';

/* ─── Wizard draft state ───────────────────────────────────
 * Shape mirrors the API's CreateEventInput exactly so the
 * submission step can just stringify and POST. The whole
 * draft is persisted to localStorage so a refresh mid-flow
 * doesn't lose typed data — cleared on success. */

export type DurationMinutes = 15 | 30 | 45 | 60 | 90;
export const ALLOWED_DURATIONS: DurationMinutes[] = [15, 30, 45, 60, 90];

export interface BlockedRangeDraft {
  /** HH:mm */
  start: string;
  end: string;
}

export interface WizardDraft {
  /* Step 1 — details */
  title: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
  timezone: string;
  durationMinutes: DurationMinutes;
  allowMultipleBookings: boolean;
  avatarStyle: import('./types').AvatarStyle;

  /* Step 2 — availability */
  startDate: string;   // yyyy-mm-dd
  endDate: string;
  weekdays: number[];  // 0=Sun..6=Sat (matches Date.getUTCDay() convention)
  dailyStart: string;  // HH:mm
  dailyEnd: string;
  blockedRanges: BlockedRangeDraft[];
}

const STORAGE_KEY = 'mytimes:slots:wizard-draft:v1';

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function defaultDraft(): WizardDraft {
  return {
    title: '',
    description: '',
    organizerName: '',
    organizerEmail: '',
    timezone: detectedTimezone(),
    durationMinutes: 30,
    allowMultipleBookings: false,
    avatarStyle: 'notionists',
    startDate: isoToday(),
    endDate: isoToday(14),
    weekdays: [1, 2, 3, 4, 5],
    dailyStart: '09:00',
    dailyEnd: '17:00',
    blockedRanges: [],
  };
}

function loadDraft(): WizardDraft {
  if (typeof window === 'undefined') return defaultDraft();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDraft();
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    /* Shallow-merge over defaults so future fields don't break old drafts. */
    return { ...defaultDraft(), ...parsed };
  } catch {
    return defaultDraft();
  }
}

function persistDraft(draft: WizardDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* Quota or private mode — silently drop. */
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useWizardDraft(): {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  reset: () => void;
} {
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft());

  useEffect(() => {
    persistDraft(draft);
  }, [draft]);

  const update = useCallback((patch: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    clearDraft();
    setDraft(defaultDraft());
  }, []);

  return { draft, update, reset };
}

/* ─── Validation ──────────────────────────────────────────
 * Per-step rules. Returns an empty object when the step is
 * valid. The page renders inline errors and disables Next. */

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDetails(d: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (d.title.trim().length === 0) errors.title = 'Add a title. This is what participants will see.';
  else if (d.title.length > 160) errors.title = 'Title must be 160 characters or fewer.';
  if (d.description.length > 5000) errors.description = 'Description must be 5000 characters or fewer.';
  if (d.organizerName.trim().length === 0) errors.organizerName = 'Add your name.';
  else if (d.organizerName.length > 160) errors.organizerName = 'Name must be 160 characters or fewer.';
  if (!EMAIL_RE.test(d.organizerEmail)) errors.organizerEmail = 'Use a valid email like name@company.com.';
  if (!ALLOWED_DURATIONS.includes(d.durationMinutes)) errors.durationMinutes = 'Pick a duration.';
  return errors;
}

export function validateAvailability(d: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) errors.startDate = 'Pick a start date.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)) errors.endDate = 'Pick an end date.';
  if (d.endDate < d.startDate) errors.endDate = 'End date must be on or after the start date.';
  if (d.weekdays.length === 0) errors.weekdays = 'Pick at least one day of the week.';
  if (!/^\d{2}:\d{2}$/.test(d.dailyStart)) errors.dailyStart = 'Pick a start time.';
  if (!/^\d{2}:\d{2}$/.test(d.dailyEnd)) errors.dailyEnd = 'Pick an end time.';
  if (d.dailyStart >= d.dailyEnd) errors.dailyEnd = 'Daily end must be after daily start.';
  for (let i = 0; i < d.blockedRanges.length; i += 1) {
    const r = d.blockedRanges[i];
    if (r.start >= r.end) errors[`blockedRanges.${i}`] = 'Break end must be after its start.';
  }
  return errors;
}
