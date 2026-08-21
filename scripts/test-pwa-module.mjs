const BASE = "https://burger-gn.vercel.app";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForSw(maxMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const res = await fetch(`${BASE}/sw.js`, { cache: "no-store" });
    const text = await res.text();
    if (res.ok && text.includes("burger-gn-pwa")) return text;
    console.log("waiting deploy sw...", res.status);
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error("SW not deployed");
}

async function main() {
  await waitForSw();
  console.log("✓ service worker");

  const man = await fetch(`${BASE}/manifest.webmanifest`, { cache: "no-store" });
  assert(man.ok, "manifest missing");
  const manifest = await man.json();
  assert(manifest.name === "Burger GN", `name=${manifest.name}`);
  assert(manifest.short_name === "Burger GN", `short=${manifest.short_name}`);
  assert(manifest.display === "standalone", "display not standalone");
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "icons");
  console.log("✓ manifest name/short/standalone/icons");

  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png",
  ]) {
    const r = await fetch(`${BASE}${path}`, { method: "HEAD", cache: "no-store" });
    assert(r.ok, `missing ${path}`);
  }
  console.log("✓ icons");

  const html = await (await fetch(`${BASE}/`, { cache: "no-store" })).text();
  assert(html.includes('rel="manifest"'), "manifest link");
  assert(html.includes("apple-mobile-web-app-capable"), "ios meta");
  assert(html.includes("pwa-boot-splash") || html.includes("Burger GN"), "splash/title");
  console.log("✓ html meta + splash");

  const profile = await fetch(`${BASE}/api/company-profile`);
  assert(profile.ok, "company profile api");
  console.log("✓ API / company-profile intact");

  const cats = await fetch(`${BASE}/api/categories`);
  assert(cats.ok, "categories api");
  console.log("✓ cardápio API intact");

  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@burgergn.com.br", password: "burger123" }),
  });
  const loginBody = await login.json();
  assert(login.ok && loginBody.ok, "admin login");
  console.log("✓ painel login intact");

  console.log("\nALL PWA CHECKS PASSED");
  console.log("Manual: Chrome → ícone instalar / 'Instalar Burger GN' no banner.");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
