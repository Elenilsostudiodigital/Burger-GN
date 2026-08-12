import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent / additive Clube schema bootstrap.
 * Safe for production: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS only.
 */
const CLUBE_SCHEMA_SQL = `
DO $$ BEGIN
  CREATE TYPE clube_member_tier AS ENUM ('bronze', 'prata', 'ouro', 'diamante');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE clube_discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS clube_settings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  club_name TEXT NOT NULL DEFAULT 'Clube Burger',
  welcome_message TEXT NOT NULL DEFAULT 'Bem-vindo ao Clube Burger! Acumule pontos, cashback e vantagens exclusivas.',
  points_per_real NUMERIC(10,2) NOT NULL DEFAULT 1,
  points_redeem_value NUMERIC(10,2) NOT NULL DEFAULT 0.05,
  cashback_percent NUMERIC(10,2) NOT NULL DEFAULT 5,
  cashback_min_order NUMERIC(10,2) NOT NULL DEFAULT 0,
  birthday_discount_type clube_discount_type NOT NULL DEFAULT 'percentage',
  birthday_discount_value NUMERIC(10,2) NOT NULL DEFAULT 15,
  birthday_days_before INTEGER NOT NULL DEFAULT 3,
  birthday_days_after INTEGER NOT NULL DEFAULT 3,
  early_access_hours INTEGER NOT NULL DEFAULT 24,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clube_settings_company_idx ON clube_settings(company_id);

ALTER TABLE clube_settings
  ADD COLUMN IF NOT EXISTS fidelity_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clube_settings
  ADD COLUMN IF NOT EXISTS stamps_required INTEGER NOT NULL DEFAULT 10;
ALTER TABLE clube_settings
  ADD COLUMN IF NOT EXISTS stamp_reward_title TEXT NOT NULL DEFAULT '1 hambúrguer grátis';
ALTER TABLE clube_settings
  ADD COLUMN IF NOT EXISTS cashback_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clube_settings
  ADD COLUMN IF NOT EXISTS cashback_max_per_order NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS clube_members (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  points INTEGER NOT NULL DEFAULT 0,
  cashback_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  club_points INTEGER NOT NULL DEFAULT 0,
  import_source TEXT,
  imported_at TIMESTAMP,
  last_import TIMESTAMP,
  tier clube_member_tier NOT NULL DEFAULT 'bronze',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NOT NULL DEFAULT '',
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE clube_members
  ADD COLUMN IF NOT EXISTS club_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clube_members
  ADD COLUMN IF NOT EXISTS import_source TEXT;
ALTER TABLE clube_members
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP;
ALTER TABLE clube_members
  ADD COLUMN IF NOT EXISTS last_import TIMESTAMP;

CREATE TABLE IF NOT EXISTS client_import_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER,
  user_email TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'outro',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  options_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_import_logs_company_idx
  ON client_import_logs(company_id);

CREATE TABLE IF NOT EXISTS clube_loyalty_rewards (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points_cost INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clube_exclusive_coupons (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  discount_type clube_discount_type NOT NULL,
  discount_value NUMERIC(10,2) NOT NULL,
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clube_exclusive_coupons_company_code_idx
  ON clube_exclusive_coupons(company_id, code);

CREATE TABLE IF NOT EXISTS clube_birthday_benefits (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_type clube_discount_type NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clube_early_promotions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_type clube_discount_type NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 10,
  early_access_at TIMESTAMP NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureClubeSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(CLUBE_SCHEMA_SQL);
      logger.info("Clube schema ensured (additive/idempotent)");
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}
