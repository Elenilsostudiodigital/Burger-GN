import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent / additive delivery-analysis schema bootstrap.
 * Safe for production: CREATE IF NOT EXISTS only.
 * Does not alter orders, payments, cashback, or fidelity tables.
 */
const DELIVERY_ANALYSIS_SQL = `
CREATE TABLE IF NOT EXISTS delivery_analysis_requests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL,
  order_number INTEGER NOT NULL,
  tracking_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_number TEXT NOT NULL DEFAULT '',
  neighborhood TEXT NOT NULL DEFAULT '',
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT '',
  customer_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT NOT NULL DEFAULT '',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by_user_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS delivery_analysis_requests_company_status_idx
  ON delivery_analysis_requests(company_id, status);
CREATE INDEX IF NOT EXISTS delivery_analysis_requests_order_idx
  ON delivery_analysis_requests(order_id);
CREATE INDEX IF NOT EXISTS delivery_analysis_requests_tracking_idx
  ON delivery_analysis_requests(tracking_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_analysis_requests_one_pending_per_order_idx
  ON delivery_analysis_requests(order_id)
  WHERE status = 'pending';
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureDeliveryAnalysisSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(DELIVERY_ANALYSIS_SQL);
    ensured = true;
    logger.info("Delivery analysis schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
