import { Router } from "express";
import { db, ordersTable, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMPPayment } from "../lib/mercadopago";
import { broadcastSSE } from "../lib/sse";

const router = Router();

// Mercado Pago webhook (public) — MP calls this with the payment id whenever a
// payment is created/updated. We re-fetch the payment from MP's API (never trust
// the webhook body itself) and reconcile the matching order by external_reference.
router.post("/payments/mercadopago/webhook", async (req, res) => {
  try {
    // Always ack quickly so Mercado Pago doesn't retry; do the work best-effort.
    res.status(200).json({ received: true });

    const query = req.query as Record<string, string>;
    const body = req.body as { data?: { id?: string }; type?: string };
    const paymentId = query["data.id"] || query["id"] || body?.data?.id;
    const topic = query["type"] || query["topic"] || body?.type;
    if (!paymentId || (topic && topic !== "payment")) return;

    const [settings] = await db.select().from(paymentSettingsTable).limit(1);
    if (!settings?.mercadoPagoAccessToken) return;

    const payment = await fetchMPPayment(settings.mercadoPagoAccessToken, String(paymentId));
    if (!payment?.externalReference) return;

    const paymentStatus = payment.status === "approved" ? "paid" : payment.status === "rejected" || payment.status === "cancelled" ? "failed" : "pending";

    const [order] = await db.update(ordersTable)
      .set({ paymentStatus, updatedAt: new Date() })
      .where(eq(ordersTable.trackingId, payment.externalReference))
      .returning();

    if (order) {
      broadcastSSE("order_payment", { id: order.id, trackingId: order.trackingId, paymentStatus: order.paymentStatus });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to process Mercado Pago webhook");
  }
});

export default router;
