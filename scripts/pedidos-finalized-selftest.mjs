/**
 * Pedidos finalized workflow contract.
 * Run: node scripts/pedidos-finalized-selftest.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const WORKFLOW_TO_STATUS = {
  awaiting_payment: "new",
  new: "new",
  accepted: "preparing",
  preparing: "preparing",
  ready: "preparing",
  out: "delivery",
  done: "done",
  finalized: "done",
};

function isVisibleOnBoard(order) {
  if (order.workflow === "finalized") return false;
  if (order.status === "cancelled") return true;
  return true;
}

function canRevertFrom(current, next) {
  if (current === "finalized" && next !== "finalized") return false;
  return true;
}

function canFinalizeFrom(current) {
  return current === "done" || current === "finalized";
}

assert(WORKFLOW_TO_STATUS.finalized === "done", "finalized keeps DB status done (not deleted)");
assert(isVisibleOnBoard({ workflow: "finalized", status: "done" }) === false, "hide finalized from board");
assert(isVisibleOnBoard({ workflow: "done", status: "done" }) === true, "delivered stays on board");
assert(canRevertFrom("finalized", "preparing") === false, "block revert from finalized");
assert(canFinalizeFrom("out") === false, "cannot finalize from out");
assert(canFinalizeFrom("done") === true, "can finalize from delivered");

console.log("pedidos-finalized-selftest: OK");
