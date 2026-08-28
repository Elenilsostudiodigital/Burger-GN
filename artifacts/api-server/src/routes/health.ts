import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("X-BurgerGN-Api", "1");
  res.setHeader("Cache-Control", "private, no-store");
  res.json(data);
});

/**
 * Browser reports edge/WAF 403 after recovery so Vercel logs show it immediately.
 * Public, no secrets, no PII.
 */
router.post("/client-telemetry", (req, res) => {
  const body = (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
  logger.warn(
    {
      src: "client",
      kind: String(body["kind"] || "unknown").slice(0, 64),
      status: body["status"],
      path: String(body["path"] || "").slice(0, 200),
      vercelMitigated: body["vercelMitigated"] ?? null,
      hasApiHeader: body["hasApiHeader"] ?? null,
      ua: String(req.headers["user-agent"] || "").slice(0, 120),
    },
    "client_telemetry",
  );
  res.status(204).end();
});

export default router;
