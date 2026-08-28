/**
 * Print agent keep-alive: watchdog, autostart installer, reconnect UI.
 * Run: node scripts/test-print-agent-keepalive.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

for (const rel of [
  "tools/burger-gn-print-agent/server.mjs",
  "tools/burger-gn-print-agent/watchdog.mjs",
  "tools/burger-gn-print-agent/install-autostart.bat",
  "tools/burger-gn-print-agent/create-startup-shortcut.ps1",
  "tools/burger-gn-print-agent/uninstall-autostart.bat",
  "tools/burger-gn-print-agent/start-hidden.vbs",
  "tools/burger-gn-print-agent/protocol-launch.vbs",
  "tools/burger-gn-print-agent/run-watchdog.cmd",
  "tools/burger-gn-print-agent/start.bat",
  "artifacts/burger-gn/src/components/PrintAgentGuard.tsx",
  ".cursor/rules/print-agent.mdc",
]) {
  assert.equal(exists(rel), true, `missing ${rel}`);
}

const watchdog = read("tools/burger-gn-print-agent/watchdog.mjs");
assert.match(watchdog, /19191/);
assert.match(watchdog, /starting print agent/);
assert.match(watchdog, /already running/);

const install = read("tools/burger-gn-print-agent/install-autostart.bat");
assert.match(install, /BurgerGN Print Agent/);
assert.match(install, /ONLOGON/);
assert.match(install, /burgergn-print/);
assert.match(install, /LOCALAPPDATA/);

const start = read("tools/burger-gn-print-agent/start.bat");
assert.match(start, /start-hidden\.vbs/);
assert.doesNotMatch(start, /^node server\.mjs$/m);

const server = read("tools/burger-gn-print-agent/server.mjs");
assert.match(server, /EADDRINUSE/);
assert.match(server, /keepalive/);

const printLib = read("artifacts/burger-gn/src/lib/printReceipt.ts");
assert.match(printLib, /reconnectPrintAgent/);
assert.match(printLib, /ensurePrintAgent/);
assert.match(printLib, /PRINT_AGENT_OFFLINE_HELP/);
assert.match(printLib, /install-autostart\.bat/);
assert.doesNotMatch(printLib, /Abra tools\/burger-gn-print-agent\/start\.bat/);

const guard = read("artifacts/burger-gn/src/components/PrintAgentGuard.tsx");
assert.match(guard, /Reconectar Impressora/);
assert.match(guard, /PrintAgentGuard/);
assert.match(guard, /PRINT_AGENT_PROTOCOL|reconnectPrintAgent/);

const app = read("artifacts/burger-gn/src/App.tsx");
assert.match(app, /PrintAgentGuard/);

const rule = read(".cursor/rules/print-agent.mdc");
assert.match(rule, /install-autostart\.bat/);
assert.match(rule, /Reconectar Impressora/);

console.log("test-print-agent-keepalive: ok");
