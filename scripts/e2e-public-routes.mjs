/**
 * Assert public storefront routes are reachable without auth cookies.
 *   node scripts/e2e-public-routes.mjs
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function probe(path) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    },
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function main() {
  const publicPages = ["/", "/cardapio", "/clube"];
  for (const path of publicPages) {
    const r = await probe(path);
    assert(r.status === 200, `${path} expected 200 got ${r.status}`);
    assert(!/403\s*[-–—]?\s*Proibido/i.test(r.text), `${path} body looks like 403 page`);
    assert(!/Authentication Required/i.test(r.text), `${path} looks like Vercel auth wall`);
    assert(/<!DOCTYPE html>/i.test(r.text) || /<html/i.test(r.text), `${path} not HTML`);
  }

  const publicApis = [
    "/api/healthz",
    "/api/products",
    "/api/categories",
    "/api/company-profile",
    "/api/store-status",
    "/api/clube/info",
  ];
  for (const path of publicApis) {
    const r = await probe(path);
    assert(r.status === 200, `${path} expected 200 got ${r.status} body=${r.text.slice(0, 120)}`);
    assert(!/Proibido/i.test(r.text), `${path} unexpected Proibido`);
  }

  // Admin login page is public HTML; protected APIs stay unauthorized without cookie
  const loginPage = await probe("/admin/login");
  assert(loginPage.status === 200, `/admin/login expected 200 got ${loginPage.status}`);

  const me = await probe("/api/admin/me");
  assert(
    me.status === 401 || me.status === 403,
    `/api/admin/me should require auth, got ${me.status}`,
  );

  console.log(JSON.stringify({ ok: true, base: BASE, publicPages, publicApis }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
