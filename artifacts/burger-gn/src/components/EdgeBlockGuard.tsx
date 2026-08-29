import React, { useRef, useState } from "react";
import {
  appendEdgeBlockLog,
  probeApiHealth,
  reportClientTelemetry,
} from "../lib/edgeBlock";
import { useSmartPoll } from "../lib/useSmartPoll";

/**
 * Detects Vercel WAF/firewall 403 (whole site blocked after deploy stampede)
 * and retries until healthz returns our API fingerprint.
 */
export function EdgeBlockGuard() {
  const [blocked, setBlocked] = useState(false);
  const wasBlocked = useRef(false);
  const startedAt = useRef<string | null>(null);

  const tick = async () => {
    const result = await probeApiHealth();
    if (result.edgeBlocked) {
      if (!wasBlocked.current) {
        startedAt.current = new Date().toISOString();
        console.error("[bgn-edge-403]", result);
        appendEdgeBlockLog({ kind: "edge_403_start", ...result, path: window.location.pathname });
        reportClientTelemetry({
          kind: "edge_403_start",
          status: result.status,
          path: window.location.pathname,
          vercelMitigated: result.vercelMitigated,
          hasApiHeader: result.hasApiHeader,
        });
      }
      wasBlocked.current = true;
      setBlocked(true);
      return;
    }
    if (wasBlocked.current && result.ok) {
      console.info("[bgn-edge-403] recovered");
      appendEdgeBlockLog({ kind: "edge_403_recovered", path: window.location.pathname });
      reportClientTelemetry({
        kind: "edge_403_recovered",
        status: result.status,
        path: window.location.pathname,
        startedAt: startedAt.current,
      });
      wasBlocked.current = false;
      startedAt.current = null;
    }
    setBlocked(false);
  };

  useSmartPoll(tick, {
    intervalMs: blocked ? 8_000 : 90_000,
    hiddenIntervalMs: blocked ? 15_000 : 0,
  });

  if (!blocked) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] bg-red-600 text-white text-center text-sm font-bold py-3 px-4">
      Proteção temporária da Vercel (HTTP 403). A loja volta sozinha em instantes — não é login nem configuração.
      Recarregue se continuar.
    </div>
  );
}
