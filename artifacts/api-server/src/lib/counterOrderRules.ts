/**
 * Counter (balcão) order sync + edit rules.
 * No schema change — flags live in order meta.
 */

export const PIX_PAID_EDIT_MESSAGE =
  "Pedidos pagos via PIX não podem ser alterados. Crie um novo pedido.";

/** Workflows where the attendant may still change items. */
export const COUNTER_EDITABLE_WORKFLOWS = [
  "awaiting_payment",
  "new",
  "accepted",
  "preparing",
] as const;

/** After these stages the kitchen/delivery flow has left the editable window. */
export const COUNTER_LOCKED_WORKFLOWS = [
  "ready",
  "out",
  "done",
  "finalized",
  "cancelled",
] as const;

const TAB_ACTIVE_WORKFLOWS = [
  "awaiting_payment",
  "new",
  "accepted",
  "preparing",
  "ready",
  "out",
] as const;

export type CounterEditDecision =
  | { ok: true }
  | { ok: false; error: string; code: "pix_paid" | "locked_status" | "not_attendant" | "empty_items" };

export function isCounterEditableWorkflow(workflow: string | null | undefined): boolean {
  return (COUNTER_EDITABLE_WORKFLOWS as readonly string[]).includes(String(workflow || ""));
}

export function isCounterLockedWorkflow(workflow: string | null | undefined): boolean {
  return (COUNTER_LOCKED_WORKFLOWS as readonly string[]).includes(String(workflow || ""));
}

export function isCustomerTabActiveWorkflow(workflow: string | null | undefined): boolean {
  return (TAB_ACTIVE_WORKFLOWS as readonly string[]).includes(String(workflow || ""));
}

/**
 * Registered Clube member (already cadastrado) vs walk-in created in this request.
 * New CRM rows created seconds earlier by Novo Pedido must NOT sync to the app.
 */
export function isEstablishedClubeMember(
  joinedAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!joinedAt) return false;
  const t = joinedAt instanceof Date ? joinedAt.getTime() : Date.parse(String(joinedAt));
  if (!Number.isFinite(t)) return false;
  return nowMs - t > 120_000;
}

export function shouldSyncAttendantOrderToCustomerApp(opts: {
  isAttendantOrder: boolean;
  linkToCustomerApp?: boolean;
  memberJoinedAt?: Date | string | null;
  memberActive?: boolean | null;
  nowMs?: number;
}): boolean {
  if (!opts.isAttendantOrder) return false;
  if (opts.memberActive === false) return false;
  if (!opts.memberJoinedAt && !opts.linkToCustomerApp) return false;
  if (opts.linkToCustomerApp === true) return true;
  return isEstablishedClubeMember(opts.memberJoinedAt, opts.nowMs);
}

export function evaluateCounterOrderEdit(opts: {
  source?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  workflow?: string | null;
  itemCount?: number;
}): CounterEditDecision {
  if (opts.source !== "attendant") {
    return { ok: false, error: "Só é possível editar pedidos lançados no balcão.", code: "not_attendant" };
  }
  if (opts.paymentMethod === "pix" && opts.paymentStatus === "paid") {
    return { ok: false, error: PIX_PAID_EDIT_MESSAGE, code: "pix_paid" };
  }
  if (!isCounterEditableWorkflow(opts.workflow)) {
    return {
      ok: false,
      error: "Este pedido não pode mais ser editado neste status.",
      code: "locked_status",
    };
  }
  if (typeof opts.itemCount === "number" && opts.itemCount <= 0) {
    return { ok: false, error: "Adicione ao menos um produto.", code: "empty_items" };
  }
  return { ok: true };
}

export function recalculateCounterOrderTotals(opts: {
  subtotal: number;
  deliveryFee: number;
  couponDiscount: number;
  fidelityDiscount: number;
  cashbackUsedAmount: number;
}): { discountAmount: number; total: number; cashbackApplied: number } {
  const subtotal = Math.max(0, round2(opts.subtotal));
  const deliveryFee = Math.max(0, round2(opts.deliveryFee));
  const couponDiscount = Math.min(subtotal, Math.max(0, round2(opts.couponDiscount)));
  const fidelityDiscount = Math.min(
    Math.max(0, subtotal - couponDiscount),
    Math.max(0, round2(opts.fidelityDiscount)),
  );
  const payable = Math.max(0, round2(subtotal + deliveryFee - couponDiscount - fidelityDiscount));
  const cashbackApplied = Math.min(payable, Math.max(0, round2(opts.cashbackUsedAmount)));
  const total = Math.max(0, round2(payable - cashbackApplied));
  const discountAmount = round2(couponDiscount + fidelityDiscount + cashbackApplied);
  return { discountAmount, total, cashbackApplied };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
