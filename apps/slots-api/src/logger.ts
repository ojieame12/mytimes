type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;
type LogMeta = Record<string, LogValue>;

const TOKEN_SEGMENT = "[A-Za-z0-9_-]{16,256}";

export function logInfo(event: string, meta: LogMeta = {}): void {
  writeLog("info", event, meta);
}

export function logWarn(event: string, meta: LogMeta = {}): void {
  writeLog("warn", event, meta);
}

export function logError(event: string, meta: LogMeta = {}, error?: unknown): void {
  writeLog("error", event, {
    ...meta,
    ...errorFields(error),
  });
}

export function sanitizeRequestPath(path: string): string {
  return path
    .replace(new RegExp(`(/api/slotboard/book)/${TOKEN_SEGMENT}`), "$1/:publicToken")
    .replace(new RegExp(`(/api/slotboard/manage)/${TOKEN_SEGMENT}`), "$1/:manageToken")
    .replace(new RegExp(`(/api/slotboard/admin)/${TOKEN_SEGMENT}`), "$1/:adminToken");
}

function writeLog(level: LogLevel, event: string, meta: LogMeta): void {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...compact(meta),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function compact(meta: LogMeta): LogMeta {
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
}

function errorFields(error: unknown): LogMeta {
  if (!error) {
    return {};
  }
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return {
    errorMessage: String(error),
  };
}
