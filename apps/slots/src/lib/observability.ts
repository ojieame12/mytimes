import * as Sentry from '@sentry/react';

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

export function initObservability(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  const tracesSampleRate = sampleRateFromEnv(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE);

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: tracesSampleRate > 0 ? [Sentry.browserTracingIntegration()] : [],
    tracesSampleRate,
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
  });
}

function sanitizeSentryEvent<T extends Sentry.Event>(event: T): T {
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

function sanitizeBreadcrumbData(data: NonNullable<Sentry.Breadcrumb['data']>): NonNullable<Sentry.Breadcrumb['data']> {
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
