import { Router } from "express";
import { db } from "@workspace/db";
import {
  deliveryAreaRequestsTable,
  deliveryAreasTable,
  deliveryStreetsTable,
  deliveryZonesTable,
  kmDeliveryConfigTable,
  type DeliveryAreaRequest,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { ensureDeliveryAreasSchema } from "../lib/ensureDeliveryAreasSchema";
import {
  circlePolygon,
  computeBbox,
  coverageRadiusKm,
} from "../lib/deliveryAreas";
import { displayStreetName, haversineKm, normalizeStreetKey } from "../lib/deliveryStreets";
import { geocodeStreetLocation } from "../lib/geocodeStreets";
import { broadcastSSE } from "../lib/sse";

const router = Router();

function parseMoney(raw: unknown, fallback = 0): string {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return fallback.toFixed(2);
  return n.toFixed(2);
}

function parseCoord(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) ? n : null;
}

function serializeRequest(row: DeliveryAreaRequest) {
  return {
    id: row.id,
    companyId: row.companyId,
    customerName: row.customerName,
    phone: row.phone,
    address: row.address,
    addressNumber: row.addressNumber,
    addressComplement: row.addressComplement,
    neighborhood: row.neighborhood,
    city: row.city,
    cep: row.cep,
    lat: row.lat != null ? parseFloat(String(row.lat)) : null,
    lng: row.lng != null ? parseFloat(String(row.lng)) : null,
    distanceKm: row.distanceKm != null ? parseFloat(String(row.distanceKm)) : null,
    status: row.status,
    coverageType: row.coverageType,
    areaId: row.areaId,
    streetId: row.streetId,
    zoneId: row.zoneId,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fullAddress: [
      row.address,
      row.addressNumber,
      row.addressComplement,
      row.neighborhood,
      row.city,
      row.cep ? `CEP ${row.cep}` : "",
    ].filter((p) => String(p || "").trim()).join(", "),
  };
}

function parseCoverageType(raw: unknown): "rua" | "bairro" | "regiao" | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "rua" || s === "bairro" || s === "regiao" || s === "região") {
    return s === "região" ? "regiao" : s;
  }
  return null;
}

const DEFAULT_STORE = { lat: -12.89444, lng: -38.32722 };

async function resolveCoordsAndDistance(opts: {
  companyId: number;
  address: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  cep: string;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
}): Promise<{ lat: number | null; lng: number | null; distanceKm: number | null }> {
  let { lat, lng, distanceKm } = opts;
  if ((lat == null || lng == null) && (opts.address.trim() || opts.neighborhood.trim())) {
    const street = opts.address.trim() || opts.neighborhood.trim();
    if (street.length >= 3) {
      try {
        const geo = await geocodeStreetLocation({
          street,
          number: opts.addressNumber,
          neighborhood: opts.neighborhood || street,
          city: opts.city || "Lauro de Freitas",
          cep: opts.cep,
        });
        const hit = geo.candidates[0];
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
          lat = hit.lat;
          lng = hit.lng;
        }
      } catch {
        /* keep null coords — admin can still see the request */
      }
    }
  }
  if (distanceKm == null && lat != null && lng != null) {
    const [config] = await db
      .select()
      .from(kmDeliveryConfigTable)
      .where(eq(kmDeliveryConfigTable.companyId, opts.companyId))
      .limit(1);
    const baseLat = parseFloat(String(config?.baseLat ?? DEFAULT_STORE.lat));
    const baseLng = parseFloat(String(config?.baseLng ?? DEFAULT_STORE.lng));
    if (Number.isFinite(baseLat) && Number.isFinite(baseLng)) {
      distanceKm = parseFloat(haversineKm(baseLat, baseLng, lat, lng).toFixed(2));
    }
  }
  return { lat, lng, distanceKm };
}

// ── Public: customer requests analysis ────────────────────────────────────────

