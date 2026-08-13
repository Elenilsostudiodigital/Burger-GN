import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent business-hours table bootstrap.
 * Safe for production: CREATE IF NOT EXISTS only.
 */
const BUSINESS_HOURS_SQL = `
CREATE TABLE IF NOT EXISTS business_hours_settings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  manual_mode TEXT NOT NULL DEFAULT 'auto',
  weekly_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  exception_date TEXT,
  exception_closed BOOLEAN NOT NULL DEFAULT false,
  exception_open TEXT,
  exception_close TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureBusinessHoursSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(BUSINESS_HOURS_SQL);
    ensured = true;
    logger.info("Business hours schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
