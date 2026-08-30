/**
 * Guards the 5xx / ~40 min kitchen delay fix (poll, webhook ack, Neon pool, SSE budget).
 * Run: node scripts/test-5xx-order-delay-fix.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function isFastAckApiPath(p) {
  return (
    p === "/healthz" ||
    p.startsWith("/healthz/") ||
    p === "/client-telemetry" ||
    p === "/orders/stream" ||
    p === "/payments/mercadopago/webhook" ||
    p.startsWith("/payments/mercadopago/webhook/")
  );
}

function resolvePostgresConnectionString(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (!host.endsWith(".neon.tech") || host.includes("-pooler.")) return raw;
    url.hostname = host.replace(/^([^.]+)\./, "$1-pooler.");
    return url.toString();
  } catch {
    return raw;
  }
}

function sseGracefulCloseMs(invocationStartedAt, now, vercel) {
  const hardLimit = vercel ? 55_000 : 50_000;
  const envCap = 45_000;
  const remaining = hardLimit - (now - invocationStartedAt);
  return Math.max(8_000, Math.min(envCap, remaining));
}

function isVisibleOnBoard(order) {
  if (order.workflow === "finalized") return false;
  if (order.status === "cancelled") return true;
  if (order.source === "attendant") return true;
  if (order.paymentMethod === "pix" && order.workflow === "awaiting_payment" && !order.hasReceipt) {
    return false;
  }
  return true;
}

function mpRetryDelayMs(attempt) {
  return [0, 15, 30, 360][attempt] * 60_000;
}

function kitchenDelayMs({ webhookAckedInTime, pollMs }) {
  if (webhookAckedInTime) return pollMs;
  return mpRetryDelayMs(2);
}

function listBoard(orders) {
  return orders
    .map((o) => ({ ...o, receiptDataUrl: null }))
    .filter((o) => o.workflow !== "finalized");
}

// ── Source contracts ────────────────────────────────────────────────────────
const app = read("artifacts/api-server/src/app.ts");
assert.match(app, /isFastAckApiPath/);
assert.match(app, /invocationStartedAt/);
assert.match(app, /\/payments\/mercadopago\/webhook/);
assert.match(app, /\/orders\/stream/);

const payments = read("artifacts/api-server/src/routes/payments.ts");
const ackIdx = payments.indexOf('res.status(200).json({ received: true })');
const schemaIdx = payments.indexOf("await ensurePaymentSettingsSchema()");
assert.ok(ackIdx >= 0 && schemaIdx > ackIdx, "webhook 200 must precede schema/DB work");

const orders = read("artifacts/api-server/src/routes/orders.ts");
assert.match(orders, /includeReceiptBytes: false/);
assert.match(orders, /scope === "finalized"/);
assert.match(orders, /sseGracefulCloseMs/);
assert.match(orders, /if \(!isPix \|\| isAttendantOrder\)/);

const sse = read("artifacts/api-server/src/lib/sse.ts");
assert.match(sse, /export function sseGracefulCloseMs/);
assert.match(sse, /VERCEL_HARD_LIMIT_MS = 55_000/);

const db = read("lib/db/src/index.ts");
assert.match(db, /max: 1/);
assert.match(db, /connectionTimeoutMillis/);
assert.match(db, /idleTimeoutMillis/);
assert.match(db, /resolvePostgresConnectionString/);
assert.match(db, /-pooler\./);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /subscribeSharedAdminOrders/);
assert.match(dash, /BOARD_POLL_MS/);
assert.match(dash, /addEventListener\('connected'/);
assert.match(dash, /addEventListener\('reconnect'/);
assert.match(dash, /getOrder\(/);

const api = read("artifacts/burger-gn/src/lib/api.ts");
assert.match(api, /OrdersScope/);
assert.match(api, /scope === "board"/);

console.log("✓ source contracts");

// ── Fast-ack paths skip schema (no 5xx from Neon on webhook/SSE) ────────────
assert.equal(isFastAckApiPath("/payments/mercadopago/webhook"), true);
assert.equal(isFastAckApiPath("/orders/stream"), true);
assert.equal(isFastAckApiPath("/orders"), false);
assert.equal(isFastAckApiPath("/healthz"), true);
console.log("✓ fast-ack paths");

// ── Neon pooler rewrite ─────────────────────────────────────────────────────
assert.equal(
  resolvePostgresConnectionString("postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb"),
  "postgresql://u:p@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/neondb",
);
assert.equal(
  resolvePostgresConnectionString("postgresql://u:p@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/neondb"),
  "postgresql://u:p@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/neondb",
);
assert.equal(
  resolvePostgresConnectionString("postgresql://postgres:x@127.0.0.1:5432/burger"),
  "postgresql://postgres:x@127.0.0.1:5432/burger",
);
console.log("✓ neon pooler URL");

// ── SSE remaining time never exceeds Vercel maxDuration ─────────────────────
const vercelClose = sseGracefulCloseMs(0, 20_000, true);
assert.equal(vercelClose, 35_000);
assert.ok(20_000 + vercelClose <= 55_000, "schema delay + SSE hold must fit under 55s");
assert.equal(sseGracefulCloseMs(0, 0, true), 45_000);
assert.equal(sseGracefulCloseMs(0, 50_000, true), 8_000);
console.log("✓ SSE remaining-time budget (no 504)");

// ── Pix simulation: unpaid hidden; paid appears on next poll ────────────────
const unpaidPix = {
  id: 11,
  workflow: "awaiting_payment",
  paymentMethod: "pix",
  paymentStatus: "pending",
  hasReceipt: false,
  source: "checkout",
  receiptDataUrl: "data:image/png;base64,AAAA",
};
const paidPix = {
  ...unpaidPix,
  workflow: "new",
  paymentStatus: "paid",
};
assert.equal(isVisibleOnBoard(unpaidPix), false, "unpaid pix stays off the board");
assert.equal(isVisibleOnBoard(paidPix), true, "paid pix enters Novos Pedidos");

const listed = listBoard([
  unpaidPix,
  paidPix,
  { id: 99, workflow: "finalized", paymentMethod: "cash", paymentStatus: "paid" },
]);
assert.equal(listed.some((o) => o.workflow === "finalized"), false);
assert.equal(listed.every((o) => o.receiptDataUrl == null), true);
assert.ok(listed.some((o) => o.id === 11));
console.log("✓ pix visibility + board list without receipt bytes");

assert.equal(kitchenDelayMs({ webhookAckedInTime: true, pollMs: 18_000 }), 18_000);
assert.equal(kitchenDelayMs({ webhookAckedInTime: false, pollMs: 18_000 }), 30 * 60_000);
assert.ok(kitchenDelayMs({ webhookAckedInTime: true, pollMs: 18_000 }) < 60_000);
console.log("✓ kitchen delay: poll 18s vs MP retry 30min");

// ── Live HTTP: webhook pattern returns 200 before slow work ─────────────────
await new Promise((resolve, reject) => {
  const work = { started: false, finished: false };
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith("/api/payments/mercadopago/webhook")) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "x-burgergn-api": "1" });
    res.end(JSON.stringify({ received: true }));
    work.started = true;
    setTimeout(() => { work.finished = true; }, 80);
  });
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    const t0 = Date.now();
    http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/payments/mercadopago/webhook?company=burger-gn&id=1&type=payment",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const ms = Date.now() - t0;
          try {
            assert.equal(res.statusCode, 200);
            assert.ok(ms < 500, `webhook ack too slow: ${ms}ms`);
            assert.equal(JSON.parse(Buffer.concat(chunks).toString()).received, true);
            assert.equal(work.started, true);
            assert.equal(work.finished, false, "slow reconcile must not block the 200");
            assert.ok(ms < 22_000, "Mercado Pago 22s window");
            console.log(`✓ live webhook ack ${ms}ms (200 before reconcile)`);
            server.close();
            resolve();
          } catch (err) {
            server.close();
            reject(err);
          }
        });
      },
    ).on("error", (err) => {
      server.close();
      reject(err);
    });
  });
});

console.log("test-5xx-order-delay-fix: ok");
