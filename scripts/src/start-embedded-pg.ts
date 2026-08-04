/**
 * Starts a project-local PostgreSQL (no Windows service install).
 * Keeps running until Ctrl+C so the API can connect via DATABASE_URL.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const databaseDir = path.join(root, ".pgdata");

const PORT = Number(process.env.PG_PORT || 5432);
const USER = process.env.PG_USER || "postgres";
const PASSWORD = process.env.PG_PASSWORD || "burger123";
const DB_NAME = process.env.PG_DATABASE || "burger_gn";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Force UTF-8 so Portuguese accents (ã, ç, é) store correctly on Windows
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (msg) => process.stdout.write(String(msg)),
  onError: (msg) => process.stderr.write(String(msg)),
});

async function main() {
  console.log(`[pg] data dir: ${databaseDir}`);
  console.log(`[pg] starting on port ${PORT}...`);

  try {
    await pg.initialise();
    console.log("[pg] cluster initialised");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Already initialised on a previous run
    if (/already|exists|initdb/i.test(message)) {
      console.log("[pg] cluster already initialised, continuing");
    } else {
      console.log(`[pg] initialise note: ${message}`);
    }
  }

  await pg.start();
  console.log("[pg] server started");

  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[pg] database "${DB_NAME}" created`);
  } catch {
    console.log(`[pg] database "${DB_NAME}" already exists`);
  }

  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
  console.log(`[pg] DATABASE_URL=${url}`);
  console.log("[pg] ready — leave this process running");

  const shutdown = async () => {
    console.log("\n[pg] stopping...");
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[pg] fatal:", err);
  process.exit(1);
});
