import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Additive marketing / promotion columns on products.
 * Safe for existing rows: defaults keep current catalog behavior.
 */
const PRODUCT_MARKETING_SQL = `
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_flash_offer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_clube_exclusive BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_original_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_starts_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_ends_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_badge TEXT NOT NULL DEFAULT '';
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureProductMarketingSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(PRODUCT_MARKETING_SQL);
    ensured = true;
    logger.info("Product marketing schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
