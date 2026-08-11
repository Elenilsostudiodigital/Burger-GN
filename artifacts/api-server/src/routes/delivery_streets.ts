/**
 * Delivery street registry + analysis requests.
 * Reuses existing KM base lat/lng, Haversine, tiers and OSM map embed coords.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  deliveryStreetsTable,
  deliveryStreetRequestsTable,
  kmDeliveryConfigTable,
  kmDeliveryTiersTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import {
  displayStreetName,
  estimateEtaMinutes,
  fetchOsrmRouteKm,
  haversineKm,
  normalizeStreetKey,
  suggestFeeFromDistance,
} from "../lib/deliveryStreets";

const router = Router();

async function loadKmContext(companyId: number) {
  const [config] = await db
    .select()
    .from(kmDeliveryConfigTable)
    .where(eq(kmDeliveryConfigTable.companyId, companyId));
  const tiers = await db
    .select()
    .from(kmDeliveryTiersTable)
    .where(eq(kmDeliveryTiersTable.companyId, companyId))
    .orderBy(asc(kmDeliveryTiersTable.displayOrder));
  return { config, tiers };
}

function serializeStreet(row: typeof deliveryStreetsTable.$inferSelect) {
  const originRaw = String((row as { origin?: string }).origin || "manual");
  const origin =
    originRaw === "pedido" || originRaw === "importada" || originRaw === "manual"
      ? originRaw
      : "manual";
  return {
    id: row.id,
    streetName: row.streetName,
    streetKey: row.streetKey,
    neighborhood: row.neighborhood,
    city: row.city,
    cep: row.cep,
    lat: row.lat != null ? parseFloat(String(row.lat)) : null,
    lng: row.lng != null ? parseFloat(String(row.lng)) : null,
    distanceKm: row.distanceKm != null ? parseFloat(String(row.distanceKm)) : null,
    etaMinutes: row.etaMinutes,
    fee: parseFloat(String(row.fee)) || 0,
    notes: row.notes || "",
    origin,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeRequest(row: typeof deliveryStreetRequestsTable.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    phone: row.phone,
    streetName: row.streetName,
    streetKey: row.streetKey,
    addressNumber: row.addressNumber,
    neighborhood: row.neighborhood,
    city: row.city,
    cep: row.cep,
    lat: row.lat != null ? parseFloat(String(row.lat)) : null,
    lng: row.lng != null ? parseFloat(String(row.lng)) : null,
    distanceKm: row.distanceKm != null ? parseFloat(String(row.distanceKm)) : null,
    routeDistanceKm: row.routeDistanceKm != null ? parseFloat(String(row.routeDistanceKm)) : null,
    etaMinutes: row.etaMinutes,
    suggestedFee: row.suggestedFee != null ? parseFloat(String(row.suggestedFee)) : null,
    status: row.status,
    reviewedAt: row.reviewedAt,
    streetId: row.streetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Public: check / register unknown street ──────────────────────────────────

router.post("/delivery/streets/check", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const body = req.body as {
      streetName?: string;
      addressNumber?: string;
      neighborhood?: string;
      city?: string;
      cep?: string;
      lat?: number;
      lng?: number;
      customerName?: string;
      phone?: string;
      distanceKm?: number;
    };

    const streetName = displayStreetName(body.streetName || "");
    const streetKey = normalizeStreetKey(streetName);
    if (!streetKey || streetKey.length < 3) {
      res.status(400).json({ error: "Informe o nome da rua." });
      return;
    }

    const neighborhood = String(body.neighborhood || "").trim();
    const city = String(body.city || "Lauro de Freitas").trim() || "Lauro de Freitas";
    const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8);
    const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

    const [knownAny] = await db
      .select()
      .from(deliveryStreetsTable)
      .where(
        and(
          eq(deliveryStreetsTable.companyId, companyId),
          eq(deliveryStreetsTable.streetKey, streetKey),
        ),
      )
      .limit(1);

    if (knownAny) {
      const street = serializeStreet(knownAny);
      if (!knownAny.active) {
        res.json({
          known: true,
          pending: false,
          active: false,
          street,
          fee: null,
          etaMinutes: street.etaMinutes,
          distanceKm: street.distanceKm,
          notes: street.notes || "",
          message:
            "🔴 Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.",
        });
        return;
      }
      res.json({
        known: true,
        pending: false,
        active: true,
        street,
        fee: street.fee,
        etaMinutes: street.etaMinutes,
        distanceKm: street.distanceKm,
        notes: street.notes || "",
        message: null,
      });
      return;
    }

    const { config, tiers } = await loadKmContext(companyId);
    let distanceKm =
      typeof body.distanceKm === "number" && Number.isFinite(body.distanceKm)
        ? body.distanceKm
        : null;

    if (distanceKm == null && lat != null && lng != null && config) {
      const baseLat = parseFloat(String(config.baseLat));
      const baseLng = parseFloat(String(config.baseLng));
      if (Number.isFinite(baseLat) && Number.isFinite(baseLng) && !(baseLat === 0 && baseLng === 0)) {
        distanceKm = parseFloat(haversineKm(baseLat, baseLng, lat, lng).toFixed(2));
      }
    }

    const suggestedFee =
      distanceKm != null ? suggestFeeFromDistance(distanceKm, tiers) : null;
    const etaMinutes = distanceKm != null ? estimateEtaMinutes(distanceKm) : null;

    // Upsert pending request (one open request per street key)
    const [existingPending] = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.companyId, companyId),
          eq(deliveryStreetRequestsTable.streetKey, streetKey),
          eq(deliveryStreetRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    let request = existingPending;
    if (existingPending) {
      const [updated] = await db
        .update(deliveryStreetRequestsTable)
        .set({
          streetName,
          addressNumber: String(body.addressNumber || existingPending.addressNumber || ""),
          neighborhood: neighborhood || existingPending.neighborhood,
          city,
          cep: cep || existingPending.cep,
          lat: lat != null ? String(lat) : existingPending.lat,
          lng: lng != null ? String(lng) : existingPending.lng,
          distanceKm: distanceKm != null ? String(distanceKm) : existingPending.distanceKm,
          etaMinutes: etaMinutes ?? existingPending.etaMinutes,
          suggestedFee: suggestedFee != null ? String(suggestedFee) : existingPending.suggestedFee,
          customerName: String(body.customerName || existingPending.customerName || ""),
          phone: String(body.phone || existingPending.phone || ""),
          updatedAt: new Date(),
        })
        .where(eq(deliveryStreetRequestsTable.id, existingPending.id))
        .returning();
      request = updated ?? existingPending;
    } else {
      const [created] = await db
        .insert(deliveryStreetRequestsTable)
        .values({
          companyId,
          streetName,
          streetKey,
          addressNumber: String(body.addressNumber || ""),
          neighborhood,
          city,
          cep,
          lat: lat != null ? String(lat) : null,
          lng: lng != null ? String(lng) : null,
          distanceKm: distanceKm != null ? String(distanceKm) : null,
          etaMinutes,
          suggestedFee: suggestedFee != null ? String(suggestedFee) : null,
          customerName: String(body.customerName || ""),
          phone: String(body.phone || ""),
          status: "pending",
        })
        .returning();
      request = created!;
    }

    res.json({
      known: false,
      pending: true,
      requestId: request?.id ?? null,
      fee: null,
      etaMinutes,
      distanceKm,
      suggestedFee,
      message:
        "📍 Esta rua ainda não faz parte da nossa área de entrega.\nAguarde um instante enquanto verificamos a disponibilidade.\nO pedido ficará aguardando análise do administrador.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to check delivery street");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Attach order to a pending street request after checkout (additive). */
