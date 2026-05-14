import pg from "pg";
import { loadEnv } from "./env.js";

const { Pool } = pg;
const POSTGRES_DATE_OID = 1082;

pg.types.setTypeParser(POSTGRES_DATE_OID, (value) => value);

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const env = loadEnv();
  if (!env.databaseURL) {
    throw new Error("SLOTBOARD_DATABASE_URL is required for database operations");
  }

  pool = new Pool({
    connectionString: env.databaseURL,
    application_name: "slotboard-api",
    max: env.dbPoolMax,
    connectionTimeoutMillis: env.dbConnectionTimeoutMs,
    idleTimeoutMillis: env.dbIdleTimeoutMs,
    query_timeout: env.dbQueryTimeoutMs,
    statement_timeout: env.dbStatementTimeoutMs,
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = undefined;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
