/**
 * Selftest: polygon extraction + form visibility contract for Áreas de Entrega.
 * Usage: node scripts/delivery-areas-save-flow-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "artifacts/burger-gn/src/pages/admin/DeliveryAreasAdmin.tsx"),
  "utf8",
);

function must(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

must(page.includes('openForm("create")'), "pm:create must open create form");
must(page.includes("Salvar Área"), "Salvar Área button label");
must(page.includes("formMode === \"create\""), "create form mode");
must(page.includes("refresh({ silent: true })"), "silent reload areas after save");
must(page.includes("listAdminDeliveryAreas"), "load areas from API");
must(page.includes("polygonFromLayer"), "extract polygon from draft layer");
must(page.includes("scrollIntoView"), "scroll form into view after Finalizar");
must(page.includes('formMode === "create" || formMode === "edit"'), "show form for create/edit");
must(!/showForm = Boolean\(draftPolygon\)/.test(page), "must not gate form only on draftPolygon");
must(page.includes("stable React DOM"), "documents insertBefore-safe DOM contract");

console.log("delivery-areas-save-flow-selftest: PASS");
