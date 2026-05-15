import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The SSR build for marketing-route prerender shares this
 * config but is invoked separately as
 * `vite build --ssr src/entry-ssr.tsx --outDir dist-ssr`.
 * Keeping it out of the plugin list means a regular SPA
 * `vite build` is unaffected. */

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-helmet-async/') ||
            id.includes('/react-fast-compare/') ||
            id.includes('/invariant/') ||
            id.includes('/shallowequal/') ||
            id.includes('/scheduler/') ||
            id.includes('/use-sync-external-store/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/lucide-react/')) {
            return 'icon-vendor';
          }
          if (id.includes('/@sentry/')) {
            return 'observability-vendor';
          }
          if (id.includes('/@dicebear/core/')) return 'avatar-core';
          if (id.includes('/@dicebear/open-peeps/')) return 'avatar-open-peeps';
          if (id.includes('/@dicebear/notionists/')) return 'avatar-notionists';
          if (id.includes('/@dicebear/lorelei/')) return 'avatar-lorelei';
          if (id.includes('/@dicebear/big-smile/')) return 'avatar-big-smile';
          return undefined;
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
    host: '127.0.0.1',
  },
  ssr: {
    /* `react-helmet-async` is a CommonJS package and breaks
     * Node's ESM named-import path unless we bundle it in;
     * DiceBear + lucide-react are bundled for the same
     * reason — keeps the SSR bundle self-contained so the
     * prerender script can `import()` it without dancing
     * around per-package resolution quirks. */
    noExternal: [
      'react-helmet-async',
      '@dicebear/core',
      /^@dicebear\//,
      'lucide-react',
    ],
  },
});
