import { Router } from "express";
import { db } from "@workspace/db";
import { deliveryZonesTable } from "@workspace/db";
import { eq, sql, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// List active zones (public — for checkout dropdown)
router.get("/delivery-zones", async (req, res) => {
  try {
    const zones = await db
      .select()
      .from(deliveryZonesTable)
      .where(eq(deliveryZonesTable.active, true))
      .orderBy(asc(deliveryZonesTable.neighborhood));
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery zones");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get fee by neighborhood (public)
// Query: GET /api/delivery-zones/fee?neighborhood=Itinga
router.get("/delivery-zones/fee", async (req, res) => {
  try {
    const { neighborhood } = req.query as { neighborhood?: string };
    if (!neighborhood) { res.status(400).json({ error: "neighborhood query param required" }); return; }

    const [zone] = await db
      .select()
      .from(deliveryZonesTable)
      .where(sql`LOWER(neighborhood) = LOWER(${neighborhood})`);

    if (!zone) {
      res.json({ found: false, neighborhood, fee: null, message: "Consulte a taxa de entrega pelo WhatsApp." });
      return;
    }
    if (!zone.active) {
      res.json({ found: false, neighborhood, fee: null, message: "Entrega indisponível neste bairro no momento." });
      return;
    }
    res.json({ found: true, neighborhood: zone.neighborhood, fee: parseFloat(zone.fee), zoneId: zone.id });
  } catch (err) {
    req.log.error({ err }, "Failed to get delivery fee");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: list all zones
router.get("/admin/delivery-zones", requireAdmin, async (req, res) => {
  try {
    const zones = await db.select().from(deliveryZonesTable).orderBy(asc(deliveryZonesTable.neighborhood));
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "Failed to list all delivery zones");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: create zone
router.post("/admin/delivery-zones", requireAdmin, async (req, res) => {
  try {
    const { neighborhood, fee, active } = req.body as { neighborhood: string; fee: string; active?: boolean };
    if (!neighborhood || !fee) {
      res.status(400).json({ error: "neighborhood and fee are required" }); return;
    }
    const [zone] = await db.insert(deliveryZonesTable).values({
      neighborhood: neighborhood.trim(),
      fee: parseFloat(fee).toFixed(2),
      active: active ?? true,
    }).returning();
    res.status(201).json(zone);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create delivery zone");
    const msg = err instanceof Error && err.message.includes("unique") ? "Bairro já cadastrado" : "Internal server error";
    res.status(msg === "Bairro já cadastrado" ? 409 : 500).json({ error: msg });
  }
});

// Admin: update zone
router.put("/admin/delivery-zones/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { neighborhood, fee, active } = req.body as { neighborhood?: string; fee?: string; active?: boolean };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (neighborhood !== undefined) patch["neighborhood"] = neighborhood.trim();
    if (fee !== undefined) patch["fee"] = parseFloat(fee).toFixed(2);
    if (active !== undefined) patch["active"] = active;
    const [zone] = await db.update(deliveryZonesTable).set(patch).where(eq(deliveryZonesTable.id, id)).returning();
    if (!zone) { res.status(404).json({ error: "Not found" }); return; }
    res.json(zone);
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery zone");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: delete zone
router.delete("/admin/delivery-zones/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(deliveryZonesTable).where(eq(deliveryZonesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete delivery zone");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
