/**
 * Guards against the polling loops that burned Hobby CPU / invocations.
 * Run: node scripts/test-poll-optimization.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const helpers = read("artifacts/burger-gn/src/lib/useSmartPoll.ts");
assert.match(helpers, /visibilitychange/);
assert.match(helpers, /hiddenIntervalMs/);

const storeCache = read("artifacts/burger-gn/src/lib/storeStatusCache.ts");
assert.match(storeCache, /MIN_GAP_MS/);
assert.match(storeCache, /refreshStoreStatus/);

const ordersCache = read("artifacts/burger-gn/src/lib/adminOrdersCache.ts");
assert.match(ordersCache, /fetchSharedAdminOrders/);
assert.match(ordersCache, /TTL_MS/);

const presenceApi = read("artifacts/api-server/src/routes/presence.ts");
assert.match(presenceApi, /presence_update/);
assert.match(presenceApi, /broadcastSSE/);

const bar = read("artifacts/burger-gn/src/components/PedidosPresenceBar.tsx");
assert.match(bar, /60_000|60000/);
assert.match(bar, /presence_update/);
assert.match(bar, /acquireAdminOrderStream/);
assert.doesNotMatch(bar, /5_000|5000/);

const tracker = read("artifacts/burger-gn/src/components/MenuPresenceTracker.tsx");
assert.match(tracker, /45_000|45000/);
assert.match(tracker, /storeOpen/);
assert.match(tracker, /useSmartPoll/);

const edge = read("artifacts/burger-gn/src/components/EdgeBlockGuard.tsx");
assert.match(edge, /90_000|90000/);
assert.match(edge, /useSmartPoll/);

const store = read("artifacts/burger-gn/src/components/StoreClosedBanner.tsx");
assert.match(store, /60_000|60000/);
assert.match(store, /refreshStoreStatus/);

const notif = read("artifacts/burger-gn/src/components/AdminNotificationEngine.tsx");
assert.match(notif, /fetchSharedAdminOrders/);
assert.match(notif, /60_000|120_000/);
assert.doesNotMatch(notif, /setInterval\(\(\) => void tick\(\), 20000\)/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /fetchSharedAdminOrders/);
assert.match(dash, /90_000|90000/);
assert.doesNotMatch(dash, /setInterval\([\s\S]{0,80}30000/);

const nav = read("artifacts/burger-gn/src/components/AdminBottomNav.tsx");
assert.match(nav, /60_000|60000/);
assert.doesNotMatch(nav, /15000/);

const fab = read("artifacts/burger-gn/src/components/MyOrderFab.tsx");
assert.match(fab, /15_000|15000/);

const track = read("artifacts/burger-gn/src/pages/OrderTracking.tsx");
assert.match(track, /12_000|12000/);
assert.match(track, /visibilityState/);

const confirm = read("artifacts/burger-gn/src/pages/Confirmation.tsx");
assert.match(confirm, /visibilityState/);

const hours = read("artifacts/burger-gn/src/pages/admin/BusinessHoursTab.tsx");
assert.match(hours, /STATUS_POLL_MS = 30_000/);

const printGuard = read("artifacts/burger-gn/src/components/PrintAgentGuard.tsx");
assert.match(printGuard, /visibilityState/);
assert.match(printGuard, /5000/);

console.log("test-poll-optimization: ok");
