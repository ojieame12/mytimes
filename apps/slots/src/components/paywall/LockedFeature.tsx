import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

export interface LockedFeatureProps {
  label: string;
  tooltip: ReactNode;
  onClick: () => void;
}

export function LockedFeature({ label, tooltip, onClick }: LockedFeatureProps) {
  return (
    <span className="locked-feature">
      <button type="button" className="locked-feature__chip" onClick={onClick}>
        <Lock size={11} strokeWidth={1.8} aria-hidden="true" />
        {label}
      </button>
      <span className="locked-feature__tooltip" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}
