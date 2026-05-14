import { useEffect, useState } from 'react';

/* ─── Hand-rolled URL routing ─────────────────────────────
 * Vite SPA. No router library — graduate to one only when
 * a third nested route appears. The hook subscribes to
 * popstate; the navigate() helper dispatches a synthetic
 * popstate so listeners stay in sync after pushState. */

export type Route =
  | { type: 'landing' }
  | { type: 'pricing' }
  | { type: 'new-basics' }
  | { type: 'new-availability' }
  | { type: 'new-review' }
  | { type: 'new-done' }
  | { type: 'signin' }
  | { type: 'signup' }
  | { type: 'account' }
  | { type: 'account-event'; eventId: string }
  | { type: 'my-boards' }
  | { type: 'my-boards-request' }
  | { type: 'booking'; publicToken: string }
  | { type: 'manage'; manageToken: string }
  | { type: 'admin'; adminToken: string }
  | { type: 'recover' }
  | { type: 'not-found' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { type: 'landing' };
  if (pathname === '/pricing') return { type: 'pricing' };
  if (pathname === '/new') return { type: 'new-basics' };
  if (pathname === '/new/availability') return { type: 'new-availability' };
  if (pathname === '/new/review') return { type: 'new-review' };
  if (pathname === '/new/done') return { type: 'new-done' };
  if (pathname === '/signin') return { type: 'signin' };
  if (pathname === '/signup') return { type: 'signup' };
  if (pathname === '/account') return { type: 'account' };
  if (pathname === '/my-boards') return { type: 'my-boards' };
  if (pathname === '/my-boards/request' || pathname === '/my-boards/request-link') {
    return { type: 'my-boards-request' };
  }
  if (pathname === '/recover') return { type: 'recover' };

  const accountEvent = pathname.match(/^\/account\/events\/([^/]+)$/);
  if (accountEvent) {
    return { type: 'account-event', eventId: decodeURIComponent(accountEvent[1]) };
  }

  const m = pathname.match(/^\/(b|m|a)\/(.+)$/);
  if (m) {
    const token = m[2];
    if (m[1] === 'b') return { type: 'booking', publicToken: token };
    if (m[1] === 'm') return { type: 'manage', manageToken: token };
    if (m[1] === 'a') return { type: 'admin', adminToken: token };
  }
  return { type: 'not-found' };
}

/* During prerender there is no window. The build script sets
 * `globalThis.__SSR_PATH__` to the target route so the same
 * useRoute() works in both worlds. */
function currentPath(): string {
  if (typeof window !== 'undefined') return window.location.pathname;
  const ssrPath = (globalThis as { __SSR_PATH__?: string }).__SSR_PATH__;
  return ssrPath ?? '/';
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(currentPath()));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(currentPath()));
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
