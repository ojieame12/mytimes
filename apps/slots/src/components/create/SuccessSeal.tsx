/* ─── SuccessSeal ──────────────────────────────────────
 * Animated orange wax disc with a checkmark. Used on the
 * done step as the visual anchor of completion. The
 * stamp-in keyframe (defined in styles.css) handles the
 * arrival animation. Decorative — aria-hidden. */

export function SuccessSeal() {
  return (
    <div className="success-seal" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M7 16.5 L13.5 23 L25 10" />
      </svg>
    </div>
  );
}
