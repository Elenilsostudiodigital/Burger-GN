/**
 * WhatsApp “Em preparo” update — message, compose URL, UI wiring.
 * Run: node scripts/test-whatsapp-preparing-update.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function normalizePhoneForWhatsapp(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";
  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length === 10 || national.length === 11) return `55${national}`;
    if (national.length > 11) return `55${national.slice(-11)}`;
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length > 11) return `55${digits.slice(-11)}`;
  return digits;
}

function buildOrderTrackingUrl(trackingId, origin) {
  const base = String(origin || "https://burger-gn.vercel.app").replace(/\/$/, "");
  return `${base}/pedido/${trackingId}`;
}

function buildPreparingUpdateWhatsappMessage(customerName, trackingId, origin) {
  const cliente = (customerName || "cliente").trim().split(/\s+/)[0] || "cliente";
  const link = buildOrderTrackingUrl(trackingId, origin);
  return (
    `Olá ${cliente} 👋\n` +
    `Seu pedido já entrou em preparo.\n` +
    `Acompanhe em tempo real pelo link abaixo:\n` +
    link
  );
}

function openWhatsappComposeUrl(phone, message) {
  const number = normalizePhoneForWhatsapp(phone);
  if (!number || number === "5500000000000" || number.replace(/\D/g, "").replace(/^55/, "").length < 10) {
    return null;
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// ── Source wiring ────────────────────────────────────────────────────────────
const api = read("artifacts/burger-gn/src/lib/api.ts");
assert.match(api, /export function openWhatsappCompose/);
assert.match(api, /export function buildPreparingUpdateWhatsappMessage/);
assert.match(api, /export function buildOrderTrackingUrl/);
assert.match(api, /WHATSAPP_EXTERNAL_ENABLED = false/);
assert.match(api, /Seu pedido já entrou em preparo\./);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /Enviar atualização ao cliente/);
assert.match(dash, /buildPreparingUpdateWhatsappMessage/);
assert.match(dash, /openWhatsappCompose/);
assert.match(dash, /column === 'preparing'/);
// Must NOT flip auto-send on status changes
assert.match(dash, /if \(WHATSAPP_EXTERNAL_ENABLED\)/);

// ── Message + phone + link ───────────────────────────────────────────────────
const phone = "71996981707"; // number from project constant / test order
const trackingId = "trk-test-abc123";
const msg = buildPreparingUpdateWhatsappMessage("Elenilson Silva", trackingId, "https://burger-gn.vercel.app");
assert.equal(
  msg,
  "Olá Elenilson 👋\nSeu pedido já entrou em preparo.\nAcompanhe em tempo real pelo link abaixo:\nhttps://burger-gn.vercel.app/pedido/trk-test-abc123",
);
assert.equal(normalizePhoneForWhatsapp(phone), "5571996981707");
assert.equal(normalizePhoneForWhatsapp("(71) 99698-1707"), "5571996981707");

const waUrl = openWhatsappComposeUrl(phone, msg);
assert.ok(waUrl);
assert.ok(waUrl.startsWith("https://wa.me/5571996981707?text="));
const decoded = decodeURIComponent(waUrl.split("?text=")[1]);
assert.equal(decoded, msg);
assert.ok(decoded.includes("/pedido/trk-test-abc123"));

// Invalid phone → null (no auto-open junk)
assert.equal(openWhatsappComposeUrl("123", msg), null);

console.log("test-whatsapp-preparing-update: ok");
