import type { OrderMeta } from "./orderMeta";
import { appendHistory } from "./orderMeta";
import {
  getMPAccessToken,
  isRealMpPaymentId,
  refundMercadoPagoPayment,
  type MPRefundResult,
} from "./mercadopago";
import { logger } from "./logger";

const inFlight = new Map<string, Promise<MPRefundResult>>();

export function orderNeedsMercadoPagoRefund(
  order: { paymentMethod: string; paymentStatus: string; mpPaymentId: string | null },
  meta: Pick<OrderMeta, "pixMode" | "refundStatus">,
): boolean {
  if (order.paymentMethod !== "pix") return false;
  if (order.paymentStatus !== "paid") return false;
  if (meta.pixMode === "manual") return false;
  if (!isRealMpPaymentId(order.mpPaymentId)) return false;
  if (meta.refundStatus === "refunded") return false;
  return true;
}

export function applyRefundResultToMeta(meta: OrderMeta, result: MPRefundResult): OrderMeta {
  const now = new Date().toISOString();
  let next: OrderMeta = { ...meta, refundAttemptedAt: now };

  if (result.confirmed) {
    next.refundStatus = "refunded";
    if (result.refundId) next.mpRefundId = result.refundId;
    next.refundedAt = now;
    delete next.refundError;
    next = appendHistory(
      next,
      "cancelled",
      result.alreadyRefunded
        ? "Reembolso já confirmado no Mercado Pago"
        : "Reembolso confirmado pelo Mercado Pago",
    );
    return next;
  }

  if (result.refundStatus === "in_process" || result.refundStatus === "pending") {
    next.refundStatus = "processing";
    if (result.refundId) next.mpRefundId = result.refundId;
    delete next.refundError;
    next = appendHistory(
      next,
      "cancelled",
      "Reembolso solicitado, aguardando confirmação do Mercado Pago",
    );
    return next;
  }

  next.refundStatus = "failed";
  next.refundError = (result.error || "Falha no reembolso Mercado Pago").slice(0, 500);
  next = appendHistory(next, "cancelled", `Falha no reembolso: ${next.refundError}`);
  return next;
}

/**
 * Calls Mercado Pago refund for this payment ID.
 * Concurrent calls for the same payment share one in-flight promise;
 * the official API also receives a stable idempotency key per order.
 */
export async function executeMercadoPagoRefund(params: {
  companyId: number;
  orderId: number;
  paymentId: string;
}): Promise<MPRefundResult> {
  const paymentId = String(params.paymentId || "").trim();
  const key = `${params.companyId}:${paymentId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<MPRefundResult> => {
    const token = await getMPAccessToken(params.companyId);
    if (!token) {
      return {
        confirmed: false,
        alreadyRefunded: false,
        refundId: null,
        refundStatus: null,
        paymentStatus: null,
        error: "Token Mercado Pago não configurado.",
      };
    }
    const result = await refundMercadoPagoPayment({
      accessToken: token,
      paymentId,
      idempotencyKey: `refund-order-${params.orderId}`,
    });
    logger.info(
      {
        orderId: params.orderId,
        paymentId,
        confirmed: result.confirmed,
        refundId: result.refundId,
        refundStatus: result.refundStatus,
        paymentStatus: result.paymentStatus,
      },
      "Mercado Pago refund attempt finished",
    );
    return result;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
