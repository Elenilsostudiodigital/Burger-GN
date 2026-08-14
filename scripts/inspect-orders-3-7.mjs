/**
 * Inspect production orders #3 and #7 only (no mutations).
 * Credentials from env: ADMIN_EMAIL / ADMIN_PASSWORD (optional).
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const email = process.env.ADMIN_EMAIL || "";
const password = process.env.ADMIN_PASSWORD || "";

function parseMeta(notes) {
  const raw = notes ?? "";
  const match = raw.match(/<!--BGN_META:([\s\S]*?):BGN_META-->/);
  if (!match) return { parseOk: true, hasBlock: false, meta: {}, publicLen: raw.length, notesLen: raw.length };
  try {
    const meta = JSON.parse(match[1] || "{}");
    return {
      parseOk: true,
      hasBlock: true,
      meta,
      publicLen: raw.replace(/<!--BGN_META:[\s\S]*?:BGN_META-->/, "").trim().length,
      notesLen: raw.length,
    };
  } catch (e) {
    return {
      parseOk: false,
      hasBlock: true,
      meta: {},
      parseError: String(e?.message || e),
      publicLen: raw.length,
      notesLen: raw.length,
    };
  }
}

function summarize(order) {
  const parsed = parseMeta(order.notes);
  const meta = order.meta || parsed.meta || {};
  const history = Array.isArray(order.history) ? order.history : (meta.history || []);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    workflow: order.workflow,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    pixMode: order.pixMode ?? meta.pixMode ?? null,
    mpPaymentId: order.mpPaymentId || null,
    customerName: order.customerName,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    deliveredAt: order.deliveredAt ?? meta.deliveredAt ?? null,
    finalizedAt: order.finalizedAt ?? meta.finalizedAt ?? null,
    metaWorkflow: meta.workflow ?? null,
    notesLen: parsed.notesLen,
    hasReceipt: !!(order.hasReceipt || meta.receiptDataUrl || meta.receiptUploadedAt),
    receiptBytes: typeof meta.receiptDataUrl === "string" ? meta.receiptDataUrl.length : 0,
    metaParseOk: parsed.parseOk,
    metaParseError: parsed.parseError || null,
    rejectReason: order.rejectReason ?? meta.rejectReason ?? null,
    stampsAwarded: !!(order.stampsAwarded || meta.stampsAwarded),
    cashbackAwarded: !!(order.cashbackAwarded || meta.cashbackAwarded),
    clientMemberId: meta.clientMemberId ?? null,
    source: order.source ?? meta.source ?? null,
    history: history.map((h) => ({ stage: h.stage, label: h.label, at: h.at })),
    itemsCount: Array.isArray(order.items) ? order.items.length : null,
  };
}

async function main() {
  if (!email || !password) {
    console.error("Need ADMIN_EMAIL and ADMIN_PASSWORD");
    process.exit(2);
  }
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginText = await loginRes.text();
  if (!loginRes.ok) {
    console.error("LOGIN_FAIL", loginRes.status, loginText.slice(0, 200));
    process.exit(1);
  }
  const setCookie = loginRes.headers.getSetCookie?.() || loginRes.headers.get("set-cookie");
  const cookie = Array.isArray(setCookie) ? setCookie.map((c) => c.split(";")[0]).join("; ") : (setCookie || "").split(";")[0];
  if (!cookie) {
    console.error("NO_COOKIE");
    process.exit(1);
  }

  const ordersRes = await fetch(`${BASE}/api/orders`, {
    headers: { Cookie: cookie },
  });
  if (!ordersRes.ok) {
    console.error("ORDERS_FAIL", ordersRes.status, await ordersRes.text());
    process.exit(1);
  }
  const orders = await ordersRes.json();
  const targets = (Array.isArray(orders) ? orders : []).filter((o) => o.orderNumber === 3 || o.orderNumber === 7);
  const othersDone = (Array.isArray(orders) ? orders : []).filter(
    (o) => o.workflow === "done" || (o.status === "done" && o.workflow !== "finalized"),
  );
  console.log(JSON.stringify({
    total: Array.isArray(orders) ? orders.length : 0,
    deliveredOnBoard: othersDone.map((o) => ({ n: o.orderNumber, wf: o.workflow, st: o.status, pay: o.paymentStatus, method: o.paymentMethod })),
    targets: targets.map(summarize),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
