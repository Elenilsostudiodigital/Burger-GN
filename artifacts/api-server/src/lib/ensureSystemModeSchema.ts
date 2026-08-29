import { pool } from "@workspace/db";
import { logger } from "./logger";

const SQL = `
CREATE TABLE IF NOT EXISTS system_operation_mode (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  override TEXT,
  override_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureSystemModeSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(SQL);
    ensured = true;
    logger.info("System operation mode schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
