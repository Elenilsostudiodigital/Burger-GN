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
  if (mpStatus === "rejected" || mpStatus === "cancelled" || mpStatus === "refunded") return "failed";
  return "pending";
}

/**
 * Reconcile a Mercado Pago payment against the matching order.
 * On approved: mark paid, leave awaiting_payment, surface in the admin queue.
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

  if (existing.paymentStatus === paymentStatus && paymentStatus !== "paid") {
    const { meta } = parseOrderNotes(existing.notes);
    return {
      id: existing.id,
      trackingId: existing.trackingId,
      paymentStatus: existing.paymentStatus,
      workflow: resolveWorkflow(existing.status, meta),
    };
  }
  if (existing.paymentStatus === "paid" && paymentStatus === "paid") {
    const { meta } = parseOrderNotes(existing.notes);
    const workflow = resolveWorkflow(existing.status, meta);
    return { id: existing.id, trackingId: existing.trackingId, paymentStatus: "paid", workflow };
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
