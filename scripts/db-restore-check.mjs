import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultDatabaseURL = "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const dockerImage = process.env.SLOTBOARD_POSTGRES_CLIENT_IMAGE || "postgres:17-alpine";
const backupFile = path.resolve(repoRoot, process.argv[2] || process.env.SLOTBOARD_BACKUP_FILE || latestBackupFile());
const sourceDatabaseURL = process.env.SLOTBOARD_RESTORE_SOURCE_DATABASE_URL ||
  process.env.SLOTBOARD_DATABASE_URL ||
  process.env.DATABASE_URL ||
  defaultDatabaseURL;
const targetDatabaseName = process.env.SLOTBOARD_RESTORE_DATABASE ||
  `slotboard_restore_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const keepDatabase = process.env.SLOTBOARD_RESTORE_KEEP_DATABASE === "true";

if (!existsSync(backupFile)) {
  throw new Error(`Backup file does not exist: ${backupFile}`);
}

const maintenanceURL = withDatabase(sourceDatabaseURL, "postgres");
const targetURL = withDatabase(sourceDatabaseURL, targetDatabaseName);
const maintenancePool = new Pool({ connectionString: maintenanceURL, application_name: "slotboard-restore-check-maintenance" });

try {
  await dropDatabase(maintenancePool, targetDatabaseName);
  await maintenancePool.query(`create database ${quoteIdentifier(targetDatabaseName)} template template0`);
  await restoreBackup(backupFile, targetURL);
  const checks = await verifyRestore(targetURL);
  console.log(JSON.stringify({
    ok: true,
    backupFile,
    restoredDatabase: targetDatabaseName,
    keptDatabase: keepDatabase,
    checks,
  }, null, 2));
} finally {
  if (!keepDatabase) {
    await dropDatabase(maintenancePool, targetDatabaseName).catch(() => undefined);
  }
  await maintenancePool.end();
}

async function restoreBackup(filePath, databaseURL) {
  const client = chooseClient(filePath.endsWith(".sql") ? "psql" : "pg_restore");
  const env = {
    ...process.env,
    ...pgEnvFromURL(databaseURL, { docker: client === "docker" }),
  };
  const databaseName = pgEnvFromURL(databaseURL).PGDATABASE;

  if (client === "local") {
    if (filePath.endsWith(".sql")) {
      await run("psql", ["--set=ON_ERROR_STOP=1", "--file", filePath], { env });
      return;
    }
    await run("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--dbname",
      databaseName,
      filePath,
    ], { env });
    return;
  }

  const backupDir = path.dirname(filePath);
  const backupName = path.basename(filePath);
  const tool = filePath.endsWith(".sql") ? "psql" : "pg_restore";
  const toolArgs = filePath.endsWith(".sql")
    ? ["--set=ON_ERROR_STOP=1", "--file", `/backup/${backupName}`]
    : [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--dbname",
        databaseName,
        `/backup/${backupName}`,
      ];

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
    `${backupDir}:/backup:ro`,
    dockerImage,
    tool,
    ...toolArgs,
  ], { env });
}

async function verifyRestore(databaseURL) {
  const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-restore-check" });
  try {
    const tables = await pool.query(`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'slotboard'
    `);
    const events = await pool.query("select count(*)::int as count from slotboard.booking_events");
    const slots = await pool.query("select count(*)::int as count from slotboard.time_slots");
    const bookings = await pool.query("select count(*)::int as count from slotboard.bookings");
    return {
      slotboardTables: tables.rows[0]?.count ?? 0,
      bookingEvents: events.rows[0]?.count ?? 0,
      timeSlots: slots.rows[0]?.count ?? 0,
      bookings: bookings.rows[0]?.count ?? 0,
    };
  } finally {
    await pool.end();
  }
}

async function dropDatabase(pool, databaseName) {
  await pool.query(`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = $1
      and pid <> pg_backend_pid()
  `, [databaseName]);
  await pool.query(`drop database if exists ${quoteIdentifier(databaseName)} with (force)`);
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

function withDatabase(rawURL, databaseName) {
  const parsed = new URL(rawURL);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function latestBackupFile() {
  const backupDir = path.resolve(repoRoot, process.env.SLOTBOARD_BACKUP_DIR || "backups");
  const files = existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((file) => file.endsWith(".dump") || file.endsWith(".sql"))
        .map((file) => path.join(backupDir, file))
        .sort((left, right) => {
          const leftModified = statSync(left).mtimeMs;
          const rightModified = statSync(right).mtimeMs;
          return leftModified === rightModified ? left.localeCompare(right) : leftModified - rightModified;
        })
    : [];
  const latest = files.at(-1);
  if (!latest) {
    throw new Error(`No backup file found in ${backupDir}. Pass a file path or run npm run db:backup first.`);
  }
  return latest;
}

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
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
