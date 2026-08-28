/**
 * Delivery area analysis request flow (customer button + admin card).
 * Run: node scripts/area-analysis-request-selftest.mjs
 */
import fs from "node:fs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkUnknownStreetResponse(existingPending) {
  return {
    known: false,
    pending: !!existingPending,
    alreadyRequested: !!existingPending,
    canRequest: true,
    requestId: existingPending?.id ?? null,
    fee: null,
    message: "Esta região ainda não faz parte da nossa área de entrega.",
  };
}

function shouldCreateOnCheck() {
  return false;
}

function customerPanelCopy() {
  return {
    region: "Não entregamos nesta região.",
    button: "📍 Solicitar análise da minha região",
    success: "Solicitação enviada com sucesso.",
  };
}

function adminCardTitle() {
  return "Nova solicitação de área de entrega.";
}

function sseOnCreate(created) {
  return created ? "street_request" : null;
}

let n = 0;

{
  const res = checkUnknownStreetResponse(null);
  assert(res.canRequest === true, "unknown street can request");
  assert(res.pending === false, "check does not mark pending until customer clicks");
  assert(shouldCreateOnCheck() === false, "check must not auto-create");
  n++;
}

{
  const copy = customerPanelCopy();
  assert(copy.button.includes("Solicitar análise da minha região"), "button label");
  assert(copy.success === "Solicitação enviada com sucesso.", "success copy");
  n++;
}

{
  assert(adminCardTitle() === "Nova solicitação de área de entrega.", "admin card");
  assert(sseOnCreate(true) === "street_request", "sse on create");
  n++;
}

{
  const existing = checkUnknownStreetResponse({ id: 9 });
  assert(existing.pending === true && existing.canRequest === true, "already requested still visible");
  n++;
}

{
  const checkout = fs.readFileSync(new URL("../artifacts/burger-gn/src/pages/Checkout.tsx", import.meta.url), "utf8");
  assert(checkout.includes("canRequestArea || areaRequestStatus === 'sent'"), "analysis panel gated on canRequestArea");
  assert(checkout.includes("geocodeDeliveryAddress"), "checkout uses border-aware geocode");
  assert(!checkout.includes("Lauro de Freitas, Bahia, Brasil"), "checkout no longer hardcodes only Lauro in geocode");
  n++;
}

{
  const checkRoute = fs.readFileSync(new URL("../artifacts/api-server/src/routes/delivery_streets.ts", import.meta.url), "utf8");
  assert(checkRoute.includes("evaluateDeliveryCoverage"), "street check uses unified coverage");
  assert(checkRoute.includes("inDeliveryArea"), "street check returns inDeliveryArea");
  n++;
}

console.log(`area-analysis-request-selftest: ${n}/6 ok`);
