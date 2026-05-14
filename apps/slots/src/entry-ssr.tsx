import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { App } from './App';

/* ─── SSR entry ────────────────────────────────────────────
 * Compiled separately by `vite build --ssr` and consumed by
 * scripts/prerender.mts. The build script sets the target
 * path on globalThis so the hand-rolled router resolves the
 * right view without a real window. The render returns both
 * the body HTML and the Helmet snapshot so the script can
 * inject the per-route title, meta, and JSON-LD into the
 * final <head>. */

export interface PrerenderResult {
  html: string;
  helmet: HelmetServerState;
}

export function renderRoute(path: string): PrerenderResult {
  (globalThis as { __SSR_PATH__?: string }).__SSR_PATH__ = path;
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <StrictMode>
      <HelmetProvider context={helmetContext}>
        <App />
      </HelmetProvider>
    </StrictMode>,
  );
  if (!helmetContext.helmet) {
    throw new Error(`Helmet context not populated for path ${path}`);
  }
  return { html, helmet: helmetContext.helmet };
}
