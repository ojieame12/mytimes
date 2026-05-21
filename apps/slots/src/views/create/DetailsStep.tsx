import { useEffect, useMemo, useState } from 'react';
import { CreateFlowShell } from '../../components/create/CreateFlowShell';
import { FormField } from '../../components/form/FormField';
import { TextInput, Textarea, Select, Toggle } from '../../components/form/Inputs';
import { ChipGroup } from '../../components/form/ChipGroup';
import { Avatar } from '../../components/Avatar';
import {
  LimitIndicator,
  PLAN_LIMITS,
} from '../../components/paywall';
import { navigate } from '../../lib/routing';
import { useWizardDraft, validateDetails, ALLOWED_DURATIONS } from '../../lib/wizard';
import { AVATAR_STYLES, type AvatarStyle } from '../../lib/types';

/* ─── Step 1 — /new ────────────────────────────────────
 * Collects: title, description, duration (chip group),
 * organizer name + email, timezone, allow multiple. */

const COMMON_TIMEZONES: string[] = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function DetailsStep() {
  const { draft, update } = useWizardDraft();
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const errors = useMemo(() => validateDetails(draft), [draft]);
  const showErrors = submitAttempted;
  const err = (k: string): string | undefined => (showErrors ? errors[k] : undefined);

  /* Ensure the user's detected tz is in the dropdown — prepend if missing. */
  const tzOptions = useMemo(() => {
    const set = new Set(COMMON_TIMEZONES);
    if (!set.has(draft.timezone)) return [draft.timezone, ...COMMON_TIMEZONES];
    return COMMON_TIMEZONES;
  }, [draft.timezone]);

  const onNext = () => {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) {
      /* Move focus to the first invalid field. */
      const first = Object.keys(errors)[0];
      const el = document.querySelector(`[name="${first}"]`) as HTMLElement | null;
      el?.focus();
      return;
    }
    navigate('/new/availability');
  };

  return (
    <CreateFlowShell
      step="details"
      eyebrow="DETAILS"
      title="Tell us about the event."
      body="Give participants the context they need to commit a slot: a clear title, a duration, and how to reach you."
    >
      <form
        className="create-step"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        noValidate
      >
        {/* About the event */}
        <section className="create-step__section">
          <header className="create-step__section-head">
            <h2 className="create-step__section-title">About the event</h2>
            <span className="create-step__section-meta">What participants see first</span>
          </header>

          <FormField
            label="Title"
            hint="Short and descriptive. Appears at the top of the booking page."
            error={err('title')}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="title"
                describedBy={describedBy}
                invalid={invalid}
                placeholder="e.g. Senior Engineer interview"
                maxLength={160}
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                required
              />
            )}
          </FormField>

          <FormField
            label="Description"
            optional
            hint="One or two sentences: context, what to bring, anything participants should know."
            error={err('description')}
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                name="description"
                describedBy={describedBy}
                invalid={invalid}
                placeholder="A 30-minute intro to scope the project. No prep needed."
                maxLength={5000}
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                rows={3}
              />
            )}
          </FormField>

          <FormField
            label="Meeting duration"
            hint="Each slot will be exactly this long."
            error={err('durationMinutes')}
          >
            {() => (
              <ChipGroup
                ariaLabel="Meeting duration in minutes"
                value={draft.durationMinutes}
                onChange={(v) => update({ durationMinutes: v })}
                options={ALLOWED_DURATIONS.map((m) => ({
                  value: m,
                  primary: String(m),
                  secondary: 'MIN',
                }))}
              />
            )}
          </FormField>
        </section>

        {/* About you */}
        <section className="create-step__section">
          <header className="create-step__section-head">
            <h2 className="create-step__section-title">About you</h2>
            <span className="create-step__section-meta create-step__section-meta--limits">
              <span>Free capacity</span>
              <LimitIndicator
                count={0}
                max={PLAN_LIMITS.free.bookings}
                unit="bookings"
              />
            </span>
          </header>

          <div className="form-row">
            <FormField label="Your name" error={err('organizerName')}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="organizerName"
                  describedBy={describedBy}
                  invalid={invalid}
                  placeholder="Jane Doe"
                  maxLength={160}
                  autoComplete="name"
                  value={draft.organizerName}
                  onChange={(e) => update({ organizerName: e.target.value })}
                />
              )}
            </FormField>

            <FormField label="Your email" error={err('organizerEmail')}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="organizerEmail"
                  type="email"
                  describedBy={describedBy}
                  invalid={invalid}
                  placeholder="jane@company.com"
                  autoComplete="email"
                  value={draft.organizerEmail}
                  onChange={(e) => update({ organizerEmail: e.target.value })}
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Your avatar"
            hint="Each style is seeded by your email. The same person always gets the same illustration. Pick the one that feels most like you."
          >
            {() => (
              <AvatarStylePicker
                seed={draft.organizerEmail || 'preview@example.com'}
                value={draft.avatarStyle}
                onChange={(style) => update({ avatarStyle: style })}
              />
            )}
          </FormField>

          <FormField
            label="Timezone"
            hint="Slot times are stored in this zone. Participants see them in their own."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                name="timezone"
                describedBy={describedBy}
                value={draft.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
              >
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            label="Allow each person to book multiple slots?"
            hint="Off by default. Most events want one slot per participant."
          >
            {({ id, describedBy }) => (
              <Toggle
                id={id}
                describedBy={describedBy}
                checked={draft.allowMultipleBookings}
                onChange={(v) => update({ allowMultipleBookings: v })}
                label={draft.allowMultipleBookings ? 'Multiple bookings allowed' : 'One booking per person'}
              />
            )}
          </FormField>

        </section>
      </form>

      <div className="create-step__nav">
        <span aria-hidden="true" />
        <span
          className={`create-step__nav-summary${showErrors && Object.keys(errors).length > 0 ? ' is-error' : ''}`}
        >
          {showErrors && Object.keys(errors).length > 0
            ? `Please fix ${Object.keys(errors).length} field${Object.keys(errors).length === 1 ? '' : 's'} above before continuing.`
            : <>Step <span className="mono">1</span> of <span className="mono">4</span> · Details</>}
        </span>
        <button type="button" className="create-step__nav-next" onClick={onNext}>
          Next: availability →
        </button>
      </div>
    </CreateFlowShell>
  );
}

