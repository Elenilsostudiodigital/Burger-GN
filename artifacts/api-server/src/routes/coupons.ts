import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable, ordersTable } from "@workspace/db";
import { eq, sql, sum } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

function calcDiscount(discountType: "percentage" | "fixed", discountValue: number, subtotal: number): number {
  if (discountType === "percentage") {
    return Math.min(parseFloat((subtotal * discountValue / 100).toFixed(2)), subtotal);
  }
  return Math.min(discountValue, subtotal);
}

// Validate coupon (public)
router.post("/coupons/validate", async (req, res) => {
  try {
    const { code, subtotal } = req.body as { code: string; subtotal: number };
    if (!code || !subtotal) { res.status(400).json({ valid: false, message: "Dados inválidos" }); return; }

    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(sql`LOWER(code) = LOWER(${code})`);

    if (!coupon) { res.json({ valid: false, message: "Cupom não encontrado" }); return; }
    if (!coupon.active) { res.json({ valid: false, message: "Cupom inativo" }); return; }
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.json({ valid: false, message: "Cupom expirado" }); return;
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.json({ valid: false, message: "Cupom esgotado" }); return;
    }
    const minOrder = parseFloat(coupon.minOrderValue);
    if (subtotal < minOrder) {
      res.json({ valid: false, message: `Pedido mínimo de R$ ${minOrder.toFixed(2).replace(".", ",")}` }); return;
    }

    const discountAmount = calcDiscount(coupon.discountType, parseFloat(coupon.discountValue), subtotal);
    res.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: parseFloat(coupon.discountValue),
      discountAmount,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate coupon");
    res.status(500).json({ valid: false, message: "Erro interno" });
  }
});

// Stats (admin)
router.get("/admin/coupons/stats", requireAdmin, async (req, res) => {
  try {
    const [{ active }] = await db
      .select({ active: sql<number>`COUNT(*) FILTER (WHERE active = true)` })
      .from(couponsTable);
    const [{ totalDiscount }] = await db
      .select({ totalDiscount: sql<string>`COALESCE(SUM(discount_amount), 0)` })
      .from(ordersTable)
      .where(sql`coupon_code IS NOT NULL`);
    const [{ totalUses }] = await db
      .select({ totalUses: sql<number>`COALESCE(SUM(used_count), 0)` })
      .from(couponsTable);
    res.json({ active: Number(active), totalDiscount: parseFloat(totalDiscount ?? "0"), totalUses: Number(totalUses) });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch coupon stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List all coupons (admin)
router.get("/admin/coupons", requireAdmin, async (req, res) => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(couponsTable.createdAt);
    res.json(coupons);
  } catch (err) {
    req.log.error({ err }, "Failed to list coupons");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create coupon (admin)
router.post("/admin/coupons", requireAdmin, async (req, res) => {
  try {
    const body = req.body as {
      code: string;
      discountType: "percentage" | "fixed";
      discountValue: string;
      minOrderValue?: string;
      maxUses?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };
    if (!body.code || !body.discountType || !body.discountValue) {
      res.status(400).json({ error: "code, discountType and discountValue are required" }); return;
    }
    const [coupon] = await db.insert(couponsTable).values({
      code: body.code.toUpperCase().trim(),
      discountType: body.discountType,
      discountValue: body.discountValue,
      minOrderValue: body.minOrderValue ?? "0",
      maxUses: body.maxUses ?? null,
      active: body.active ?? true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }).returning();
    res.status(201).json(coupon);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create coupon");
    const msg = err instanceof Error && err.message.includes("unique") ? "Código já existe" : "Internal server error";
    res.status(msg === "Código já existe" ? 409 : 500).json({ error: msg });
  }
});

// Update coupon (admin)
router.put("/admin/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      code: string;
      discountType: "percentage" | "fixed";
      discountValue: string;
      minOrderValue: string;
      maxUses: number | null;
      active: boolean;
      expiresAt: string | null;
    }>;
    const updateData: Record<string, unknown> = { ...body };
    if (body.code) updateData["code"] = body.code.toUpperCase().trim();
    if (body.expiresAt !== undefined) updateData["expiresAt"] = body.expiresAt ? new Date(body.expiresAt) : null;
    const [coupon] = await db.update(couponsTable).set(updateData).where(eq(couponsTable.id, id)).returning();
    if (!coupon) { res.status(404).json({ error: "Not found" }); return; }
    res.json(coupon);
  } catch (err) {
    req.log.error({ err }, "Failed to update coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete coupon (admin)
router.delete("/admin/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { calcDiscount };
export default router;
