/**
 * Sanity checks for Mercado Pago refuse/refund decision helpers.
 * Run: node scripts/mp-refund-selftest.mjs
 */

function isRealMpPaymentId(paymentId) {
  const id = String(paymentId || "").trim();
  return Boolean(id) && !id.startsWith("static_");
}

function isConfirmedMpRefund(paymentStatus, refundStatus) {
  const pay = String(paymentStatus || "").toLowerCase();
  const ref = String(refundStatus || "").toLowerCase();
  if (pay === "refunded" || pay === "charged_back") return true;
  if (ref === "approved") return true;
  return false;
}

function orderNeedsMercadoPagoRefund(order, meta) {
  if (order.paymentMethod !== "pix") return false;
  if (order.paymentStatus !== "paid") return false;
  if (meta.pixMode === "manual") return false;
  if (!isRealMpPaymentId(order.mpPaymentId)) return false;
  if (meta.refundStatus === "refunded") return false;
  return true;
}

function mapMpStatus(mpStatus) {
  if (mpStatus === "approved") return "paid";
  if (mpStatus === "refunded" || mpStatus === "charged_back") return "paid";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "failed";
  return "pending";
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isRealMpPaymentId("172552108275"), "real MP id");
assert(!isRealMpPaymentId("static_abc"), "static pix is not MP");
assert(!isRealMpPaymentId(""), "empty is not MP");
assert(!isRealMpPaymentId(null), "null is not MP");

assert(isConfirmedMpRefund("refunded", null), "payment refunded is confirmed");
assert(isConfirmedMpRefund("charged_back", null), "chargeback is confirmed");
assert(isConfirmedMpRefund("approved", "approved"), "refund resource approved is confirmed");
assert(!isConfirmedMpRefund("approved", "in_process"), "in_process is not confirmed");
assert(!isConfirmedMpRefund("approved", null), "approved payment alone is not a refund");
assert(!isConfirmedMpRefund("approved", "rejected"), "rejected refund is not confirmed");

assert(orderNeedsMercadoPagoRefund(
  { paymentMethod: "pix", paymentStatus: "paid", mpPaymentId: "172552108275" },
  { pixMode: "online" },
), "paid online pix needs refund");

assert(!orderNeedsMercadoPagoRefund(
  { paymentMethod: "pix", paymentStatus: "paid", mpPaymentId: "172552108275" },
  { pixMode: "online", refundStatus: "refunded" },
), "already refunded skips");

assert(orderNeedsMercadoPagoRefund(
  { paymentMethod: "pix", paymentStatus: "paid", mpPaymentId: "172552108275" },
  { pixMode: "online", refundStatus: "failed" },
), "failed refund can retry");

assert(!orderNeedsMercadoPagoRefund(
  { paymentMethod: "pix", paymentStatus: "paid", mpPaymentId: "static_x" },
  { pixMode: "manual" },
), "manual pix does not refund via MP");

assert(!orderNeedsMercadoPagoRefund(
  { paymentMethod: "pix", paymentStatus: "pending", mpPaymentId: "172552108275" },
  { pixMode: "online" },
), "unpaid does not refund");

assert(!orderNeedsMercadoPagoRefund(
  { paymentMethod: "cash", paymentStatus: "paid", mpPaymentId: null },
  {},
), "cash does not refund via MP");

assert(mapMpStatus("refunded") === "paid", "refunded must not map to failed");
assert(mapMpStatus("charged_back") === "paid", "chargeback must not map to failed");
assert(mapMpStatus("approved") === "paid", "approved stays paid");
assert(mapMpStatus("rejected") === "failed", "rejected is failed");

console.log("mp-refund-selftest: OK");
