/**
 * Classify HTTP 403: our API vs Vercel WAF / firewall (post-deploy stampede).
 * WAF 403 has no X-BurgerGN-Api header and often x-vercel-mitigated.
 */
export const APP_API_HEADER = "x-burgergn-api";

export type EdgeProbeResult = {
  ok: boolean;
  status: number;
  edgeBlocked: boolean;
  hasApiHeader: boolean;
  vercelMitigated: string | null;
};

export function classifyForbiddenResponse(res: Response): {
  edgeBlocked: boolean;
  hasApiHeader: boolean;
  vercelMitigated: string | null;
} {
  const hasApiHeader = res.headers.get(APP_API_HEADER) === "1";
  const vercelMitigated =
    res.headers.get("x-vercel-mitigated") ||
    res.headers.get("x-vercel-challenge-token") ||
    res.headers.get("x-vercel-firewall-challenge") ||
    null;
  const edgeBlocked =
    (res.status === 403 || res.status === 429) && !hasApiHeader;
  return { edgeBlocked, hasApiHeader, vercelMitigated };
}

export async function probeApiHealth(): Promise<EdgeProbeResult> {
  try {
    const res = await fetch("/api/healthz", { method: "GET", cache: "no-store" });
    const classified = classifyForbiddenResponse(res);
    return {
      ok: res.ok,
      status: res.status,
      ...classified,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      edgeBlocked: false,
      hasApiHeader: false,
      vercelMitigated: null,
    };
  }
}

export function reportClientTelemetry(payload: Record<string, unknown>) {
  try {
    void fetch("/api/client-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

const LOG_KEY = "bgn_edge_403_log_v1";

export function appendEdgeBlockLog(entry: Record<string, unknown>) {
  try {
    const prev = JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as unknown[];
    const next = [...prev, { at: new Date().toISOString(), ...entry }].slice(-30);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
