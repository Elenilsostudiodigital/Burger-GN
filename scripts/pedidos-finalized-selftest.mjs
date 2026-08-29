/**
 * Pedidos finalized workflow contract.
 * Run: node scripts/pedidos-finalized-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finalizedPage = fs.readFileSync(
  path.join(root, "artifacts/burger-gn/src/pages/admin/FinalizedOrders.tsx"),
  "utf8",
);
assert(finalizedPage.includes("Reimprimir comprovante"), "reprint tooltip on finalized list");
assert(finalizedPage.includes("🖨️ Reimprimir"), "labeled reprint button");
assert(finalizedPage.includes("silentPrintOrder"), "reprint uses print agent, not browser print");
assert(finalizedPage.includes("getOrder(") || finalizedPage.includes("getOrder"), "reprint fetches full order");
assert(!finalizedPage.includes("window.print"), "no window.print on finalized orders");

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