/* ─── AvatarStylePicker ───────────────────────────────────
 * 2×2 grid of style choices, each rendered with the user's
 * actual seed (their email if entered, otherwise a generic
 * preview seed) so they see how they'll look in each style. */
function AvatarStylePicker({
  seed,
  value,
  onChange,
}: {
  seed: string;
  value: AvatarStyle;
  onChange: (style: AvatarStyle) => void;
}) {
  const [previewedStyles, setPreviewedStyles] = useState<Set<AvatarStyle>>(() => new Set([value]));

  useEffect(() => {
    setPreviewedStyles((current) => {
      if (current.has(value)) return current;
      const next = new Set(current);
      next.add(value);
      return next;
    });
  }, [value]);

  const previewStyle = (style: AvatarStyle) => {
    setPreviewedStyles((current) => {
      if (current.has(style)) return current;
      const next = new Set(current);
      next.add(style);
      return next;
    });
  };

  return (
    <div className="avatar-style-picker" role="radiogroup" aria-label="Avatar style">
      {AVATAR_STYLES.map((option, index) => {
        const isSelected = option.id === value;
        const shouldRenderImage = previewedStyles.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`avatar-style-picker__option${isSelected ? ' is-selected' : ''}`}
            onPointerEnter={() => previewStyle(option.id)}
            onFocus={() => previewStyle(option.id)}
            onClick={() => {
              previewStyle(option.id);
              onChange(option.id);
            }}
          >
            <Avatar
              seed={seed}
              style={option.id}
              size={40}
              renderImage={shouldRenderImage}
              loadDelayMs={isSelected ? 0 : 700 + index * 200}
              priority={isSelected}
            />
            <span className="avatar-style-picker__option-text">
              <span className="avatar-style-picker__option-label">
                {option.label}
              </span>
              <span className="avatar-style-picker__option-blurb">
                {option.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
