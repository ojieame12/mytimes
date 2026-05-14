export interface LimitIndicatorProps {
  count: number;
  max: number;
  unit: string;
  className?: string;
}

export function LimitIndicator({
  count,
  max,
  unit,
  className,
}: LimitIndicatorProps) {
  const ratio = max <= 0 ? 0 : count / max;
  const stateClass = ratio >= 0.95 ? ' is-at' : ratio >= 0.6 ? ' is-near' : '';
  const classes = `limit-indicator${stateClass}${className ? ` ${className}` : ''}`;

  return (
    <span className={classes} aria-label={`${count} of ${max} ${unit}`}>
      <span className="limit-indicator__count">{count}</span>
      <span className="limit-indicator__sep">/</span>
      <span className="limit-indicator__max">{max}</span>
      <span className="limit-indicator__unit">{unit}</span>
    </span>
  );
}
