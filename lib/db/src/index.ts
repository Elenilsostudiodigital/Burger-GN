import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Neon serverless: use the connection pooler hostname when given a direct
 * compute endpoint. Local Postgres URLs are left unchanged.
 */
export function resolvePostgresConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (!host.endsWith(".neon.tech") || host.includes("-pooler.")) return raw;
    url.hostname = host.replace(/^([^.]+)\./, "$1-pooler.");
    return url.toString();
  } catch {
    return raw;
  }
}

export const pool = new Pool({
  connectionString: resolvePostgresConnectionString(process.env.DATABASE_URL),
  max: 1,
  min: 0,
  connectionTimeoutMillis: 12_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
