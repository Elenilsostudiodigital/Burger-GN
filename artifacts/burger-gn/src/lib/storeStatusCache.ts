import { getStoreStatus, type StoreStatusPublic } from "./api";

type Listener = (status: StoreStatusPublic | null) => void;

const listeners = new Set<Listener>();
let cached: StoreStatusPublic | null = null;
let fetchedAt = 0;
let inflight: Promise<StoreStatusPublic | null> | null = null;

const MIN_GAP_MS = 12_000;

export function peekStoreStatus(): StoreStatusPublic | null {
  return cached;
}

export function isStoreOpenCached(): boolean | null {
  if (!cached) return null;
  return cached.isOpen !== false;
}

export async function refreshStoreStatus(force = false): Promise<StoreStatusPublic | null> {
  if (!force && cached && Date.now() - fetchedAt < MIN_GAP_MS) return cached;
  if (inflight) return inflight;
  inflight = getStoreStatus()
    .then((status) => {
      cached = status;
      fetchedAt = Date.now();
      for (const listener of listeners) listener(status);
      return status;
    })
    .catch(() => cached)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function subscribeStoreStatus(listener: Listener): () => void {
  listeners.add(listener);
  if (cached) listener(cached);
  return () => {
    listeners.delete(listener);
  };
}
