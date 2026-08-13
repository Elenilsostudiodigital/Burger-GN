/**
 * Novo Pedido (attendant) — pure rules selftest.
 * Run: node scripts/novo-pedido-selftest.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Mirrors serialize/parse of OrderMeta.source */
function serializeSource(meta) {
  const clean = {};
  if (meta.source === "online" || meta.source === "attendant") clean.source = meta.source;
  return clean;
}

function parseSource(json) {
  try {
    const meta = JSON.parse(json);
    return meta.source === "online" || meta.source === "attendant" ? meta.source : null;
  } catch {
    return null;
  }
}

/** Delivery address validation used by POST /orders */
function validateDeliveryAddress(body) {
  if (body.orderType !== "delivery") return { ok: true };
  const street = String(body.address || "").trim();
  const number = String(body.addressNumber || "").trim();
  if (!street) return { ok: false, error: "Informe o endereço de entrega." };
  if (!number) return { ok: false, error: "Informe o número do imóvel." };
  return { ok: true };
}

/** Attendant source only when admin session matches company */
function resolveAttendantSource(bodySource, session, companyId) {
  if (bodySource !== "attendant") return null;
  if (!session || session.companyId !== companyId) return null;
  return "attendant";
}

/** Board visibility: attendant PIX awaiting payment still shows */
function isVisibleOnBoard(order) {
  if (order.status === "cancelled") return true;
  if (order.source === "attendant") return true;
  if (order.paymentMethod === "pix" && order.workflow === "awaiting_payment" && !order.hasReceipt) {
    return false;
  }
  return true;
}

/** Prefer MP online PIX when available */
function preferPixMode(requested, onlineAvailable, manualEnabled) {
  if (requested === "online") return onlineAvailable ? "online" : null;
  if (requested === "manual") return manualEnabled ? "manual" : null;
  if (onlineAvailable) return "online";
  if (manualEnabled) return "manual";
  return null;
}

let passed = 0;

// 1) source serialize round-trip
{
  const clean = serializeSource({ source: "attendant" });
  assert(clean.source === "attendant", "source attendant serialized");
  assert(parseSource(JSON.stringify(clean)) === "attendant", "source attendant parsed");
  assert(serializeSource({ source: "hack" }).source === undefined, "invalid source dropped");
  passed++;
}

// 2) delivery number required; CEP optional
{
  assert(
    !validateDeliveryAddress({ orderType: "delivery", address: "Rua A", addressNumber: "" }).ok,
    "number required",
  );
  assert(
    validateDeliveryAddress({
      orderType: "delivery",
      address: "Rua A",
      addressNumber: "100",
      // no cep / complement
    }).ok,
    "cep optional ok",
  );
  assert(
    validateDeliveryAddress({ orderType: "pickup", address: "", addressNumber: "" }).ok,
    "pickup no address",
  );
  passed++;
}

// 3) attendant source requires session
{
  assert(resolveAttendantSource("attendant", null, 1) === null, "no session");
  assert(resolveAttendantSource("attendant", { companyId: 2 }, 1) === null, "wrong company");
  assert(resolveAttendantSource("online", { companyId: 1 }, 1) === null, "online body");
  assert(resolveAttendantSource("attendant", { companyId: 1 }, 1) === "attendant", "ok attendant");
  passed++;
}

// 4) board visibility
{
  assert(
    isVisibleOnBoard({
      status: "pending",
      source: "attendant",
      paymentMethod: "pix",
      workflow: "awaiting_payment",
      hasReceipt: false,
    }),
    "attendant pix visible",
  );
  assert(
    !isVisibleOnBoard({
      status: "pending",
      source: null,
      paymentMethod: "pix",
      workflow: "awaiting_payment",
      hasReceipt: false,
    }),
    "public pix hidden until receipt",
  );
  assert(
    isVisibleOnBoard({
      status: "pending",
      source: null,
      paymentMethod: "cash",
      workflow: "new",
      hasReceipt: false,
    }),
    "cash visible",
  );
  passed++;
}

// 5) PIX preference
{
  assert(preferPixMode(undefined, true, true) === "online", "prefer online");
  assert(preferPixMode("manual", true, true) === "manual", "honor manual");
  assert(preferPixMode("online", false, true) === null, "online unavailable");
  assert(preferPixMode(undefined, false, true) === "manual", "fallback manual");
  passed++;
}

console.log(`novo-pedido-selftest: ${passed}/5 ok`);
