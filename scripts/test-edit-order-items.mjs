/**
 * Edit accepted order items — source + calculation checks.
 * Run: node scripts/test-edit-order-items.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function recalculateTotals({ items, deliveryFee, discountAmount }) {
  const subtotal = items.reduce((acc, i) => {
    const addons = (i.addons || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
    return acc + (Number(i.productPrice) + addons) * i.quantity;
  }, 0);
  const total = Math.max(0, Math.round((subtotal + deliveryFee - discountAmount) * 100) / 100);
  return { subtotal, total };
}

// ── API route ───────────────────────────────────────────────────────────────
const ordersRoute = read("artifacts/api-server/src/routes/orders.ts");
assert.match(ordersRoute, /router\.put\("\/orders\/:id\/items"/);
assert.match(ordersRoute, /Pedido editado/);
assert.match(ordersRoute, /broadcastSSE\(companyId, "order_updated"/);
assert.match(ordersRoute, /prepStartedAt/); // file uses prep elsewhere; ensure we don't call startPrepTimer in edit block
{
  const putStart = ordersRoute.indexOf('router.put("/orders/:id/items"');
  assert.ok(putStart > 0);
  const putEnd = ordersRoute.indexOf("router.patch(\"/orders/:id/status\"", putStart);
  const putBlock = ordersRoute.slice(putStart, putEnd);
  assert.doesNotMatch(putBlock, /startPrepTimer/);
  assert.doesNotMatch(putBlock, /finishPrepTimer/);
  assert.match(putBlock, /delete\(orderItemsTable\)/);
  assert.match(putBlock, /insert\(orderItemsTable\)/);
  assert.match(putBlock, /subtotal: String\(subtotal/);
  assert.match(putBlock, /total: String\(total/);
  assert.match(putBlock, /workflow === "preparing"/);
  assert.doesNotMatch(putBlock, /insert\(ordersTable\)/);
}

// ── Client API ──────────────────────────────────────────────────────────────
const api = read("artifacts/burger-gn/src/lib/api.ts");
assert.match(api, /export const updateOrderItems/);
assert.match(api, /api\.put\(`\/orders\/\$\{id\}\/items`/);

// ── Modal + board wiring ────────────────────────────────────────────────────
const modal = read("artifacts/burger-gn/src/components/EditOrderItemsModal.tsx");
assert.match(modal, /ProductDetailModal/);
assert.match(modal, /updateOrderItems/);
assert.match(modal, /Observações do pedido/);

const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
assert.match(dash, /EditOrderItemsModal/);
assert.match(dash, /Editar/);
assert.match(dash, /canEditItems/);
assert.match(dash, /setEditingOrder/);

// ── Recalculation ───────────────────────────────────────────────────────────
{
  const { subtotal, total } = recalculateTotals({
    items: [
      { productPrice: 20, quantity: 2, addons: [{ price: 5 }] },
      { productPrice: 10, quantity: 1, addons: [] },
    ],
    deliveryFee: 4,
    discountAmount: 3,
  });
  // (20+5)*2 + 10 = 60; +4 -3 = 61
  assert.equal(subtotal, 60);
  assert.equal(total, 61);
}

{
  const { total } = recalculateTotals({
    items: [{ productPrice: 5, quantity: 1, addons: [] }],
    deliveryFee: 0,
    discountAmount: 10,
  });
  assert.equal(total, 0);
}

// Same order number / timer preserved = edit updates same row, no orderNumber change
assert.match(ordersRoute.slice(
  ordersRoute.indexOf('router.put("/orders/:id/items"'),
  ordersRoute.indexOf("router.patch(\"/orders/:id/status\""),
), /eq\(ordersTable\.id, id\)/);
assert.doesNotMatch(ordersRoute.slice(
  ordersRoute.indexOf('router.put("/orders/:id/items"'),
  ordersRoute.indexOf("router.patch(\"/orders/:id/status\""),
), /orderNumber/);

console.log("test-edit-order-items: ok");
