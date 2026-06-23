import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/products", async (req, res) => {
  try {
    const { category } = req.query as { category?: string };
    const conditions = [eq(productsTable.available, true)];
    if (category) {
      const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, category));
      if (cat) conditions.push(eq(productsTable.categoryId, cat.id));
    }
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        categoryId: productsTable.categoryId,
        image: productsTable.image,
        available: productsTable.available,
        displayOrder: productsTable.displayOrder,
        categorySlug: categoriesTable.slug,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(...conditions))
      .orderBy(asc(productsTable.displayOrder));
    res.json(products);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/products", requireAdmin, async (req, res) => {
  try {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        categoryId: productsTable.categoryId,
        image: productsTable.image,
        available: productsTable.available,
        displayOrder: productsTable.displayOrder,
        categorySlug: categoriesTable.slug,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .orderBy(asc(productsTable.displayOrder));
    res.json(products);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch all products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/products", requireAdmin, async (req, res) => {
  try {
    const { name, description, price, categoryId, image, available, displayOrder } = req.body as {
      name: string; description?: string; price: string; categoryId?: number; image?: string; available?: boolean; displayOrder?: number;
    };
    if (!name || !price) { res.status(400).json({ error: "name and price are required" }); return; }
    const [prod] = await db.insert(productsTable).values({
      name, description: description ?? "", price, categoryId: categoryId ?? null, image: image ?? "", available: available ?? true, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(prod);
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as { name?: string; description?: string; price?: string; categoryId?: number | null; image?: string; available?: boolean; displayOrder?: number };
    const [prod] = await db.update(productsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
    if (!prod) { res.status(404).json({ error: "Not found" }); return; }
    res.json(prod);
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
