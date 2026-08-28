/**
 * Static checks for public-route 403 hardening.
 *   node scripts/test-public-access-hardening.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const companyMw = read("artifacts/api-server/src/middlewares/company.ts");
assert.match(companyMw, /companyBlocked/);
assert.doesNotMatch(
  companyMw,
  /if \(company\.status === "blocked"\)[\s\S]{0,80}res\.status\(403\)/,
);
assert.match(companyMw, /Catalog routes[\s\S]*must never/);

const orders = read("artifacts/api-server/src/routes/orders.ts");
assert.match(orders, /req\.companyBlocked/);
assert.match(orders, /Esta loja está temporariamente indisponível/);

const sw = read("artifacts/burger-gn/public/sw.js");
assert.match(sw, /burger-gn-pwa-v5-edge-403/);
assert.match(sw, /isCacheableOk/);
assert.match(sw, /isEdgeBlockStatus|403/);

const app = read("artifacts/burger-gn/src/App.tsx");
assert.match(app, /<Route path="\/" component=\{Home\} \/>/);
assert.match(app, /<Route path="\/cardapio" component=\{Menu\} \/>/);
assert.match(app, /<Route path="\/clube" component=\{ClubeCliente\} \/>/);
assert.match(app, /ProtectedAdminRoute/);
assert.match(app, /path="\/admin\/cardapio".*ProtectedAdminRoute/);

const vercel = read("vercel.json");
assert.match(vercel, /CDN-Cache-Control|no-store/);
assert.match(vercel, /must-revalidate|no-store/);

console.log("test-public-access-hardening: ok");
