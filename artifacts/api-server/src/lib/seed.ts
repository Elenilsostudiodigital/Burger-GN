import { db } from "@workspace/db";
import {
  companiesTable,
  categoriesTable,
  productsTable,
  kmDeliveryConfigTable,
  kmDeliveryTiersTable,
  paymentSettingsTable,
  whatsappSettingsTable,
} from "@workspace/db";
import { count, eq, or } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_CATEGORIES = [
  { name: "Hambúrgueres", slug: "hamburguer", displayOrder: 0 },
  { name: "Combos", slug: "combo", displayOrder: 1 },
  { name: "Bebidas", slug: "bebida", displayOrder: 2 },
  { name: "Adicionais", slug: "adicional", displayOrder: 3 },
  { name: "Promoções", slug: "promocao", displayOrder: 4 },
];

const DEFAULT_PRODUCTS = [
  { name: "KING BURGER", description: "Pão com gergelim, hambúrguer 120g, cheddar, bacon crocante, alface, tomate, cebola roxa e molhos especiais.", price: "24.90", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop", categorySlug: "hamburguer", displayOrder: 0 },
  { name: "PANTANAL BURGER", description: "Pão batata, hambúrguer 120g, mussarela, alface americano, tomate, cebola roxa e molhos especiais.", price: "22.90", image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop", categorySlug: "hamburguer", displayOrder: 1 },
  { name: "COMBO KING", description: "King Burger + Batata Frita + Refrigerante 350ml.", price: "39.90", image: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&h=300&fit=crop", categorySlug: "combo", displayOrder: 0 },
  { name: "Coca-Cola", description: "Lata 350ml gelada.", price: "6.00", image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=300&fit=crop", categorySlug: "bebida", displayOrder: 0 },
  { name: "Bacon Extra", description: "Porção adicional de bacon crocante.", price: "4.00", image: "https://images.unsplash.com/photo-1606852836067-7e4d44ff71c0?w=400&h=300&fit=crop", categorySlug: "adicional", displayOrder: 0 },
];

const DEFAULT_KM_TIERS = [
  { fromKm: "0", toKm: "2", fee: "5.00", displayOrder: 0 },
  { fromKm: "2.1", toKm: "4", fee: "8.00", displayOrder: 1 },
  { fromKm: "4.1", toKm: "6", fee: "10.00", displayOrder: 2 },
  { fromKm: "6.1", toKm: "8", fee: "12.00", displayOrder: 3 },
  { fromKm: "8.1", toKm: null, fee: null, displayOrder: 4 },
];

async function resolveDefaultCompanyId(): Promise<number | null> {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(
      or(
        eq(companiesTable.isDefaultStorefront, true),
        eq(companiesTable.slug, "burger-gn"),
      ),
    )
    .limit(1);

  return company?.id ?? null;
}

export async function runSeed() {
  try {
    const companyId = await resolveDefaultCompanyId();
    if (!companyId) {
      logger.warn("No default company found — run migrate-multi-tenant before seeding");
      return;
    }

    const [{ value: catCount }] = await db
      .select({ value: count() })
      .from(categoriesTable)
      .where(eq(categoriesTable.companyId, companyId));
    if (Number(catCount) === 0) {
      logger.info("Seeding default categories...");
      await db.insert(categoriesTable).values(
        DEFAULT_CATEGORIES.map((c) => ({ ...c, companyId })),
      );
    }

    const [{ value: prodCount }] = await db
      .select({ value: count() })
      .from(productsTable)
      .where(eq(productsTable.companyId, companyId));
    if (Number(prodCount) === 0) {
      logger.info("Seeding default products...");
      const cats = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.companyId, companyId));
      const catMap = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
      await db.insert(productsTable).values(
        DEFAULT_PRODUCTS.map((p) => ({
          companyId,
          name: p.name,
          description: p.description,
          price: p.price,
          image: p.image,
          categoryId: catMap[p.categorySlug] ?? null,
          displayOrder: p.displayOrder,
        })),
      );
    }

    const [{ value: kmCount }] = await db
      .select({ value: count() })
      .from(kmDeliveryConfigTable)
      .where(eq(kmDeliveryConfigTable.companyId, companyId));
    if (Number(kmCount) === 0) {
      logger.info("Seeding KM delivery config...");
      // neighborhoodsEnabled is set only on first insert. Later deploys must not UPDATE it.
      await db.insert(kmDeliveryConfigTable).values({
        companyId,
        enabled: false,
        baseAddress: "",
        baseLat: "0",
        baseLng: "0",
        minFee: "5.00",
        feePerKm: "2.00",
        maxDistanceKm: "10.00",
        neighborhoodsEnabled: false,
      });
      await db.insert(kmDeliveryTiersTable).values(
        DEFAULT_KM_TIERS.map((t) => ({ ...t, companyId })),
      );
    }

    const [{ value: paySettingsCount }] = await db
      .select({ value: count() })
      .from(paymentSettingsTable)
      .where(eq(paymentSettingsTable.companyId, companyId));
    if (Number(paySettingsCount) === 0) {
      logger.info("Seeding default payment settings...");
      await db.insert(paymentSettingsTable).values({ companyId });
    }

    const [{ value: waCount }] = await db
      .select({ value: count() })
      .from(whatsappSettingsTable)
      .where(eq(whatsappSettingsTable.companyId, companyId));
    if (Number(waCount) === 0) {
      logger.info("Seeding default WhatsApp settings...");
      await db.insert(whatsappSettingsTable).values({ companyId, number: "" });
    }

    logger.info("Seed complete.");
  } catch (err) {
    logger.error({ err }, "Seed failed (non-fatal)");
  }
}
