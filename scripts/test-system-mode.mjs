/**
 * Isolated system Operation / Sleep mode.
 * Run: node scripts/test-system-mode.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const schedule = read("artifacts/api-server/src/lib/systemModeSchedule.ts");
assert.match(schedule, /WAKE_WEEKDAY = 5/);
assert.match(schedule, /WAKE_HOUR = 17/);
assert.match(schedule, /WAKE_MINUTE = 30/);
assert.match(schedule, /SLEEP_WEEKDAY = 1/);
assert.match(schedule, /SLEEP_HOUR = 23/);
assert.match(schedule, /SLEEP_MINUTE = 30/);
assert.match(schedule, /America\/Sao_Paulo/);

const store = read("artifacts/api-server/src/lib/systemModeStore.ts");
assert.match(store, /override/);
assert.match(store, /nextTransitionAfter/);

const route = read("artifacts/api-server/src/routes/systemMode.ts");
assert.match(route, /\/system-mode/);
assert.match(route, /\/admin\/system-mode/);
assert.match(route, /writeSystemModeOverride/);

const index = read("artifacts/api-server/src/routes/index.ts");
assert.match(index, /systemMode/);

const client = read("artifacts/burger-gn/src/lib/systemModeClient.ts");
assert.match(client, /isSystemSleeping/);
assert.match(client, /setAdminSystemMode/);

const bar = read("artifacts/burger-gn/src/components/SystemModeBar.tsx");
assert.match(bar, /Ligar Sistema/);
assert.match(bar, /Colocar Sistema para Dormir/);
assert.match(bar, /Próximo despertar/);
assert.match(bar, /Próximo descanso/);

const app = read("artifacts/burger-gn/src/App.tsx");
assert.match(app, /SystemModeBoot/);
assert.doesNotMatch(app, /SystemModeBar/);

const hub = read("artifacts/burger-gn/src/pages/admin/SettingsHub.tsx");
assert.match(hub, /SystemModeBar/);

const poll = read("artifacts/burger-gn/src/lib/useSmartPoll.ts");
assert.match(poll, /isSystemSleeping/);

const stream = read("artifacts/burger-gn/src/lib/adminOrderStream.ts");
assert.match(stream, /isSystemSleeping/);

const tracker = read("artifacts/burger-gn/src/components/MenuPresenceTracker.tsx");
assert.match(tracker, /isSystemSleeping/);

const hours = read("artifacts/burger-gn/src/pages/admin/BusinessHoursTab.tsx");
assert.match(hours, /STATUS_POLL_MS = 30_000/);
assert.match(hours, /isSystemSleeping/);

assert.doesNotMatch(read("artifacts/burger-gn/src/lib/printReceipt.ts"), /systemMode/);
assert.doesNotMatch(read("artifacts/api-server/src/routes/payments.ts"), /systemMode/);

console.log("test-system-mode: ok");
