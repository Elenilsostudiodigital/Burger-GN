/** Client-side mirrors of counter (balcão) edit + sync rules. */

export const PIX_PAID_EDIT_MESSAGE =
  "Pedidos pagos via PIX não podem ser alterados. Crie um novo pedido.";

export const COUNTER_EDITABLE_WORKFLOWS = [
  "awaiting_payment",
  "new",
  "accepted",
  "preparing",
] as const;

export const COUNTER_LOCKED_WORKFLOWS = [
  "ready",
  "out",
  "done",
  "finalized",
  "cancelled",
] as const;

export type CounterOrderLike = {
  source?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  workflow?: string | null;
  status?: string | null;
};

export function isCounterEditableWorkflow(workflow: string | null | undefined): boolean {
  return (COUNTER_EDITABLE_WORKFLOWS as readonly string[]).includes(String(workflow || ""));
}

export function isCounterLockedWorkflow(workflow: string | null | undefined): boolean {
  return (COUNTER_LOCKED_WORKFLOWS as readonly string[]).includes(String(workflow || ""));
}

export function canShowCounterEditAction(order: CounterOrderLike): boolean {
  if (order.source !== "attendant") return false;
  if (order.status === "cancelled" || order.workflow === "cancelled") return false;
  return isCounterEditableWorkflow(order.workflow) || (
    order.paymentMethod === "pix" && order.paymentStatus === "paid" && isCounterEditableWorkflow(order.workflow)
  );
}

/**
 * Button is shown in editable stages. PIX paid still shows it so the attendant
 * sees the required message when they try.
 */
export function counterEditButtonVisible(order: CounterOrderLike): boolean {
  if (order.source !== "attendant") return false;
  if (order.status === "cancelled" || order.workflow === "cancelled") return false;
  if (isCounterLockedWorkflow(order.workflow)) return false;
  if (isCounterEditableWorkflow(order.workflow)) return true;
  return false;
}

export function evaluateCounterOrderEdit(order: CounterOrderLike): {
  ok: boolean;
  error?: string;
  code?: "pix_paid" | "locked_status" | "not_attendant";
} {
  if (order.source !== "attendant") {
    return { ok: false, error: "Só é possível editar pedidos lançados no balcão.", code: "not_attendant" };
  }
  if (order.paymentMethod === "pix" && order.paymentStatus === "paid") {
    return { ok: false, error: PIX_PAID_EDIT_MESSAGE, code: "pix_paid" };
  }
  if (!isCounterEditableWorkflow(order.workflow)) {
    return { ok: false, error: "Este pedido não pode mais ser editado neste status.", code: "locked_status" };
  }
  return { ok: true };
}

export function lineSubtotal(opts: {
  productPrice: number;
  addons?: Array<{ price?: number }>;
  quantity: number;
}): number {
  const add = (opts.addons ?? []).reduce((s, a) => s + (Number(a.price) || 0), 0);
  return Math.round(((Number(opts.productPrice) || 0) + add) * Math.max(0, opts.quantity) * 100) / 100;
}
