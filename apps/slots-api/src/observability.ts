import * as Sentry from "@sentry/node";
import type { Env } from "./env.js";
import { sanitizeRequestPath } from "./logger.js";

const TOKEN_SEGMENT = "[A-Za-z0-9_-]{16,256}";
const TOKEN_PATH_REPLACEMENTS: Array<[RegExp, string]> = [
  [new RegExp(`(/api/slotboard/book/)${TOKEN_SEGMENT}`, "g"), "$1:publicToken"],
  [new RegExp(`(/api/slotboard/manage/)${TOKEN_SEGMENT}`, "g"), "$1:manageToken"],
  [new RegExp(`(/api/slotboard/admin/)${TOKEN_SEGMENT}`, "g"), "$1:adminToken"],
  [new RegExp(`(/b/)${TOKEN_SEGMENT}`, "g"), "$1:publicToken"],
  [new RegExp(`(/m/)${TOKEN_SEGMENT}`, "g"), "$1:manageToken"],
  [new RegExp(`(/a/)${TOKEN_SEGMENT}`, "g"), "$1:adminToken"],
];
const SENSITIVE_QUERY_KEYS = [
  "token",
  "code",
  "state",
  "publicToken",
  "manageToken",
  "adminToken",
  "session_id",
  "checkout_session_id",
];

let initialized = false;

type CaptureContext = {
  method?: string | undefined;
  path?: string | undefined;
  status?: number | undefined;
  source?: string | undefined;
};

export function initObservability(env: Env): void {
  if (!env.sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    release: env.sentryRelease,
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
  });
  initialized = true;
}

export function captureException(error: unknown, context: CaptureContext = {}): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("service", "slots-api");
    if (context.method) {
      scope.setTag("method", context.method);
    }
    if (context.status) {
      scope.setTag("status", String(context.status));
    }
    if (context.source) {
      scope.setTag("source", context.source);
    }
    if (context.path) {
      scope.setContext("request", {
        path: sanitizeRequestPath(context.path),
      });
    }
    Sentry.captureException(error);
  });
}

export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!initialized) {
    return;
  }
  await Sentry.flush(timeoutMs);
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
    delete event.request.headers["X-SlotBoard-Ops-Secret"];
    delete event.request.headers["x-slotboard-ops-secret"];
  }
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (typeof breadcrumb.message === "string") {
        breadcrumb.message = sanitizePathLike(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = sanitizeBreadcrumbData(breadcrumb.data);
      }
    }
  }
  return event;
}

function sanitizeBreadcrumbData(data: NonNullable<Sentry.Breadcrumb["data"]>): NonNullable<Sentry.Breadcrumb["data"]> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (typeof value === "string") {
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
        url.searchParams.set(key, "[Filtered]");
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
