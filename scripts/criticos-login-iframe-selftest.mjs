/**
 * Contract checks for critical fixes 1, 2, 9, 10.
 * Usage: node scripts/criticos-login-iframe-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const admin = strip(read("artifacts/api-server/src/routes/admin.ts"));
const app = strip(read("artifacts/api-server/src/app.ts"));
const ensure = strip(read("artifacts/api-server/src/lib/ensureCompanySchema.ts"));
const login = strip(read("artifacts/burger-gn/src/pages/admin/Login.tsx"));
const checkout = strip(read("artifacts/burger-gn/src/pages/Checkout.tsx"));
const novas = strip(read("artifacts/burger-gn/src/pages/admin/NovasRuas.tsx"));

const checks = [
  {
    name: "ensureCompanySchema exists and seeds owner",
    ok:
      ensure.includes("CREATE TABLE IF NOT EXISTS companies") &&
      ensure.includes("CREATE TABLE IF NOT EXISTS company_users") &&
      ensure.includes("admin@burgergn.com.br"),
  },
  {
    name: "app middleware ensures company schema before API handlers",
    ok: app.includes("ensureCompanySchema") && app.includes("Failed to ensure company schema"),
  },
  {
    name: "login route has try/catch and returns JSON 500 (not HTML)",
    ok:
      admin.includes("try {") &&
      admin.includes('res.status(500).json({ error: loginFailureMessage(err) })') &&
      admin.includes("ensureCompanySchema"),
  },
  {
    name: "Login UI does not mask all errors as wrong password",
    ok:
      login.includes("err instanceof Error") &&
      !login.match(/catch\s*\{\s*setError\('E-mail ou senha incorretos/),
  },
  {
    name: "Checkout has no iframe",
    ok: !checkout.includes("<iframe") && checkout.includes("StreetMapPreview"),
  },
  {
    name: "NovasRuas has no iframe",
    ok: !novas.includes("<iframe") && novas.includes("StreetMapPreview"),
  },
  {
    name: "API unhandled errors return JSON for /api",
    ok: app.includes("Unhandled API error") && app.includes("res.status(500).json"),
  },
];

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? "ok" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed = true;
}
if (failed) process.exit(1);
console.log("PASS");
