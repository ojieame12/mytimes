import { useMemo } from 'react';
import { createAvatar, type Style } from '@dicebear/core';
import * as openPeeps from '@dicebear/open-peeps';
import * as notionists from '@dicebear/notionists';
import * as lorelei from '@dicebear/lorelei';
import * as bigSmile from '@dicebear/big-smile';
import type { AvatarStyle } from '../lib/types';

/* ─── Avatar ──────────────────────────────────────────────
 * Renders a DiceBear illustration deterministically seeded by
 * the user's email (or any stable string). The avatar circle
 * keeps the existing chrome — border, soft inner highlight,
 * orange ambient glow — so swapping the inner illustration
 * doesn't change the brand frame. */

/* Pick a style adapter at runtime — type assertion because each
 * adapter is a namespace object that satisfies the Style<T>
 * interface but TypeScript can't see through `import *`. */
const STYLES: Record<AvatarStyle, Style<Record<string, unknown>>> = {
  notionists: notionists as Style<Record<string, unknown>>,
  'open-peeps': openPeeps as Style<Record<string, unknown>>,
  lorelei: lorelei as Style<Record<string, unknown>>,
  'big-smile': bigSmile as Style<Record<string, unknown>>,
};

/* Backgrounds picked from our orange-tinted palette so the
 * illustration sits on the same warmth as the booking card. */
const BG_PALETTE = ['fcebd7', 'fde9da', 'ffd4bc', 'fff1e3'];

export interface AvatarProps {
  /** Stable seed — typically the organizer's email. */
  seed: string;
  /** Which DiceBear style to render. */
  style?: AvatarStyle;
  /** Display size in CSS pixels. */
  size?: number;
  /** Optional className extensions (e.g. for the breathing glow). */
  className?: string;
  /** Aria label override. Defaults to a generic "Avatar for {seed}". */
  ariaLabel?: string;
}

export function Avatar({
  seed,
  style = 'notionists',
  size = 56,
  className,
  ariaLabel,
}: AvatarProps) {
  const dataUri = useMemo(() => {
    const adapter = STYLES[style] ?? STYLES.notionists;
    return createAvatar(adapter, {
      seed,
      backgroundColor: BG_PALETTE,
      backgroundType: ['solid'],
    }).toDataUri();
  }, [seed, style]);

  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <img className="avatar__img" src={dataUri} alt="" />
    </span>
  );
}
