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

export function isRealMpPaymentId(paymentId: string | null | undefined): boolean {
  const id = String(paymentId || "").trim();
  return Boolean(id) && !id.startsWith("static_");
}

export function isConfirmedMpRefund(
  paymentStatus: string | null | undefined,
  refundStatus: string | null | undefined,
): boolean {
  const pay = String(paymentStatus || "").toLowerCase();
  const ref = String(refundStatus || "").toLowerCase();
  if (pay === "refunded" || pay === "charged_back") return true;
  if (ref === "approved") return true;
  return false;
}

export interface MPPaymentInfo {
  id: string; status: string; externalReference: string | null;
}

export interface MPRefundResult {
  /** True only after Mercado Pago confirms the refund (payment refunded/charged_back or refund approved). */
  confirmed: boolean;
  alreadyRefunded: boolean;
  refundId: string | null;
  refundStatus: string | null;
  paymentStatus: string | null;
  error: string | null;
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

const MP_API_BASE = "https://api.mercadopago.com";

async function parseMpJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function mpErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const o = body as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) return o.message.slice(0, 400);
  const cause = o.cause;
  if (Array.isArray(cause) && cause[0] && typeof cause[0] === "object") {
    const description = (cause[0] as { description?: string }).description;
    if (description) return String(description).slice(0, 400);
  }
  return fallback;
}

function looksAlreadyRefunded(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("already refunded")
    || s.includes("already been refunded")
    || s.includes("payment is refunded")
    || s.includes("já reembolsado")
  );
}

function refundIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  if (id == null) return null;
  const value = String(id).trim();
  return value || null;
}

function refundStatusFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const status = (body as { status?: unknown }).status;
  return typeof status === "string" && status.trim() ? status : null;
}

/**
 * Full refund via the official Mercado Pago Payments API:
 * POST /v1/payments/{id}/refunds
 *
 * Uses a stable idempotency key so retries / double-clicks do not create a second refund.
 * Only reports `confirmed: true` after MP returns a valid refund/payment confirmation.
 */
export async function refundMercadoPagoPayment(params: {
  accessToken: string;
  paymentId: string;
  idempotencyKey: string;
}): Promise<MPRefundResult> {
  const paymentId = String(params.paymentId || "").trim();
  const empty: MPRefundResult = {
    confirmed: false,
    alreadyRefunded: false,
    refundId: null,
    refundStatus: null,
    paymentStatus: null,
    error: null,
  };

  if (!isRealMpPaymentId(paymentId)) {
    return { ...empty, error: "Payment ID do Mercado Pago inválido." };
  }

  if (isLocalMpStubToken(params.accessToken)) {
    const stub = stubPayments.get(paymentId);
    if (!stub) {
      return { ...empty, error: "Pagamento stub não encontrado para reembolso." };
    }
    if (stub.status === "refunded" || stub.status === "charged_back") {
      return {
        confirmed: true,
        alreadyRefunded: true,
        refundId: `stub-refund-${paymentId}`,
        refundStatus: "approved",
        paymentStatus: stub.status,
        error: null,
      };
    }
    if (stub.status !== "approved") {
      return {
        ...empty,
        paymentStatus: stub.status,
        error: `Pagamento não está aprovado para reembolso (${stub.status}).`,
      };
    }
    stub.status = "refunded";
    logger.info({ paymentId }, "Mercado Pago stub refund confirmed (local token)");
    return {
      confirmed: true,
      alreadyRefunded: false,
      refundId: `stub-refund-${paymentId}`,
      refundStatus: "approved",
      paymentStatus: "refunded",
      error: null,
    };
  }

  try {
    const before = await fetchMPPayment(params.accessToken, paymentId);
    if (!before) {
      return { ...empty, error: "Não foi possível consultar o pagamento no Mercado Pago." };
    }
    if (isConfirmedMpRefund(before.status, null)) {
      return {
        confirmed: true,
        alreadyRefunded: true,
        refundId: null,
        refundStatus: "approved",
        paymentStatus: before.status,
        error: null,
      };
    }
    if (before.status !== "approved") {
      return {
        ...empty,
        paymentStatus: before.status,
        error: `Pagamento não está aprovado para reembolso (${before.status}).`,
      };
    }

    const res = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    const body = await parseMpJson(res);
    const refundId = refundIdFromBody(body);
    const refundStatus = refundStatusFromBody(body);

    const after = await fetchMPPayment(params.accessToken, paymentId);
    const paymentStatus = after?.status ?? before.status;

    if (isConfirmedMpRefund(paymentStatus, refundStatus)) {
      logger.info(
        { paymentId, refundId, paymentStatus, refundStatus, httpStatus: res.status },
        "Mercado Pago refund confirmed",
      );
      return {
        confirmed: true,
        alreadyRefunded: false,
        refundId,
        refundStatus: refundStatus ?? "approved",
        paymentStatus,
        error: null,
      };
    }

    if (!res.ok) {
      const errMsg = mpErrorMessage(body, `Falha no reembolso Mercado Pago (HTTP ${res.status}).`);
      if (looksAlreadyRefunded(errMsg) || isConfirmedMpRefund(paymentStatus, null)) {
        const confirmedPay = await fetchMPPayment(params.accessToken, paymentId);
        const confirmedStatus = confirmedPay?.status ?? paymentStatus;
        if (isConfirmedMpRefund(confirmedStatus, null)) {
          return {
            confirmed: true,
            alreadyRefunded: true,
            refundId,
            refundStatus: "approved",
            paymentStatus: confirmedStatus,
            error: null,
          };
        }
      }
      logger.error({ paymentId, httpStatus: res.status, body }, "Mercado Pago refund request failed");
      return {
        ...empty,
        refundId,
        refundStatus,
        paymentStatus,
        error: errMsg,
      };
    }

    if (refundStatus === "in_process" || refundStatus === "pending") {
      logger.warn({ paymentId, refundId, refundStatus }, "Mercado Pago refund in process — not yet confirmed");
      return {
        confirmed: false,
        alreadyRefunded: false,
        refundId,
        refundStatus,
        paymentStatus,
        error: null,
      };
    }

    logger.error({ paymentId, refundId, refundStatus, paymentStatus, body }, "Mercado Pago refund not confirmed");
    return {
      ...empty,
      refundId,
      refundStatus,
      paymentStatus,
      error: `Mercado Pago não confirmou o reembolso (pagamento: ${paymentStatus}, reembolso: ${refundStatus || "desconhecido"}).`,
    };
  } catch (err) {
    logger.error({ err, paymentId }, "Failed to refund Mercado Pago payment");
    return {
      ...empty,
      error: err instanceof Error ? err.message.slice(0, 400) : "Falha ao solicitar reembolso no Mercado Pago.",
    };
  }
}
