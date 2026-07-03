import { db, pool } from "@workspace/db";
import {
  companiesTable,
  companyUsersTable,
  categoriesTable,
  productsTable,
  couponsTable,
  deliveryZonesTable,
  kmDeliveryConfigTable,
  kmDeliveryTiersTable,
  paymentSettingsTable,
  whatsappSettingsTable,
  externalLinksTable,
  ordersTable,
} from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEFAULT_SLUG = "burger-gn";
const DEFAULT_OWNER_EMAIL = "admin@burgergn.com.br";

async function main() {
  console.log("Starting multi-tenant migration...");

  const existing = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, DEFAULT_SLUG));

  let companyId: number;

  if (existing.length > 0) {
    companyId = existing[0]!.id;
    console.log(`Default company already exists (id=${companyId}), skipping creation.`);
  } else {
    const [created] = await db
      .insert(companiesTable)
      .values({
        name: "Burger GN",
        slug: DEFAULT_SLUG,
        isDefaultStorefront: true,
        logoUrl: "",
        primaryColor: "#f59e0b",
        secondaryColor: "#0a0a0a",
        plan: "premium",
        status: "active",
        maxProducts: 9999,
        maxUsers: 9999,
        subscriptionStatus: "active",
        planPriceCents: 0,
      })
      .returning();
    companyId = created!.id;
    console.log(`Created default company "Burger GN" (id=${companyId}).`);
  }

  const backfillTargets = [
    categoriesTable,
    productsTable,
    couponsTable,
    deliveryZonesTable,
    kmDeliveryConfigTable,
    kmDeliveryTiersTable,
    paymentSettingsTable,
    whatsappSettingsTable,
    externalLinksTable,
    ordersTable,
  ] as const;

  for (const table of backfillTargets) {
    const result = await db
      .update(table)
      .set({ companyId })
      .where(isNull(table.companyId));
    console.log(`Backfilled ${table === ordersTable ? "orders" : "table"}: rowCount=${result.rowCount ?? 0}`);
  }

  const existingUser = await db
    .select()
    .from(companyUsersTable)
    .where(eq(companyUsersTable.email, DEFAULT_OWNER_EMAIL));

  if (existingUser.length > 0) {
    console.log("Default company owner already exists, skipping creation.");
  } else {
    const password = process.env["ADMIN_PASSWORD"] || "burger123";
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(companyUsersTable).values({
      companyId,
      name: "Administrador Burger GN",
      email: DEFAULT_OWNER_EMAIL,
      passwordHash,
      role: "owner",
      active: true,
    });
    console.log(`Created default company owner (${DEFAULT_OWNER_EMAIL}).`);
  }

  console.log("Applying NOT NULL and UNIQUE constraints...");

  const alterStatements = [
    `ALTER TABLE categories ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE products ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE coupons ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE delivery_zones ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE km_delivery_config ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE km_delivery_tiers ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE payment_settings ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE whatsapp_settings ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE external_links ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE orders ALTER COLUMN company_id SET NOT NULL`,
    `ALTER TABLE payment_settings ADD CONSTRAINT payment_settings_company_id_unique UNIQUE (company_id)`,
    `ALTER TABLE whatsapp_settings ADD CONSTRAINT whatsapp_settings_company_id_unique UNIQUE (company_id)`,
    `ALTER TABLE km_delivery_config ADD CONSTRAINT km_delivery_config_company_id_unique UNIQUE (company_id)`,
  ];

  for (const stmt of alterStatements) {
    try {
      await pool.query(stmt);
      console.log(`OK: ${stmt}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already exists")) {
        console.log(`SKIP (already applied): ${stmt}`);
      } else {
        throw err;
      }
    }
  }

  console.log("Migration complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
