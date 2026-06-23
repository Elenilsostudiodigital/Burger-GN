import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_CATEGORIES = [
  { name: "Hambúrgueres", slug: "hamburguer", displayOrder: 0 },
  { name: "Combos", slug: "combo", displayOrder: 1 },
  { name: "Bebidas", slug: "bebida", displayOrder: 2 },
  { name: "Adicionais", slug: "adicional", displayOrder: 3 },
  { name: "Promoções", slug: "promocao", displayOrder: 4 },
];

const DEFAULT_PRODUCTS = [
  {
    name: "KING BURGER",
    description: "Pão com gergelim, hambúrguer 120g, cheddar, bacon crocante, alface, tomate, cebola roxa e molhos especiais.",
    price: "24.90",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
    categorySlug: "hamburguer",
    displayOrder: 0,
  },
  {
    name: "PANTANAL BURGER",
    description: "Pão batata, hambúrguer 120g, mussarela, alface americano, tomate, cebola roxa e molhos especiais.",
    price: "22.90",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop",
    categorySlug: "hamburguer",
    displayOrder: 1,
  },
  {
    name: "COMBO KING",
    description: "King Burger + Batata Frita + Refrigerante 350ml.",
    price: "39.90",
    image: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&h=300&fit=crop",
    categorySlug: "combo",
    displayOrder: 0,
  },
  {
    name: "Coca-Cola",
    description: "Lata 350ml gelada.",
    price: "6.00",
    image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=300&fit=crop",
    categorySlug: "bebida",
    displayOrder: 0,
  },
  {
    name: "Bacon Extra",
    description: "Porção adicional de bacon crocante.",
    price: "4.00",
    image: "https://images.unsplash.com/photo-1606852836067-7e4d44ff71c0?w=400&h=300&fit=crop",
    categorySlug: "adicional",
    displayOrder: 0,
  },
];

export async function runSeed() {
  try {
    const [{ value: catCount }] = await db.select({ value: count() }).from(categoriesTable);
    if (Number(catCount) === 0) {
      logger.info("Seeding default categories...");
      await db.insert(categoriesTable).values(DEFAULT_CATEGORIES);
    }

    const [{ value: prodCount }] = await db.select({ value: count() }).from(productsTable);
    if (Number(prodCount) === 0) {
      logger.info("Seeding default products...");
      const cats = await db.select().from(categoriesTable);
      const catMap = Object.fromEntries(cats.map(c => [c.slug, c.id]));
      await db.insert(productsTable).values(
        DEFAULT_PRODUCTS.map(p => ({
          name: p.name,
          description: p.description,
          price: p.price,
          image: p.image,
          categoryId: catMap[p.categorySlug] ?? null,
          displayOrder: p.displayOrder,
        }))
      );
    }
    logger.info("Seed complete.");
  } catch (err) {
    logger.error({ err }, "Seed failed (non-fatal)");
  }
}
