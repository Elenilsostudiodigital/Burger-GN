import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { db, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface MPSettings {
  onlinePaymentEnabled: boolean;
  accessToken: string;
  publicKey: string;
}

export async function getMPSettings(companyId: number): Promise<MPSettings | null> {
  const [settings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
  if (!settings || !settings.onlinePaymentEnabled || !settings.mercadoPagoAccessToken) return null;
  return {
    onlinePaymentEnabled: settings.onlinePaymentEnabled,
    accessToken: settings.mercadoPagoAccessToken,
    publicKey: settings.mercadoPagoPublicKey ?? "",
  };
}

function getClient(accessToken: string): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken });
}

// A valid-format email is required by the Mercado Pago Payments API for Pix,
// but we don't collect customer email at checkout — synthesize one from the phone number.
function syntheticPayerEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "") || "cliente";
  return `pedido${digits}@theburgergn.com.br`;
}

export interface PixPaymentResult {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
}

export async function createPixPayment(params: {
  accessToken: string; total: number; trackingId: string;
  customerName: string; phone: string; notificationUrl: string;
}): Promise<PixPaymentResult | null> {
  try {
    const client = getClient(params.accessToken);
    const payment = new Payment(client);
    const result = await payment.create({
      body: {
        transaction_amount: Math.round(params.total * 100) / 100,
        description: `Pedido The Burger GN #${params.trackingId}`,
        payment_method_id: "pix",
        external_reference: params.trackingId,
        notification_url: params.notificationUrl,
        payer: {
          email: syntheticPayerEmail(params.phone),
          first_name: params.customerName.split(" ")[0] || params.customerName,
        },
      },
    });
    const txData = result.point_of_interaction?.transaction_data;
    if (!txData?.qr_code || !txData?.qr_code_base64 || !result.id) return null;
    return {
      paymentId: String(result.id),
      qrCode: txData.qr_code,
      qrCodeBase64: txData.qr_code_base64,
    };
  } catch (err) {
    logger.error({ err }, "Failed to create Mercado Pago Pix payment");
    return null;
  }
}

export interface CardPreferenceResult {
  preferenceId: string;
  checkoutUrl: string;
}

export async function createCardPreference(params: {
  accessToken: string; total: number; trackingId: string;
  notificationUrl: string; backUrl: string;
}): Promise<CardPreferenceResult | null> {
  try {
    const client = getClient(params.accessToken);
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [{
          id: params.trackingId,
          title: `Pedido The Burger GN #${params.trackingId}`,
          quantity: 1,
          unit_price: Math.round(params.total * 100) / 100,
          currency_id: "BRL",
        }],
        external_reference: params.trackingId,
        notification_url: params.notificationUrl,
        back_urls: { success: params.backUrl, failure: params.backUrl, pending: params.backUrl },
        auto_return: "approved",
        payment_methods: {
          excluded_payment_types: [
            { id: "ticket" }, { id: "bank_transfer" }, { id: "atm" },
            { id: "digital_wallet" }, { id: "digital_currency" },
          ],
        },
      },
    });
    if (!result.id || !result.init_point) return null;
    return { preferenceId: result.id, checkoutUrl: result.init_point };
  } catch (err) {
    logger.error({ err }, "Failed to create Mercado Pago card preference");
    return null;
  }
}

export interface MPPaymentInfo {
  id: string; status: string; externalReference: string | null;
}

export async function fetchMPPayment(accessToken: string, paymentId: string): Promise<MPPaymentInfo | null> {
  try {
    const client = getClient(accessToken);
    const payment = new Payment(client);
    const result = await payment.get({ id: paymentId });
    if (!result.id) return null;
    return {
      id: String(result.id),
      status: result.status ?? "unknown",
      externalReference: result.external_reference ?? null,
    };
  } catch (err) {
    logger.error({ err, paymentId }, "Failed to fetch Mercado Pago payment");
    return null;
  }
}
