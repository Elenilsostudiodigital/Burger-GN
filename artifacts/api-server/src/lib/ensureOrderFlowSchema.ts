import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Additive order-flow bootstrap:
 * - order_status += 'finalized'
 * - payment_settings.auto_finalize_on_delivered
 * - one-shot migrate legacy done → finalized
 */
const ORDER_FLOW_SQL = `
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE 'finalized';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS auto_finalize_on_delivered BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS bgn_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bgn_schema_migrations WHERE id = 'orders_done_to_finalized_v1') THEN
    UPDATE orders SET status = 'finalized', updated_at = NOW() WHERE status = 'done';
    INSERT INTO bgn_schema_migrations (id) VALUES ('orders_done_to_finalized_v1');
  END IF;
END $$;
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureOrderFlowSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(ORDER_FLOW_SQL);
    ensured = true;
    logger.info("Order flow schema ensured (finalized + auto_finalize)");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
