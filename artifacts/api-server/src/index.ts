import app from "./app";
import { logger } from "./lib/logger";
import { runSeed } from "./lib/seed";
import { ensureCompanySchema } from "./lib/ensureCompanySchema";
import { ensureClubeSchema } from "./lib/ensureClubeSchema";
import { ensureDeliveryStreetsSchema } from "./lib/ensureDeliveryStreetsSchema";
import { ensureDeliveryAreasSchema } from "./lib/ensureDeliveryAreasSchema";
import { ensurePaymentSettingsSchema } from "./lib/ensurePaymentSettingsSchema";

// On Vercel/serverless the platform invokes the exported app; do not call listen()
const isServerless = Boolean(process.env["VERCEL"] || process.env["AWS_LAMBDA_FUNCTION_NAME"]);

async function bootstrapData() {
  await ensureCompanySchema();
  await ensureClubeSchema();
  await ensureDeliveryStreetsSchema();
  await ensureDeliveryAreasSchema();
  await ensurePaymentSettingsSchema();
  await runSeed();
}

if (!isServerless) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, async (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    await bootstrapData();
  });
} else {
  // Best-effort schema + seed on cold start (non-blocking; middleware also awaits schema)
  void bootstrapData().catch((err) => logger.error({ err }, "Bootstrap failed on serverless start"));
}

export default app;
