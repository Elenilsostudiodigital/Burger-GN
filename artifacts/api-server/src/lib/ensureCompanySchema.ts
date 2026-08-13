import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent bootstrap for multi-tenant company tables.
 * Must run before Clube / delivery-streets ensures (they FK to companies).
 * Safe for production: CREATE IF NOT EXISTS + seed only when missing.
 */
const COMPANY_SCHEMA_SQL = `
DO $$ BEGIN
  CREATE TYPE company_plan AS ENUM ('basico', 'pro', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_status AS ENUM ('active', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_user_role AS ENUM ('owner', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_default_storefront BOOLEAN NOT NULL DEFAULT false,
  logo_url TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#f59e0b',
  secondary_color TEXT NOT NULL DEFAULT '#0a0a0a',
  plan company_plan NOT NULL DEFAULT 'basico',
  status company_status NOT NULL DEFAULT 'active',
  max_products INTEGER NOT NULL DEFAULT 30,
  max_users INTEGER NOT NULL DEFAULT 1,
  subscription_status subscription_status NOT NULL DEFAULT 'trialing',
  plan_price_cents INTEGER NOT NULL DEFAULT 0,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role company_user_role NOT NULL DEFAULT 'owner',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_users_company_id_idx ON company_users(company_id);
CREATE INDEX IF NOT EXISTS companies_default_storefront_idx ON companies(is_default_storefront);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slogan TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS profile_whatsapp TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS instagram_url TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS facebook_url TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website_url TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS display_open_days TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS display_hours_text TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS menu_welcome_message TEXT NOT NULL DEFAULT '';

ALTER TABLE company_users ADD COLUMN IF NOT EXISTS recovery_email TEXT NOT NULL DEFAULT '';
ALTER TABLE company_users ADD COLUMN IF NOT EXISTS recovery_phone TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  email_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_email_idx ON password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(company_user_id);
`;

const DEFAULT_SLUG = "burger-gn";
const DEFAULT_OWNER_EMAIL = "admin@burgergn.com.br";

let ensured = false;
let ensurePromise: Promise<void> | null = null;

async function seedDefaultCompanyAndOwner(): Promise<void> {
  const existingCompany = await pool.query(
    `SELECT id FROM companies WHERE slug = $1 OR is_default_storefront = true ORDER BY id ASC LIMIT 1`,
    [DEFAULT_SLUG],
  );

  let companyId: number;
  if (existingCompany.rows.length > 0) {
    companyId = Number(existingCompany.rows[0]!.id);
  } else {
    const inserted = await pool.query(
      `INSERT INTO companies (
         name, slug, is_default_storefront, logo_url, primary_color, secondary_color,
         plan, status, max_products, max_users, subscription_status, plan_price_cents
       ) VALUES (
         $1, $2, true, '', '#f59e0b', '#0a0a0a',
         'premium', 'active', 9999, 9999, 'active', 0
       ) RETURNING id`,
      ["Burger GN", DEFAULT_SLUG],
    );
    companyId = Number(inserted.rows[0]!.id);
    logger.info({ companyId }, "Seeded default company");
  }

  // Ensure at least one storefront is marked default (public routes depend on it).
  await pool.query(
    `UPDATE companies SET is_default_storefront = true
     WHERE id = $1 AND NOT EXISTS (
       SELECT 1 FROM companies WHERE is_default_storefront = true
     )`,
    [companyId],
  );

  const existingUser = await pool.query(
    `SELECT id FROM company_users WHERE lower(email) = lower($1) LIMIT 1`,
    [DEFAULT_OWNER_EMAIL],
  );
  if (existingUser.rows.length > 0) return;

  const password = process.env["ADMIN_PASSWORD"] || "burger123";
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO company_users (company_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, 'owner', true)`,
    [companyId, "Administrador Burger GN", DEFAULT_OWNER_EMAIL, passwordHash],
  );
  logger.info({ email: DEFAULT_OWNER_EMAIL }, "Seeded default company owner");
}

export async function ensureCompanySchema(): Promise<void> {
  if (ensured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // Fail fast with a clear DB connectivity error (used by login handler messaging).
    await pool.query("SELECT 1");
    await pool.query(COMPANY_SCHEMA_SQL);
    await seedDefaultCompanyAndOwner();
    ensured = true;
    logger.info("Company schema ensured");
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
