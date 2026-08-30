import { Response } from "express";

interface SSEClient {
  res: Response;
  companyId: number;
}

/** Leave a margin before Vercel maxDuration (60s) kills the invocation with 504. */
const VERCEL_HARD_LIMIT_MS = 55_000;
const LOCAL_CAP_MS = 50_000;

/**
 * How long to keep GET /orders/stream open, based on time already spent
 * (schema, auth, cold start) rather than a fixed 45s that can exceed maxDuration.
 */
export function sseGracefulCloseMs(invocationStartedAt: number, now = Date.now()): number {
  const hardLimit = process.env["VERCEL"] ? VERCEL_HARD_LIMIT_MS : LOCAL_CAP_MS;
  const envCap = Math.max(15_000, Math.min(50_000, Number(process.env["SSE_GRACEFUL_MS"] || 45_000)));
  const remaining = hardLimit - (now - invocationStartedAt);
  return Math.max(8_000, Math.min(envCap, remaining));
}

const clients = new Set<SSEClient>();

export function addSSEClient(res: Response, companyId: number) {
  clients.add({ res, companyId });
}

export function removeSSEClient(res: Response) {
  for (const client of clients) {
    if (client.res === res) clients.delete(client);
  }
}

export function broadcastSSE(companyId: number, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.companyId !== companyId) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}
