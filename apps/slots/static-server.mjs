import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number.parseInt(process.env.PORT || "4174", 10);
const apiOrigin = (process.env.SLOTBOARD_API_ORIGIN || "https://api-production-067c0.up.railway.app").replace(/\/$/, "");
const includeLocalhostCspSources =
  process.env.NODE_ENV === "development" || process.env.SLOTBOARD_CSP_INCLUDE_LOCALHOST === "true";
const cspConnectSources = [
  "'self'",
  ...(includeLocalhostCspSources ? ["http://127.0.0.1:3014", "http://localhost:3014"] : []),
  ...envSourceList("SLOTBOARD_CSP_CONNECT_SRC"),
  ...envSourceList("VITE_SLOTBOARD_API_URL"),
  ...sentryDsnOrigins("VITE_SENTRY_DSN"),
];
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src ${dedupe(cspConnectSources).join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const server = createServer(async (req, res) => {
  setSecurityHeaders(res);

  let url;
  let pathname;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/healthz" || pathname === "/readyz") {
    proxyApiRequest(req, res, url);
    return;
  }

  const requested = resolve(root, `.${pathname}`);
  if (!isSafePath(requested)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = await resolveFile(requested);
  res.setHeader("Cache-Control", cacheControlFor(filePath));
  res.setHeader("Content-Type", contentTypes.get(extname(filePath)) || "application/octet-stream");
  createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`slotboard_frontend_started port=${port}`);
});

/* Marketing routes are prerendered into dist/index.html and
 * dist/<route>/index.html so crawlers see real HTML. Every
 * other path is an SPA route — for those we serve the empty
 * shell at _shell.html so the SPA mounts on a blank canvas
 * instead of flashing the landing page. _shell.html is
 * written by the build (a verbatim copy of the Vite shell
 * before prerender overwrote dist/index.html). If it isn't
 * present (older build), fall back to dist/index.html.   */
const SPA_SHELL_FILENAME = "_shell.html";

async function resolveFile(pathname) {
  try {
    const fileStat = await stat(pathname);
    if (fileStat.isDirectory()) {
      return join(pathname, "index.html");
    }
    return pathname;
  } catch {
    const shellPath = join(root, SPA_SHELL_FILENAME);
    try {
      await stat(shellPath);
      return shellPath;
    } catch {
      return join(root, "index.html");
    }
  }
}

function isSafePath(pathname) {
  const pathFromRoot = relative(root, pathname);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
}

function proxyApiRequest(req, res, url) {
  const target = new URL(`${url.pathname}${url.search}`, apiOrigin);
  const transport = target.protocol === "http:" ? http : https;
  const headers = { ...req.headers };
  headers.host = target.host;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "https";

  delete headers.connection;
  delete headers["content-length"];

  const upstream = transport.request(
    target,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("API proxy unavailable");
  });

  req.pipe(upstream);
}

function cacheControlFor(filePath) {
  const requestPath = `/${relative(root, filePath).replaceAll("\\", "/")}`;
  if (/^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:css|js|woff2|webp|svg|png|jpe?g)$/.test(requestPath)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-store";
}

function envSourceList(name) {
  return (process.env[name] || "")
    .split(/[\s,]+/)
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function sentryDsnOrigins(name) {
  return envSourceList(name)
    .map((value) => {
      try {
        const parsed = new URL(value);
        return parsed.origin;
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

function dedupe(values) {
  return Array.from(new Set(values));
}
