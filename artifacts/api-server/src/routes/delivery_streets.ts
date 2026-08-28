/**
 * Delivery street registry + analysis requests.
 * Reuses existing KM base lat/lng, Haversine, tiers and OSM map embed coords.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  deliveryStreetsTable,
  deliveryStreetRequestsTable,
  deliveryAreasTable,
  kmDeliveryConfigTable,
  kmDeliveryTiersTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { broadcastSSE } from "../lib/sse";
import {
  displayStreetName,
  estimateEtaMinutes,
  fetchOsrmRouteKm,
  haversineKm,
  normalizeStreetKey,
  suggestFeeFromDistance,
} from "../lib/deliveryStreets";
import { geocodeStreetLocation, geocodeCheckoutAddress } from "../lib/geocodeStreets";
import {
  AREA_ANALYSIS_MSG,
  APPROVED_REGION_MSG,
  evaluateDeliveryCoverage,
} from "../lib/deliveryAreas";

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
  const maxDeliveryTimeRaw = (row as { maxDeliveryTime?: string | null }).maxDeliveryTime;
  const maxDeliveryTime =
    maxDeliveryTimeRaw != null && String(maxDeliveryTimeRaw).trim()
      ? String(maxDeliveryTimeRaw).trim()
      : null;
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
    maxDeliveryTime,
    origin,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Customer-facing notes: delivery cutoff + free-text observations. */
function buildCustomerStreetNotes(street: {
  notes?: string | null;
  maxDeliveryTime?: string | null;
}): string {
  const parts: string[] = [];
  const cutoff = street.maxDeliveryTime ? String(street.maxDeliveryTime).trim() : "";
  if (cutoff) {
    parts.push(
      `Para esta rua realizamos entregas somente até às ${cutoff}.\nApós esse horário, pedidos poderão ser retirados na loja até às 22:30.`,
    );
  }
  const notes = street.notes ? String(street.notes).trim() : "";
  if (notes) parts.push(notes);
  return parts.join("\n\n");
}

function normalizeMaxDeliveryTime(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return raw.slice(0, 5);
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
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
    let lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    let lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

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

    const { config, tiers } = await loadKmContext(companyId);
    const areasEnabled = Boolean(config?.areasEnabled);

    if (areasEnabled) {
      if ((lat == null || lng == null) && streetName) {
        try {
          const geo = await geocodeCheckoutAddress({
            street: streetName,
            number: String(body.addressNumber || ""),
            neighborhood,
            city,
          });
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
          }
        } catch {
          /* polygon check stays skipped if geocode is down */
        }
      }

      const areas = await db
        .select()
        .from(deliveryAreasTable)
        .where(eq(deliveryAreasTable.companyId, companyId));
      const baseLat = config ? parseFloat(String(config.baseLat)) : 0;
      const baseLng = config ? parseFloat(String(config.baseLng)) : 0;
      const street = knownAny ? serializeStreet(knownAny) : null;
      const coverage = evaluateDeliveryCoverage({
        areasEnabled: true,
        areas,
        lat,
        lng,
        baseLat,
        baseLng,
        kmTiers: tiers,
        knownStreet: street
          ? {
              active: street.active,
              fee: street.fee,
              distanceKm: street.distanceKm,
              etaMinutes: street.etaMinutes,
            }
          : null,
      });

      if (coverage.status === "blocked") {
        const customerNotes = street ? buildCustomerStreetNotes(street) : "";
        res.json({
          known: !!street,
          pending: false,
          active: false,
          inDeliveryArea: false,
          canRequest: false,
          street: street ?? undefined,
          fee: null,
          etaMinutes: street?.etaMinutes ?? null,
          distanceKm: coverage.distanceKm,
          notes: customerNotes,
          maxDeliveryTime: street?.maxDeliveryTime ?? null,
          message: coverage.message,
          source: coverage.source,
        });
        return;
      }

      if (coverage.status === "allowed") {
        const customerNotes = street ? buildCustomerStreetNotes(street) : "";
        res.json({
          known: !!street,
          pending: false,
          active: true,
          inDeliveryArea: coverage.inDeliveryArea,
          canRequest: false,
          street: street ?? undefined,
          fee: coverage.fee,
          etaMinutes: street?.etaMinutes ?? null,
          distanceKm: coverage.distanceKm,
          notes: customerNotes,
          maxDeliveryTime: street?.maxDeliveryTime ?? null,
          message: null,
          source: coverage.source,
          area: coverage.area,
        });
        return;
      }

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

      let distanceKm =
        typeof body.distanceKm === "number" && Number.isFinite(body.distanceKm)
          ? body.distanceKm
          : coverage.distanceKm;
      if (distanceKm == null && lat != null && lng != null && config) {
        if (Number.isFinite(baseLat) && Number.isFinite(baseLng) && !(baseLat === 0 && baseLng === 0)) {
          distanceKm = parseFloat(haversineKm(baseLat, baseLng, lat, lng).toFixed(2));
        }
      }
      const suggestedFee = distanceKm != null ? suggestFeeFromDistance(distanceKm, tiers) : null;
      const etaMinutes = distanceKm != null ? estimateEtaMinutes(distanceKm) : null;

      res.json({
        known: false,
        pending: !!existingPending,
        alreadyRequested: !!existingPending,
        canRequest: true,
        inDeliveryArea: false,
        requestId: existingPending?.id ?? null,
        fee: null,
        etaMinutes,
        distanceKm,
        suggestedFee,
        message: AREA_ANALYSIS_MSG,
        source: "none",
      });
      return;
    }

    if (knownAny) {
      const street = serializeStreet(knownAny);
      const customerNotes = buildCustomerStreetNotes(street);
      if (!knownAny.active) {
        res.json({
          known: true,
          pending: false,
          active: false,
          street,
          fee: null,
          etaMinutes: street.etaMinutes,
          distanceKm: street.distanceKm,
          notes: customerNotes,
          maxDeliveryTime: street.maxDeliveryTime,
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
        notes: customerNotes,
        maxDeliveryTime: street.maxDeliveryTime,
        message: null,
      });
      return;
    }

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

    // Lookup only — the customer must click "Solicitar análise" to create a request.
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

    res.json({
      known: false,
      pending: !!existingPending,
      alreadyRequested: !!existingPending,
      canRequest: true,
      requestId: existingPending?.id ?? null,
      fee: null,
      etaMinutes,
      distanceKm,
      suggestedFee,
      message: "Esta região ainda não faz parte da nossa área de entrega.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to check delivery street");
    res.status(500).json({ error: "Internal server error" });
  }
});

