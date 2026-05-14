import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { closePool } from "./db.js";
import { loadEnv } from "./env.js";
import { logError, logInfo } from "./logger.js";
import { captureException, flushObservability, initObservability } from "./observability.js";
import { closeOrganizerAuthPool } from "./organizerAuth.js";

const env = loadEnv();
initObservability(env);
let shuttingDown = false;

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    logInfo("slotboard_api_started", { port: info.port });
  },
);

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("uncaughtException", (error) => {
  captureException(error, { source: "uncaughtException" });
  logError("slotboard_uncaught_exception", {}, error);
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  captureException(reason, { source: "unhandledRejection" });
  logError("slotboard_unhandled_rejection", {}, reason);
  void shutdown("unhandledRejection", 1);
});

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logInfo("slotboard_api_shutdown_started", { reason });

  const timer = setTimeout(() => {
    logError("slotboard_api_shutdown_timeout", { reason, timeoutMs: env.gracefulShutdownMs });
    process.exit(1);
  }, env.gracefulShutdownMs);
  timer.unref();

  server.close(async (error?: Error) => {
    try {
      if (error) {
        logError("slotboard_api_server_close_failed", { reason }, error);
        exitCode = 1;
      }
      await Promise.all([closePool(), closeOrganizerAuthPool(), flushObservability()]);
      logInfo("slotboard_api_shutdown_completed", { reason, exitCode });
      process.exit(exitCode);
    } catch (closeError) {
      logError("slotboard_api_shutdown_failed", { reason }, closeError);
      process.exit(1);
    }
  });
}
