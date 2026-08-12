import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent / additive delivery areas schema bootstrap.
 * Safe for production: CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only.
 */
const DELIVERY_AREAS_SQL = `
ALTER TABLE km_delivery_config
  ADD COLUMN IF NOT EXISTS areas_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS delivery_areas (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  city TEXT NOT NULL DEFAULT 'Lauro de Freitas',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22c55e',
  status TEXT NOT NULL DEFAULT 'active',
  enabled BOOLEAN NOT NULL DEFAULT true,
  block_reason TEXT NOT NULL DEFAULT '',
  min_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_per_km NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_distance_km NUMERIC(10,2),
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  polygon JSONB NOT NULL,
  bbox JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_areas_company_idx
  ON delivery_areas(company_id);
CREATE INDEX IF NOT EXISTS delivery_areas_company_enabled_idx
  ON delivery_areas(company_id, enabled);

CREATE TABLE IF NOT EXISTS delivery_area_requests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_number TEXT NOT NULL DEFAULT '',
  address_complement TEXT NOT NULL DEFAULT '',
  neighborhood TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Lauro de Freitas',
  cep TEXT NOT NULL DEFAULT '',
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  distance_km NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending',
  coverage_type TEXT,
  area_id INTEGER,
  street_id INTEGER,
  zone_id INTEGER,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_area_requests_company_status_idx
  ON delivery_area_requests(company_id, status);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureDeliveryAreasSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(DELIVERY_AREAS_SQL);
    ensured = true;
    logger.info("Delivery areas schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
