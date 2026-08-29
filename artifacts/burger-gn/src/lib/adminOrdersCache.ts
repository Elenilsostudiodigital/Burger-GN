import { getOrders, type Order } from "./api";

type Listener = (orders: Order[]) => void;

const listeners = new Set<Listener>();
let cached: Order[] | null = null;
let cachedAt = 0;
let inflight: Promise<Order[]> | null = null;

const TTL_MS = 12_000;

function emit(orders: Order[]) {
  for (const listener of listeners) listener(orders);
}

export async function fetchSharedAdminOrders(force = false): Promise<Order[]> {
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (inflight) return inflight;
  inflight = getOrders()
    .then((orders) => {
      cached = orders;
      cachedAt = Date.now();
      emit(orders);
      return orders;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function mergeSharedAdminOrder(order: Order): void {
  if (!cached) {
    cached = [order];
  } else {
    cached = [order, ...cached.filter((item) => item.id !== order.id)];
  }
  cachedAt = Date.now();
  emit(cached);
}

export function invalidateSharedAdminOrders(): void {
  cachedAt = 0;
}

export function sharedAdminOrdersHavePreparing(): boolean {
  if (!cached) return true;
  return cached.some(
    (order) =>
      (order.workflow === "preparing" || order.status === "preparing")
      && !order.prepFinishedAt,
  );
}

export function subscribeSharedAdminOrders(listener: Listener): () => void {
  listeners.add(listener);
  if (cached) listener(cached);
  return () => {
    listeners.delete(listener);
  };
}
