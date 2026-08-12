import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Additive payment-settings / Mercado Pago columns.
 * Safe for production: ADD COLUMN IF NOT EXISTS only.
 */
const PAYMENT_SETTINGS_SQL = `
ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS pix_manual_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensurePaymentSettingsSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(PAYMENT_SETTINGS_SQL);
    ensured = true;
    logger.info("Payment settings schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
