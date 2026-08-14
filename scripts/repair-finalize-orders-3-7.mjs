/**
 * Repair + finalize production orders #3 and #7 only.
 * 1) Regularize unpaid PIX on already-delivered legacy rows
 * 2) Call the existing FINALIZAR path (workflow=finalized)
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const email = process.env.ADMIN_EMAIL || "";
const password = process.env.ADMIN_PASSWORD || "";

async function login() {
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) throw new Error(`LOGIN_FAIL ${loginRes.status} ${await loginRes.text()}`);
  const setCookie = loginRes.headers.getSetCookie?.() || loginRes.headers.get("set-cookie");
  const cookie = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(";")[0]).join("; ")
    : String(setCookie || "").split(";")[0];
  if (!cookie) throw new Error("NO_COOKIE");
  return cookie;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  if (!email || !password) {
    console.error("Need ADMIN_EMAIL and ADMIN_PASSWORD");
    process.exit(2);
  }
  const cookie = await login();

  const repair = await api(cookie, "POST", "/admin/repair-legacy-delivered-pix");
  console.log("REPAIR", repair.status, JSON.stringify(repair.json));
  if (!repair.ok) process.exit(1);

  const ids = (repair.json.repaired || []).map((r) => r.id);
  if (!ids.length) {
    console.log("Nothing to repair — checking current state of #3/#7");
  }

  const list1 = await api(cookie, "GET", "/orders");
  const all1 = Array.isArray(list1.json) ? list1.json : [];
  const targets = all1.filter((o) => o.orderNumber === 3 || o.orderNumber === 7);

  for (const o of targets) {
    if (o.workflow === "finalized") {
      console.log(`SKIP finalize #${o.orderNumber} already finalized`);
      continue;
    }
    const fin = await api(cookie, "PATCH", `/orders/${o.id}/status`, { workflow: "finalized" });
    console.log(`FINALIZE #${o.orderNumber}`, fin.status, {
      workflow: fin.json?.workflow,
      status: fin.json?.status,
      paymentStatus: fin.json?.paymentStatus,
      finalizedAt: fin.json?.finalizedAt,
      error: fin.json?.error,
    });
    if (!fin.ok) process.exit(1);
  }

  const list2 = await api(cookie, "GET", "/orders");
  const all2 = Array.isArray(list2.json) ? list2.json : [];
  const after = all2
    .filter((o) => o.orderNumber === 3 || o.orderNumber === 7)
    .map((o) => ({
      n: o.orderNumber,
      status: o.status,
      workflow: o.workflow,
      paymentStatus: o.paymentStatus,
      finalizedAt: o.finalizedAt || null,
      onBoard: o.workflow !== "finalized" && o.status !== "cancelled",
    }));
  const deliveredLeft = all2.filter((o) => o.workflow === "done");
  console.log("AFTER", JSON.stringify({ after, deliveredLeft: deliveredLeft.map((o) => o.orderNumber) }, null, 2));

  const ok = after.length === 2
    && after.every((o) => o.workflow === "finalized" && o.status === "done" && !o.onBoard);
  if (!ok) {
    console.error("VERIFY_FAIL");
    process.exit(1);
  }
  console.log("VERIFY_OK #3 and #7 are FINALIZADO and off ENTREGUE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
