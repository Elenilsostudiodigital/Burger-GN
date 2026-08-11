import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureClubeSchema } from "./lib/ensureClubeSchema";
import { ensureDeliveryStreetsSchema } from "./lib/ensureDeliveryStreetsSchema";

const app: Express = express();

/** Ensures additive Clube/CRM schema before handlers that touch those tables. */
app.use("/api", async (req, res, next) => {
  const path = req.path || "";
  const needsClubeSchema =
    path.startsWith("/admin/clientes") ||
    path.startsWith("/admin/clube") ||
    path === "/orders" ||
    path.startsWith("/orders/");
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
  const path = req.path || "";
  const needsStreets =
    path.startsWith("/delivery/streets") ||
    path.startsWith("/admin/delivery-street") ||
    path.startsWith("/admin/delivery-streets") ||
    path === "/orders" ||
    path.startsWith("/orders/");
  if (!needsStreets) return next();
  try {
    await ensureDeliveryStreetsSchema();
    next();
  } catch (err) {
    logger.error({ err }, "Failed to ensure delivery streets schema");
    res.status(500).json({ error: "Falha ao preparar o banco de ruas de entrega." });
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
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
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

export default app;
