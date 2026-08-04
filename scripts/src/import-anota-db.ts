/**
 * Import Anota menu JSON directly into DATABASE_URL (no HTTP API).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool } from "@workspace/db";
import {
  companiesTable,
  categoriesTable,
  productsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const menuPath = path.join(__dirname, "../anota-menu.json");

type MenuProduct = {
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
  categorySlug: string;
  categoryName: string;
};

async function main() {
  const menu = JSON.parse(fs.readFileSync(menuPath, "utf8")) as {
    categories: Array<{ name: string; slug: string }>;
    products: MenuProduct[];
  };

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, "burger-gn"))
    .limit(1);
  if (!company) throw new Error("company burger-gn not found — run migrate first");

  await db.delete(productsTable).where(eq(productsTable.companyId, company.id));

  const existingCats = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.companyId, company.id));
  const slugToId = new Map(existingCats.map((c) => [c.slug, c.id]));

  // deactivate non-anota categories
  const anotaSlugs = new Set(menu.categories.map((c) => c.slug));
  for (const c of existingCats) {
    if (!anotaSlugs.has(c.slug)) {
      await db.update(categoriesTable).set({ active: false }).where(eq(categoriesTable.id, c.id));
    }
  }

  let categoriesCreated = 0;
  for (const [i, cat] of menu.categories.entries()) {
    if (slugToId.has(cat.slug)) {
      await db
        .update(categoriesTable)
        .set({ name: cat.name, active: true, displayOrder: i })
        .where(eq(categoriesTable.id, slugToId.get(cat.slug)!));
      continue;
    }
    const [created] = await db
      .insert(categoriesTable)
      .values({
        companyId: company.id,
        name: cat.name,
        slug: cat.slug,
        displayOrder: i,
        active: true,
      })
      .returning();
    slugToId.set(cat.slug, created!.id);
    categoriesCreated += 1;
  }

  const addonSource = menu.products.filter((p) => p.categorySlug === "adicionais");
  const burgerAddons = addonSource.map((a) => ({
    name: a.name.replace(/^\+\s*/, "").trim(),
    price: a.price,
  }));

  let productsCreated = 0;
  for (const [i, prod] of menu.products.entries()) {
    const categoryId = slugToId.get(prod.categorySlug);
    if (!categoryId) continue;
    const isBurger =
      prod.categorySlug === "hamburguer-artesanal" ||
      prod.categorySlug === "combos-burger-gn";
    await db.insert(productsTable).values({
      companyId: company.id,
      name: prod.name,
      description: prod.description || "",
      price: prod.price.toFixed(2),
      image: prod.image || "",
      categoryId,
      available: prod.available,
      displayOrder: i,
      ingredients: [],
      addons: isBurger ? burgerAddons : [],
      videoUrl: "",
    });
    productsCreated += 1;
  }

  console.log(
    JSON.stringify(
      {
        companyId: company.id,
        categoriesCreated,
        productsCreated,
        addonOptions: burgerAddons.length,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
