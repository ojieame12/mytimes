import { useEffect, useMemo, useRef, useState } from 'react';
import type { Style } from '@dicebear/core';
import type { AvatarStyle } from '../lib/types';

/* ─── Avatar ──────────────────────────────────────────────
 * Renders a DiceBear illustration deterministically seeded by
 * the user's email (or any stable string). The avatar circle
 * keeps the existing chrome — border, soft inner highlight,
 * orange ambient glow — so swapping the inner illustration
 * doesn't change the brand frame. */

type AvatarAdapter = Style<Record<string, unknown>>;

const STYLE_LOADERS: Record<AvatarStyle, () => Promise<AvatarAdapter>> = {
  notionists: () => import('@dicebear/notionists').then((mod) => mod as unknown as AvatarAdapter),
  'open-peeps': () => import('@dicebear/open-peeps').then((mod) => mod as unknown as AvatarAdapter),
  lorelei: () => import('@dicebear/lorelei').then((mod) => mod as unknown as AvatarAdapter),
  'big-smile': () => import('@dicebear/big-smile').then((mod) => mod as unknown as AvatarAdapter),
};

/* Backgrounds picked from our orange-tinted palette so the
 * illustration sits on the same warmth as the booking card. */
const BG_PALETTE = ['fcebd7', 'fde9da', 'ffd4bc', 'fff1e3'];
const DATA_URI_CACHE = new Map<string, string>();
const DATA_URI_PROMISES = new Map<string, Promise<string>>();
const AVATAR_LOAD_DELAY_MS = 4000;

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
  const cacheKey = `${style}:${seed}`;
  const [dataUri, setDataUri] = useState(() => DATA_URI_CACHE.get(cacheKey));
  const [nearViewport, setNearViewport] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const initials = useMemo(() => fallbackInitials(seed), [seed]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || nearViewport) return;
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    if (isReactActTestEnvironment()) return;
    if (!nearViewport) return;

    let cancelled = false;
    const cached = DATA_URI_CACHE.get(cacheKey);
    if (cached) {
      setDataUri(cached);
      return () => {
        cancelled = true;
      };
    }
    setDataUri(undefined);
    const cancelScheduledLoad = scheduleIdleAfterCriticalPaint(() => {
      void loadAvatarDataUri(style, seed, cacheKey).then((next) => {
        if (!cancelled) setDataUri(next);
      });
    });
    return () => {
      cancelled = true;
      cancelScheduledLoad();
    };
  }, [cacheKey, nearViewport, seed, style]);

  return (
    <span
      ref={rootRef}
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      {dataUri ? (
        <img
          className="avatar__img"
          src={dataUri}
          alt=""
          width={size}
          height={size}
          decoding="async"
        />
      ) : (
        <span className="avatar__fallback mono" aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

async function loadAvatarDataUri(style: AvatarStyle, seed: string, cacheKey: string): Promise<string> {
  const cached = DATA_URI_CACHE.get(cacheKey);
  if (cached) return cached;
  const pending = DATA_URI_PROMISES.get(cacheKey);
  if (pending) return pending;

  const promise = Promise.all([
    import('@dicebear/core'),
    (STYLE_LOADERS[style] ?? STYLE_LOADERS.notionists)(),
  ]).then(([{ createAvatar }, adapter]) => {
    const dataUri = createAvatar(adapter, {
      seed,
      backgroundColor: BG_PALETTE,
      backgroundType: ['solid'],
    }).toDataUri();
    DATA_URI_CACHE.set(cacheKey, dataUri);
    DATA_URI_PROMISES.delete(cacheKey);
    return dataUri;
  });

  DATA_URI_PROMISES.set(cacheKey, promise);
  return promise;
}

function fallbackInitials(seed: string): string {
  return seed
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'MT';
}

function isReactActTestEnvironment(): boolean {
  return Boolean((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT);
}

function scheduleIdleAfterCriticalPaint(callback: () => void): () => void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let idleHandle: number | undefined;
  let timeoutHandle: number | undefined;
  const run = () => {
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 1500 });
      return;
    }
    timeoutHandle = window.setTimeout(callback, 180);
  };
  const delayHandle = window.setTimeout(run, AVATAR_LOAD_DELAY_MS);
  return () => {
    window.clearTimeout(delayHandle);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
  };
}
