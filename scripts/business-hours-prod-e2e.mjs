/**
 * Production E2E for business hours.
 * Usage:
 *   node scripts/business-hours-prod-e2e.mjs
 * Optional:
 *   BASE_URL=https://burger-gn.vercel.app ADMIN_EMAIL=... ADMIN_PASSWORD=... node ...
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  // Keep only name=value of first cookie (company_session=...)
  return single.split(";")[0].trim();
}

async function waitForDeploy(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/store-status`);
      last = `${res.status}`;
      if (res.ok) {
        const j = await res.json();
        if (typeof j.isOpen === "boolean") return j;
      }
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error(`Deploy timeout waiting for /api/store-status (last=${last})`);
}

async function main() {
  console.log("Waiting for deploy…", BASE);
  await waitForDeploy();
  console.log("store-status live");

  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginText = await loginRes.text();
  assert(loginRes.ok, `admin login failed: ${loginRes.status} ${loginText.slice(0, 120)}`);
  const cookie = parseCookies(loginRes);
  assert(cookie.includes("company_session="), `missing admin session cookie: ${cookie}`);
  const authHeaders = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  const adminRes = await fetch(`${BASE}/api/admin/business-hours`, { headers: authHeaders });
  const adminText = await adminRes.text();
  assert(adminRes.ok, `admin business-hours failed: ${adminRes.status} ${adminText.slice(0, 200)}`);
  const snapshot = JSON.parse(adminText);
  assert(snapshot.weeklySchedule?.monday, "admin business hours missing schedule");

  // 1) Manual close
  {
    const closed = await (await fetch(`${BASE}/api/admin/business-hours/close-now`, {
      method: "POST",
      headers: authHeaders,
      body: "{}",
    })).json();
    assert(closed.status?.isOpen === false, "close-now should close");
    assert(closed.status?.reason === "manual_closed", "manual_closed reason");
    assert(
      closed.status?.message === "No momento não estamos aceitando pedidos.",
      "manual close message",
    );
    const pub = await (await fetch(`${BASE}/api/store-status`)).json();
    assert(pub.isOpen === false, "public status closed after close-now");
    console.log("✓ fechamento manual");
  }

  // 2) Checkout/order block
  {
    const orderRes = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Teste Horario",
        phone: "71999990000",
        orderType: "pickup",
        paymentMethod: "cash",
        items: [{ productName: "Teste", productPrice: 1, quantity: 1 }],
      }),
    });
    assert(orderRes.status === 403, `expected 403 when closed, got ${orderRes.status}`);
    const err = await orderRes.json();
    assert(err.storeClosed === true || /não estamos aceitando|fechados/i.test(err.error || ""), "order block payload");
    console.log("✓ bloqueio do checkout (POST /orders)");
  }

  // 3) Manual open
  {
    const opened = await (await fetch(`${BASE}/api/admin/business-hours/open-now`, {
      method: "POST",
      headers: authHeaders,
      body: "{}",
    })).json();
    assert(opened.status?.isOpen === true, "open-now should open");
    const pub = await (await fetch(`${BASE}/api/store-status`)).json();
    assert(pub.isOpen === true, "public status open after open-now");
    console.log("✓ loja aberta (manual)");
  }

  // 4) Follow schedule + temporary outside-hours via exception closed today
  {
    await fetch(`${BASE}/api/admin/business-hours/follow-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: "{}",
    });
    const today = (await (await fetch(`${BASE}/api/store-status`)).json()).localDate;
    const closedToday = await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        exceptionDate: today,
        exceptionClosed: true,
      }),
    })).json();
    assert(closedToday.status?.isOpen === false, "exception closed should close");
    assert(
      closedToday.status?.message === "Estamos fechados no momento.",
      "auto/exception closed message",
    );
    console.log("✓ exceção do dia (hoje fechado)");

    // special hours for today
    const special = await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        exceptionDate: today,
        exceptionClosed: false,
        exceptionOpen: "00:00",
        exceptionClose: "23:59",
      }),
    })).json();
    assert(special.status?.isOpen === true, "exception open window should open");
    console.log("✓ exceção do dia (horário especial aberto)");

    await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ clearException: true }),
    });
  }

  // 5) Weekly schedule persistence: set tonight window then restore always-open-ish
  {
    const schedule = JSON.parse(JSON.stringify(snapshot.weeklySchedule));
    for (const k of Object.keys(schedule)) {
      schedule[k] = { active: true, open: "18:00", close: "23:00" };
    }
    schedule.sunday = { active: false, open: "18:00", close: "23:00" };
    const saved = await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ weeklySchedule: schedule, manualMode: "auto" }),
    })).json();
    assert(saved.weeklySchedule.monday.open === "18:00", "schedule persist open");
    assert(saved.weeklySchedule.sunday.active === false, "sunday closed persist");

    const nowH = Number((saved.status.localTime || "12:00").split(":")[0]);
    if (nowH >= 18 && nowH < 23) {
      assert(saved.status.isOpen === true, "within evening hours should be open");
      console.log("✓ abertura automática (dentro do horário)");
    } else {
      assert(saved.status.isOpen === false, "outside evening hours should be closed");
      assert(saved.status.nextOpenLabel, "should expose Voltaremos às");
      console.log("✓ fechamento automático (fora do horário)");
    }

    // Restore safe always-open defaults so production stays usable after the test.
    const restore = JSON.parse(JSON.stringify(snapshot.weeklySchedule));
    for (const k of Object.keys(restore)) {
      restore[k] = { active: true, open: "00:00", close: "23:59" };
    }
    await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        weeklySchedule: restore,
        manualMode: "auto",
        clearException: true,
      }),
    });
    const pub = await (await fetch(`${BASE}/api/store-status`)).json();
    assert(pub.isOpen === true, "store restored open");
    console.log("✓ loja restaurada aberta");
  }

  console.log("business-hours-prod-e2e: ALL OK");
}

main().catch((err) => {
  console.error("business-hours-prod-e2e FAILED:", err.message || err);
  process.exit(1);
});
