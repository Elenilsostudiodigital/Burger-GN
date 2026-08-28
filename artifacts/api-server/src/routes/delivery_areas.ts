import { Router } from "express";
import { db } from "@workspace/db";
import {
  deliveryAreasTable,
  kmDeliveryConfigTable,
  kmDeliveryTiersTable,
  type DeliveryArea,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { ensureDeliveryAreasSchema } from "../lib/ensureDeliveryAreasSchema";
import {
  computeBbox,
  normalizePolygon,
  resolvePointInAreas,
} from "../lib/deliveryAreas";

const router = Router();

function serializeArea(row: DeliveryArea) {
  return {
    id: row.id,
    companyId: row.companyId,
    city: row.city,
    name: row.name,
    color: row.color,
    status: row.status,
    enabled: row.enabled,
    blockReason: row.blockReason,
    minFee: row.minFee,
    feePerKm: row.feePerKm,
    maxDistanceKm: row.maxDistanceKm,
    notes: row.notes,
    priority: row.priority,
    polygon: row.polygon,
    bbox: row.bbox,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseStatus(raw: unknown): "active" | "blocked" | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "active" || s === "blocked") return s;
  return null;
}

function parseMoney(raw: unknown, fallback = 0): string {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0) return String(fallback.toFixed(2));
  return n.toFixed(2);
}

async function getAreasEnabled(companyId: number): Promise<boolean> {
  const [config] = await db
    .select()
    .from(kmDeliveryConfigTable)
    .where(eq(kmDeliveryConfigTable.companyId, companyId))
    .limit(1);
  return Boolean(config?.areasEnabled);
}

async function getBaseCoords(companyId: number): Promise<{ lat: number; lng: number }> {
  const [config] = await db
    .select()
    .from(kmDeliveryConfigTable)
    .where(eq(kmDeliveryConfigTable.companyId, companyId))
    .limit(1);
  return {
    lat: parseFloat(String(config?.baseLat ?? 0)),
    lng: parseFloat(String(config?.baseLng ?? 0)),
  };
}

// ── Public: resolve customer point → area / fee ───────────────────────────────

router.post("/delivery/resolve-area", resolvePublicCompany, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const body = req.body as { lat?: number; lng?: number };
    const lat = typeof body.lat === "number" ? body.lat : parseFloat(String(body.lat ?? ""));
    const lng = typeof body.lng === "number" ? body.lng : parseFloat(String(body.lng ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "lat e lng são obrigatórios." });
      return;
    }

    const areasEnabled = await getAreasEnabled(req.companyId!);
    const areas = await db
      .select()
      .from(deliveryAreasTable)
      .where(eq(deliveryAreasTable.companyId, req.companyId!));
    const base = await getBaseCoords(req.companyId!);
    const kmTiers = await db
      .select()
      .from(kmDeliveryTiersTable)
      .where(eq(kmDeliveryTiersTable.companyId, req.companyId!));
    const result = resolvePointInAreas({
      areasEnabled,
      areas,
      lat,
      lng,
      baseLat: base.lat,
      baseLng: base.lng,
      kmTiers,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to resolve delivery area");
    res.status(500).json({ error: "Não foi possível verificar a área de entrega." });
  }
});

// ── Admin: feature flag on KM config ──────────────────────────────────────────