router.post("/delivery/streets/link-order", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const body = req.body as {
      streetName?: string;
      orderId?: number;
      orderNumber?: number;
      customerName?: string;
      phone?: string;
    };
    const streetKey = normalizeStreetKey(body.streetName || "");
    if (!streetKey || !body.orderId) {
      res.status(400).json({ error: "streetName and orderId required" });
      return;
    }

    const [pending] = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.companyId, companyId),
          eq(deliveryStreetRequestsTable.streetKey, streetKey),
          eq(deliveryStreetRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (!pending) {
      res.json({ ok: true, linked: false });
      return;
    }

    await db
      .update(deliveryStreetRequestsTable)
      .set({
        orderId: body.orderId,
        orderNumber: body.orderNumber ?? null,
        customerName: String(body.customerName || pending.customerName),
        phone: String(body.phone || pending.phone),
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetRequestsTable.id, pending.id));

    res.json({ ok: true, linked: true, requestId: pending.id });
  } catch (err) {
    req.log.error({ err }, "Failed to link street request to order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: pending requests (Novas Ruas) ─────────────────────────────────────

router.get("/admin/delivery-street-requests", requireCompanyAuth, async (req, res) => {
  try {
    const status = String(req.query["status"] || "pending");
    const rows = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.companyId, req.companyId!),
          status === "all" ? sql`true` : eq(deliveryStreetRequestsTable.status, status),
        ),
      )
      .orderBy(desc(deliveryStreetRequestsTable.createdAt));
    res.json(rows.map(serializeRequest));
  } catch (err) {
    req.log.error({ err }, "Failed to list street requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/delivery-street-requests/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [row] = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.id, id),
          eq(deliveryStreetRequestsTable.companyId, req.companyId!),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }

    const { config, tiers } = await loadKmContext(req.companyId!);
    const lat = row.lat != null ? parseFloat(String(row.lat)) : null;
    const lng = row.lng != null ? parseFloat(String(row.lng)) : null;
    const baseLat = config ? parseFloat(String(config.baseLat)) : NaN;
    const baseLng = config ? parseFloat(String(config.baseLng)) : NaN;

    let routeDistanceKm =
      row.routeDistanceKm != null ? parseFloat(String(row.routeDistanceKm)) : null;
    let etaMinutes = row.etaMinutes;
    let haversineDistance =
      row.distanceKm != null ? parseFloat(String(row.distanceKm)) : null;

    if (
      lat != null &&
      lng != null &&
      Number.isFinite(baseLat) &&
      Number.isFinite(baseLng) &&
      !(baseLat === 0 && baseLng === 0)
    ) {
      if (haversineDistance == null) {
        haversineDistance = parseFloat(haversineKm(baseLat, baseLng, lat, lng).toFixed(2));
      }
      const route = await fetchOsrmRouteKm(baseLat, baseLng, lat, lng);
      if (route) {
        routeDistanceKm = route.distanceKm;
        etaMinutes = route.durationMin;
      } else if (haversineDistance != null) {
        // Fallback: checkout Haversine × urban factor (~1.3) as route estimate
        routeDistanceKm = parseFloat((haversineDistance * 1.3).toFixed(2));
        etaMinutes = estimateEtaMinutes(routeDistanceKm);
      }
    }

    const distanceForFee = routeDistanceKm ?? haversineDistance;
    const suggestedFee =
      distanceForFee != null ? suggestFeeFromDistance(distanceForFee, tiers) : null;

    // Persist enriched analysis for next open
    await db
      .update(deliveryStreetRequestsTable)
      .set({
        distanceKm: haversineDistance != null ? String(haversineDistance) : row.distanceKm,
        routeDistanceKm: routeDistanceKm != null ? String(routeDistanceKm) : row.routeDistanceKm,
        etaMinutes: etaMinutes ?? row.etaMinutes,
        suggestedFee: suggestedFee != null ? String(suggestedFee) : row.suggestedFee,
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetRequestsTable.id, id));

    res.json({
      request: {
        ...serializeRequest(row),
        distanceKm: haversineDistance,
        routeDistanceKm,
        etaMinutes,
        suggestedFee,
      },
      store: {
        lat: Number.isFinite(baseLat) ? baseLat : null,
        lng: Number.isFinite(baseLng) ? baseLng : null,
        address: config?.baseAddress ?? null,
      },
      mapEmbed:
        lat != null && lng != null
          ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.012}%2C${lng + 0.012}%2C${lat + 0.012}&layer=mapnik&marker=${lat}%2C${lng}`
          : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load street request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-street-requests/:id/approve", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as {
      fee?: number;
      etaMinutes?: number;
      notes?: string;
      distanceKm?: number;
      routeDistanceKm?: number;
      streetName?: string;
      neighborhood?: string;
      city?: string;
      cep?: string;
    };

    const [row] = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.id, id),
          eq(deliveryStreetRequestsTable.companyId, req.companyId!),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: "Esta solicitação já foi analisada." });
      return;
    }

    const fee = typeof body.fee === "number" && Number.isFinite(body.fee) ? body.fee : parseFloat(String(row.suggestedFee ?? "0")) || 0;
    const etaMinutes =
      typeof body.etaMinutes === "number" && Number.isFinite(body.etaMinutes)
        ? Math.round(body.etaMinutes)
        : row.etaMinutes;
    const streetName = displayStreetName(body.streetName || row.streetName);
    const streetKey = normalizeStreetKey(streetName);
    const neighborhood = String(body.neighborhood ?? row.neighborhood).trim();
    const city = String(body.city ?? row.city).trim() || "Lauro de Freitas";
    const cep = String(body.cep ?? row.cep).replace(/\D/g, "").slice(0, 8);
    const distanceKm =
      typeof body.routeDistanceKm === "number"
        ? body.routeDistanceKm
        : typeof body.distanceKm === "number"
          ? body.distanceKm
          : row.routeDistanceKm != null
            ? parseFloat(String(row.routeDistanceKm))
            : row.distanceKm != null
              ? parseFloat(String(row.distanceKm))
              : null;

    const [existingStreet] = await db
      .select()
      .from(deliveryStreetsTable)
      .where(
        and(
          eq(deliveryStreetsTable.companyId, req.companyId!),
          eq(deliveryStreetsTable.streetKey, streetKey),
        ),
      )
      .limit(1);

    let street;
    if (existingStreet) {
      const [updated] = await db
        .update(deliveryStreetsTable)
        .set({
          streetName,
          neighborhood,
          city,
          cep,
          lat: row.lat,
          lng: row.lng,
          distanceKm: distanceKm != null ? String(distanceKm) : existingStreet.distanceKm,
          etaMinutes: etaMinutes ?? existingStreet.etaMinutes,
          fee: String(fee.toFixed(2)),
          notes: String(body.notes ?? existingStreet.notes ?? ""),
          origin: (existingStreet as { origin?: string }).origin || "pedido",
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(deliveryStreetsTable.id, existingStreet.id))
        .returning();
      street = updated!;
    } else {
      const [created] = await db
        .insert(deliveryStreetsTable)
        .values({
          companyId: req.companyId!,
          streetName,
          streetKey,
          neighborhood,
          city,
          cep,
          lat: row.lat,
          lng: row.lng,
          distanceKm: distanceKm != null ? String(distanceKm) : null,
          etaMinutes: etaMinutes ?? null,
          fee: String(fee.toFixed(2)),
          notes: String(body.notes || ""),
          origin: "pedido",
          active: true,
        })
        .returning();
      street = created!;
    }

    const [updatedReq] = await db
      .update(deliveryStreetRequestsTable)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        streetId: street.id,
        suggestedFee: String(fee.toFixed(2)),
        etaMinutes: etaMinutes ?? row.etaMinutes,
        routeDistanceKm: distanceKm != null ? String(distanceKm) : row.routeDistanceKm,
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetRequestsTable.id, id))
      .returning();

    res.json({
      ok: true,
      request: serializeRequest(updatedReq!),
      street: serializeStreet(street),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to approve street request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-street-requests/:id/reject", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [row] = await db
      .select()
      .from(deliveryStreetRequestsTable)
      .where(
        and(
          eq(deliveryStreetRequestsTable.id, id),
          eq(deliveryStreetRequestsTable.companyId, req.companyId!),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: "Esta solicitação já foi analisada." });
      return;
    }

    const [updated] = await db
      .update(deliveryStreetRequestsTable)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetRequestsTable.id, id))
      .returning();

    res.json({ ok: true, request: serializeRequest(updated!) });
  } catch (err) {
    req.log.error({ err }, "Failed to reject street request");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: street registry CRUD (Config → Ruas de Entrega) ───────────────────

router.get("/admin/delivery-streets", requireCompanyAuth, async (req, res) => {
  try {
    const q = String(req.query["q"] || "").trim();
    const conditions = [eq(deliveryStreetsTable.companyId, req.companyId!)];
    if (q) {
      const like = `%${q}%`;
      conditions.push(
        or(
          ilike(deliveryStreetsTable.streetName, like),
          ilike(deliveryStreetsTable.neighborhood, like),
          ilike(deliveryStreetsTable.city, like),
          ilike(deliveryStreetsTable.cep, like),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(deliveryStreetsTable)
      .where(and(...conditions))
      .orderBy(asc(deliveryStreetsTable.streetName));
    res.json(rows.map(serializeStreet));
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery streets");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-streets", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as Partial<{
      streetName: string;
      neighborhood: string;
      city: string;
      cep: string;
      lat: number;
      lng: number;
      distanceKm: number;
      etaMinutes: number;
      fee: number;
      notes: string;
      active: boolean;
      origin: string;
    }>;
    const streetName = displayStreetName(body.streetName || "");
    const streetKey = normalizeStreetKey(streetName);
    if (!streetKey) {
      res.status(400).json({ error: "Informe o nome da rua." });
      return;
    }
    const originRaw = String(body.origin || "manual");
    const origin =
      originRaw === "pedido" || originRaw === "importada" || originRaw === "manual"
        ? originRaw
        : "manual";
    const [created] = await db
      .insert(deliveryStreetsTable)
      .values({
        companyId: req.companyId!,
        streetName,
        streetKey,
        neighborhood: String(body.neighborhood || ""),
        city: String(body.city || "Lauro de Freitas"),
        cep: String(body.cep || "").replace(/\D/g, "").slice(0, 8),
        lat: typeof body.lat === "number" ? String(body.lat) : null,
        lng: typeof body.lng === "number" ? String(body.lng) : null,
        distanceKm: typeof body.distanceKm === "number" ? String(body.distanceKm) : null,
        etaMinutes: typeof body.etaMinutes === "number" ? body.etaMinutes : null,
        fee: String((Number(body.fee) || 0).toFixed(2)),
        notes: String(body.notes || ""),
        origin,
        active: body.active !== false,
      })
      .returning();
    res.status(201).json(serializeStreet(created!));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "Esta rua já está cadastrada." });
      return;
    }
    req.log.error({ err }, "Failed to create delivery street");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/delivery-streets/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      streetName: string;
      neighborhood: string;
      city: string;
      cep: string;
      lat: number | null;
      lng: number | null;
      distanceKm: number | null;
      etaMinutes: number | null;
      fee: number;
      notes: string;
      active: boolean;
      origin: string;
    }>;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.streetName != null) {
      patch.streetName = displayStreetName(body.streetName);
      patch.streetKey = normalizeStreetKey(body.streetName);
    }
    if (body.neighborhood != null) patch.neighborhood = String(body.neighborhood);
    if (body.city != null) patch.city = String(body.city);
    if (body.cep != null) patch.cep = String(body.cep).replace(/\D/g, "").slice(0, 8);
    if (body.lat !== undefined) patch.lat = body.lat != null ? String(body.lat) : null;
    if (body.lng !== undefined) patch.lng = body.lng != null ? String(body.lng) : null;
    if (body.distanceKm !== undefined) {
      patch.distanceKm = body.distanceKm != null ? String(body.distanceKm) : null;
    }
    if (body.etaMinutes !== undefined) patch.etaMinutes = body.etaMinutes;
    if (body.fee != null) patch.fee = String(Number(body.fee).toFixed(2));
    if (body.notes != null) patch.notes = String(body.notes);
    if (typeof body.active === "boolean") patch.active = body.active;
    if (body.origin != null) {
      const originRaw = String(body.origin);
      patch.origin =
        originRaw === "pedido" || originRaw === "importada" || originRaw === "manual"
          ? originRaw
          : "manual";
    }

    const [updated] = await db
      .update(deliveryStreetsTable)
      .set(patch)
      .where(
        and(
          eq(deliveryStreetsTable.id, id),
          eq(deliveryStreetsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Rua não encontrada" });
      return;
    }
    res.json(serializeStreet(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery street");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/delivery-streets/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [deleted] = await db
      .delete(deliveryStreetsTable)
      .where(
        and(
          eq(deliveryStreetsTable.id, id),
          eq(deliveryStreetsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Rua não encontrada" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete delivery street");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