router.post("/delivery/area-requests", resolvePublicCompany, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const body = req.body as Record<string, unknown>;
    const customerName = String(body.customerName || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const address = String(body.address || body.streetName || "").trim();
    const neighborhood = String(body.neighborhood || "").trim();
    const lat = parseCoord(body.lat);
    const lng = parseCoord(body.lng);

    if (!customerName || phone.length < 8) {
      res.status(400).json({ error: "Informe nome e telefone para solicitar a análise." });
      return;
    }
    if (!address && (lat == null || lng == null)) {
      res.status(400).json({ error: "Informe o endereço ou a localização." });
      return;
    }

    const companyId = req.companyId!;
    const addressNumber = String(body.addressNumber || "").trim();
    const city = String(body.city || "Lauro de Freitas").trim() || "Lauro de Freitas";
    const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8);
    const resolved = await resolveCoordsAndDistance({
      companyId,
      address,
      addressNumber,
      neighborhood,
      city,
      cep,
      lat,
      lng,
      distanceKm: parseCoord(body.distanceKm),
    });
    const resolvedLat = resolved.lat;
    const resolvedLng = resolved.lng;
    const resolvedDistance = resolved.distanceKm;
    const latKey = resolvedLat != null ? resolvedLat.toFixed(4) : "";
    const lngKey = resolvedLng != null ? resolvedLng.toFixed(4) : "";

    const existing = await db
      .select()
      .from(deliveryAreaRequestsTable)
      .where(
        and(
          eq(deliveryAreaRequestsTable.companyId, companyId),
          eq(deliveryAreaRequestsTable.status, "pending"),
          eq(deliveryAreaRequestsTable.phone, phone),
        ),
      )
      .orderBy(desc(deliveryAreaRequestsTable.createdAt))
      .limit(8);

    const duplicate = existing.find((row) => {
      if (latKey && lngKey && row.lat != null && row.lng != null) {
        return parseFloat(String(row.lat)).toFixed(4) === latKey
          && parseFloat(String(row.lng)).toFixed(4) === lngKey;
      }
      return String(row.address || "").trim().toLowerCase() === address.toLowerCase()
        && String(row.neighborhood || "").trim().toLowerCase() === neighborhood.toLowerCase();
    });

    if (duplicate) {
      res.json({ ok: true, alreadyPending: true, request: serializeRequest(duplicate) });
      return;
    }

    const [created] = await db
      .insert(deliveryAreaRequestsTable)
      .values({
        companyId,
        customerName,
        phone,
        address,
        addressNumber,
        addressComplement: String(body.addressComplement || "").trim(),
        neighborhood,
        city,
        cep,
        lat: resolvedLat != null ? String(resolvedLat) : null,
        lng: resolvedLng != null ? String(resolvedLng) : null,
        distanceKm: resolvedDistance != null ? String(resolvedDistance) : null,
        status: "pending",
      })
      .returning();

    broadcastSSE(companyId, "area_request", {
      id: created!.id,
      customerName,
      neighborhood,
      city: created!.city,
    });

    res.status(201).json({ ok: true, alreadyPending: false, request: serializeRequest(created!) });
  } catch (err) {
    req.log.error({ err }, "Failed to create delivery area request");
    res.status(500).json({ error: "Não foi possível enviar a solicitação." });
  }
});

// ── Admin list / count ────────────────────────────────────────────────────────

