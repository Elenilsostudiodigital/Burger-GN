import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  parseOrderNotes, serializeOrderNotes, appendHistory, resolveWorkflow,
  buildCustomerNotifyMessage, type OrderMeta,
} from "./orderMeta";
import { broadcastSSE } from "./sse";
import { logger } from "./logger";

export function mapMpStatus(mpStatus: string): "paid" | "failed" | "pending" {
  if (mpStatus === "approved") return "paid";
  if (mpStatus === "refunded" || mpStatus === "charged_back") return "paid";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "failed";
  return "pending";
}

function snapshot(existing: typeof ordersTable.$inferSelect, meta: OrderMeta) {
  return {
    id: existing.id,
    trackingId: existing.trackingId,
    paymentStatus: existing.paymentStatus,
    workflow: resolveWorkflow(existing.status, meta),
  };
}

async function confirmRefundFromWebhook(params: {
  companyId: number;
  existing: typeof ordersTable.$inferSelect;
  paymentId: string;
  mpStatus: string;
}): Promise<{ id: number; trackingId: string; paymentStatus: string; workflow: string } | null> {
  const { publicNotes, meta } = parseOrderNotes(params.existing.notes);
  if (meta.refundStatus === "refunded") {
    return snapshot(params.existing, meta);
  }

  let nextMeta: OrderMeta = {
    ...meta,
    pixMode: meta.pixMode ?? "online",
    refundStatus: "refunded",
    refundedAt: new Date().toISOString(),
    mpPaymentId: meta.mpPaymentId || params.paymentId,
  };
  delete nextMeta.refundError;
  nextMeta = appendHistory(nextMeta, params.existing.status === "cancelled" ? "cancelled" : resolveWorkflow(params.existing.status, meta), "Reembolso confirmado pelo Mercado Pago");

  const [order] = await db.update(ordersTable)
    .set({
      mpPaymentId: params.paymentId || params.existing.mpPaymentId,
      notes: serializeOrderNotes(publicNotes, nextMeta),
      updatedAt: new Date(),
    })
    .where(and(eq(ordersTable.id, params.existing.id), eq(ordersTable.companyId, params.companyId)))
    .returning();

  if (!order) return null;

  const workflow = resolveWorkflow(order.status, nextMeta);
  broadcastSSE(params.companyId, "order_status", {
    id: order.id,
    trackingId: order.trackingId,
    status: order.status,
    workflow,
    paymentStatus: order.paymentStatus,
    refundStatus: nextMeta.refundStatus,
    mpRefundId: nextMeta.mpRefundId ?? null,
    rejectReason: nextMeta.rejectReason ?? null,
  });

  logger.info(
    { trackingId: order.trackingId, mpPaymentId: params.paymentId, mpStatus: params.mpStatus },
    "Mercado Pago refund confirmed via webhook",
  );

  return { id: order.id, trackingId: order.trackingId, paymentStatus: order.paymentStatus, workflow };
}

/**
 * Reconcile a Mercado Pago payment against the matching order.
 * On approved: mark paid, leave awaiting_payment, surface in the admin queue.
 * On refunded: confirm refund meta only — never treat a confirmed refund as a failed payment.
 */
export async function applyMercadoPagoStatus(params: {
  companyId: number;
  trackingId?: string | null;
  paymentId: string;
  mpStatus: string;
}): Promise<{ id: number; trackingId: string; paymentStatus: string; workflow: string } | null> {
  const paymentStatus = mapMpStatus(params.mpStatus);

  const [byRef] = params.trackingId
    ? await db.select().from(ordersTable).where(and(
        eq(ordersTable.trackingId, params.trackingId),
        eq(ordersTable.companyId, params.companyId),
      ))
    : [];
  const [byMp] = !byRef && params.paymentId
    ? await db.select().from(ordersTable).where(and(
        eq(ordersTable.mpPaymentId, params.paymentId),
        eq(ordersTable.companyId, params.companyId),
      ))
    : [];
  const existing = byRef ?? byMp;
  if (!existing) return null;

  if (params.mpStatus === "refunded" || params.mpStatus === "charged_back") {
    return confirmRefundFromWebhook({
      companyId: params.companyId,
      existing,
      paymentId: params.paymentId,
      mpStatus: params.mpStatus,
    });
  }

  // A refused order must not be reopened or flipped to failed by later MP events.
  if (existing.status === "cancelled") {
    const { meta } = parseOrderNotes(existing.notes);
    return snapshot(existing, meta);
  }

  if (existing.paymentStatus === paymentStatus && paymentStatus !== "paid") {
    const { meta } = parseOrderNotes(existing.notes);
    return snapshot(existing, meta);
  }
  if (existing.paymentStatus === "paid" && paymentStatus === "paid") {
    const { meta } = parseOrderNotes(existing.notes);
    return snapshot(existing, meta);
  }

  const { publicNotes, meta } = parseOrderNotes(existing.notes);
  let nextMeta: OrderMeta = { ...meta, pixMode: meta.pixMode ?? "online" };
  let customerNotifyMessage: string | null = null;
  let notifyKind: "payment_confirmed" | null = null;

  if (paymentStatus === "paid") {
    nextMeta = appendHistory(nextMeta, "new", "Pagamento confirmado (Mercado Pago)");
    delete nextMeta.receiptRejectReason;
    delete nextMeta.receiptRejectedAt;
    notifyKind = "payment_confirmed";
    customerNotifyMessage = buildCustomerNotifyMessage(
      existing.orderNumber,
      existing.customerName,
      "payment_confirmed",
    );
  } else if (paymentStatus === "failed") {
    nextMeta = appendHistory(nextMeta, "awaiting_payment", "Pagamento Pix recusado pelo Mercado Pago");
  }

  const [order] = await db.update(ordersTable)
    .set({
      paymentStatus,
      mpPaymentId: params.paymentId || existing.mpPaymentId,
      status: "new",
      notes: serializeOrderNotes(publicNotes, nextMeta),
      updatedAt: new Date(),
    })
    .where(and(eq(ordersTable.id, existing.id), eq(ordersTable.companyId, params.companyId)))
    .returning();

  if (!order) return null;

  const enrichedWorkflow = resolveWorkflow(order.status, nextMeta);
  broadcastSSE(params.companyId, "order_payment", {
    id: order.id,
    trackingId: order.trackingId,
    paymentStatus: order.paymentStatus,
    workflow: enrichedWorkflow,
    customerNotifyMessage,
    notifyKind,
  });

  if (paymentStatus === "paid") {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    const { publicNotes: notes, meta: paidMeta } = parseOrderNotes(order.notes);
    broadcastSSE(params.companyId, "new_order", {
      ...order,
      notes,
      meta: paidMeta,
      workflow: enrichedWorkflow,
      items,
    });
  }

  logger.info(
    { trackingId: order.trackingId, paymentStatus, mpPaymentId: params.paymentId },
    "Mercado Pago payment reconciled",
  );

  return {
    id: order.id,
    trackingId: order.trackingId,
    paymentStatus: order.paymentStatus,
    workflow: enrichedWorkflow,
  };
}
