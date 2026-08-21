/**
 * Verify production bundle contains cashback utilization UI markers.
 */
const BASE = process.env.PROD_URL || "https://burger-gn.vercel.app";

const htmlRes = await fetch(BASE + "/");
const html = await htmlRes.text();
const headers = Object.fromEntries(htmlRes.headers.entries());

const assetMatches = [...html.matchAll(/\/assets\/([A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]);
const uniqueAssets = [...new Set(assetMatches)];
console.log("url", BASE);
console.log("status", htmlRes.status);
console.log("x-vercel-id", headers["x-vercel-id"] || headers["x-vercel-cache"] || "(none)");
console.log("assets", uniqueAssets.slice(0, 20));

const markers = [
  "Utilizar meu cashback",
  "cashback dispon",
  "useCashback",
  "ClubeCashback",
  "maxUsePercent",
  "cashbackMaxUsePercent",
  "Validade do cashback",
  "% máximo utilizável",
];

let foundAny = false;
for (const name of uniqueAssets.slice(0, 15)) {
  const js = await (await fetch(`${BASE}/assets/${name}`)).text();
  const hits = markers.filter((m) => js.includes(m));
  if (hits.length) {
    foundAny = true;
    console.log(`\n[${name}] hits (${hits.length}):`, hits.join(" | "));
  }
}

// Also check admin chunk naming patterns in HTML modulepreload
console.log("\nfoundMarkersInBundles:", foundAny);

// Probe public API for new fields
try {
  const info = await (await fetch(`${BASE}/api/clube/info`)).json();
  console.log("\n/api/clube/info cashback keys:", Object.keys(info?.cashback || {}));
  console.log("has maxUsePercent:", info?.cashback?.maxUsePercent !== undefined);
  console.log("has expiryMode:", info?.cashback?.expiryMode !== undefined);
} catch (e) {
  console.log("api/clube/info failed", e?.message || e);
}
