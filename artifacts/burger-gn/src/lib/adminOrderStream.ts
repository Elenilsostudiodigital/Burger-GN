/**
 * Single shared EventSource for /api/orders/stream.
 *
 * Multiple admin components used to open parallel SSE connections. On Vercel
 * serverless those connections die at maxDuration and EventSource reconnects,
 * which after ~20–30 minutes can trip WAF / DDoS persistent IP blocks → HTTP 403
 * for the whole site (including public /cardapio) from that network.
 *
 * Server sends SSE `retry:` with per-connection jitter so a deploy (all
 * connections drop at once) does not reconnect in a stampede.
 *
 * Sleep mode closes the real socket and keeps the same hub so listeners survive
 * Ligar / Dormir without remounting the kitchen pages.
 */
import { isSystemSleeping, subscribeSystemMode } from "./systemModeClient";

const STREAM_URL = "/api/orders/stream";
const STREAM_EVENTS = [
  "new_order",
  "order_status",
  "order_receipt",
  "order_payment",
  "street_request",
  "street_request_resolved",
  "presence_update",
  "connected",
  "reconnect",
] as const;

let hub: EventSource | null = null;
let real: EventSource | null = null;
let refs = 0;

function forward(event: Event) {
  if (!hub) return;
  const message = event as MessageEvent;
  hub.dispatchEvent(new MessageEvent(message.type, { data: message.data }));
}

function detachReal() {
  if (!real) return;
  for (const name of STREAM_EVENTS) {
    real.removeEventListener(name, forward);
  }
  try { real.close(); } catch { /* ignore */ }
  real = null;
}

function attachReal() {
  if (refs <= 0 || isSystemSleeping()) {
    detachReal();
    return;
  }
  if (real && real.readyState !== EventSource.CLOSED) return;
  detachReal();
  real = new EventSource(STREAM_URL, { withCredentials: true });
  for (const name of STREAM_EVENTS) {
    real.addEventListener(name, forward);
  }
}

function getHub(): EventSource {
  if (hub) return hub;
  const target = new EventTarget() as EventSource;
  Object.defineProperty(target, "readyState", {
    get() {
      return real ? real.readyState : EventSource.CLOSED;
    },
  });
  hub = target;
  return target;
}

subscribeSystemMode(() => {
  if (refs <= 0) return;
  attachReal();
});

export function acquireAdminOrderStream(): EventSource {
  refs += 1;
  const next = getHub();
  attachReal();
  return next;
}

export function releaseAdminOrderStream(es: EventSource): void {
  if (!hub || es !== hub) return;
  refs = Math.max(0, refs - 1);
  if (refs === 0) {
    detachReal();
  }
}

/** Test helper — do not use in UI. */
export function _adminOrderStreamRefCountForTests(): number {
  return refs;
}
