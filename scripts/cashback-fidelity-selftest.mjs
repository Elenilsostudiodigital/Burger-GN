/**
 * Runs all cashback/fidelity proof scripts.
 * Run: node scripts/cashback-fidelity-selftest.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = [
  "fidelity-stamp-selftest.mjs",
  "order-rewards-selftest.mjs",
  "phone-match-selftest.mjs",
];

for (const name of scripts) {
  const r = spawnSync(process.execPath, [path.join(dir, name)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

console.log("cashback-fidelity-selftest: ALL OK");