type StreetRequestBody = {
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

async function upsertPendingAnalysisRequest(
  companyId: number,
  body: StreetRequestBody,
): Promise<{ request: typeof deliveryStreetRequestsTable.$inferSelect; created: boolean } | { error: string; status: number }> {
  const streetName = displayStreetName(body.streetName || "");
  const streetKey = normalizeStreetKey(streetName);
  if (!streetKey || streetKey.length < 3) {
    return { error: "Informe o nome da rua.", status: 400 };
  }

  const neighborhood = String(body.neighborhood || "").trim();
  const city = String(body.city || "Lauro de Freitas").trim() || "Lauro de Freitas";
  const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8);
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
  const customerName = String(body.customerName || "").trim();
  const phone = String(body.phone || "").replace(/\D/g, "");
  if (!customerName || phone.length < 10) {
    return { error: "Informe nome e telefone para solicitar a análise.", status: 400 };
  }

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
  if (knownAny?.active) {
    return { error: APPROVED_REGION_MSG, status: 409 };
  }
  if (knownAny && !knownAny.active) {
    return {
      error: "Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.",
      status: 400,
    };
  }

  const { config, tiers } = await loadKmContext(companyId);
  let resolvedLat = lat;
  let resolvedLng = lng;
  if (config?.areasEnabled && (resolvedLat == null || resolvedLng == null)) {
    try {
      const geo = await geocodeCheckoutAddress({
        street: streetName,
        number: String(body.addressNumber || ""),
        neighborhood,
        city,
      });
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    } catch {
      /* continue without coords */
    }
  }
  if (config?.areasEnabled) {
    const areas = await db
      .select()
      .from(deliveryAreasTable)
      .where(eq(deliveryAreasTable.companyId, companyId));
    const coverage = evaluateDeliveryCoverage({
      areasEnabled: true,
      areas,
      lat: resolvedLat,
      lng: resolvedLng,
      baseLat: parseFloat(String(config.baseLat ?? 0)),
      baseLng: parseFloat(String(config.baseLng ?? 0)),
      kmTiers: tiers,
      knownStreet: null,
    });
    if (coverage.inDeliveryArea || coverage.status === "allowed") {
      return { error: APPROVED_REGION_MSG, status: 409 };
    }
    if (coverage.status === "blocked") {
      return { error: coverage.message || "Não entregamos nesta área.", status: 400 };
    }
  }

  let distanceKm =
    typeof body.distanceKm === "number" && Number.isFinite(body.distanceKm)
      ? body.distanceKm
      : null;
  if (distanceKm == null && resolvedLat != null && resolvedLng != null && config) {
    const baseLat = parseFloat(String(config.baseLat));
    const baseLng = parseFloat(String(config.baseLng));
    if (Number.isFinite(baseLat) && Number.isFinite(baseLng) && !(baseLat === 0 && baseLng === 0)) {
      distanceKm = parseFloat(haversineKm(baseLat, baseLng, resolvedLat, resolvedLng).toFixed(2));
    }
  }
  const suggestedFee = distanceKm != null ? suggestFeeFromDistance(distanceKm, tiers) : null;
  const etaMinutes = distanceKm != null ? estimateEtaMinutes(distanceKm) : null;

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

  if (existingPending) {
    const [updated] = await db
      .update(deliveryStreetRequestsTable)
      .set({
        streetName,
        addressNumber: String(body.addressNumber || existingPending.addressNumber || ""),
        neighborhood: neighborhood || existingPending.neighborhood,
        city,
        cep: cep || existingPending.cep,
        lat: resolvedLat != null ? String(resolvedLat) : existingPending.lat,
        lng: resolvedLng != null ? String(resolvedLng) : existingPending.lng,
        distanceKm: distanceKm != null ? String(distanceKm) : existingPending.distanceKm,
        etaMinutes: etaMinutes ?? existingPending.etaMinutes,
        suggestedFee: suggestedFee != null ? String(suggestedFee) : existingPending.suggestedFee,
        customerName,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetRequestsTable.id, existingPending.id))
      .returning();
    return { request: updated ?? existingPending, created: false };
  }

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
      lat: resolvedLat != null ? String(resolvedLat) : null,
      lng: resolvedLng != null ? String(resolvedLng) : null,
      distanceKm: distanceKm != null ? String(distanceKm) : null,
      etaMinutes,
      suggestedFee: suggestedFee != null ? String(suggestedFee) : null,
      customerName,
      phone,
      status: "pending",
    })
    .returning();
  return { request: created!, created: true };
}

