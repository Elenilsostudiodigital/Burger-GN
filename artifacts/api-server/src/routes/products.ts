import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { enrichProductMarketing, isPromoExpired } from "../lib/productMarketing";
import { ensureProductMarketingSchema } from "../lib/ensureProductMarketingSchema";

const router = Router();

const marketingColumns = {
  isFeatured: productsTable.isFeatured,
  isPromotion: productsTable.isPromotion,
  isBestseller: productsTable.isBestseller,
  isNew: productsTable.isNew,
  isFlashOffer: productsTable.isFlashOffer,
  isClubeExclusive: productsTable.isClubeExclusive,
  promoOriginalPrice: productsTable.promoOriginalPrice,
  promoPrice: productsTable.promoPrice,
  promoStartsAt: productsTable.promoStartsAt,
  promoEndsAt: productsTable.promoEndsAt,
  marketingBadge: productsTable.marketingBadge,
};

async function clearExpiredPromotion(companyId: number, productId: number) {
  await db
    .update(productsTable)
    .set({
      isPromotion: false,
      isFlashOffer: false,
      updatedAt: new Date(),
    })
    .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
}

function mapProductRow(p: Record<string, unknown>) {
  const marketing = enrichProductMarketing(p as Parameters<typeof enrichProductMarketing>[0]);
  if (marketing.promoExpired) {
    // Fire-and-forget DB clear; response already shows normal price
    const id = Number(p.id);
    const companyId = Number(p.companyId ?? 0);
    if (id && companyId) {
      clearExpiredPromotion(companyId, id).catch(() => {});
    }
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    price: p.price,
    categoryId: p.categoryId,
    image: p.image ?? "",
    videoUrl: p.videoUrl ?? "",
    ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
    addons: Array.isArray(p.addons) ? p.addons : [],
    available: p.available,
    displayOrder: p.displayOrder,
    categorySlug: p.categorySlug ?? null,
    categoryName: p.categoryName ?? null,
    ...marketing,
    // If expired, reflect cleared promotion in payload
    isPromotion: marketing.isPromotion,
    isFlashOffer: marketing.promoExpired ? false : marketing.isFlashOffer,
  };
}

