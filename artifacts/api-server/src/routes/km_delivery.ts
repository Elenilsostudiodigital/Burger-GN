import { Router } from "express";
import { db } from "@workspace/db";
import { kmDeliveryConfigTable, kmDeliveryTiersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ── Utility functions ─────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findKmTier(
  distanceKm: number,
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }>
): { fee: number | null; consult: boolean } {
  const sorted = [...tiers].sort((a, b) => parseFloat(a.fromKm) - parseFloat(b.fromKm));
  for (const tier of sorted) {
    const from = parseFloat(tier.fromKm);
    const to = tier.toKm !== null ? parseFloat(tier.toKm) : Infinity;
    if (distanceKm >= from && distanceKm <= to) {
      return { fee: tier.fee !== null ? parseFloat(tier.fee) : null, consult: tier.fee === null };
    }
  }
  return { fee: null, consult: true };
}

// ── Public routes ─────────────────────────────────────────────────────────────

// Get KM config + tiers (for checkout use)
router.get("/delivery/km-config", async (req, res) => {
  try {
    const [config] = await db.select().from(kmDeliveryConfigTable).limit(1);
    if (!config) { res.json({ enabled: false, tiers: [] }); return; }
    const tiers = await db.select().from(kmDeliveryTiersTable).orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json({ ...config, tiers });
  } catch (err) {
    req.log.error({ err }, "Failed to get km config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Calculate delivery fee by coordinates (public)
router.post("/delivery/calculate-fee", async (req, res) => {
  try {
    const { lat, lng } = req.body as { lat: number; lng: number };
    if (typeof lat !== "number" || typeof lng !== "number") {
      res.status(400).json({ error: "lat and lng required" }); return;
    }

    const [config] = await db.select().from(kmDeliveryConfigTable).limit(1);
    if (!config || !config.enabled) { res.json({ enabled: false }); return; }

    const baseLat = parseFloat(config.baseLat);
    const baseLng = parseFloat(config.baseLng);
    if (baseLat === 0 && baseLng === 0) { res.json({ enabled: false, reason: "base location not set" }); return; }

    const distanceKm = haversineKm(baseLat, baseLng, lat, lng);
    const maxDist = parseFloat(config.maxDistanceKm);

    if (distanceKm > maxDist) {
      res.json({
        enabled: true, distanceKm: parseFloat(distanceKm.toFixed(2)),
        fee: null, consult: true,
        message: "Área fora do raio de entrega. Consulte pelo WhatsApp.",
      }); return;
    }

    const tiers = await db.select().from(kmDeliveryTiersTable).orderBy(asc(kmDeliveryTiersTable.displayOrder));
    const { fee, consult } = findKmTier(distanceKm, tiers);

    res.json({
      enabled: true,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      fee,
      consult,
      message: consult ? "Consulte a taxa de entrega pelo WhatsApp." : undefined,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to calculate fee");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// Get config
router.get("/admin/km-delivery", requireAdmin, async (req, res) => {
  try {
    const [config] = await db.select().from(kmDeliveryConfigTable).limit(1);
    const tiers = await db.select().from(kmDeliveryTiersTable).orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json({ config: config ?? null, tiers });
  } catch (err) {
    req.log.error({ err }, "Failed to get km delivery config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update config (upsert)
router.put("/admin/km-delivery", requireAdmin, async (req, res) => {
  try {
    const body = req.body as {
      enabled?: boolean; baseAddress?: string;
      baseLat?: string; baseLng?: string;
      minFee?: string; feePerKm?: string; maxDistanceKm?: string;
    };
    const [existing] = await db.select().from(kmDeliveryConfigTable).limit(1);
    if (existing) {
      const [updated] = await db.update(kmDeliveryConfigTable)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(kmDeliveryConfigTable.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(kmDeliveryConfigTable).values({ ...body }).returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update km delivery config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List tiers
router.get("/admin/km-delivery/tiers", requireAdmin, async (req, res) => {
  try {
    const tiers = await db.select().from(kmDeliveryTiersTable).orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json(tiers);
  } catch (err) {
    req.log.error({ err }, "Failed to list tiers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create tier
router.post("/admin/km-delivery/tiers", requireAdmin, async (req, res) => {
  try {
    const { fromKm, toKm, fee, displayOrder } = req.body as {
      fromKm: string; toKm?: string | null; fee?: string | null; displayOrder?: number;
    };
    if (!fromKm) { res.status(400).json({ error: "fromKm is required" }); return; }
    const [tier] = await db.insert(kmDeliveryTiersTable).values({
      fromKm, toKm: toKm ?? null, fee: fee ?? null, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(tier);
  } catch (err) {
    req.log.error({ err }, "Failed to create tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tier
router.put("/admin/km-delivery/tiers/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { fromKm, toKm, fee, displayOrder } = req.body as {
      fromKm?: string; toKm?: string | null; fee?: string | null; displayOrder?: number;
    };
    const patch: Record<string, unknown> = {};
    if (fromKm !== undefined) patch["fromKm"] = fromKm;
    if (toKm !== undefined) patch["toKm"] = toKm;
    if (fee !== undefined) patch["fee"] = fee;
    if (displayOrder !== undefined) patch["displayOrder"] = displayOrder;
    const [tier] = await db.update(kmDeliveryTiersTable).set(patch).where(eq(kmDeliveryTiersTable.id, id)).returning();
    if (!tier) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tier);
  } catch (err) {
    req.log.error({ err }, "Failed to update tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete tier
router.delete("/admin/km-delivery/tiers/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(kmDeliveryTiersTable).where(eq(kmDeliveryTiersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
