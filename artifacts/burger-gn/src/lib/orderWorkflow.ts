/**
 * Kitchen board workflow by order type.
 * Delivery: new → preparing → ready → out → done
 * Pickup / local: new → preparing → ready → (finalize) — no "out"
 */
import type { OrderType } from "./api";

export type BoardColumnKey = "new" | "preparing" | "ready" | "out" | "done";

export const DELIVERY_BOARD_FLOW: BoardColumnKey[] = [
  "new",
  "preparing",
  "ready",
  "out",
  "done",
];

export const PICKUP_LOCAL_BOARD_FLOW: BoardColumnKey[] = [
  "new",
  "preparing",
  "ready",
  "done",
];

export function usesDeliveryWorkflow(orderType: OrderType | string | null | undefined): boolean {
  return orderType === "delivery";
}

export function getBoardFlow(orderType: OrderType | string | null | undefined): BoardColumnKey[] {
  return usesDeliveryWorkflow(orderType) ? DELIVERY_BOARD_FLOW : PICKUP_LOCAL_BOARD_FLOW;
}

export function getNextBoardColumn(
  orderType: OrderType | string | null | undefined,
  column: BoardColumnKey | "cancelled",
): BoardColumnKey | null {
  if (column === "cancelled") return null;
  // Legacy: non-delivery orders that landed on "out" can move to done.
  if (column === "out" && !usesDeliveryWorkflow(orderType)) return "done";
  const flow = getBoardFlow(orderType);
  const i = flow.indexOf(column);
  if (i < 0 || i >= flow.length - 1) return null;
  return flow[i + 1]!;
}

export function getPrevBoardColumn(
  orderType: OrderType | string | null | undefined,
  column: BoardColumnKey | "cancelled",
): BoardColumnKey | null {
  if (column === "cancelled") return null;
  if (column === "out" && !usesDeliveryWorkflow(orderType)) return "ready";
  const flow = getBoardFlow(orderType);
  const i = flow.indexOf(column);
  if (i <= 0) return null;
  return flow[i - 1]!;
}

/** Pickup/local on Pronto: next action is Finalizar (skip Saiu / Entregue advance). */
export function canFinalizeFromReady(
  orderType: OrderType | string | null | undefined,
  column: BoardColumnKey | "cancelled",
): boolean {
  return !usesDeliveryWorkflow(orderType) && column === "ready";
}

/** Block dragging/advancing non-delivery orders into "Saiu para Entrega". */
export function isOutStageAllowed(orderType: OrderType | string | null | undefined): boolean {
  return usesDeliveryWorkflow(orderType);
}
