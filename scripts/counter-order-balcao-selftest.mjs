/**
 * Counter (balcão) order → customer app sync + edit rules.
 * Run: node scripts/counter-order-balcao-selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PIX_PAID_EDIT_MESSAGE =
  "Pedidos pagos via PIX não podem ser alterados. Crie um novo pedido.";

const COUNTER_EDITABLE_WORKFLOWS = ["awaiting_payment", "new", "accepted", "preparing"];
const COUNTER_LOCKED_WORKFLOWS = ["ready", "out", "done", "finalized", "cancelled"];

function isEstablishedClubeMember(joinedAt, nowMs = Date.now()) {
  if (!joinedAt) return false;
  const t = joinedAt instanceof Date ? joinedAt.getTime() : Date.parse(String(joinedAt));
  if (!Number.isFinite(t)) return false;
  return nowMs - t > 120_000;
}

function shouldSyncAttendantOrderToCustomerApp(opts) {
  if (!opts.isAttendantOrder) return false;
  if (opts.memberActive === false) return false;
  if (!opts.memberJoinedAt && !opts.linkToCustomerApp) return false;
  if (opts.linkToCustomerApp === true) return true;
  return isEstablishedClubeMember(opts.memberJoinedAt, opts.nowMs);
}

function evaluateCounterOrderEdit(opts) {
  if (opts.source !== "attendant") {
    return { ok: false, error: "Só é possível editar pedidos lançados no balcão.", code: "not_attendant" };
  }
  if (opts.paymentMethod === "pix" && opts.paymentStatus === "paid") {
    return { ok: false, error: PIX_PAID_EDIT_MESSAGE, code: "pix_paid" };
  }
  if (!COUNTER_EDITABLE_WORKFLOWS.includes(String(opts.workflow || ""))) {
    return { ok: false, error: "Este pedido não pode mais ser editado neste status.", code: "locked_status" };
  }
  if (typeof opts.itemCount === "number" && opts.itemCount <= 0) {
    return { ok: false, error: "Adicione ao menos um produto.", code: "empty_items" };
  }
  return { ok: true };
}

function recalculateCounterOrderTotals(opts) {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const subtotal = Math.max(0, round2(opts.subtotal));
  const deliveryFee = Math.max(0, round2(opts.deliveryFee));
  const couponDiscount = Math.min(subtotal, Math.max(0, round2(opts.couponDiscount)));
  const fidelityDiscount = Math.min(
    Math.max(0, subtotal - couponDiscount),
    Math.max(0, round2(opts.fidelityDiscount)),
  );
  const payable = Math.max(0, round2(subtotal + deliveryFee - couponDiscount - fidelityDiscount));
  const cashbackApplied = Math.min(payable, Math.max(0, round2(opts.cashbackUsedAmount)));
  const total = Math.max(0, round2(payable - cashbackApplied));
  const discountAmount = round2(couponDiscount + fidelityDiscount + cashbackApplied);
  return { discountAmount, total, cashbackApplied };
}

function lineSubtotal(opts) {
  const add = (opts.addons ?? []).reduce((s, a) => s + (Number(a.price) || 0), 0);
  return Math.round(((Number(opts.productPrice) || 0) + add) * Math.max(0, opts.quantity) * 100) / 100;
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const now = Date.parse("2026-08-21T15:00:00.000Z");

// 1. Registered client at the counter → sync
ok(
  "cliente cadastrado (flag) sincroniza",
  shouldSyncAttendantOrderToCustomerApp({
    isAttendantOrder: true,
    linkToCustomerApp: true,
    memberJoinedAt: "2026-01-01T00:00:00.000Z",
    memberActive: true,
    nowMs: now,
  }) === true,
);
ok(
  "cliente cadastrado antigo sem flag ainda sincroniza",
  shouldSyncAttendantOrderToCustomerApp({
    isAttendantOrder: true,
    linkToCustomerApp: false,
    memberJoinedAt: "2026-01-01T00:00:00.000Z",
    memberActive: true,
    nowMs: now,
  }) === true,
);

// 2. Walk-in / newly created CRM row → no app sync
ok(
  "cliente novo (CRM criado agora) não sincroniza",
  shouldSyncAttendantOrderToCustomerApp({
    isAttendantOrder: true,
    linkToCustomerApp: false,
    memberJoinedAt: new Date(now - 5_000).toISOString(),
    memberActive: true,
    nowMs: now,
  }) === false,
);
ok(
  "pedido online nunca sincroniza por este fluxo",
  shouldSyncAttendantOrderToCustomerApp({
    isAttendantOrder: false,
    linkToCustomerApp: true,
    memberJoinedAt: "2026-01-01T00:00:00.000Z",
    memberActive: true,
    nowMs: now,
  }) === false,
);
ok(
  "membro inativo não sincroniza",
  shouldSyncAttendantOrderToCustomerApp({
    isAttendantOrder: true,
    linkToCustomerApp: true,
    memberJoinedAt: "2026-01-01T00:00:00.000Z",
    memberActive: false,
    nowMs: now,
  }) === false,
);

// 3. Edit allowed in received / analysis / accepted / preparing
for (const wf of COUNTER_EDITABLE_WORKFLOWS) {
  ok(
    `dinheiro/cartão editável em ${wf}`,
    evaluateCounterOrderEdit({
      source: "attendant",
      paymentMethod: "cash",
      paymentStatus: "pending",
      workflow: wf,
      itemCount: 1,
    }).ok === true,
  );
  ok(
    `cartão editável em ${wf}`,
    evaluateCounterOrderEdit({
      source: "attendant",
      paymentMethod: "card",
      paymentStatus: "pending",
      workflow: wf,
      itemCount: 1,
    }).ok === true,
  );
}

ok(
  "PIX pendente (em análise) ainda pode editar",
  evaluateCounterOrderEdit({
    source: "attendant",
    paymentMethod: "pix",
    paymentStatus: "pending",
    workflow: "awaiting_payment",
    itemCount: 1,
  }).ok === true,
);

// 4. Locked after out / delivered / finalized
for (const wf of COUNTER_LOCKED_WORKFLOWS) {
  ok(
    `edição bloqueada em ${wf}`,
    evaluateCounterOrderEdit({
      source: "attendant",
      paymentMethod: "cash",
      paymentStatus: "pending",
      workflow: wf,
      itemCount: 1,
    }).ok === false,
  );
}

ok(
  "Pronto (ready) não está na lista editável",
  evaluateCounterOrderEdit({
    source: "attendant",
    paymentMethod: "cash",
    paymentStatus: "pending",
    workflow: "ready",
    itemCount: 1,
  }).code === "locked_status",
);

// 5. PIX paid cannot be edited — exact message
{
  const r = evaluateCounterOrderEdit({
    source: "attendant",
    paymentMethod: "pix",
    paymentStatus: "paid",
    workflow: "preparing",
    itemCount: 1,
  });
  ok("PIX pago bloqueia edição", r.ok === false && r.code === "pix_paid");
  ok("mensagem PIX exatamente como especificado", r.error === PIX_PAID_EDIT_MESSAGE);
}

ok(
  "pedido do app (online) não usa Editar Pedido",
  evaluateCounterOrderEdit({
    source: "online",
    paymentMethod: "cash",
    paymentStatus: "pending",
    workflow: "new",
    itemCount: 1,
  }).code === "not_attendant",
);

// 6. Recalculate subtotal / discounts / total
{
  const line = lineSubtotal({ productPrice: 25, addons: [{ price: 5 }], quantity: 2 });
  ok("subtotal linha 2x (25+5) = 60", line === 60);

  const t = recalculateCounterOrderTotals({
    subtotal: 60,
    deliveryFee: 8,
    couponDiscount: 10,
    fidelityDiscount: 0,
    cashbackUsedAmount: 5,
  });
  ok("total 60+8-10-5 = 53", t.total === 53);
  ok("discountAmount = cupom + cashback", t.discountAmount === 15);

  const capped = recalculateCounterOrderTotals({
    subtotal: 20,
    deliveryFee: 0,
    couponDiscount: 0,
    fidelityDiscount: 0,
    cashbackUsedAmount: 50,
  });
  ok("cashback não deixa total negativo", capped.total === 0 && capped.cashbackApplied === 20);

  const addThenRemove = recalculateCounterOrderTotals({
    subtotal: 80,
    deliveryFee: 8,
    couponDiscount: 8,
    fidelityDiscount: 0,
    cashbackUsedAmount: 0,
  });
  ok("após adicionar itens o total sobe", addThenRemove.total === 80);

  const fewer = recalculateCounterOrderTotals({
    subtotal: 30,
    deliveryFee: 8,
    couponDiscount: 3,
    fidelityDiscount: 0,
    cashbackUsedAmount: 0,
  });
  ok("após remover itens o total desce", fewer.total === 35);
}

// 7. Source wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ordersApi = src("artifacts/api-server/src/routes/orders.ts");
ok("POST /orders grava syncToCustomerApp", /syncToCustomerApp/.test(ordersApi));
ok("GET customer-active existe", /\/orders\/customer-active/.test(ordersApi));
ok("GET customer-stream existe", /\/orders\/customer-stream/.test(ordersApi));
ok("PATCH /orders/:id/items existe", /\/orders\/:id\/items/.test(ordersApi));
ok("broadcast customer SSE no create", /counter_order/.test(ordersApi));
ok("PATCH usa evaluateCounterOrderEdit", /evaluateCounterOrderEdit/.test(ordersApi));
ok("mensagem PIX no backend", src("artifacts/api-server/src/lib/counterOrderRules.ts").includes(PIX_PAID_EDIT_MESSAGE));

const newOrder = src("artifacts/burger-gn/src/pages/admin/NewOrder.tsx");
ok("Novo Pedido envia linkToCustomerApp quando found", /linkToCustomerApp:\s*clientStatus === 'found'/.test(newOrder));

const api = src("artifacts/burger-gn/src/lib/api.ts");
ok("client getCustomerActiveOrder", /getCustomerActiveOrder/.test(api));
ok("client updateOrderItems", /updateOrderItems/.test(api));

const app = src("artifacts/burger-gn/src/App.tsx");
ok("App liga useCustomerOrderSync", /useCustomerOrderSync/.test(app));

const dash = src("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
ok("Dashboard tem opção Editar Pedido", /Editar Pedido/.test(dash));
ok("Dashboard abre EditOrderModal", /EditOrderModal/.test(dash));

const modal = src("artifacts/burger-gn/src/components/admin/EditOrderModal.tsx");
ok("modal usa a mensagem PIX", /PIX_PAID_EDIT_MESSAGE/.test(modal));

const hook = src("artifacts/burger-gn/src/hooks/useCustomerOrderSync.ts");
ok("hook consulta pedido ativo do cliente", /getCustomerActiveOrder/.test(hook));
ok("hook enfileira push futuro", /notifyOrderStatusChange/.test(hook));
ok("hook conecta SSE do cliente", /customer-stream/.test(hook));

const myOrder = src("artifacts/burger-gn/src/lib/myOrder.ts");
ok("fila de push futura permanece", /queuePushNotification/.test(myOrder));
ok("isPushIntegrated continua false", /function isPushIntegrated[\s\S]*?return false;/.test(myOrder));

ok("cashback não é reescrito neste módulo de regras", !/debitCashback|cashbackBalance/.test(src("artifacts/api-server/src/lib/counterOrderRules.ts")));

console.log(`\ncounter-order-balcao-selftest: ${passed} checks passed.`);
