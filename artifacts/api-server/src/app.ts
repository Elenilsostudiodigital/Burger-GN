import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureCompanySchema } from "./lib/ensureCompanySchema";
import { ensureClubeSchema } from "./lib/ensureClubeSchema";
import { ensureDeliveryStreetsSchema } from "./lib/ensureDeliveryStreetsSchema";
import { ensureDeliveryAreasSchema } from "./lib/ensureDeliveryAreasSchema";
import { ensurePaymentSettingsSchema } from "./lib/ensurePaymentSettingsSchema";
import { ensureBusinessHoursSchema } from "./lib/ensureBusinessHoursSchema";
import { ensureProductMarketingSchema } from "./lib/ensureProductMarketingSchema";

const app: Express = express();

/** Company tables are required by nearly every authenticated/public commerce route. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  if (p === "/healthz" || p.startsWith("/healthz/")) return next();
  try {
    await ensureCompanySchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure company schema");
    const detail = err instanceof Error ? err.message : String(err);
    const missingRelation = /relation .* does not exist/i.test(detail);
    const noUrl = !process.env["DATABASE_URL"];
    res.status(500).json({
      error: noUrl
        ? "DATABASE_URL não configurada no servidor."
        : missingRelation
          ? "Banco de dados incompleto: tabelas da empresa ausentes. Tente novamente em instantes."
          : `Falha ao conectar ou preparar o banco de dados da loja. (${detail.slice(0, 180)})`,
    });
  }
});

/** Ensures additive Clube/CRM schema before handlers that touch those tables. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsClubeSchema =
    p.startsWith("/admin/clientes") ||
    p.startsWith("/admin/clube") ||
    p === "/orders" ||
    p.startsWith("/orders/");
  if (!needsClubeSchema) return next();
  try {
    await ensureClubeSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure Clube schema");
    res.status(500).json({ error: "Falha ao preparar o banco de dados do Clube/CRM." });
  }
});

/** Ensures delivery streets tables before street/fee handlers. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsStreets =
    p.startsWith("/delivery/streets") ||
    p.startsWith("/admin/delivery-street") ||
    p.startsWith("/admin/delivery-streets") ||
    p === "/orders" ||
    p.startsWith("/orders/");
  if (!needsStreets) return next();
  try {
    await ensureDeliveryStreetsSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure delivery streets schema");
    res.status(500).json({ error: "Falha ao preparar o banco de ruas de entrega." });
  }
});

/** Ensures delivery areas tables before area/fee handlers. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsAreas =
    p.startsWith("/delivery/resolve-area") ||
    p.startsWith("/admin/delivery-areas") ||
    p === "/orders" ||
    p.startsWith("/orders/");
  if (!needsAreas) return next();
  try {
    await ensureDeliveryAreasSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure delivery areas schema");
    res.status(500).json({ error: "Falha ao preparar o banco de áreas de entrega." });
  }
});

/** Ensures payment settings columns (PIX Online / PIX Manual) before payment handlers. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsPayment =
    p.startsWith("/payment-settings") ||
    p.startsWith("/admin/payment-settings") ||
    p.startsWith("/payments/") ||
    p === "/orders" ||
    p.startsWith("/orders/");
  if (!needsPayment) return next();
  try {
    await ensurePaymentSettingsSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure payment settings schema");
    res.status(500).json({ error: "Falha ao preparar o banco de pagamentos." });
  }
});

/** Ensures business-hours table before store-status / order creation. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsHours =
    p.startsWith("/store-status") ||
    p.startsWith("/business-hours") ||
    p.startsWith("/admin/business-hours") ||
    p === "/orders";
  if (!needsHours) return next();
  try {
    await ensureBusinessHoursSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure business hours schema");
    res.status(500).json({ error: "Falha ao preparar o horário de funcionamento." });
  }
});

/** Ensures product marketing / promotion columns before product handlers. */
app.use("/api", async (req, res, next) => {
  const p = req.path || "";
  const needsMarketing =
    p.startsWith("/products") ||
    p.startsWith("/admin/products") ||
    p === "/orders" ||
    p.startsWith("/orders/");
  if (!needsMarketing) return next();
  try {
    await ensureProductMarketingSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure product marketing schema");
    res.status(500).json({ error: "Falha ao preparar marketing de produtos." });
  }
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true, limit: "4mb" }));
app.use(cookieParser(process.env["SESSION_SECRET"] || "fallback-secret"));

app.use("/api", router);

// Production: serve the Vite build from the same origin so /api keeps working
const staticDir = process.env["STATIC_DIR"];
if (staticDir && fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

/** Always return JSON for unhandled /api errors (never Express HTML 500 pages). */
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  logger.error({ err, url: req.url }, "Unhandled API error");
  const wantsApi = (req.originalUrl || req.url || "").startsWith("/api");
  if (!wantsApi) return next(err);
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Internal server error";
  res.status(500).json({ error: message });
});

export default app;
