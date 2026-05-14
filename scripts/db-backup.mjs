import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultDatabaseURL = "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const dockerImage = process.env.SLOTBOARD_POSTGRES_CLIENT_IMAGE || "postgres:17-alpine";
const source = process.env.SLOTBOARD_BACKUP_SOURCE || "url";
const schemaOnly = process.env.SLOTBOARD_BACKUP_SCHEMA_ONLY === "true";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(repoRoot, process.env.SLOTBOARD_BACKUP_DIR || "backups");
const outputFile = path.resolve(
  outputDir,
  process.env.SLOTBOARD_BACKUP_FILE || `mytimes-${source}-${timestamp}.dump`,
);

async function main() {
  mkdirSync(outputDir, { recursive: true });

  if (source === "railway") {
    await backupFromRailway(outputFile);
  } else if (source === "url") {
    const databaseURL = process.env.SLOTBOARD_DATABASE_URL || process.env.DATABASE_URL || defaultDatabaseURL;
    await backupFromDatabaseURL(databaseURL, outputFile);
  } else {
    throw new Error(`Unsupported SLOTBOARD_BACKUP_SOURCE "${source}". Use "url" or "railway".`);
  }

  const bytes = statSync(outputFile).size;
  console.log(JSON.stringify({
    ok: true,
    source,
    outputFile,
    bytes,
  }, null, 2));
}

async function backupFromRailway(filePath) {
  const service = process.env.RAILWAY_POSTGRES_SERVICE || "postgres";
  const environment = process.env.RAILWAY_ENVIRONMENT || "production";
  const database = process.env.RAILWAY_POSTGRES_DB || "slotboard";
  const user = process.env.RAILWAY_POSTGRES_USER || "slotboard";
  const railwayBaseArgs = [
    "ssh",
    "--service",
    service,
    "--environment",
    environment,
    "--",
  ];
  const remoteFile = `/tmp/mytimes-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.dump`;

  await run("railway", [
    ...railwayBaseArgs,
    "pg_dump",
    "-U",
    user,
    "-d",
    database,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    ...(schemaOnly ? ["--schema-only"] : []),
    "--file",
    remoteFile,
  ]);

  try {
    await runBase64ToFile("railway", [...railwayBaseArgs, "base64", remoteFile], filePath);
  } finally {
    await run("railway", [...railwayBaseArgs, "rm", "-f", remoteFile]).catch(() => undefined);
  }
}

async function backupFromDatabaseURL(databaseURL, filePath) {
  const client = chooseClient("pg_dump");
  const env = {
    ...process.env,
    ...pgEnvFromURL(databaseURL, { docker: client === "docker" }),
  };

  if (client === "local") {
    await run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      ...(schemaOnly ? ["--schema-only"] : []),
      "--file",
      filePath,
    ], { env });
    return;
  }

  const backupDir = path.dirname(filePath);
  const backupName = path.basename(filePath);
  await run("docker", [
    "run",
    "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "--env",
    "PGHOST",
    "--env",
    "PGPORT",
    "--env",
    "PGUSER",
    "--env",
    "PGPASSWORD",
    "--env",
    "PGDATABASE",
    "--env",
    "PGSSLMODE",
    "--volume",
    `${backupDir}:/backup`,
    dockerImage,
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    ...(schemaOnly ? ["--schema-only"] : []),
    "--file",
    `/backup/${backupName}`,
  ], { env });
}

function chooseClient(command) {
  const available = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (available.status === 0) {
    return "local";
  }
  const docker = spawnSync("docker", ["--version"], { stdio: "ignore" });
  if (docker.status === 0) {
    return "docker";
  }
  throw new Error(`${command} is not installed and Docker is unavailable for the ${dockerImage} fallback.`);
}

function pgEnvFromURL(rawURL, { docker = false } = {}) {
  const parsed = new URL(rawURL);
  const host = docker && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    ? "host.docker.internal"
    : parsed.hostname;
  return {
    PGHOST: host,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "prefer",
  };
}

async function runToFile(command, args, filePath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(filePath, { mode: 0o600 });
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });

    child.stdout.pipe(output);
    child.on("error", reject);
    output.on("error", reject);
    child.on("close", (code) => {
      output.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

async function runBase64ToFile(command, args, filePath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(filePath, { mode: 0o600 });
    const decoder = new Base64DecodeStream();
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });

    child.stdout.pipe(decoder).pipe(output);
    child.on("error", reject);
    decoder.on("error", reject);
    output.on("error", reject);
    child.on("close", (code) => {
      output.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

class Base64DecodeStream extends Transform {
  #pending = "";

  _transform(chunk, _encoding, callback) {
    const text = `${this.#pending}${chunk.toString("ascii")}`.replace(/\s/g, "");
    const safeLength = text.length - (text.length % 4);
    if (safeLength > 0) {
      this.push(Buffer.from(text.slice(0, safeLength), "base64"));
    }
    this.#pending = text.slice(safeLength);
    callback();
  }

  _flush(callback) {
    if (this.#pending) {
      this.push(Buffer.from(this.#pending, "base64"));
    }
    callback();
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env || process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

await main();
