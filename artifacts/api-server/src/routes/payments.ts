import { Router } from "express";
import { db, paymentSettingsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMPPayment } from "../lib/mercadopago";
import { applyMercadoPagoStatus } from "../lib/mpReconcile";
import { ensurePaymentSettingsSchema } from "../lib/ensurePaymentSettingsSchema";

const router = Router();

// Mercado Pago webhook (public) — MP calls this with the payment id whenever a
// payment is created/updated. We re-fetch the payment from MP's API (never trust
// the webhook body itself) and reconcile the matching order by external_reference.
router.post("/payments/mercadopago/webhook", async (req, res) => {
  // Ack before any DB/schema work so Mercado Pago gets HTTP 200 within 22s
  // even on Neon cold start. Middleware also skips this path (see app.ts).
  res.status(200).json({ received: true });

  try {
    await ensurePaymentSettingsSchema();

    const query = req.query as Record<string, string>;
    const body = req.body as { data?: { id?: string }; type?: string };
    const paymentId = query["data.id"] || query["id"] || body?.data?.id;
    const topic = query["type"] || query["topic"] || body?.type;
    const companySlug = query["company"];
    if (!paymentId || (topic && topic !== "payment") || !companySlug) return;

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.slug, companySlug));
    if (!company) return;

    const [settings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, company.id));
    if (!settings?.mercadoPagoAccessToken) return;

    const payment = await fetchMPPayment(settings.mercadoPagoAccessToken, String(paymentId), { fromWebhook: true });
    if (!payment) return;

    await applyMercadoPagoStatus({
      companyId: company.id,
      trackingId: payment.externalReference,
      paymentId: payment.id,
      mpStatus: payment.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to process Mercado Pago webhook");
  }
});

export default router;