/** Customer explicitly requests analysis of an unserved region. */
router.post("/delivery/streets/request-analysis", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const result = await upsertPendingAnalysisRequest(companyId, req.body as StreetRequestBody);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const payload = serializeRequest(result.request);
    broadcastSSE(companyId, "street_request", {
      ...payload,
      created: result.created,
    });
    res.status(result.created ? 201 : 200).json({
      ok: true,
      created: result.created,
      requestId: result.request.id,
      message: "Solicitação enviada com sucesso.",
      request: payload,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to request street analysis");
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
    broadcastSSE(req.companyId!, "street_request_resolved", {
      id,
      status: "approved",
      streetId: street.id,
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
    broadcastSSE(req.companyId!, "street_request_resolved", {
      id,
      status: "rejected",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to reject street request");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: street registry CRUD (Config → Ruas de Entrega) ───────────────────

/** Server-side Nominatim search — avoids browser CORS failures on Localizar Endereço. */
router.post("/admin/delivery-streets/geocode", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      street?: string;
      neighborhood?: string;
      city?: string;
      cep?: string;
      state?: string;
      number?: string;
      similar?: boolean;
    };
    const street = String(body.street || "").trim();
    const neighborhood = String(body.neighborhood || "").trim();
    if (street.length < 3) {
      res.status(400).json({ error: "Informe o nome da rua (mín. 3 caracteres) para localizar." });
      return;
    }
    if (!neighborhood) {
      res.status(400).json({ error: "Informe o bairro para localizar o endereço." });
      return;
    }
    const result = await geocodeStreetLocation({
      street,
      neighborhood,
      city: String(body.city || "Lauro de Freitas").trim() || "Lauro de Freitas",
      cep: String(body.cep || "").trim(),
      state: String(body.state || "Bahia").trim() || "Bahia",
      number: String(body.number || "").trim(),
      similar: body.similar === true,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to geocode delivery street");
    res.status(502).json({
      error: "Não foi possível localizar o endereço agora. Tente novamente em instantes.",
      candidates: [],
      suggestions: [],
      autoSelect: false,
      exactNotFound: false,
      message: "Não foi possível localizar o endereço agora. Tente novamente em instantes.",
    });
  }
});

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
      maxDeliveryTime: string | null;
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
        maxDeliveryTime: normalizeMaxDeliveryTime(body.maxDeliveryTime),
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
      maxDeliveryTime: string | null;
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
    if (body.maxDeliveryTime !== undefined) {
      patch.maxDeliveryTime = normalizeMaxDeliveryTime(body.maxDeliveryTime);
    }
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
