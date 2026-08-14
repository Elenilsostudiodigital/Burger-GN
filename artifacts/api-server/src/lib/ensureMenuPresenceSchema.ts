import { pool } from "@workspace/db";
import { logger } from "./logger";

const SQL = `
CREATE TABLE IF NOT EXISTS menu_presence_sessions (
  session_id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'browsing',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  cart_items INTEGER NOT NULL DEFAULT 0,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checkout_started_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS menu_presence_sessions_company_seen_idx
  ON menu_presence_sessions (company_id, last_seen_at DESC);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureMenuPresenceSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(SQL);
    ensured = true;
    logger.info("Menu presence schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
