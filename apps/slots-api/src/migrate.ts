import { readFile } from "node:fs/promises";
import { closePool, getPool } from "./db.js";

const MAX_ATTEMPTS = 20;
const RETRY_MS = 1500;

async function runMigration(): Promise<void> {
  const migration = await readFile(new URL("../migrations/0001_slotboard.sql", import.meta.url), "utf8");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await getPool().query(migration);
      console.log("slotboard_migration_completed");
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.log(`slotboard_migration_waiting attempt=${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

try {
  await runMigration();
} finally {
  await closePool();
}
