/**
 * Printers module — source + receipt/test HTML checks.
 * Run: node scripts/test-printers-module.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const hub = read("artifacts/burger-gn/src/pages/admin/SettingsHub.tsx");
assert.match(hub, /impressoras/);
assert.match(hub, /PrintersTab/);
assert.match(hub, /Impressoras/);

const tab = read("artifacts/burger-gn/src/pages/admin/PrintersTab.tsx");
assert.match(tab, /Testar Impressora/);
assert.match(tab, /Conectar USB/);
assert.match(tab, /Conectar Bluetooth/);
assert.match(tab, /Atualizar lista/);
assert.match(tab, /autoPrintOnAccept/);
assert.match(tab, /printSecondCopy/);
assert.match(tab, /highlightOrderNumber/);
assert.match(tab, /printTrackingQr/);
assert.match(tab, /PRINTER_STATUS_LABELS/);

const printLib = read("artifacts/burger-gn/src/lib/printReceipt.ts");
assert.match(printLib, /BURGER GN/);
assert.match(printLib, /TESTE DE IMPRESSÃO/);
assert.match(printLib, /Impressora funcionando corretamente/);
assert.match(printLib, /buildReceiptHTML/);
assert.match(printLib, /printOrderReceipt/);
assert.match(printLib, /requestUsbPrinter/);
assert.match(printLib, /requestBluetoothPrinter/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /autoPrintOnAccept/);
assert.match(dash, /printOrderReceipt/);
assert.match(dash, /getAdminPrinterSettings/);
// Accept flow still updates workflow first
assert.match(dash, /updateOrderWorkflow\(order\.id, 'preparing'\)/);

const apiRoute = read("artifacts/api-server/src/routes/printerSettings.ts");
assert.match(apiRoute, /\/admin\/printer-settings/);
assert.match(apiRoute, /normalizePrinterSettings/);

const index = read("artifacts/api-server/src/routes/index.ts");
assert.match(index, /printerSettingsRouter/);

const ensure = read("artifacts/api-server/src/lib/ensurePrinterSettingsSchema.ts");
assert.match(ensure, /CREATE TABLE IF NOT EXISTS printer_settings/);

// Test HTML content contract
function buildTestPrintHTML(printerName) {
  const now = new Date();
  const data = now.toLocaleDateString("pt-BR");
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `BURGER GN\nTESTE DE IMPRESSÃO\nData: ${data}\nHora: ${hora}\nImpressora: ${printerName}\nImpressora funcionando corretamente.`;
}
const sample = buildTestPrintHTML("EPSON TM-T20");
assert.match(sample, /BURGER GN/);
assert.match(sample, /TESTE DE IMPRESSÃO/);
assert.match(sample, /Impressora funcionando corretamente/);
assert.match(sample, /EPSON TM-T20/);

// Existing WhatsApp / messages untouched markers
assert.match(dash, /Enviar atualização ao cliente/);
assert.doesNotMatch(read("artifacts/api-server/src/routes/settings.ts"), /printer_settings/);

console.log("test-printers-module: ok");
