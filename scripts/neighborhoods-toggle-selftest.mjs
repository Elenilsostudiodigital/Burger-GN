/**
 * Contract: Bairros master switch is persisted and never reset by seed/KM save.
 * Usage: node scripts/neighborhoods-toggle-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const schema = read("lib/db/src/schema/km_delivery.ts");
const ensure = read("artifacts/api-server/src/lib/ensureDeliveryAreasSchema.ts");
const seed = read("artifacts/api-server/src/lib/seed.ts");
const kmRoute = read("artifacts/api-server/src/routes/km_delivery.ts");
const zonesRoute = read("artifacts/api-server/src/routes/delivery_zones.ts");
const orders = read("artifacts/api-server/src/routes/orders.ts");
const helper = read("artifacts/api-server/src/lib/neighborhoodsSettings.ts");
const checkout = read("artifacts/burger-gn/src/pages/Checkout.tsx");
const admin = read("artifacts/burger-gn/src/pages/admin/DeliveryZones.tsx");
const api = read("artifacts/burger-gn/src/lib/api.ts");
const rule = read(".cursor/rules/delivery-coverage.mdc");
const validate = read("artifacts/burger-gn/src/lib/validateDeliveryCoverage.ts");

assert(schema.includes("neighborhoodsEnabled"), "schema column exists");
assert(ensure.includes("ADD COLUMN IF NOT EXISTS neighborhoods_enabled"), "additive column only");
assert(!ensure.includes("UPDATE km_delivery_config"), "schema ensure must not overwrite the flag");
assert(!seed.includes("db.delete(deliveryZonesTable)"), "seed must keep saved neighborhoods");
assert(!seed.includes("neighborhoodsEnabled: true"), "seed must not force bairros on");
assert(seed.includes("Later deploys must not UPDATE it") || seed.includes("neighborhoodsEnabled is set only on first insert"), "seed documents first-insert-only");
assert(!kmRoute.includes("neighborhoodsEnabled: Boolean") && !kmRoute.includes("patch[\"neighborhoodsEnabled\"]"), "KM save must not write the bairros flag");
assert(helper.includes("setNeighborhoodsEnabled"), "dedicated writer exists");
assert(zonesRoute.includes("/admin/delivery-zones/settings"), "admin settings endpoint");
assert(zonesRoute.includes("getNeighborhoodsEnabled"), "public zone list/fee check the switch");
assert(orders.includes("kmCfg?.neighborhoodsEnabled"), "orders skip neighborhood fee when off");
assert(checkout.includes("neighborhoodsEnabled"), "checkout reads the switch");
assert(checkout.includes("|| !neighborhoodsEnabled"), "disabled bairros force polygon/KM checkout");
assert(validate.includes("neighborhoodsEnabled"), "validator does not fall back to bairros when off");
assert(admin.includes("updateNeighborhoodsSettings"), "Bairros tab has the master toggle");
assert(admin.includes("Ativado") && admin.includes("Desativado"), "toggle copy is Ativado/Desativado");
assert(api.includes("updateNeighborhoodsSettings"), "client API for the switch");
assert(rule.includes("neighborhoods_enabled"), "official architecture records the switch");
assert(rule.includes("must never UPDATE this flag"), "official rule forbids seed/migration overwrite");

console.log("neighborhoods-toggle-selftest: ok");
