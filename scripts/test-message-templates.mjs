/**
 * Message templates admin + WhatsApp Em Preparo integration.
 * Run: node scripts/test-message-templates.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function interpolateMessageTemplate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key];
    return v != null && v !== "" ? String(v) : "";
  });
}

const KEYS = [
  "pedido_recebido",
  "pedido_confirmado",
  "em_preparo",
  "pedido_pronto",
  "pedido_retirado",
  "pedido_cancelado",
];

// Source wiring
const hub = read("artifacts/burger-gn/src/pages/admin/SettingsHub.tsx");
assert.match(hub, /mensagens/);
assert.match(hub, /MessageTemplatesTab/);
assert.match(hub, /Mensagens Automáticas/);

const tab = read("artifacts/burger-gn/src/pages/admin/MessageTemplatesTab.tsx");
assert.match(tab, /Visualizar/);
assert.match(tab, /Restaurar padrão/);
assert.match(tab, /Salvar/);
assert.match(tab, /updateAdminMessageTemplate/);
assert.match(tab, /restoreAdminMessageTemplate/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /getAdminMessageTemplate\('em_preparo'\)/);
assert.match(dash, /interpolateMessageTemplate/);
assert.match(dash, /Enviar atualização ao cliente/);

const apiRoute = read("artifacts/api-server/src/routes/messageTemplates.ts");
assert.match(apiRoute, /\/admin\/message-templates/);
assert.match(apiRoute, /\/restore/);
assert.match(apiRoute, /\/preview/);

const defaults = read("artifacts/api-server/src/lib/messageTemplates.ts");
for (const k of KEYS) assert.match(defaults, new RegExp(k));
assert.match(defaults, /\{\{cliente\}\}/);
assert.match(defaults, /\{\{pedido\}\}/);
assert.match(defaults, /\{\{valor\}\}/);
assert.match(defaults, /\{\{status\}\}/);
assert.match(defaults, /\{\{link\}\}/);
assert.match(defaults, /\{\{loja\}\}/);
assert.match(defaults, /\{\{telefone\}\}/);
assert.match(defaults, /\{\{horario\}\}/);

const index = read("artifacts/api-server/src/routes/index.ts");
assert.match(index, /messageTemplatesRouter/);

const ensure = read("artifacts/api-server/src/lib/ensureMessageTemplatesSchema.ts");
assert.match(ensure, /CREATE TABLE IF NOT EXISTS message_templates/);

const clientApi = read("artifacts/burger-gn/src/lib/api.ts");
assert.match(clientApi, /getAdminMessageTemplates/);
assert.match(clientApi, /buildOrderTemplateVars/);

// Interpolation
const msg = interpolateMessageTemplate(
  "Olá {{cliente}} 👋\nPedido #{{pedido}} — {{valor}}\n{{link}}",
  {
    cliente: "João",
    pedido: "42",
    valor: "R$ 10,00",
    link: "https://burger-gn.vercel.app/pedido/abc",
  },
);
assert.equal(
  msg,
  "Olá João 👋\nPedido #42 — R$ 10,00\nhttps://burger-gn.vercel.app/pedido/abc",
);

console.log("test-message-templates: ok");
