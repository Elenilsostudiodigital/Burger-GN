import { pool } from "@workspace/db";
import { logger } from "./logger";

const SQL = `
CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_company_key_uidx
  ON message_templates (company_id, template_key);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureMessageTemplatesSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(SQL);
    ensured = true;
    logger.info("Message templates schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
