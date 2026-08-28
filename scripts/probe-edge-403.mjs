/**
 * Live probe: distinguish Vercel WAF 403 from app 403.
 * Run: node scripts/probe-edge-403.mjs
 * Exit 2 if the edge is blocking (WAF). Exit 1 on unexpected errors.
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function probe(path) {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    redirect: "manual",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  const text = await res.text();
  const headers = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const hasApiHeader = headers["x-burgergn-api"] === "1";
  const vercelMitigated =
    headers["x-vercel-mitigated"] ||
    headers["x-vercel-challenge-token"] ||
    headers["x-vercel-firewall-challenge"] ||
    null;
  const edgeBlocked = (res.status === 403 || res.status === 429) && !hasApiHeader;
  return { path, status: res.status, hasApiHeader, vercelMitigated, edgeBlocked, snippet: text.slice(0, 160) };
}

async function main() {
  const paths = ["/", "/cardapio", "/admin/login", "/api/healthz", "/api/products"];
  const rows = [];
  for (const p of paths) rows.push(await probe(p));

  const blocked = rows.filter((r) => r.edgeBlocked);
  const report = {
    ok: blocked.length === 0,
    base: BASE,
    at: new Date().toISOString(),
    blocked: blocked.map((r) => r.path),
    results: rows,
  };
  console.log(JSON.stringify(report, null, 2));

  if (blocked.length) {
    console.error("EDGE_403: Vercel WAF/firewall is blocking (not app auth/middleware).");
    process.exit(2);
  }
  const health = rows.find((r) => r.path === "/api/healthz");
  assert(health && health.status === 200, "healthz not 200");
  assert(health.hasApiHeader, "healthz missing X-BurgerGN-Api (old deploy?)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
