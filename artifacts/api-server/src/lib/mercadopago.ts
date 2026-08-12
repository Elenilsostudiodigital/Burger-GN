import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { db, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { buildStaticPixPayload } from "./staticPix";

export interface MPSettings {
  onlinePaymentEnabled: boolean;
  accessToken: string;
  publicKey: string;
}

/** Local placeholder tokens (seed/dev) — never used against the real Mercado Pago API. */
export function isLocalMpStubToken(accessToken: string): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (accessToken.startsWith("APP_USR-local") || accessToken.startsWith("TEST-local"))
  );
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

export async function getMPAccessToken(companyId: number): Promise<string | null> {
  const [settings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
  return settings?.mercadoPagoAccessToken || null;
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

interface StubPayment {
  id: string;
  status: string;
  externalReference: string;
  qrCode: string;
  qrCodeBase64: string;
}

const stubPayments = new Map<string, StubPayment>();

function createStubPixPayment(params: {
  total: number; trackingId: string;
}): PixPaymentResult {
  const paymentId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const qrCode = buildStaticPixPayload({
    key: "pix-online@theburgergn.com.br",
    merchantName: "THE BURGER GN",
    merchantCity: "LAURO DE FREITAS",
    amount: params.total,
    description: `MP${params.trackingId.replace(/-/g, "").slice(0, 10)}`,
  });
  const stub: StubPayment = {
    id: paymentId,
    status: "pending",
    externalReference: params.trackingId,
    qrCode,
    qrCodeBase64: "",
  };
  stubPayments.set(paymentId, stub);
  logger.warn({ paymentId, trackingId: params.trackingId }, "Mercado Pago stub Pix created (local token)");
  return { paymentId, qrCode, qrCodeBase64: stub.qrCodeBase64 };
}

export async function createPixPayment(params: {
  accessToken: string; total: number; trackingId: string;
  customerName: string; phone: string; notificationUrl: string;
}): Promise<PixPaymentResult | null> {
  if (isLocalMpStubToken(params.accessToken)) {
    return createStubPixPayment(params);
  }
  try {
    const client = getClient(params.accessToken);
    const payment = new Payment(client);
    const body: Record<string, unknown> = {
      transaction_amount: Math.round(params.total * 100) / 100,
      description: `Pedido The Burger GN #${params.trackingId}`,
      payment_method_id: "pix",
      external_reference: params.trackingId,
      payer: {
        email: syntheticPayerEmail(params.phone),
        first_name: params.customerName.split(" ")[0] || params.customerName,
      },
    };
    if (params.notificationUrl && !params.notificationUrl.includes("localhost")) {
      body.notification_url = params.notificationUrl;
    }
    const result = await payment.create({
      body: body as never,
      requestOptions: { idempotencyKey: `pix-${params.trackingId}` },
    });
    const txData = result.point_of_interaction?.transaction_data;
    if (!txData?.qr_code || !result.id) return null;
    return {
      paymentId: String(result.id),
      qrCode: txData.qr_code,
      qrCodeBase64: txData.qr_code_base64 ?? "",
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

export async function fetchMPPayment(
  accessToken: string,
  paymentId: string,
  opts?: { fromWebhook?: boolean },
): Promise<MPPaymentInfo | null> {
  if (isLocalMpStubToken(accessToken)) {
    const stub = stubPayments.get(String(paymentId));
    if (!stub) return null;
    if (opts?.fromWebhook && stub.status === "pending") {
      stub.status = "approved";
    }
    return {
      id: stub.id,
      status: stub.status,
      externalReference: stub.externalReference,
    };
  }
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
