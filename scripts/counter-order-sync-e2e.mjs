/**
 * Real HTTP E2E: admin Novo Pedido for a registered Clube client →
 * GET /api/orders/customer-active with the national WhatsApp used by the app.
 *
 *   node scripts/counter-order-sync-e2e.mjs
 *
 * Optional: BASE_URL=https://… to hit an already running server.
 * Without BASE_URL, boots embedded Postgres + API locally.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTERNAL_BASE = process.env.BASE_URL || "";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
const CLUBE_PHONE_NATIONAL = "71993958477";
const CLUBE_PHONE_E164 = "5571993958477";
const CLUBE_NAME = "Elenilson fernandes";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function shouldShowMyOrderTab(order) {
  if (!order?.trackingId) return false;
  const workflow = String(order.workflow || "").trim();
  const status = String(order.status || "").trim();
  if (status === "cancelled" || workflow === "cancelled" || workflow === "finalized") return false;
  if (workflow === "done" || status === "done") return false;
  if (workflow) {
    return ["awaiting_payment", "new", "accepted", "preparing", "ready", "out"].includes(workflow);
  }
  return ["new", "preparing", "delivery"].includes(status);
}

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
}

async function json(base, method, pathname, body, cookie) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { status: res.status, data, cookie: parseCookies(res) };
}

function spawnLogged(cmd, args, env, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (b) => {
    out += b.toString();
    process.stdout.write(b);
  });
  child.stderr.on("data", (b) => {
    out += b.toString();
    process.stderr.write(b);
  });
  child.outputText = () => out;
  return child;
}

function waitExit(child) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`process exited ${code}\n${child.outputText?.() || ""}`.slice(0, 4000)));
    });
    child.on("error", reject);
  });
}

async function waitHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      last = String(res.status);
      if (res.ok) return;
    } catch (err) {
      last = String(err?.message || err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url} (last=${last})`);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });
}

async function bootLocal() {
  const pgPort = await freePort();
  const apiPort = await freePort();
  const databaseUrl = `postgresql://postgres:burger123@127.0.0.1:${pgPort}/burger_gn_e2e`;
  const pgData = path.join(root, ".pgdata-e2e");
  fs.rmSync(pgData, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: pgData,
    user: "postgres",
    password: "burger123",
    port: pgPort,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (msg) => process.stdout.write(String(msg)),
    onError: (msg) => process.stderr.write(String(msg)),
  });

  try {
    await pg.initialise();
  } catch (err) {
    console.log("[pg] initialise:", err instanceof Error ? err.message : err);
  }
  await pg.start();
  try {
    await pg.createDatabase("burger_gn_e2e");
  } catch {
    /* exists */
  }
  console.log("[pg] ready", databaseUrl);

  try {
    await waitExit(
      spawnLogged(
        "pnpm",
        ["--filter", "@workspace/db", "run", "push-force"],
        { DATABASE_URL: databaseUrl, CI: "true" },
        root,
      ),
    );
  } catch (err) {
    console.warn("drizzle push-force note:", err instanceof Error ? err.message.slice(0, 500) : err);
  }

  await waitExit(
    spawnLogged("pnpm", ["--filter", "@workspace/api-server", "run", "build"], {}, root),
  );

  const api = spawnLogged(
    "node",
    ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
    {
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "e2e-session-secret",
      PORT: String(apiPort),
      ADMIN_PASSWORD: PASSWORD,
      NODE_ENV: "development",
    },
    root,
  );

  const base = `http://127.0.0.1:${apiPort}`;
  await waitHttp(`${base}/api/healthz`, 120000);
  return {
    base,
    async stop() {
      api.kill("SIGTERM");
      try { await pg.stop(); } catch { /* ignore */ }
      fs.rmSync(pgData, { recursive: true, force: true });
    },
  };
}

