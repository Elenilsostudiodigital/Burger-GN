/**
 * Guards against parallel admin SSE connections (root cause of delayed 403).
 *   node scripts/test-sse-single-stream.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const streamLib = read("artifacts/burger-gn/src/lib/adminOrderStream.ts");
assert.match(streamLib, /acquireAdminOrderStream/);
assert.match(streamLib, /releaseAdminOrderStream/);
assert.match(streamLib, /refs \+= 1|refs \+= 1/);

const files = [
  "artifacts/burger-gn/src/pages/admin/Dashboard.tsx",
  "artifacts/burger-gn/src/components/AdminNotificationEngine.tsx",
  "artifacts/burger-gn/src/components/AdminBottomNav.tsx",
  "artifacts/burger-gn/src/pages/admin/NovasRuas.tsx",
];

for (const f of files) {
  const src = read(f);
  assert.match(src, /acquireAdminOrderStream/, `${f} must acquire shared stream`);
  assert.match(src, /releaseAdminOrderStream/, `${f} must release shared stream`);
  assert.doesNotMatch(
    src,
    /new EventSource\(\s*['"]\/api\/orders\/stream['"]/,
    `${f} must not open its own EventSource`,
  );
}

const orders = read("artifacts/api-server/src/routes/orders.ts");
assert.match(orders, /SSE_GRACEFUL_MS|gracefulMs/);
assert.match(orders, /event: reconnect/);

const sw = read("artifacts/burger-gn/public/sw.js");
assert.match(sw, /burger-gn-pwa-v4-nocache-html/);
assert.match(sw, /always network|network-only|Never cache/i);
assert.doesNotMatch(sw, /cache\.put\("\/index\.html"/);

const vercel = read("vercel.json");
assert.match(vercel, /CDN-Cache-Control/);
assert.match(vercel, /no-store/);

console.log("test-sse-single-stream: ok");