router.put("/admin/delivery-areas/settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const areasEnabled = Boolean((req.body as { areasEnabled?: boolean }).areasEnabled);
    const [existing] = await db
      .select()
      .from(kmDeliveryConfigTable)
      .where(eq(kmDeliveryConfigTable.companyId, req.companyId!))
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(kmDeliveryConfigTable)
        .set({ areasEnabled, updatedAt: new Date() })
        .where(
          and(
            eq(kmDeliveryConfigTable.id, existing.id),
            eq(kmDeliveryConfigTable.companyId, req.companyId!),
          ),
        )
        .returning();
      res.json({ areasEnabled: Boolean(updated?.areasEnabled) });
      return;
    }
    const [created] = await db
      .insert(kmDeliveryConfigTable)
      .values({ companyId: req.companyId!, areasEnabled })
      .returning();
    res.json({ areasEnabled: Boolean(created?.areasEnabled) });
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery areas settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/delivery-areas/settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const areasEnabled = await getAreasEnabled(req.companyId!);
    const base = await getBaseCoords(req.companyId!);
    res.json({ areasEnabled, baseLat: base.lat, baseLng: base.lng });
  } catch (err) {
    req.log.error({ err }, "Failed to get delivery areas settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin CRUD ────────────────────────────────────────────────────────────────

router.get("/admin/delivery-areas", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const rows = await db
      .select()
      .from(deliveryAreasTable)
      .where(eq(deliveryAreasTable.companyId, req.companyId!))
      .orderBy(desc(deliveryAreasTable.priority), asc(deliveryAreasTable.name));
    res.json(rows.map(serializeArea));
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery areas");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-areas", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const body = req.body as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const status = parseStatus(body.status) || "active";
    const polygon = normalizePolygon(body.polygon);
    if (name.length < 2) {
      res.status(400).json({ error: "Informe o nome da área." });
      return;
    }
    if (!polygon) {
      res.status(400).json({ error: "Desenhe um polígono válido no mapa." });
      return;
    }
    if (status === "blocked" && !String(body.blockReason || "").trim()) {
      res.status(400).json({ error: "Informe o motivo do bloqueio." });
      return;
    }

    const color =
      String(body.color || "").trim() ||
      (status === "blocked" ? "#ef4444" : "#22c55e");
    const bbox = computeBbox(polygon);
    const maxRaw = body.maxDistanceKm;
    const maxDistanceKm =
      maxRaw === null || maxRaw === undefined || String(maxRaw).trim() === ""
        ? null
        : parseMoney(maxRaw);

    const [row] = await db
      .insert(deliveryAreasTable)
      .values({
        companyId: req.companyId!,
        city: String(body.city || "Lauro de Freitas").trim() || "Lauro de Freitas",
        name,
        color,
        status,
        enabled: body.enabled === undefined ? true : Boolean(body.enabled),
        blockReason: status === "blocked" ? String(body.blockReason || "").trim() : "",
        minFee: parseMoney(body.minFee, 0),
        feePerKm: parseMoney(body.feePerKm, 0),
        maxDistanceKm,
        notes: String(body.notes || "").trim(),
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        polygon,
        bbox,
      })
      .returning();
    res.status(201).json(serializeArea(row!));
  } catch (err) {
    req.log.error({ err }, "Failed to create delivery area");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/delivery-areas/:id", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (name.length < 2) {
        res.status(400).json({ error: "Informe o nome da área." });
        return;
      }
      patch.name = name;
    }
    if (body.city !== undefined) patch.city = String(body.city || "").trim() || "Lauro de Freitas";
    if (body.color !== undefined) patch.color = String(body.color || "").trim() || "#22c55e";
    if (body.notes !== undefined) patch.notes = String(body.notes || "").trim();
    if (body.priority !== undefined) {
      patch.priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;
    }
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.minFee !== undefined) patch.minFee = parseMoney(body.minFee, 0);
    if (body.feePerKm !== undefined) patch.feePerKm = parseMoney(body.feePerKm, 0);
    if (body.maxDistanceKm !== undefined) {
      const maxRaw = body.maxDistanceKm;
      patch.maxDistanceKm =
        maxRaw === null || maxRaw === undefined || String(maxRaw).trim() === ""
          ? null
          : parseMoney(maxRaw);
    }

    let nextStatus: "active" | "blocked" | null = null;
    if (body.status !== undefined) {
      nextStatus = parseStatus(body.status);
      if (!nextStatus) {
        res.status(400).json({ error: "Status inválido." });
        return;
      }
      patch.status = nextStatus;
    }

    if (body.blockReason !== undefined || nextStatus === "blocked") {
      const reason = String(body.blockReason ?? "").trim();
      const statusForCheck =
        nextStatus ||
        (
          await db
            .select()
            .from(deliveryAreasTable)
            .where(
              and(
                eq(deliveryAreasTable.id, id),
                eq(deliveryAreasTable.companyId, req.companyId!),
              ),
            )
            .limit(1)
        )[0]?.status;
      if (statusForCheck === "blocked" && !reason && body.blockReason !== undefined) {
        res.status(400).json({ error: "Informe o motivo do bloqueio." });
        return;
      }
      if (body.blockReason !== undefined) patch.blockReason = reason;
      if (nextStatus === "blocked" && body.blockReason === undefined && !reason) {
        // keep existing reason; validated below after load if empty
      }
    }

    if (body.polygon !== undefined) {
      const polygon = normalizePolygon(body.polygon);
      if (!polygon) {
        res.status(400).json({ error: "Polígono inválido." });
        return;
      }
      patch.polygon = polygon;
      patch.bbox = computeBbox(polygon);
    }

    if (nextStatus === "blocked") {
      const [current] = await db
        .select()
        .from(deliveryAreasTable)
        .where(
          and(eq(deliveryAreasTable.id, id), eq(deliveryAreasTable.companyId, req.companyId!)),
        )
        .limit(1);
      const reason = String(
        patch.blockReason !== undefined ? patch.blockReason : current?.blockReason || "",
      ).trim();
      if (!reason) {
        res.status(400).json({ error: "Informe o motivo do bloqueio." });
        return;
      }
      patch.blockReason = reason;
    }
    if (nextStatus === "active" && body.blockReason === undefined) {
      // keep reason for history, or clear — clear is cleaner when unblocking
      patch.blockReason = String(body.blockReason ?? "").trim();
    }

    const [row] = await db
      .update(deliveryAreasTable)
      .set(patch)
      .where(and(eq(deliveryAreasTable.id, id), eq(deliveryAreasTable.companyId, req.companyId!)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Área não encontrada." });
      return;
    }
    res.json(serializeArea(row));
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery area");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Quick enable/disable without redrawing */
router.patch("/admin/delivery-areas/:id/enabled", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    const enabled = Boolean((req.body as { enabled?: boolean }).enabled);
    const [row] = await db
      .update(deliveryAreasTable)
      .set({ enabled, updatedAt: new Date() })
      .where(and(eq(deliveryAreasTable.id, id), eq(deliveryAreasTable.companyId, req.companyId!)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Área não encontrada." });
      return;
    }
    res.json(serializeArea(row));
  } catch (err) {
    req.log.error({ err }, "Failed to toggle delivery area");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/delivery-areas/:id", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    const deleted = await db
      .delete(deliveryAreasTable)
      .where(and(eq(deliveryAreasTable.id, id), eq(deliveryAreasTable.companyId, req.companyId!)))
      .returning();
    if (!deleted.length) {
      res.status(404).json({ error: "Área não encontrada." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete delivery area");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