router.get("/products", resolvePublicCompany, async (req, res) => {
  try {
    await ensureProductMarketingSchema();
    const { category } = req.query as { category?: string };
    const conditions = [eq(productsTable.companyId, req.companyId!), eq(productsTable.available, true)];
    if (category) {
      const [cat] = await db
        .select()
        .from(categoriesTable)
        .where(and(eq(categoriesTable.companyId, req.companyId!), eq(categoriesTable.slug, category)));
      if (cat) conditions.push(eq(productsTable.categoryId, cat.id));
    }
    const products = await db
      .select({
        id: productsTable.id,
        companyId: productsTable.companyId,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        categoryId: productsTable.categoryId,
        image: productsTable.image,
        videoUrl: productsTable.videoUrl,
        ingredients: productsTable.ingredients,
        addons: productsTable.addons,
        available: productsTable.available,
        displayOrder: productsTable.displayOrder,
        categorySlug: categoriesTable.slug,
        categoryName: categoriesTable.name,
        ...marketingColumns,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(...conditions))
      .orderBy(asc(productsTable.displayOrder));

    // Eagerly clear expired promos before mapping
    const now = new Date();
    await Promise.all(
      products
        .filter((p) => isPromoExpired(p, now))
        .map((p) => clearExpiredPromotion(req.companyId!, p.id)),
    );

    res.json(products.map((p) => mapProductRow(p as unknown as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/products", requireCompanyAuth, async (req, res) => {
  try {
    await ensureProductMarketingSchema();
    const products = await db
      .select({
        id: productsTable.id,
        companyId: productsTable.companyId,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        categoryId: productsTable.categoryId,
        image: productsTable.image,
        videoUrl: productsTable.videoUrl,
        ingredients: productsTable.ingredients,
        addons: productsTable.addons,
        available: productsTable.available,
        displayOrder: productsTable.displayOrder,
        categorySlug: categoriesTable.slug,
        categoryName: categoriesTable.name,
        ...marketingColumns,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.companyId, req.companyId!))
      .orderBy(asc(productsTable.displayOrder));

    const now = new Date();
    await Promise.all(
      products
        .filter((p) => isPromoExpired(p, now))
        .map((p) => clearExpiredPromotion(req.companyId!, p.id)),
    );

    res.json(products.map((p) => mapProductRow(p as unknown as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch all products");
    res.status(500).json({ error: "Internal server error" });
  }
});

function sanitizeAddons(raw: unknown): { name: string; price: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is { name?: unknown; price?: unknown } => typeof a === "object" && a !== null)
    .map((a) => ({ name: String(a.name ?? "").trim(), price: Number(a.price) || 0 }))
    .filter((a) => a.name.length > 0 && a.price >= 0);
}

function sanitizeIngredients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i) => String(i).trim()).filter((i) => i.length > 0);
}

function parseOptionalDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalMoney(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

const BADGES = new Set(["", "promotion", "featured", "flash", "new", "bestseller", "clube"]);

function pickMarketing(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.isFeatured !== undefined) out.isFeatured = !!body.isFeatured;
  if (body.isPromotion !== undefined) out.isPromotion = !!body.isPromotion;
  if (body.isBestseller !== undefined) out.isBestseller = !!body.isBestseller;
  if (body.isNew !== undefined) out.isNew = !!body.isNew;
  if (body.isFlashOffer !== undefined) out.isFlashOffer = !!body.isFlashOffer;
  if (body.isClubeExclusive !== undefined) out.isClubeExclusive = !!body.isClubeExclusive;
  if (body.promoOriginalPrice !== undefined) out.promoOriginalPrice = parseOptionalMoney(body.promoOriginalPrice);
  if (body.promoPrice !== undefined) out.promoPrice = parseOptionalMoney(body.promoPrice);
  if (body.promoStartsAt !== undefined) out.promoStartsAt = parseOptionalDate(body.promoStartsAt);
  if (body.promoEndsAt !== undefined) out.promoEndsAt = parseOptionalDate(body.promoEndsAt);
  if (body.marketingBadge !== undefined) {
    const b = String(body.marketingBadge || "");
    out.marketingBadge = BADGES.has(b) ? b : "";
  }
  return out;
}

router.post("/admin/products", requireCompanyAuth, async (req, res) => {
  try {
    await ensureProductMarketingSchema();
    const body = req.body as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const price = String(body.price ?? "").trim();
    if (!name || !price) {
      res.status(400).json({ error: "name and price are required" });
      return;
    }
    const marketing = pickMarketing(body);
    const [prod] = await db
      .insert(productsTable)
      .values({
        companyId: req.companyId!,
        name,
        description: String(body.description ?? ""),
        price,
        categoryId: body.categoryId != null && body.categoryId !== "" ? Number(body.categoryId) : null,
        image: String(body.image ?? ""),
        videoUrl: String(body.videoUrl ?? ""),
        ingredients: sanitizeIngredients(body.ingredients),
        addons: sanitizeAddons(body.addons),
        available: body.available !== undefined ? !!body.available : true,
        displayOrder: Number(body.displayOrder) || 0,
        ...marketing,
      })
      .returning();
    res.status(201).json(mapProductRow({ ...prod, categorySlug: null, categoryName: null }));
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/products/:id", requireCompanyAuth, async (req, res) => {
  try {
    await ensureProductMarketingSchema();
    const id = Number(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const { ingredients, addons, ...rest } = body;
    const updateValues: Record<string, unknown> = {
      ...pickMarketing(rest),
      updatedAt: new Date(),
    };
    if (rest.name !== undefined) updateValues.name = String(rest.name);
    if (rest.description !== undefined) updateValues.description = String(rest.description);
    if (rest.price !== undefined) updateValues.price = String(rest.price);
    if (rest.categoryId !== undefined) {
      updateValues.categoryId =
        rest.categoryId === null || rest.categoryId === "" ? null : Number(rest.categoryId);
    }
    if (rest.image !== undefined) updateValues.image = String(rest.image);
    if (rest.videoUrl !== undefined) updateValues.videoUrl = String(rest.videoUrl);
    if (rest.available !== undefined) updateValues.available = !!rest.available;
    if (rest.displayOrder !== undefined) updateValues.displayOrder = Number(rest.displayOrder) || 0;
    if (ingredients !== undefined) updateValues.ingredients = sanitizeIngredients(ingredients);
    if (addons !== undefined) updateValues.addons = sanitizeAddons(addons);

    // When enabling promotion without original price, snapshot current price
    if (updateValues.isPromotion === true && updateValues.promoOriginalPrice == null) {
      const [current] = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)));
      if (current && !current.promoOriginalPrice) {
        updateValues.promoOriginalPrice = current.price;
      }
    }

    const [prod] = await db
      .update(productsTable)
      .set(updateValues)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)))
      .returning();
    if (!prod) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(mapProductRow({ ...prod, categorySlug: null, categoryName: null }));
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Quick promotion modal — does not require full product edit. */
router.patch("/admin/products/:id/promotion", requireCompanyAuth, async (req, res) => {
  try {
    await ensureProductMarketingSchema();
    const id = Number(req.params["id"]);
    const body = req.body as {
      promoPrice?: string | number;
      promoStartsAt?: string | null;
      promoEndsAt?: string | null;
      clear?: boolean;
    };

    const [current] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)));
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (body.clear) {
      const [prod] = await db
        .update(productsTable)
        .set({
          isPromotion: false,
          isFlashOffer: false,
          promoPrice: null,
          promoStartsAt: null,
          promoEndsAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)))
        .returning();
      res.json(mapProductRow({ ...prod!, categorySlug: null, categoryName: null }));
      return;
    }

    const promoPrice = parseOptionalMoney(body.promoPrice);
    if (!promoPrice) {
      res.status(400).json({ error: "Informe o preço promocional." });
      return;
    }
    const starts = parseOptionalDate(body.promoStartsAt);
    const ends = parseOptionalDate(body.promoEndsAt);
    if (starts && ends && ends < starts) {
      res.status(400).json({ error: "A data final deve ser após a data inicial." });
      return;
    }

    const [prod] = await db
      .update(productsTable)
      .set({
        isPromotion: true,
        promoPrice,
        promoOriginalPrice: current.promoOriginalPrice || current.price,
        promoStartsAt: starts,
        promoEndsAt: ends,
        marketingBadge: current.marketingBadge || "promotion",
        updatedAt: new Date(),
      })
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)))
      .returning();

    res.json(mapProductRow({ ...prod!, categorySlug: null, categoryName: null }));
  } catch (err) {
    req.log.error({ err }, "Failed to update product promotion");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/products/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, req.companyId!)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
