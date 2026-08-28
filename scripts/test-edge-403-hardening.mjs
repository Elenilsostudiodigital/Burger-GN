/**
 * Edge/WAF 403 hardening after deploys.
 * Run: node scripts/test-edge-403-hardening.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const vercel = read("vercel.json");
assert.match(vercel, /CDN-Cache-Control/);
assert.match(vercel, /\/api\/\(\.\*\)/);
assert.match(vercel, /Vercel-CDN-Cache-Control/);
assert.match(vercel, /no-store/);

const app = read("artifacts/api-server/src/app.ts");
assert.match(app, /X-BurgerGN-Api/);
assert.match(app, /app_http_403/);

const health = read("artifacts/api-server/src/routes/health.ts");
assert.match(health, /client-telemetry/);
assert.match(health, /client_telemetry/);

const orders = read("artifacts/api-server/src/routes/orders.ts");
assert.match(orders, /retry: \$\{retryMs\}/);
assert.match(orders, /retry: \$\{4000/);

const sw = read("artifacts/burger-gn/public/sw.js");
assert.match(sw, /burger-gn-pwa-v5-edge-403/);
assert.match(sw, /fetchWithEdgeRetry/);
assert.match(sw, /403/);

const edge = read("artifacts/burger-gn/src/lib/edgeBlock.ts");
assert.match(edge, /x-burgergn-api/);
assert.match(edge, /edgeBlocked/);
assert.match(edge, /client-telemetry/);

const guard = read("artifacts/burger-gn/src/components/EdgeBlockGuard.tsx");
assert.match(guard, /EdgeBlockGuard/);
assert.match(guard, /probeApiHealth/);

const spa = read("artifacts/burger-gn/src/App.tsx");
assert.match(spa, /EdgeBlockGuard/);

const probe = read("scripts/probe-edge-403.mjs");
assert.match(probe, /x-burgergn-api/);
assert.match(probe, /healthz/);

console.log("test-edge-403-hardening: ok");
