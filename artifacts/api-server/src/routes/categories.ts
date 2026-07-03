import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";

const router = Router();

router.get("/categories", resolvePublicCompany, async (req, res) => {
  try {
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.companyId, req.companyId!), eq(categoriesTable.active, true)))
      .orderBy(asc(categoriesTable.displayOrder));
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/categories", requireCompanyAuth, async (req, res) => {
  try {
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.companyId, req.companyId!))
      .orderBy(asc(categoriesTable.displayOrder));
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch all categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/categories", requireCompanyAuth, async (req, res) => {
  try {
    const { name, slug, displayOrder } = req.body as { name: string; slug: string; displayOrder?: number };
    if (!name || !slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }
    const [cat] = await db.insert(categoriesTable).values({
      companyId: req.companyId!, name, slug, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(cat);
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/categories/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { name, slug, displayOrder, active } = req.body as { name?: string; slug?: string; displayOrder?: number; active?: boolean };
    const [cat] = await db.update(categoriesTable)
      .set({ ...(name ? { name } : {}), ...(slug ? { slug } : {}), ...(displayOrder !== undefined ? { displayOrder } : {}), ...(active !== undefined ? { active } : {}) })
      .where(and(eq(categoriesTable.id, id), eq(categoriesTable.companyId, req.companyId!)))
      .returning();
    if (!cat) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cat);
  } catch (err) {
    req.log.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/categories/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(categoriesTable).where(and(eq(categoriesTable.id, id), eq(categoriesTable.companyId, req.companyId!)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
