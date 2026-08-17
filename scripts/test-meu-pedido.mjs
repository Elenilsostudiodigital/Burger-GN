/**
 * Meu Pedido tab visibility — only while a real active order exists.
 * Run: node scripts/test-meu-pedido.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE_CUSTOMER_WORKFLOWS = [
  "awaiting_payment",
  "new",
  "accepted",
  "preparing",
  "ready",
  "out",
  "done",
];
const ACTIVE_CUSTOMER_STATUSES = ["new", "preparing", "delivery", "done"];

function isActiveCustomerOrder(order) {
  if (!order) return false;
  const workflow = String(order.workflow || "").trim();
  const status = String(order.status || "").trim();
  if (status === "cancelled" || workflow === "cancelled") return false;
  if (workflow === "finalized") return false;
  if (workflow) return ACTIVE_CUSTOMER_WORKFLOWS.includes(workflow);
  if (status) return ACTIVE_CUSTOMER_STATUSES.includes(status);
  return Boolean(order.trackingId);
}

function shouldShowMyOrderTab(ref) {
  if (!ref?.trackingId) return false;
  if (ref.workflow || ref.status) return isActiveCustomerOrder(ref);
  return true;
}

const memory = new Map();
const session = new Map();
const localStorage = {
  getItem(k) {
    return memory.has(k) ? memory.get(k) : null;
  },
  setItem(k, v) {
    memory.set(k, String(v));
  },
  removeItem(k) {
    memory.delete(k);
  },
};
const sessionStorage = {
  getItem(k) {
    return session.has(k) ? session.get(k) : null;
  },
  setItem(k, v) {
    session.set(k, String(v));
  },
  removeItem(k) {
    session.delete(k);
  },
};

const STORAGE_KEY = "bgn_my_order";
const HISTORY_KEY = "bgn_order_history";
const PUSH_QUEUE_KEY = "bgn_push_queue";
const LAST_ORDER_KEY = "lastOrder";
const CART_STORAGE_KEY = "bgn_cart_v1";

function getMyOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.trackingId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearMyOrder() {
  localStorage.removeItem(STORAGE_KEY);
}

function purgeCustomerOrderTracking(trackingId) {
  const current = getMyOrder();
  const id = trackingId || current?.trackingId;
  clearMyOrder();
  sessionStorage.removeItem(LAST_ORDER_KEY);
  if (id) {
    for (const key of [HISTORY_KEY, PUSH_QUEUE_KEY]) {
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify(prev.filter((p) => p.trackingId !== id)));
    }
  }
}

function saveMyOrder(ref) {
  if ((ref.workflow || ref.status) && !isActiveCustomerOrder(ref)) {
    purgeCustomerOrderTracking(ref.trackingId);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
}

function applyServerOrderToMyOrder(order) {
  if (!isActiveCustomerOrder(order)) {
    purgeCustomerOrderTracking(order.trackingId);
    return "inactive";
  }
  saveMyOrder({
    trackingId: order.trackingId,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    workflow: order.workflow,
    status: order.status,
  });
  return "active";
}

function hideMyOrderUnlessActive() {
  sessionStorage.removeItem(LAST_ORDER_KEY);
  const ref = getMyOrder();
  if (!ref) return;
  if (!shouldShowMyOrderTab(ref)) {
    purgeCustomerOrderTracking(ref.trackingId);
  }
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
}

function tabVisible() {
  return shouldShowMyOrderTab(getMyOrder());
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

function reset() {
  memory.clear();
  session.clear();
}

const base = {
  trackingId: "trk-1",
  orderNumber: 42,
  createdAt: "2026-08-17T00:00:00.000Z",
};

// 1. Carrinho limpo — sem pedido ativo a aba some imediatamente
reset();
localStorage.setItem(
  CART_STORAGE_KEY,
  JSON.stringify([{ lineId: "1", item: { id: 1, name: "Smash", price: 25 }, quantity: 1, selectedAddons: [], notes: "" }]),
);
sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(base));
localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, workflow: "finalized", status: "done" }));
ok("carrinho com itens no storage", localStorage.getItem(CART_STORAGE_KEY) !== null);
clearCart();
hideMyOrderUnlessActive();
ok("limpar carrinho remove itens", localStorage.getItem(CART_STORAGE_KEY) === null);
ok("limpar carrinho remove lastOrder", sessionStorage.getItem(LAST_ORDER_KEY) === null);
ok("limpar carrinho oculta aba sem pedido ativo", tabVisible() === false);

reset();
localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ lineId: "x" }]));
clearCart();
hideMyOrderUnlessActive();
ok("limpar carrinho sem nenhum pedido nunca mostra aba", tabVisible() === false);

reset();
saveMyOrder({ ...base, workflow: "preparing", status: "preparing" });
clearCart();
hideMyOrderUnlessActive();
ok("limpar carrinho preserva aba se pedido ativo", tabVisible() === true);

// 2. Voltar ao cardápio
reset();
saveMyOrder({ ...base, workflow: "finalized", status: "done" });
hideMyOrderUnlessActive();
ok("voltar ao cardápio oculta aba sem pedido ativo", tabVisible() === false);

reset();
saveMyOrder({ ...base, workflow: "out", status: "delivery" });
hideMyOrderUnlessActive();
ok("voltar ao cardápio mantém aba com pedido ativo", tabVisible() === true);

reset();
sessionStorage.setItem(LAST_ORDER_KEY, "{}");
hideMyOrderUnlessActive();
ok("voltar ao cardápio não reabre aba só porque usou o carrinho", tabVisible() === false);

// 3–7. Fluxo operacional
const stages = [
  ["criar novo pedido", { workflow: "new", status: "new" }, true],
  ["pedido em análise (awaiting_payment)", { workflow: "awaiting_payment", status: "new" }, true],
  ["pedido aceito", { workflow: "accepted", status: "preparing" }, true],
  ["em preparo", { workflow: "preparing", status: "preparing" }, true],
  ["saiu para entrega", { workflow: "out", status: "delivery" }, true],
  ["entregue", { workflow: "done", status: "done" }, true],
  ["finalizado", { workflow: "finalized", status: "done" }, false],
];

for (const [label, extra, visible] of stages) {
  reset();
  const state = applyServerOrderToMyOrder({ ...base, ...extra });
  ok(`${label}: aba ${visible ? "visível" : "oculta"}`, tabVisible() === visible);
  ok(`${label}: apply retorna ${visible ? "active" : "inactive"}`, state === (visible ? "active" : "inactive"));
}

// 8. Finalizado remove referências
reset();
saveMyOrder({ ...base, workflow: "out", status: "delivery" });
localStorage.setItem(HISTORY_KEY, JSON.stringify([{ trackingId: "trk-1", reason: "manual" }]));
localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify([{ trackingId: "trk-1", workflow: "out" }]));
sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(base));
applyServerOrderToMyOrder({ ...base, workflow: "finalized", status: "done" });
ok("finalizado remove bgn_my_order", localStorage.getItem(STORAGE_KEY) === null);
ok("finalizado remove lastOrder", sessionStorage.getItem(LAST_ORDER_KEY) === null);
ok("finalizado remove histórico do tracking", JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").length === 0);
ok("finalizado remove fila de push do tracking", JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || "[]").length === 0);
ok("finalizado não deixa rastreamento antigo visível", tabVisible() === false);

reset();
applyServerOrderToMyOrder({ ...base, trackingId: "trk-old", workflow: "finalized", status: "done" });
saveMyOrder({ ...base, trackingId: "trk-new", workflow: "new", status: "new" });
ok("próxima compra reaparece só com pedido novo", getMyOrder()?.trackingId === "trk-new" && tabVisible() === true);

ok("cancelled nunca mostra aba", isActiveCustomerOrder({ ...base, workflow: "cancelled", status: "cancelled" }) === false);
ok("pedido só no carrinho (sem tracking) não é pedido ativo", isActiveCustomerOrder({}) === false);

// Source wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => fs.readFileSync(path.join(root, p), "utf8");

const myOrderSrc = src("artifacts/burger-gn/src/lib/myOrder.ts");
ok("helper isActiveCustomerOrder exportado", /export function isActiveCustomerOrder/.test(myOrderSrc));
ok("helper hideMyOrderUnlessActive exportado", /export function hideMyOrderUnlessActive/.test(myOrderSrc));
ok("finalized não está na lista ativa", !/ACTIVE_CUSTOMER_WORKFLOWS = \[[^\]]*finalized/.test(myOrderSrc));

const cartSrc = src("artifacts/burger-gn/src/pages/Cart.tsx");
ok("Limpar carrinho redireciona com goToCardapio", /goToCardapio\(setLocation\)/.test(cartSrc));
ok("botão Voltar ao cardápio no carrinho", /Voltar ao cardápio/.test(cartSrc));

const checkoutSrc = src("artifacts/burger-gn/src/pages/Checkout.tsx");
ok("checkout persiste workflow no Meu Pedido", /workflow:\s*result\.workflow/.test(checkoutSrc));
ok("checkout Voltar ao cardápio usa goToCardapio", /goToCardapio\(setLocation\)/.test(checkoutSrc));

const navSrc = src("artifacts/burger-gn/src/components/BottomNav.tsx");
ok("BottomNav tem aba Meu Pedido", /Meu Pedido/.test(navSrc));
ok("BottomNav só renderiza aba com pedido visível", /useVisibleMyOrder/.test(navSrc) && /showMyOrder/.test(navSrc));

const fabSrc = src("artifacts/burger-gn/src/components/MyOrderFab.tsx");
ok("FAB aplica pedido do servidor e some se inativo", /applyServerOrderToMyOrder/.test(fabSrc));
ok("FAB some em 404", /purgeCustomerOrderTracking/.test(fabSrc));

const trackSrc = src("artifacts/burger-gn/src/pages/OrderTracking.tsx");
ok("tracking redireciona ao finalizar", /orderState === 'inactive'/.test(trackSrc));
ok("tracking Voltar ao cardápio", /Voltar ao cardápio/.test(trackSrc));

console.log(`\n${passed} checks passed.`);
