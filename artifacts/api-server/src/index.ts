import app from "./app";
import { logger } from "./lib/logger";
import { runSeed } from "./lib/seed";

// On Vercel/serverless the platform invokes the exported app; do not call listen()
const isServerless = Boolean(process.env["VERCEL"] || process.env["AWS_LAMBDA_FUNCTION_NAME"]);

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
    await runSeed();
  });
} else {
  // Best-effort seed on cold start (non-blocking)
  void runSeed().catch((err) => logger.error({ err }, "Seed failed on serverless start"));
}

export default app;
