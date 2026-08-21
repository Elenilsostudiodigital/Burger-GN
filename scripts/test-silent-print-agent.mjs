/**
 * Silent print agent + no window.print wiring.
 * Run: node scripts/test-silent-print-agent.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const agent = read("tools/burger-gn-print-agent/server.mjs");
assert.match(agent, /WritePrinter/);
assert.match(agent, /19191/);
assert.match(agent, /\/printers/);
assert.match(agent, /\/print/);
assert.doesNotMatch(agent, /window\.print/);

const printLib = read("artifacts/burger-gn/src/lib/printReceipt.ts");
assert.match(printLib, /silentPrintOrder/);
assert.match(printLib, /127\.0\.0\.1:19191/);
assert.match(printLib, /buildTestPrintText/);
assert.doesNotMatch(printLib, /window\.print\(/);
assert.doesNotMatch(printLib, /window\.open\(/);
assert.match(printLib, /copies/);

const tab = read("artifacts/burger-gn/src/pages/admin/PrintersTab.tsx");
assert.match(tab, /Impressão automática/);
assert.match(tab, /Quantidade de vias/);
assert.match(tab, /Testar impressão/);
assert.match(tab, /Reimprimir último pedido/);
assert.match(tab, /silentPrintTest/);
assert.doesNotMatch(tab, /window\.print/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /silentPrintOrder/);
assert.doesNotMatch(dash, /window\.print/);
assert.doesNotMatch(dash, /buildReceiptHTML/);
assert.doesNotMatch(dash, /document\.write\(buildReceipt/);

const serverNorm = read("artifacts/api-server/src/lib/printerSettings.ts");
assert.match(serverNorm, /copies/);
assert.doesNotMatch(serverNorm, /SYSTEM_PRINTER_ID/);

console.log("test-silent-print-agent: ok");
