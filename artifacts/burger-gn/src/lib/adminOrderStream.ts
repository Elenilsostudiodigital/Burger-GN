/**
 * Single shared EventSource for /api/orders/stream.
 *
 * Multiple admin components used to open parallel SSE connections. On Vercel
 * serverless those connections die at maxDuration and EventSource reconnects,
 * which after ~20–30 minutes can trip WAF / DDoS persistent IP blocks → HTTP 403
 * for the whole site (including public /cardapio) from that network.
 */
const STREAM_URL = "/api/orders/stream";

let shared: EventSource | null = null;
let refs = 0;

export function acquireAdminOrderStream(): EventSource {
  if (
    !shared
    || shared.readyState === EventSource.CLOSED
  ) {
    shared = new EventSource(STREAM_URL, { withCredentials: true });
  }
  refs += 1;
  return shared;
}

export function releaseAdminOrderStream(es: EventSource): void {
  if (!shared || es !== shared) return;
  refs = Math.max(0, refs - 1);
  if (refs === 0) {
    try {
      shared.close();
    } catch { /* ignore */ }
    shared = null;
  }
}

/** Test helper — do not use in UI. */
export function _adminOrderStreamRefCountForTests(): number {
  return refs;
}