router.get("/admin/delivery-area-requests/pending-count", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(deliveryAreaRequestsTable)
      .where(
        and(
          eq(deliveryAreaRequestsTable.companyId, req.companyId!),
          eq(deliveryAreaRequestsTable.status, "pending"),
        ),
      );
    res.json({ count: Number(row?.value ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to count area requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/delivery-area-requests", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const status = String(req.query.status || "pending").trim().toLowerCase();
    const conditions = [eq(deliveryAreaRequestsTable.companyId, req.companyId!)];
    if (status && status !== "all") {
      conditions.push(eq(deliveryAreaRequestsTable.status, status));
    }
    const rows = await db
      .select()
      .from(deliveryAreaRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(deliveryAreaRequestsTable.createdAt));
    res.json(rows.map(serializeRequest));
  } catch (err) {
    req.log.error({ err }, "Failed to list area requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/delivery-area-requests/:id", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }
    const [row] = await db
      .select()
      .from(deliveryAreaRequestsTable)
      .where(
        and(
          eq(deliveryAreaRequestsTable.id, id),
          eq(deliveryAreaRequestsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }
    res.json(serializeRequest(row));
  } catch (err) {
    req.log.error({ err }, "Failed to get area request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-area-requests/:id/reject", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    const [updated] = await db
      .update(deliveryAreaRequestsTable)
      .set({ status: "rejected", reviewedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(deliveryAreaRequestsTable.id, id),
          eq(deliveryAreaRequestsTable.companyId, req.companyId!),
          eq(deliveryAreaRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Solicitação não encontrada ou já analisada." });
      return;
    }
    res.json(serializeRequest(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to reject area request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-area-requests/:id/approve", requireCompanyAuth, async (req, res) => {
  try {
    await ensureDeliveryAreasSchema();
    const id = Number(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const coverageType = parseCoverageType(body.type ?? body.coverageType);
    if (!coverageType) {
      res.status(400).json({ error: "Informe o tipo: Rua, Bairro ou Região." });
      return;
    }

    const [request] = await db
      .select()
      .from(deliveryAreaRequestsTable)
      .where(
        and(
          eq(deliveryAreaRequestsTable.id, id),
          eq(deliveryAreaRequestsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }
    if (request.status !== "pending") {
      res.status(400).json({ error: "Esta solicitação já foi analisada." });
      return;
    }

    const risk = Boolean(body.risk === true || body.risk === "true" || body.risk === "sim");
    const status = risk ? "blocked" : "active";
    const blockReason = String(body.blockReason || "").trim() || (status === "blocked" ? "Área de risco" : "");

    const minFee = parseMoney(body.minFee ?? body.fee, 0);
    const feePerKm = parseMoney(body.feePerKm, 0);
    const color =
      String(body.color || "").trim() || (status === "blocked" ? "#ef4444" : "#22c55e");

    const resolved = await resolveCoordsAndDistance({
      companyId: req.companyId!,
      address: request.address,
      addressNumber: request.addressNumber,
      neighborhood: request.neighborhood,
      city: request.city,
      cep: request.cep,
      lat: request.lat != null ? parseFloat(String(request.lat)) : null,
      lng: request.lng != null ? parseFloat(String(request.lng)) : null,
      distanceKm: request.distanceKm != null ? parseFloat(String(request.distanceKm)) : null,
    });
    const lat = resolved.lat ?? NaN;
    const lng = resolved.lng ?? NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "Esta solicitação não tem coordenadas para gerar a área." });
      return;
    }

    const polygon = circlePolygon(lat, lng, coverageRadiusKm(coverageType));
    if (!polygon) {
      res.status(400).json({ error: "Não foi possível gerar o polígono da área." });
      return;
    }

    const nameParts = [
      coverageType === "rua" ? "Rua" : coverageType === "bairro" ? "Bairro" : "Região",
      request.address || request.neighborhood || "Nova área",
    ];
    const name = nameParts.join(" ").slice(0, 80);

    const [area] = await db
      .insert(deliveryAreasTable)
      .values({
        companyId: req.companyId!,
        city: request.city || "Lauro de Freitas",
        name,
        color,
        status,
        enabled: true,
        blockReason: status === "blocked" ? blockReason : "",
        minFee,
        feePerKm,
        maxDistanceKm: null,
        notes: `Aprovado a partir da solicitação #${request.id} (${request.customerName || "cliente"}).`,
        priority: coverageType === "rua" ? 30 : coverageType === "bairro" ? 20 : 10,
        polygon,
        bbox: computeBbox(polygon),
      })
      .returning();

    let streetId: number | null = null;
    let zoneId: number | null = null;

    if (status === "active") {
      const streetName = displayStreetName(request.address || request.neighborhood || name);
      const streetKey = normalizeStreetKey(streetName);
      const genericStreet =
        !streetKey
        || streetKey === "gps"
        || streetKey === "localizacao gps"
        || streetKey === "s n"
        || streetKey === "sn";
      if (streetKey && !genericStreet) {
        const [known] = await db
          .select()
          .from(deliveryStreetsTable)
          .where(
            and(
              eq(deliveryStreetsTable.companyId, req.companyId!),
              eq(deliveryStreetsTable.streetKey, streetKey),
            ),
          )
          .limit(1);
        if (known) {
          const [updatedStreet] = await db
            .update(deliveryStreetsTable)
            .set({
              active: true,
              fee: minFee,
              neighborhood: request.neighborhood || known.neighborhood,
              city: request.city || known.city,
              cep: request.cep || known.cep,
              lat: String(lat),
              lng: String(lng),
              distanceKm: resolved.distanceKm != null ? String(resolved.distanceKm) : known.distanceKm,
              notes: known.notes,
              updatedAt: new Date(),
            })
            .where(eq(deliveryStreetsTable.id, known.id))
            .returning();
          streetId = updatedStreet?.id ?? known.id;
        } else {
          const [createdStreet] = await db
            .insert(deliveryStreetsTable)
            .values({
              companyId: req.companyId!,
              streetName,
              streetKey,
              neighborhood: request.neighborhood,
              city: request.city || "Lauro de Freitas",
              cep: request.cep,
              lat: String(lat),
              lng: String(lng),
              distanceKm: resolved.distanceKm != null ? String(resolved.distanceKm) : null,
              fee: minFee,
              notes: "",
              origin: "pedido",
              active: true,
            })
            .returning();
          streetId = createdStreet?.id ?? null;
        }
      }

      if (
        coverageType === "bairro"
        && request.neighborhood.trim()
        && normalizeStreetKey(request.neighborhood) !== "gps"
      ) {
        const [knownZone] = await db
          .select()
          .from(deliveryZonesTable)
          .where(
            and(
              eq(deliveryZonesTable.companyId, req.companyId!),
              sql`LOWER(neighborhood) = LOWER(${request.neighborhood.trim()})`,
            ),
          )
          .limit(1);
        if (knownZone) {
          const [updatedZone] = await db
            .update(deliveryZonesTable)
            .set({ fee: minFee, active: true, updatedAt: new Date() })
            .where(eq(deliveryZonesTable.id, knownZone.id))
            .returning();
          zoneId = updatedZone?.id ?? knownZone.id;
        } else {
          const [createdZone] = await db
            .insert(deliveryZonesTable)
            .values({
              companyId: req.companyId!,
              neighborhood: request.neighborhood.trim(),
              fee: minFee,
              active: true,
            })
            .returning();
          zoneId = createdZone?.id ?? null;
        }
      }
    }

    const [updated] = await db
      .update(deliveryAreaRequestsTable)
      .set({
        status: "approved",
        coverageType,
        areaId: area?.id ?? null,
        streetId,
        zoneId,
        lat: String(lat),
        lng: String(lng),
        distanceKm: resolved.distanceKm != null ? String(resolved.distanceKm) : request.distanceKm,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deliveryAreaRequestsTable.id, request.id))
      .returning();

    res.json({
      request: serializeRequest(updated!),
      area: area
        ? { id: area.id, name: area.name, color: area.color, status: area.status }
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to approve area request");
    res.status(500).json({ error: "Não foi possível aprovar a área." });
  }
});

export default router;
