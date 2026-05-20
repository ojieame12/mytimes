import type { ErrorInfo } from 'react';
import type * as SentryTypes from '@sentry/react';

const TOKEN_SEGMENT = '[A-Za-z0-9_-]{16,256}';
const TOKEN_PATH_REPLACEMENTS: Array<[RegExp, string]> = [
  [new RegExp(`(/b/)${TOKEN_SEGMENT}`, 'g'), '$1:publicToken'],
  [new RegExp(`(/m/)${TOKEN_SEGMENT}`, 'g'), '$1:manageToken'],
  [new RegExp(`(/a/)${TOKEN_SEGMENT}`, 'g'), '$1:adminToken'],
  [new RegExp(`(/api/slotboard/book/)${TOKEN_SEGMENT}`, 'g'), '$1:publicToken'],
  [new RegExp(`(/api/slotboard/manage/)${TOKEN_SEGMENT}`, 'g'), '$1:manageToken'],
  [new RegExp(`(/api/slotboard/admin/)${TOKEN_SEGMENT}`, 'g'), '$1:adminToken'],
];
const SENSITIVE_QUERY_KEYS = [
  'token',
  'code',
  'state',
  'publicToken',
  'manageToken',
  'adminToken',
  'session_id',
  'checkout_session_id',
];

type SentryModule = typeof import('@sentry/react');

type SentryConfig = {
  dsn: string;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
};

let sentryModulePromise: Promise<SentryModule> | undefined;
let sentryInitPromise: Promise<SentryModule> | undefined;
let sentryConfig: SentryConfig | undefined;
let sentryStarted = false;

/* Sentry is useful in production but large enough to keep out of the
 * first paint path. Load it after idle, or immediately if the runtime
 * error boundary needs to report a caught render failure. */
export function initObservability(): void {
  const config = readSentryConfig();
  if (!config) {
    return;
  }

  sentryConfig = config;
  scheduleSentryStart();
}

export function captureBoundaryError(error: Error, errorInfo: ErrorInfo): void {
  const config = sentryConfig ?? readSentryConfig();
  if (!config) return;
  sentryConfig = config;

  void startSentry().then((Sentry) => {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  });
}

function scheduleSentryStart(): void {
  const start = () => {
    void startSentry();
  };

  if (typeof window === 'undefined') {
    return;
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 2500 });
    return;
  }

  globalThis.setTimeout(start, 0);
}

function startSentry(): Promise<SentryModule> {
  if (sentryInitPromise) {
    return sentryInitPromise;
  }

  sentryInitPromise = loadSentry().then((Sentry) => {
    const config = sentryConfig ?? readSentryConfig();
    if (!config || sentryStarted) {
      return Sentry;
    }

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      integrations: config.tracesSampleRate > 0 ? [Sentry.browserTracingIntegration()] : [],
      tracesSampleRate: config.tracesSampleRate,
      beforeSend(event) {
        return sanitizeSentryEvent(event);
      },
    });
    sentryStarted = true;
    return Sentry;
  });

  return sentryInitPromise;
}

function loadSentry(): Promise<SentryModule> {
  sentryModulePromise ??= import('@sentry/react');
  return sentryModulePromise;
}

function readSentryConfig(): SentryConfig | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return undefined;

  return {
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: sampleRateFromEnv(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
  };
}

function sanitizeSentryEvent<T extends SentryTypes.Event>(event: T): T {
  if (event.request?.url) {
    event.request.url = sanitizeURL(event.request.url);
  }
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.authorization;
    delete event.request.headers.Cookie;
    delete event.request.headers.cookie;
  }
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (typeof breadcrumb.message === 'string') {
        breadcrumb.message = sanitizePathLike(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = sanitizeBreadcrumbData(breadcrumb.data);
      }
    }
  }
  return event;
}

function sanitizeBreadcrumbData(
  data: NonNullable<SentryTypes.Breadcrumb['data']>,
): NonNullable<SentryTypes.Breadcrumb['data']> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, sanitizePathLike(value)];
      }
      return [key, value];
    }),
  );
}

function sanitizeURL(value: string): string {
  try {
    const url = new URL(value);
    url.pathname = sanitizePathLike(url.pathname);
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[Filtered]');
      }
    }
    return url.toString();
  } catch {
    return sanitizePathLike(value);
  }
}

function sanitizePathLike(value: string): string {
  return TOKEN_PATH_REPLACEMENTS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function sampleRateFromEnv(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 0;
  }
  return parsed;
}
