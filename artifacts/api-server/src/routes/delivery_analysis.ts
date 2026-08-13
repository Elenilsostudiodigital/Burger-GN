import { Router } from "express";
import { db, deliveryAnalysisRequestsTable, ordersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { broadcastSSE } from "../lib/sse";
import {
  isUniquePendingViolation,
  serializeDeliveryAnalysis,
} from "../lib/deliveryAnalysis";

const router = Router();

const PENDING_EXISTS_MSG = "Já existe uma análise de entrega pendente para este pedido.";

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

    const now = new Date();
    const [updated] = await db
      .update(deliveryAnalysisRequestsTable)
      .set({
        status: "approved",
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
