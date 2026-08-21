import { pool } from "@workspace/db";
import { logger } from "./logger";

const SQL = `
CREATE TABLE IF NOT EXISTS printer_settings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensurePrinterSettingsSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(SQL);
    ensured = true;
    logger.info("Printer settings schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
