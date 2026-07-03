import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";

const router = Router();

interface DraftProduct {
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
  categorySlug: string;
  categoryName: string;
}

interface DraftCategory {
  name: string;
  slug: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const NOISE_LINE = /^(esgotado|5% cashback|\d+% cashback|sem pedido m[ií]nimo|perfil da loja|loja online|loja offline|aproveite j[aá]!?)$/i;
const PRICE_LINE = /^r\$\s*([\d.,]+)$/i;
const IMAGE_LINE = /^!\[[^\]]*\]\(([^)]+)\)$/;
const NO_IMAGE_MARKERS = ["item_no_image"];

function parseMenuText(raw: string): { categories: DraftCategory[]; products: DraftProduct[] } {
  const lines = raw.split(/\r?\n/).map(l => l.trim());
  const categories: DraftCategory[] = [];
  const products: DraftProduct[] = [];
  const seenSlugs = new Set<string>();

  let currentCategory: DraftCategory | null = null;
  let pendingName: string | null = null;
  let pendingDescLines: string[] = [];
  let pendingPrice: number | null = null;
  let pendingImage = "";
  let pendingAvailable = true;

  const flushProduct = () => {
    if (pendingName && pendingPrice !== null && currentCategory) {
      products.push({
        name: pendingName,
        description: pendingDescLines.join(" ").trim(),
        price: pendingPrice,
        image: pendingImage,
        available: pendingAvailable,
        categorySlug: currentCategory.slug,
        categoryName: currentCategory.name,
      });
    }
    pendingName = null;
    pendingDescLines = [];
    pendingPrice = null;
    pendingImage = "";
    pendingAvailable = true;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\\/, "");
    if (!line) continue;

    if (line.startsWith("## ") && !line.startsWith("###")) {
      flushProduct();
      const name = line.replace(/^##\s*/, "").trim();
      if (!name) continue;
      const slug = slugify(name);
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        categories.push({ name, slug });
      }
      currentCategory = { name, slug };
      continue;
    }

    if (line.startsWith("### ")) {
      flushProduct();
      pendingName = line.replace(/^###\s*/, "").trim();
      continue;
    }

    if (!pendingName) continue;

    if (NOISE_LINE.test(line)) {
      if (/^esgotado$/i.test(line)) pendingAvailable = false;
      continue;
    }

    const priceMatch = line.match(PRICE_LINE);
    if (priceMatch) {
      const numeric = priceMatch[1]!.replace(/\./g, "").replace(",", ".");
      pendingPrice = parseFloat(numeric);
      continue;
    }

    const imageMatch = line.match(IMAGE_LINE);
    if (imageMatch) {
      const url = imageMatch[1]!;
      if (!NO_IMAGE_MARKERS.some(marker => url.includes(marker))) {
        pendingImage = url;
      }
      continue;
    }

    if (pendingPrice === null) {
      pendingDescLines.push(line);
    }
  }
  flushProduct();

  return { categories, products };
}

router.post("/admin/import/parse", requireCompanyAuth, (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const draft = parseMenuText(text);
    res.json(draft);
  } catch (err) {
    req.log.error({ err }, "Failed to parse import text");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/import/fetch-link", requireCompanyAuth, async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) { res.status(400).json({ error: "url is required" }); return; }
    let html = "";
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      html = await response.text();
    } catch (fetchErr) {
      req.log.error({ err: fetchErr }, "Failed to fetch import link");
      res.status(502).json({ error: "Não foi possível acessar o link informado." });
      return;
    }
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n");
    const draft = parseMenuText(text);
    if (draft.products.length === 0) {
      res.status(422).json({
        error: "Não foi possível extrair produtos automaticamente deste link (provavelmente carregado via JavaScript). Copie e cole o conteúdo do cardápio na aba \"Colar texto\".",
      });
      return;
    }
    res.json(draft);
  } catch (err) {
    req.log.error({ err }, "Failed to process import link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/import/commit", requireCompanyAuth, async (req, res) => {
  try {
    const { categories, products } = req.body as {
      categories: DraftCategory[];
      products: (DraftProduct & { include?: boolean })[];
    };
    if (!Array.isArray(categories) || !Array.isArray(products)) {
      res.status(400).json({ error: "categories and products arrays are required" });
      return;
    }

    const companyId = req.companyId!;
    const existingCategories = await db.select().from(categoriesTable).where(eq(categoriesTable.companyId, companyId));
    const slugToId = new Map(existingCategories.map(c => [c.slug, c.id]));
    let categoriesCreated = 0;
    let maxOrder = existingCategories.reduce((m, c) => Math.max(m, c.displayOrder), -1);

    for (const cat of categories) {
      if (slugToId.has(cat.slug)) continue;
      maxOrder += 1;
      const [created] = await db.insert(categoriesTable).values({
        companyId, name: cat.name, slug: cat.slug, displayOrder: maxOrder,
      }).returning();
      if (created) {
        slugToId.set(cat.slug, created.id);
        categoriesCreated += 1;
      }
    }

    const existingProducts = await db.select({ name: productsTable.name, categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(eq(productsTable.companyId, companyId));
    const existingKey = new Set(existingProducts.map(p => `${p.categoryId}::${p.name.toLowerCase().trim()}`));

    let productsCreated = 0;
    let productsSkipped = 0;
    for (const prod of products) {
      if (prod.include === false) continue;
      const categoryId = slugToId.get(prod.categorySlug) ?? null;
      const key = `${categoryId}::${prod.name.toLowerCase().trim()}`;
      if (categoryId !== null && existingKey.has(key)) {
        productsSkipped += 1;
        continue;
      }
      await db.insert(productsTable).values({
        companyId,
        name: prod.name,
        description: prod.description ?? "",
        price: prod.price.toFixed(2),
        image: prod.image ?? "",
        categoryId,
        available: prod.available ?? true,
        displayOrder: 0,
      });
      if (categoryId !== null) existingKey.add(key);
      productsCreated += 1;
    }

    res.json({ ok: true, categoriesCreated, productsCreated, productsSkipped });
  } catch (err) {
    req.log.error({ err }, "Failed to commit import");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
