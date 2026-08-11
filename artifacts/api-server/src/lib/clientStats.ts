import { phoneIdentityKeys, phonesMatch } from "./clientMeta";

/** Recovery-ready segments — computed from order history, not stored. */
export type ClientRecoverySegment =
  | "novo"
  | "recorrente"
  | "vip"
  | "inativo_7"
  | "inativo_15"
  | "inativo_30"
  | "ativo";

/** Operational recovery status for the Recuperação panel (computed, not stored). */
export type RecoveryStatus = "ativo" | "esfriando" | "em_risco" | "perdido";

export type RecoveryFilter =
  | "todos"
  | "esfriando"
  | "em_risco"
  | "perdido"
  | "vip_inativo";

export interface ClientOrderStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastOrderNumber: number | null;
  segments: ClientRecoverySegment[];
  /** Whole days since last non-cancelled order (or null if never). */
  daysWithoutOrder: number | null;
  recoveryStatus: RecoveryStatus;
  isVip: boolean;
  vipInativo: boolean;
}

export interface OrderForStats {
  id: number;
  orderNumber: number;
  phone: string;
  total: string | number;
  status: string;
  createdAt: Date | string;
  /** Optional explicit link from order meta (when present). */
  clientMemberId?: number | null;
}

export const VIP_MIN_ORDERS = 5;
export const VIP_MIN_SPENT = 300;
const DAY_MS = 1000 * 60 * 60 * 24;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function daysBetween(from: Date | string, to: Date = new Date()): number {
  const start = toDate(from).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((to.getTime() - start) / DAY_MS));
}

export function isVipClient(orderCount: number, totalSpent: number): boolean {
  return orderCount >= VIP_MIN_ORDERS || totalSpent >= VIP_MIN_SPENT;
}

/** Map last-order age to recovery bucket. No orders ⇒ perdido. */
export function computeRecoveryStatus(
  lastOrderAt: string | null,
  orderCount: number,
  now: Date = new Date(),
): { status: RecoveryStatus; daysWithoutOrder: number | null } {
  if (!lastOrderAt || orderCount <= 0) {
    return { status: "perdido", daysWithoutOrder: null };
  }
  const days = daysBetween(lastOrderAt, now);
  if (days <= 7) return { status: "ativo", daysWithoutOrder: days };
  if (days <= 15) return { status: "esfriando", daysWithoutOrder: days };
  if (days <= 30) return { status: "em_risco", daysWithoutOrder: days };
  return { status: "perdido", daysWithoutOrder: days };
}

export function emptyClientOrderStats(): ClientOrderStats {
  return {
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    lastOrderNumber: null,
    segments: ["novo", "inativo_30"],
    daysWithoutOrder: null,
    recoveryStatus: "perdido",
    isVip: false,
    vipInativo: false,
  };
}

export function computeClientOrderStats(
  orders: OrderForStats[],
  now: Date = new Date(),
): ClientOrderStats {
  // Exclude cancelled from spend/loyalty stats; still count last activity if only cancelled exist.
  const active = orders.filter((o) => o.status !== "cancelled");
  const pool = active.length > 0 ? active : orders;

  const sorted = [...pool].sort(
    (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
  );

  const orderCount = active.length;
  const totalSpent = active.reduce((sum, o) => sum + (parseFloat(String(o.total)) || 0), 0);
  const last = sorted[0];
  const lastOrderAt = last ? toDate(last.createdAt).toISOString() : null;
  const lastOrderNumber = last ? last.orderNumber : null;

  const segments = computeRecoverySegments({ orderCount, totalSpent, lastOrderAt }, now);
  const { status, daysWithoutOrder } = computeRecoveryStatus(lastOrderAt, orderCount, now);
  const vip = isVipClient(orderCount, totalSpent);
  const vipInativo = vip && daysWithoutOrder !== null && daysWithoutOrder > 15;

  return {
    orderCount,
    totalSpent: Math.round(totalSpent * 100) / 100,
    lastOrderAt,
    lastOrderNumber,
    segments,
    daysWithoutOrder,
    recoveryStatus: status,
    isVip: vip,
    vipInativo,
  };
}

export function computeRecoverySegments(
  stats: Pick<ClientOrderStats, "orderCount" | "totalSpent" | "lastOrderAt">,
  now: Date = new Date(),
): ClientRecoverySegment[] {
  const segments: ClientRecoverySegment[] = [];

  if (stats.orderCount <= 1) segments.push("novo");
  if (stats.orderCount >= 2) segments.push("recorrente");
  if (isVipClient(stats.orderCount, stats.totalSpent)) {
    segments.push("vip");
  }

  const { status, daysWithoutOrder } = computeRecoveryStatus(
    stats.lastOrderAt,
    stats.orderCount,
    now,
  );
  if (status === "ativo") segments.push("ativo");
  else if (status === "esfriando") segments.push("inativo_7");
  else if (status === "em_risco") segments.push("inativo_15");
  else segments.push("inativo_30");

  if (isVipClient(stats.orderCount, stats.totalSpent) && daysWithoutOrder !== null && daysWithoutOrder > 15) {
    // vip + inactive already covered by vip + inativo_* flags
  }

  return segments;
}

/** Urgency sort: lost → risk → cooling; VIP inactive boosted; then more days first. */
export function recoverySortScore(row: {
  recoveryStatus: RecoveryStatus;
  vipInativo: boolean;
  daysWithoutOrder: number | null;
}): number {
  const statusWeight =
    row.recoveryStatus === "perdido" ? 3000
      : row.recoveryStatus === "em_risco" ? 2000
        : row.recoveryStatus === "esfriando" ? 1000
          : 0;
  const vipBoost = row.vipInativo ? 500 : 0;
  const days = row.daysWithoutOrder ?? 9999;
  return statusWeight + vipBoost + days;
}

export function matchesRecoveryFilter(
  row: { recoveryStatus: RecoveryStatus; vipInativo: boolean },
  filter: RecoveryFilter,
): boolean {
  if (filter === "todos") {
    return row.recoveryStatus !== "ativo";
  }
  if (filter === "vip_inativo") return row.vipInativo;
  return row.recoveryStatus === filter;
}

/** Match company orders to a client by explicit meta id and/or phone. */
export function filterOrdersForClient(
  orders: OrderForStats[],
  opts: { clientId: number; phone: string },
): OrderForStats[] {
  return orders.filter((o) => {
    if (o.clientMemberId != null && o.clientMemberId === opts.clientId) return true;
    return phonesMatch(o.phone, opts.phone);
  });
}

/** Build phone-identity → orders index for list aggregation. */
export function indexOrdersByPhone(orders: OrderForStats[]): Map<string, OrderForStats[]> {
  const map = new Map<string, OrderForStats[]>();
  for (const order of orders) {
    const keys = phoneIdentityKeys(order.phone).filter((k) => k && !/^0+$/.test(k));
    if (!keys.length) continue;
    for (const key of keys) {
      const list = map.get(key) ?? [];
      // Avoid duplicating the same order under one key.
      if (!list.some((o) => o.id === order.id)) list.push(order);
      map.set(key, list);
    }
  }
  return map;
}

export function ordersForPhone(
  index: Map<string, OrderForStats[]>,
  phone: string,
): OrderForStats[] {
  const keys = phoneIdentityKeys(phone);
  if (!keys.length) return [];
  const seen = new Set<number>();
  const out: OrderForStats[] = [];
  for (const key of keys) {
    for (const order of index.get(key) ?? []) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      out.push(order);
    }
  }
  return out;
}
