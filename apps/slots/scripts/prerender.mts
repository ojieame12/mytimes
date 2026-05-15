/* ─── Prerender — Tier 3 SEO/AI-crawler step ──────────────
 * After `vite build` + the separate SSR bundle build, this
 * walks a hard-coded list of marketing routes, calls
 * renderRoute() from dist-ssr/entry-ssr.js, and writes the
 * resulting HTML back into dist/{route}/index.html so static
 * hosts (and the bundled static-server.mjs) serve fully
 * rendered HTML on the first byte. The hydration script tag
 * is preserved so React still hydrates the SPA on top.       */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../dist');
const ssrDir = resolve(here, '../dist-ssr');
const ssrEntry = resolve(ssrDir, 'entry-ssr.js');

/* Each route writes into dist/<dir>/index.html. '/' becomes
 * dist/index.html and replaces the shell Vite produced. */
const routes: Array<{ path: string; out: string }> = [
  { path: '/', out: 'index.html' },
  { path: '/pricing', out: 'pricing/index.html' },
  { path: '/privacy', out: 'privacy/index.html' },
  { path: '/terms', out: 'terms/index.html' },
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/* Strip the shell's site-wide tags that Helmet overrides on
 * the marketing routes so the prerendered HTML doesn't carry
 * duplicates. Each pattern intentionally skips Helmet's own
 * `data-rh="true"` tags. */
function dedupeShellHead(html: string): string {
  const dropPatterns: RegExp[] = [
    /<meta\s+name="description"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<link\s+rel="canonical"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+property="og:title"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+property="og:description"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+property="og:url"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+property="og:type"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+name="twitter:title"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
    /<meta\s+name="twitter:description"(?![^>]*\bdata-rh\b)[^>]*>\s*/gi,
  ];
  let cleaned = html;
  for (const re of dropPatterns) cleaned = cleaned.replace(re, '');
  return cleaned;
}

async function main() {
  if (!(await exists(ssrEntry))) {
    /* Soft-fail: a missing SSR bundle means the SPA build
     * still ships, just without crawler-friendly HTML. */
    console.warn(
      `[prerender] SSR bundle missing at ${ssrEntry}; skipping prerender. SPA shell remains intact.`,
    );
    return;
  }

  const shellPath = resolve(distDir, 'index.html');
  if (!(await exists(shellPath))) {
    console.warn(
      `[prerender] Client shell missing at ${shellPath}; skipping prerender.`,
    );
    return;
  }

  /* Preserve the pre-render Vite shell as the SPA fallback.
   * The static server serves this for unknown paths so booking,
   * manage, admin, etc. don't briefly flash landing content. */
  const spaFallbackPath = resolve(distDir, '_shell.html');
  const originalShell = await readFile(shellPath, 'utf8');
  await writeFile(spaFallbackPath, originalShell, 'utf8');
  console.log('[prerender] saved SPA fallback shell → _shell.html');

  /* renderRoute() is exported from the SSR bundle. We import
   * it dynamically because this script is ESM and the bundle
   * sits outside the package's import resolution graph. */
  const ssrUrl = pathToFileURL(ssrEntry).href;
  const { renderRoute } = (await import(ssrUrl)) as {
    renderRoute: (path: string) => {
      html: string;
      helmet: {
        title: { toString(): string };
        meta: { toString(): string };
        link: { toString(): string };
        script: { toString(): string };
      };
    };
  };

  const shellHtml = originalShell;

  for (const route of routes) {
    let result;
    try {
      result = renderRoute(route.path);
    } catch (error) {
      console.error(
        `[prerender] Failed to render ${route.path}, leaving SPA shell:`,
        error,
      );
      continue;
    }

    const { html, helmet } = result;

    /* Compose the per-route <head> from the Helmet snapshot.
     * The site-wide defaults inside the shell stay below as
     * a baseline; Helmet's title overrides the shell title
     * because the last <title> in <head> wins in browsers,
     * but search engines read the first one. So we replace
     * the shell <title> instead of appending. */
    const headAdditions = [
      helmet.meta.toString(),
      helmet.link.toString(),
      helmet.script.toString(),
    ]
      .filter(Boolean)
      .join('');

    const helmetTitle = helmet.title.toString();
    /* Helmet emits `<title data-rh="true">…</title>`. We swap
     * that in for the shell's plain <title>. */
    let mergedHtml = shellHtml.replace(
      /<title>[^<]*<\/title>/,
      helmetTitle,
    );

    /* Drop the shell tags that Helmet replaces — otherwise
     * crawlers see two canonicals, two descriptions, two
     * og:titles, etc. We only strip the *non-Helmet* copies
     * (those without the data-rh attribute). The browser
     * does this on hydration too; we mirror it for SSR. */
    mergedHtml = dedupeShellHead(mergedHtml);

    mergedHtml = mergedHtml.replace(
      '</head>',
      `${headAdditions}</head>`,
    );

    mergedHtml = mergedHtml.replace(
      '<div id="root"></div>',
      `<div id="root">${html}</div>`,
    );

    const outPath = resolve(distDir, route.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, mergedHtml, 'utf8');
    console.log(`[prerender] ${route.path} → ${route.out}`);
  }
}

main().catch((error) => {
  /* The SPA dist/ is already complete by the time we run.
   * Log the failure loudly but exit 0 so the wrapping build
   * still ships a working SPA — the only thing missing is
   * the SEO/AI-crawler boost on the two marketing routes. */
  console.error('[prerender] Unhandled failure (SPA build unaffected):', error);
  process.exit(0);
});