async function runScenario(base) {
  console.log("E2E base:", base);

  const health = await json(base, "GET", "/api/healthz");
  assert(health.status === 200, `healthz ${health.status} ${JSON.stringify(health.data)}`);

  const login = await json(base, "POST", "/api/admin/login", { email: EMAIL, password: PASSWORD });
  assert(login.status === 200 && login.data?.ok, `login failed ${login.status} ${JSON.stringify(login.data)}`);
  const cookie = login.cookie;
  assert(cookie.includes("company_session="), "missing admin cookie");

  await json(base, "POST", "/api/admin/business-hours/open-now", {}, cookie);

  const members = await json(base, "GET", "/api/admin/clube/members", null, cookie);
  assert(members.status === 200 && Array.isArray(members.data), `members ${members.status}`);
  let member = members.data.find((m) => String(m.phone || "").replace(/\D/g, "").endsWith("71993958477"));
  if (!member) {
    const created = await json(
      base,
      "POST",
      "/api/admin/clube/members",
      { name: CLUBE_NAME, phone: CLUBE_PHONE_E164, active: true },
      cookie,
    );
    assert(created.status === 201 || created.status === 200, `create member ${created.status} ${JSON.stringify(created.data)}`);
    member = created.data;
  }
  assert(member?.id, "clube member missing");
  console.log("✓ clube member", member.id, member.phone);

  const me = await json(base, "GET", `/api/clube/me?phone=${CLUBE_PHONE_NATIONAL}`);
  assert(me.status === 200 && me.data?.found === true, `clube/me ${me.status} ${JSON.stringify(me.data)}`);
  console.log("✓ /clube/me found with national WhatsApp");

  let products = await json(base, "GET", "/api/products");
  if (products.status !== 200 || !Array.isArray(products.data) || products.data.length === 0) {
    const createdProd = await json(
      base,
      "POST",
      "/api/admin/products",
      { name: "KING BURGER E2E", price: "24.90", available: true },
      cookie,
    );
    assert(createdProd.status === 201, `create product ${createdProd.status} ${JSON.stringify(createdProd.data)}`);
    products = { status: 200, data: [createdProd.data] };
  }
  const product = products.data.find((p) => p.available !== false) || products.data[0];
  assert(product?.id, "no product for Novo Pedido");

  const orderRes = await json(
    base,
    "POST",
    "/api/orders",
    {
      customerName: CLUBE_NAME,
      phone: CLUBE_PHONE_NATIONAL,
      orderType: "pickup",
      paymentMethod: "cash",
      source: "attendant",
      linkToCustomerApp: true,
      items: [
        {
          productId: product.id,
          productName: product.name,
          productPrice: Number(product.price) || 24.9,
          quantity: 1,
        },
      ],
    },
    cookie,
  );
  assert(orderRes.status === 201, `create order ${orderRes.status} ${JSON.stringify(orderRes.data)}`);
  assert(orderRes.data.trackingId, "missing trackingId");
  assert(orderRes.data.syncToCustomerApp === true, `syncToCustomerApp should be true, got ${orderRes.data.syncToCustomerApp}`);
  console.log("✓ attendant order", orderRes.data.orderNumber, orderRes.data.trackingId, "sync=", orderRes.data.syncToCustomerApp);

  const activeNational = await json(base, "GET", `/api/orders/customer-active?phone=${CLUBE_PHONE_NATIONAL}`);
  assert(activeNational.status === 200, `customer-active national ${activeNational.status} ${JSON.stringify(activeNational.data)}`);
  assert(activeNational.data.found === true, "customer-active national did not find the order");
  assert(activeNational.data.order?.trackingId === orderRes.data.trackingId, "tracking mismatch (national)");
  assert(shouldShowMyOrderTab(activeNational.data.order), `tab hidden for ${JSON.stringify({
    workflow: activeNational.data.order?.workflow,
    status: activeNational.data.order?.status,
  })}`);
  console.log("✓ customer-active (71…) found order", activeNational.data.order.orderNumber, activeNational.data.order.workflow);

  const activeE164 = await json(base, "GET", `/api/orders/customer-active?phone=${CLUBE_PHONE_E164}`);
  assert(activeE164.data?.found === true, "customer-active e164 did not find the order");
  console.log("✓ customer-active (55…) found the same order");

  const formatted = await json(base, "GET", `/api/orders/customer-active?phone=${encodeURIComponent("(71) 99395-8477")}`);
  assert(formatted.data?.found === true, "customer-active formatted phone did not find the order");

  const wf = await json(
    base,
    "PATCH",
    `/api/orders/${orderRes.data.orderId}/status`,
    { workflow: "preparing" },
    cookie,
  );
  assert(wf.status === 200, `workflow patch ${wf.status} ${JSON.stringify(wf.data)}`);

  const after = await json(base, "GET", `/api/orders/customer-active?phone=${CLUBE_PHONE_NATIONAL}`);
  assert(after.data?.order?.workflow === "preparing" || after.data?.order?.workflow === "accepted",
    `expected preparing, got ${after.data?.order?.workflow}`);
  assert(shouldShowMyOrderTab(after.data.order), "tab should remain visible while preparing");
  console.log("✓ live workflow sync", after.data.order.workflow);

  const missing = await json(base, "GET", "/api/orders/customer-active?phone=71988887777");
  assert(missing.data?.found === false, "other WhatsApp must not see this order");
  console.log("✓ other phone does not see the order");

  console.log("\ncounter-order-sync-e2e: PASS");
}

async function main() {
  let stop = async () => {};
  let base = EXTERNAL_BASE.replace(/\/$/, "");
  try {
    if (!base) {
      const local = await bootLocal();
      base = local.base;
      stop = local.stop;
    }
    await runScenario(base);
  } finally {
    await stop();
  }
}

main().catch((err) => {
  console.error("\ncounter-order-sync-e2e: FAIL", err);
  process.exit(1);
});
