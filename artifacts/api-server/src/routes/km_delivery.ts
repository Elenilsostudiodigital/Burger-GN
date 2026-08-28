import { Router } from "express";
import { db } from "@workspace/db";
import { kmDeliveryConfigTable, kmDeliveryTiersTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";

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
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }> | null | undefined
): { fee: number | null; consult: boolean } {
  if (!Array.isArray(tiers) || tiers.length === 0 || !Number.isFinite(distanceKm)) {
    return { fee: null, consult: true };
  }
  const sorted = [...tiers].sort((a, b) => parseFloat(String(a.fromKm)) - parseFloat(String(b.fromKm)));
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]!;
    const from = parseFloat(String(tier.fromKm));
    const explicitTo = tier.toKm !== null && tier.toKm !== undefined ? parseFloat(String(tier.toKm)) : Infinity;
    const nextFrom = i + 1 < sorted.length ? parseFloat(String(sorted[i + 1]!.fromKm)) : NaN;
    if (!Number.isFinite(from)) continue;
    const inBand =
      Number.isFinite(nextFrom) && nextFrom > from
        ? distanceKm >= from && distanceKm < nextFrom
        : distanceKm >= from && distanceKm <= explicitTo;
    if (inBand) {
      return { fee: tier.fee !== null && tier.fee !== undefined ? parseFloat(String(tier.fee)) : null, consult: tier.fee === null };
    }
  }
  return { fee: null, consult: true };
}

// ── Public routes ─────────────────────────────────────────────────────────────

// Get KM config + tiers (for checkout use)
router.get("/delivery/km-config", resolvePublicCompany, async (req, res) => {
  try {
    const [config] = await db.select().from(kmDeliveryConfigTable).where(eq(kmDeliveryConfigTable.companyId, req.companyId!));
    if (!config) { res.json({ enabled: false, areasEnabled: false, neighborhoodsEnabled: false, tiers: [] }); return; }
    const tiers = await db.select().from(kmDeliveryTiersTable)
      .where(eq(kmDeliveryTiersTable.companyId, req.companyId!))
      .orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json({ ...config, tiers });
  } catch (err) {
    req.log.error({ err }, "Failed to get km config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Calculate delivery fee by coordinates (public)
router.post("/delivery/calculate-fee", resolvePublicCompany, async (req, res) => {
  try {
    const { lat, lng } = req.body as { lat: number; lng: number };
    if (typeof lat !== "number" || typeof lng !== "number") {
      res.status(400).json({ error: "lat and lng required" }); return;
    }

    const [config] = await db.select().from(kmDeliveryConfigTable).where(eq(kmDeliveryConfigTable.companyId, req.companyId!));
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

    const tiers = await db.select().from(kmDeliveryTiersTable)
      .where(eq(kmDeliveryTiersTable.companyId, req.companyId!))
      .orderBy(asc(kmDeliveryTiersTable.displayOrder));
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
router.get("/admin/km-delivery", requireCompanyAuth, async (req, res) => {
  try {
    const [config] = await db.select().from(kmDeliveryConfigTable).where(eq(kmDeliveryConfigTable.companyId, req.companyId!));
    const tiers = await db.select().from(kmDeliveryTiersTable)
      .where(eq(kmDeliveryTiersTable.companyId, req.companyId!))
      .orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json({ config: config ?? null, tiers });
  } catch (err) {
    req.log.error({ err }, "Failed to get km delivery config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update config (upsert)
router.put("/admin/km-delivery", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      enabled?: boolean; baseAddress?: string;
      baseLat?: string; baseLng?: string;
      minFee?: string; feePerKm?: string; maxDistanceKm?: string;
      areasEnabled?: boolean;
    };
    const [existing] = await db.select().from(kmDeliveryConfigTable).where(eq(kmDeliveryConfigTable.companyId, req.companyId!));
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.enabled !== undefined) patch["enabled"] = Boolean(body.enabled);
      if (body.baseAddress !== undefined) patch["baseAddress"] = String(body.baseAddress);
      if (body.baseLat !== undefined) patch["baseLat"] = String(body.baseLat);
      if (body.baseLng !== undefined) patch["baseLng"] = String(body.baseLng);
      if (body.minFee !== undefined) patch["minFee"] = String(body.minFee);
      if (body.feePerKm !== undefined) patch["feePerKm"] = String(body.feePerKm);
      if (body.maxDistanceKm !== undefined) patch["maxDistanceKm"] = String(body.maxDistanceKm);
      if (body.areasEnabled !== undefined) patch["areasEnabled"] = Boolean(body.areasEnabled);
      const [updated] = await db.update(kmDeliveryConfigTable)
        .set(patch)
        .where(and(eq(kmDeliveryConfigTable.id, existing.id), eq(kmDeliveryConfigTable.companyId, req.companyId!)))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(kmDeliveryConfigTable).values({
        companyId: req.companyId!,
        enabled: Boolean(body.enabled),
        baseAddress: String(body.baseAddress ?? ""),
        baseLat: String(body.baseLat ?? "0"),
        baseLng: String(body.baseLng ?? "0"),
        minFee: String(body.minFee ?? "5.00"),
        feePerKm: String(body.feePerKm ?? "2.00"),
        maxDistanceKm: String(body.maxDistanceKm ?? "10.00"),
        areasEnabled: Boolean(body.areasEnabled),
        neighborhoodsEnabled: false,
      }).returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update km delivery config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List tiers
router.get("/admin/km-delivery/tiers", requireCompanyAuth, async (req, res) => {
  try {
    const tiers = await db.select().from(kmDeliveryTiersTable)
      .where(eq(kmDeliveryTiersTable.companyId, req.companyId!))
      .orderBy(asc(kmDeliveryTiersTable.displayOrder));
    res.json(tiers);
  } catch (err) {
    req.log.error({ err }, "Failed to list tiers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create tier
router.post("/admin/km-delivery/tiers", requireCompanyAuth, async (req, res) => {
  try {
    const { fromKm, toKm, fee, displayOrder } = req.body as {
      fromKm: string; toKm?: string | null; fee?: string | null; displayOrder?: number;
    };
    if (!fromKm) { res.status(400).json({ error: "fromKm is required" }); return; }
    const [tier] = await db.insert(kmDeliveryTiersTable).values({
      companyId: req.companyId!, fromKm, toKm: toKm ?? null, fee: fee ?? null, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(tier);
  } catch (err) {
    req.log.error({ err }, "Failed to create tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tier
router.put("/admin/km-delivery/tiers/:id", requireCompanyAuth, async (req, res) => {
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
    const [tier] = await db.update(kmDeliveryTiersTable).set(patch)
      .where(and(eq(kmDeliveryTiersTable.id, id), eq(kmDeliveryTiersTable.companyId, req.companyId!)))
      .returning();
    if (!tier) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tier);
  } catch (err) {
    req.log.error({ err }, "Failed to update tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete tier
router.delete("/admin/km-delivery/tiers/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(kmDeliveryTiersTable).where(and(eq(kmDeliveryTiersTable.id, id), eq(kmDeliveryTiersTable.companyId, req.companyId!)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete tier");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
