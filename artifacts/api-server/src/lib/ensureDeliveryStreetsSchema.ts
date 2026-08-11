import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent / additive delivery streets schema bootstrap.
 * Safe for production: CREATE IF NOT EXISTS only.
 */
const DELIVERY_STREETS_SQL = `
CREATE TABLE IF NOT EXISTS delivery_streets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  street_name TEXT NOT NULL,
  street_key TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Lauro de Freitas',
  cep TEXT NOT NULL DEFAULT '',
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  distance_km NUMERIC(10,2),
  eta_minutes INTEGER,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_streets_company_key_idx
  ON delivery_streets(company_id, street_key);
CREATE INDEX IF NOT EXISTS delivery_streets_company_active_idx
  ON delivery_streets(company_id, active);

ALTER TABLE delivery_streets
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE delivery_streets
  ADD COLUMN IF NOT EXISTS max_delivery_time TEXT;

CREATE TABLE IF NOT EXISTS delivery_street_requests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id INTEGER,
  order_number INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  street_name TEXT NOT NULL,
  street_key TEXT NOT NULL,
  address_number TEXT NOT NULL DEFAULT '',
  neighborhood TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Lauro de Freitas',
  cep TEXT NOT NULL DEFAULT '',
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  distance_km NUMERIC(10,2),
  route_distance_km NUMERIC(10,2),
  eta_minutes INTEGER,
  suggested_fee NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  street_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS delivery_street_requests_company_status_idx
  ON delivery_street_requests(company_id, status);
CREATE INDEX IF NOT EXISTS delivery_street_requests_company_key_idx
  ON delivery_street_requests(company_id, street_key);
`;

let ensured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureDeliveryStreetsSchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(DELIVERY_STREETS_SQL);
    ensured = true;
    logger.info("Delivery streets schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
