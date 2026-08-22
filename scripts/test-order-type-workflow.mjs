/**
 * Order-type kitchen workflow tests (static + optional live API).
 *   node scripts/test-order-type-workflow.mjs
 *   RUN_LIVE=1 node scripts/test-order-type-workflow.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const lib = read("artifacts/burger-gn/src/lib/orderWorkflow.ts");
assert.match(lib, /DELIVERY_BOARD_FLOW/);
assert.match(lib, /PICKUP_LOCAL_BOARD_FLOW/);
assert.match(lib, /canFinalizeFromReady/);
assert.match(lib, /isOutStageAllowed/);
assert.match(lib, /"out"/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /canFinalizeFromReady/);
assert.match(dash, /getNextBoardColumn/);
assert.match(dash, /isOutStageAllowed/);
assert.match(dash, /showFinalizeFromReady/);
assert.doesNotMatch(
  dash,
  /const nextStatus = colIndex >= 0 && colIndex < COLUMN_ORDER\.length - 1 \? COLUMN_ORDER\[colIndex \+ 1\]/,
);

const orders = read("artifacts/api-server/src/routes/orders.ts");
assert.match(orders, /Saiu para Entrega só existe para pedidos de entrega/);
assert.match(orders, /allowedFromReadySkipDelivery/);
assert.match(orders, /orderType !== "delivery"/);

// --- Pure logic mirror (keep in sync with orderWorkflow.ts) ---
function usesDeliveryWorkflow(orderType) {
  return orderType === "delivery";
}
function getBoardFlow(orderType) {
  return usesDeliveryWorkflow(orderType)
    ? ["new", "preparing", "ready", "out", "done"]
    : ["new", "preparing", "ready", "done"];
}
function getNextBoardColumn(orderType, column) {
  if (column === "cancelled") return null;
  if (column === "out" && !usesDeliveryWorkflow(orderType)) return "done";
  const flow = getBoardFlow(orderType);
  const i = flow.indexOf(column);
  if (i < 0 || i >= flow.length - 1) return null;
  return flow[i + 1];
}
function canFinalizeFromReady(orderType, column) {
  return !usesDeliveryWorkflow(orderType) && column === "ready";
}

assert.equal(getNextBoardColumn("delivery", "ready"), "out");
assert.equal(getNextBoardColumn("pickup", "ready"), "done");
assert.equal(getNextBoardColumn("local", "ready"), "done");
assert.equal(canFinalizeFromReady("pickup", "ready"), true);
assert.equal(canFinalizeFromReady("local", "ready"), true);
assert.equal(canFinalizeFromReady("delivery", "ready"), false);
assert.equal(canFinalizeFromReady("pickup", "done"), false);

// UI: when finalize-from-ready, next advance is suppressed
assert.equal(
  canFinalizeFromReady("pickup", "ready") ? null : getNextBoardColumn("pickup", "ready"),
  null,
);

console.log("test-order-type-workflow: static ok");

const RUN_LIVE = process.env.RUN_LIVE === "1";
if (!RUN_LIVE) {
  console.log("test-order-type-workflow: skip live (set RUN_LIVE=1)");
  process.exit(0);
}

const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
const PHONE = process.env.TEST_WHATSAPP_PHONE || "71996981707";

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
}

async function json(method, url, body, cookie) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, cookie: parseCookies(res) || cookie || "" };
}

async function createAndPrep(cookie, orderType, product) {
  const create = await json(
    "POST",
    `${BASE}/api/orders`,
    {
      customerName: `Fluxo ${orderType}`,
      phone: PHONE,
      orderType,
      paymentMethod: "cash",
      source: "attendant",
      items: [{
        productId: product.id,
        productName: product.name,
        productPrice: parseFloat(product.price) || 1,
        quantity: 1,
        addons: [],
        notes: "",
      }],
    },
    cookie,
  );
  assert.ok(create.status === 200 || create.status === 201, `create ${orderType} ${create.status}`);
  const orderId = create.data.orderId;
  const prep = await json("PATCH", `${BASE}/api/orders/${orderId}/status`, { workflow: "preparing" }, cookie);
  assert.equal(prep.status, 200, `prep ${orderType}`);
  const ready = await json("PATCH", `${BASE}/api/orders/${orderId}/status`, { workflow: "ready" }, cookie);
  assert.equal(ready.status, 200, `ready ${orderType}`);
  return orderId;
}

async function live() {
  const login = await json("POST", `${BASE}/api/admin/login`, { email: EMAIL, password: PASSWORD });
  assert.equal(login.status, 200, "login");
  const cookie = login.cookie;
  const productsRes = await json("GET", `${BASE}/api/products`, null, cookie);
  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const product = products.find((p) => p.available !== false) || products[0];
  assert.ok(product, "product");

  // Delivery: ready → out → done → finalized
  const deliveryId = await createAndPrep(cookie, "delivery", product);
  const out = await json("PATCH", `${BASE}/api/orders/${deliveryId}/status`, { workflow: "out" }, cookie);
  assert.equal(out.status, 200, "delivery out");
  const done = await json("PATCH", `${BASE}/api/orders/${deliveryId}/status`, { workflow: "done" }, cookie);
  assert.equal(done.status, 200, "delivery done");
  const finD = await json("PATCH", `${BASE}/api/orders/${deliveryId}/status`, { workflow: "finalized" }, cookie);
  assert.equal(finD.status, 200, "delivery finalized");

  // Pickup: out blocked; ready → finalized ok
  const pickupId = await createAndPrep(cookie, "pickup", product);
  const badOut = await json("PATCH", `${BASE}/api/orders/${pickupId}/status`, { workflow: "out" }, cookie);
  assert.equal(badOut.status, 400, "pickup out blocked");
  const finP = await json("PATCH", `${BASE}/api/orders/${pickupId}/status`, { workflow: "finalized" }, cookie);
  assert.equal(finP.status, 200, "pickup finalize from ready");
  assert.equal(finP.data.workflow, "finalized");

  // Local: same as pickup
  const localId = await createAndPrep(cookie, "local", product);
  const badOutL = await json("PATCH", `${BASE}/api/orders/${localId}/status`, { workflow: "out" }, cookie);
  assert.equal(badOutL.status, 400, "local out blocked");
  const finL = await json("PATCH", `${BASE}/api/orders/${localId}/status`, { workflow: "finalized" }, cookie);
  assert.equal(finL.status, 200, "local finalize from ready");

  console.log(JSON.stringify({
    ok: true,
    delivery: deliveryId,
    pickup: pickupId,
    local: localId,
  }, null, 2));
}

live().catch((e) => {
  console.error(e);
  process.exit(1);
});
