/* ─── StatusChip ──────────────────────────────────────
 * Small pill that names a state (Open / Booked / Closed /
 * Cancelled / Active / Archived / Deleted). One source of
 * truth for status visualisation across admin surfaces. */

export type StatusChipKind =
  | 'open'
  | 'booked'
  | 'closed'
  | 'blocked'
  | 'cancelled'
  | 'just-claimed'
  | 'active'
  | 'archived'
  | 'deleted';

const LABEL: Record<StatusChipKind, string> = {
  open: 'Open',
  booked: 'Booked',
  closed: 'Closed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  'just-claimed': 'Confirmed',
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
};

export interface StatusChipProps {
  kind: StatusChipKind;
  size?: 'sm' | 'md';
}

export function StatusChip({ kind, size = 'sm' }: StatusChipProps) {
  return (
    <span
      className={`status-chip status-chip--${kind} status-chip--${size}`}
      aria-label={`Status: ${LABEL[kind]}`}
    >
      <span className="status-chip__dot" aria-hidden="true" />
      <span className="status-chip__label">{LABEL[kind]}</span>
    </span>
  );
}
