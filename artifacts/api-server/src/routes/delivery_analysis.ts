import { Router } from "express";
import { db, deliveryAnalysisRequestsTable, deliveryStreetsTable, ordersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { broadcastSSE } from "../lib/sse";
import { normalizeStreetKey, displayStreetName } from "../lib/deliveryStreets";
import {
  isCheckoutAnalysisToken,
  isUniquePendingViolation,
  serializeDeliveryAnalysis,
} from "../lib/deliveryAnalysis";

const router = Router();

const PENDING_EXISTS_MSG = "Já existe uma análise de entrega pendente para este pedido.";
const PENDING_CHECKOUT_MSG = "Já existe uma análise pendente para este endereço.";

function parseFee(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100) / 100;
  if (typeof raw === "string" && raw.trim()) {
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
}

async function upsertLearnedStreet(opts: {
  companyId: number;
  address: string;
  neighborhood: string;
  city: string;
  fee: number;
  lat: string | null;
  lng: string | null;
}) {
  const streetName = displayStreetName(opts.address);
  const streetKey = normalizeStreetKey(streetName);
  if (!streetKey || streetKey.length < 3) return;
  const [existing] = await db
    .select()
    .from(deliveryStreetsTable)
    .where(
      and(
        eq(deliveryStreetsTable.companyId, opts.companyId),
        eq(deliveryStreetsTable.streetKey, streetKey),
      ),
    )
    .limit(1);
  if (existing) {
    if (!existing.active) return;
    await db
      .update(deliveryStreetsTable)
      .set({
        fee: String(opts.fee.toFixed(2)),
        neighborhood: opts.neighborhood || existing.neighborhood,
        city: opts.city || existing.city,
        lat: opts.lat ?? existing.lat,
        lng: opts.lng ?? existing.lng,
        origin: existing.origin || "pedido",
        updatedAt: new Date(),
      })
      .where(eq(deliveryStreetsTable.id, existing.id));
    return;
  }
  await db.insert(deliveryStreetsTable).values({
    companyId: opts.companyId,
    streetName,
    streetKey,
    neighborhood: opts.neighborhood,
    city: opts.city || "Lauro de Freitas",
    lat: opts.lat,
    lng: opts.lng,
    fee: String(opts.fee.toFixed(2)),
    origin: "pedido",
    active: true,
  });
}

/**
 * Checkout: request analysis for an address that is not in the automatic area.
 * No order exists yet — ownership is a client UUID token.
 */
router.post("/delivery/checkout-analysis", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const body = req.body as {
      token?: string;
      customerName?: string;
      phone?: string;
      address?: string;
      addressNumber?: string;
      neighborhood?: string;
      city?: string;
      complement?: string;
      reference?: string;
      lat?: number;
      lng?: number;
      note?: string;
    };

    const address = String(body.address || "").trim();
    const addressNumber = String(body.addressNumber || "").trim();
    const neighborhood = String(body.neighborhood || "").trim();
    if (!address || !addressNumber || !neighborhood) {
      res.status(400).json({ error: "Informe rua, número e bairro para solicitar a análise." });
      return;
    }

    let token = String(body.token || "").trim();
    if (token && !isCheckoutAnalysisToken(token)) {
      res.status(400).json({ error: "Token de análise inválido." });
      return;
    }
    if (!token) token = crypto.randomUUID();

    const [pending] = await db
      .select()
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.trackingId, token),
          eq(deliveryAnalysisRequestsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      res.status(409).json({
        error: PENDING_CHECKOUT_MSG,
        deliveryAnalysis: serializeDeliveryAnalysis(pending),
      });
      return;
    }

    const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
    const customerNote = String(body.note || "").trim().slice(0, 1000);

    let created;
    try {
      const inserted = await db
        .insert(deliveryAnalysisRequestsTable)
        .values({
          companyId,
          orderId: null,
          orderNumber: null,
          trackingId: token,
          source: "checkout",
          customerName: String(body.customerName || "").trim(),
          phone: String(body.phone || "").trim(),
          address,
          addressNumber,
          neighborhood,
          city: String(body.city || "Lauro de Freitas").trim(),
          complement: String(body.complement || "").trim(),
          reference: String(body.reference || "").trim(),
          lat: lat != null ? String(lat) : null,
          lng: lng != null ? String(lng) : null,
          deliveryFee: "0",
          customerNote,
          status: "pending",
        })
        .returning();
      created = inserted[0];
    } catch (err) {
      if (isUniquePendingViolation(err)) {
        res.status(409).json({ error: PENDING_CHECKOUT_MSG });
        return;
      }
      throw err;
    }

    if (!created) {
      res.status(500).json({ error: "Não foi possível registrar a solicitação." });
      return;
    }

    const payload = serializeDeliveryAnalysis(created);
    broadcastSSE(companyId, "delivery_analysis", payload);
    res.status(201).json({ ok: true, token, deliveryAnalysis: payload });
  } catch (err) {
    req.log.error({ err }, "Failed to create checkout delivery analysis");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/delivery/checkout-analysis/:token", resolvePublicCompany, async (req, res) => {
  try {
    const token = String((req.params as { token: string }).token || "").trim();
    if (!isCheckoutAnalysisToken(token)) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    const [row] = await db
      .select()
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.companyId, req.companyId!),
          eq(deliveryAnalysisRequestsTable.trackingId, token),
        ),
      )
      .orderBy(desc(deliveryAnalysisRequestsTable.requestedAt), desc(deliveryAnalysisRequestsTable.id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    res.json({ ok: true, deliveryAnalysis: serializeDeliveryAnalysis(row) });
  } catch (err) {
    req.log.error({ err }, "Failed to load checkout delivery analysis");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Customer: request delivery analysis for the order identified by trackingId.
 * Ownership is the tracking UUID — not a login. Wrong id → 404.
 * Does NOT change order.status or paymentStatus.
 */
router.post("/orders/track/:trackingId/delivery-analysis", async (req, res) => {
  try {
    const { trackingId } = req.params as { trackingId: string };
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    if (!order) {
      res.status(404).json({ error: "Pedido não encontrado" });
      return;
    }
    if (order.orderType !== "delivery") {
      res.status(400).json({ error: "A análise de entrega está disponível apenas para pedidos de delivery." });
      return;
    }
    if (order.status === "cancelled") {
      res.status(400).json({ error: "Não é possível solicitar análise de um pedido recusado." });
      return;
    }

    const body = req.body as { note?: string; customerNote?: string };
    const customerNote = String(body.note ?? body.customerNote ?? "").trim().slice(0, 1000);

    const [pending] = await db
      .select({ id: deliveryAnalysisRequestsTable.id })
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.orderId, order.id),
          eq(deliveryAnalysisRequestsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      res.status(409).json({ error: PENDING_EXISTS_MSG });
      return;
    }

    let created;
    try {
      const inserted = await db
        .insert(deliveryAnalysisRequestsTable)
        .values({
          companyId: order.companyId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          trackingId: order.trackingId,
          source: "order",
          customerName: order.customerName,
          phone: order.phone,
          address: order.address,
          addressNumber: order.addressNumber,
          neighborhood: order.neighborhood,
          deliveryFee: order.deliveryFee,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          customerNote,
          status: "pending",
        })
        .returning();
      created = inserted[0];
    } catch (err) {
      if (isUniquePendingViolation(err)) {
        res.status(409).json({ error: PENDING_EXISTS_MSG });
        return;
      }
      throw err;
    }

    if (!created) {
      res.status(500).json({ error: "Não foi possível registrar a solicitação." });
      return;
    }

    const payload = serializeDeliveryAnalysis(created);
    broadcastSSE(order.companyId, "delivery_analysis", payload);
    res.status(201).json({ ok: true, deliveryAnalysis: payload });
  } catch (err) {
    req.log.error({ err }, "Failed to create delivery analysis request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/delivery-analysis-requests", requireCompanyAuth, async (req, res) => {
  try {
    const status = String(req.query["status"] || "pending");
    const rows = await db
      .select()
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.companyId, req.companyId!),
          status === "all" ? sql`true` : eq(deliveryAnalysisRequestsTable.status, status),
        ),
      )
      .orderBy(desc(deliveryAnalysisRequestsTable.requestedAt));
    res.json(rows.map(serializeDeliveryAnalysis));
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery analysis requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-analysis-requests/:id/approve", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [row] = await db
      .select()
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.id, id),
          eq(deliveryAnalysisRequestsTable.companyId, req.companyId!),
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

    const isCheckout = row.source === "checkout" || row.orderId == null;
    const body = req.body as { fee?: unknown; deliveryFee?: unknown };
    let nextFee = row.deliveryFee;
    if (isCheckout) {
      const fee = parseFee(body.fee ?? body.deliveryFee);
      if (fee == null || fee < 0) {
        res.status(400).json({ error: "Informe a taxa de entrega para aprovar." });
        return;
      }
      nextFee = String(fee.toFixed(2));
    }

    const now = new Date();
    const [updated] = await db
      .update(deliveryAnalysisRequestsTable)
      .set({
        status: "approved",
        deliveryFee: nextFee,
        reviewedAt: now,
        reviewedByUserId: req.companyUserId ?? null,
        updatedAt: now,
      })
      .where(eq(deliveryAnalysisRequestsTable.id, id))
      .returning();

    if (isCheckout && updated) {
      const feeNum = parseFloat(String(updated.deliveryFee));
      if (Number.isFinite(feeNum)) {
        await upsertLearnedStreet({
          companyId: req.companyId!,
          address: updated.address,
          neighborhood: updated.neighborhood,
          city: updated.city || "Lauro de Freitas",
          fee: feeNum,
          lat: updated.lat,
          lng: updated.lng,
        });
      }
    }

    const payload = serializeDeliveryAnalysis(updated!);
    broadcastSSE(req.companyId!, "delivery_analysis", payload);
    res.json({ ok: true, deliveryAnalysis: payload });
  } catch (err) {
    req.log.error({ err }, "Failed to approve delivery analysis");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/delivery-analysis-requests/:id/reject", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as { reason?: string; rejectReason?: string };
    const reason = String(body.reason ?? body.rejectReason ?? "").trim();
    if (!reason) {
      res.status(400).json({ error: "Informe o motivo da recusa da análise." });
      return;
    }

    const [row] = await db
      .select()
      .from(deliveryAnalysisRequestsTable)
      .where(
        and(
          eq(deliveryAnalysisRequestsTable.id, id),
          eq(deliveryAnalysisRequestsTable.companyId, req.companyId!),
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

    const now = new Date();
    const [updated] = await db
      .update(deliveryAnalysisRequestsTable)
      .set({
        status: "rejected",
        rejectReason: reason.slice(0, 1000),
        reviewedAt: now,
        reviewedByUserId: req.companyUserId ?? null,
        updatedAt: now,
      })
      .where(eq(deliveryAnalysisRequestsTable.id, id))
      .returning();

    const payload = serializeDeliveryAnalysis(updated!);
    broadcastSSE(req.companyId!, "delivery_analysis", payload);
    res.json({ ok: true, deliveryAnalysis: payload });
  } catch (err) {
    req.log.error({ err }, "Failed to reject delivery analysis");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
