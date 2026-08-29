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
const agentDir = path.join(root, "tools/burger-gn-print-agent");

for (const rel of [
  "tools/burger-gn-print-agent/server.mjs",
  "tools/burger-gn-print-agent/watchdog.mjs",
  "tools/burger-gn-print-agent/install-autostart.bat",
  "tools/burger-gn-print-agent/startup-logon.vbs",
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

assert.equal(
  exists("tools/burger-gn-print-agent/create-startup-shortcut.ps1"),
  false,
  "PowerShell startup script must not exist",
);
assert.equal(
  exists("tools/burger-gn-print-agent/register-autostart.vbs"),
  false,
  "CreateShortcut registrar must not exist",
);
const leftoverPs1 = fs.readdirSync(agentDir).filter((f) => f.toLowerCase().endsWith(".ps1"));
assert.deepEqual(leftoverPs1, [], `no .ps1 files in print-agent: ${leftoverPs1.join(", ")}`);

const startHidden = read("tools/burger-gn-print-agent/start-hidden.vbs");
assert.match(startHidden, /WScript\.Shell/);
assert.match(startHidden, /watchdog\.mjs/);
assert.match(startHidden, /,\s*0,\s*False/);
assert.doesNotMatch(startHidden, /run-watchdog\.cmd/);
assert.doesNotMatch(startHidden, /cmd \/c/);

const protocol = read("tools/burger-gn-print-agent/protocol-launch.vbs");
assert.match(protocol, /start-hidden\.vbs/);
assert.match(protocol, /,\s*0,\s*False/);
assert.doesNotMatch(protocol, /run-watchdog\.cmd/);

const logon = read("tools/burger-gn-print-agent/startup-logon.vbs");
assert.match(logon, /LOCALAPPDATA/);
assert.match(logon, /start-hidden\.vbs/);
assert.match(logon, /,\s*0,\s*False/);
assert.doesNotMatch(logon, /CreateShortcut/i);
assert.doesNotMatch(logon, /powershell\.exe/i);
assert.doesNotMatch(logon, /launch\.cmd/);

const install = read("tools/burger-gn-print-agent/install-autostart.bat");
assert.match(install, /burgergn-print/);
assert.match(install, /LOCALAPPDATA/);
assert.match(install, /wscript\.exe/);
assert.match(install, /startup-logon\.vbs/);
assert.match(install, /schtasks \/Create/);
assert.match(install, /ONLOGON/);
assert.match(install, /node-path\.txt/);
assert.match(install, /create-startup-shortcut\.ps1/);
assert.doesNotMatch(install, /powershell\.exe/i);
assert.doesNotMatch(install, /set "LAUNCH=/);

const start = read("tools/burger-gn-print-agent/start.bat");
assert.match(start, /start-hidden\.vbs/);
assert.doesNotMatch(start, /^node server\.mjs$/m);
assert.doesNotMatch(start, /powershell\.exe/i);

const watchdog = read("tools/burger-gn-print-agent/watchdog.mjs");
assert.match(watchdog, /19191/);
assert.match(watchdog, /starting print agent/);
assert.match(watchdog, /already running/);
assert.match(watchdog, /windowsHide:\s*true/);
assert.match(watchdog, /agent\.log/);
assert.doesNotMatch(watchdog, /console\.log/);

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
assert.match(rule, /wscript|headless|windowsHide/);
assert.match(rule, /startup-logon\.vbs/);
assert.match(rule, /\.ps1/);

console.log("test-print-agent-keepalive: ok");
