import { normalizeClientPhone, phonesMatch } from "./clientMeta";

/** Recovery-ready segments — computed from order history, not stored. */
export type ClientRecoverySegment =
  | "novo"
  | "recorrente"
  | "vip"
  | "inativo_7"
  | "inativo_15"
  | "inativo_30"
  | "ativo";

export interface ClientOrderStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastOrderNumber: number | null;
  segments: ClientRecoverySegment[];
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

const VIP_MIN_ORDERS = 5;
const VIP_MIN_SPENT = 300;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function emptyClientOrderStats(): ClientOrderStats {
  return {
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    lastOrderNumber: null,
    segments: ["novo"],
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

  return {
    orderCount,
    totalSpent: Math.round(totalSpent * 100) / 100,
    lastOrderAt,
    lastOrderNumber,
    segments,
  };
}

export function computeRecoverySegments(
  stats: Pick<ClientOrderStats, "orderCount" | "totalSpent" | "lastOrderAt">,
  now: Date = new Date(),
): ClientRecoverySegment[] {
  const segments: ClientRecoverySegment[] = [];

  if (stats.orderCount <= 1) segments.push("novo");
  if (stats.orderCount >= 2) segments.push("recorrente");
  if (stats.orderCount >= VIP_MIN_ORDERS || stats.totalSpent >= VIP_MIN_SPENT) {
    segments.push("vip");
  }

  if (stats.lastOrderAt) {
    const days = (now.getTime() - new Date(stats.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 30) segments.push("inativo_30");
    else if (days >= 15) segments.push("inativo_15");
    else if (days >= 7) segments.push("inativo_7");
    else segments.push("ativo");
  } else if (stats.orderCount === 0) {
    // Registered without orders — treat as inactive 30d for recovery readiness
    segments.push("inativo_30");
  }

  return segments;
}

/** Match company orders to a client by explicit meta id and/or phone. */
export function filterOrdersForClient(
  orders: OrderForStats[],
  opts: { clientId: number; phone: string },
): OrderForStats[] {
  const phone = normalizeClientPhone(opts.phone);
  return orders.filter((o) => {
    if (o.clientMemberId != null && o.clientMemberId === opts.clientId) return true;
    return phonesMatch(o.phone, phone);
  });
}

/** Build phone → orders index for list aggregation. */
export function indexOrdersByPhone(orders: OrderForStats[]): Map<string, OrderForStats[]> {
  const map = new Map<string, OrderForStats[]>();
  for (const order of orders) {
    const key = normalizeClientPhone(order.phone);
    if (!key || isAllZeros(key)) continue;
    const national = key.length > 11 ? key.slice(-11) : key;
    const list = map.get(national) ?? [];
    list.push(order);
    map.set(national, list);
  }
  return map;
}

function isAllZeros(phone: string): boolean {
  const national = phone.startsWith("55") ? phone.slice(2) : phone;
  return /^0+$/.test(national);
}

export function ordersForPhone(
  index: Map<string, OrderForStats[]>,
  phone: string,
): OrderForStats[] {
  const key = normalizeClientPhone(phone);
  if (!key) return [];
  const national = key.length > 11 ? key.slice(-11) : key;
  return index.get(national) ?? [];
}
