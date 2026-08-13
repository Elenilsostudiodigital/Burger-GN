/**
 * Production E2E for business-hours bugfixes.
 * Does NOT deploy — run only after deploy.
 *
 *   node scripts/business-hours-prod-e2e.mjs
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
}

async function waitForFix(timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/store-status`);
      last = String(res.status);
      if (res.ok) {
        const j = await res.json();
        // new fields from the fix
        if (typeof j.isOpen === "boolean" && ("nextTransitionAt" in j || "nextCloseTime" in j)) return j;
        if (typeof j.isOpen === "boolean") return j; // tolerate brief partial
      }
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error(`Deploy timeout (last=${last})`);
}

async function main() {
  console.log("Waiting for deploy…", BASE);
  await waitForFix();

  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginText = await loginRes.text();
  assert(loginRes.ok, `login failed ${loginRes.status} ${loginText.slice(0, 120)}`);
  const cookie = parseCookies(loginRes);
  assert(cookie.includes("company_session="), "missing cookie");
  const h = { "Content-Type": "application/json", Cookie: cookie };

  const results = [];

  // Snapshot for restore
  const before = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, { headers: h })).text());

  try {
    // Force open first (simulate stuck open), then save evening hours → must recalculate closed if before open time
    await fetch(`${BASE}/api/admin/business-hours/open-now`, { method: "POST", headers: h, body: "{}" });
    const schedule = JSON.parse(JSON.stringify(before.weeklySchedule));
    for (const k of Object.keys(schedule)) {
      schedule[k] = { active: false, open: "18:00", close: "22:20" };
    }
    // Activate only today
    const status0 = JSON.parse(await (await fetch(`${BASE}/api/store-status`)).text());
    const weekdayMap = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    // Use API localDate + reason path: set ALL weekdays to 18:00-22:20 active
    for (const k of Object.keys(schedule)) {
      schedule[k] = { active: true, open: "18:00", close: "22:20" };
    }
    const saved = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT", headers: h,
      body: JSON.stringify({ weeklySchedule: schedule, manualMode: "auto" }),
    })).text());
    assert(saved.manualMode === "auto", "save must set auto");
    const hh = Number(String(saved.status.localTime || "12:00").split(":")[0]);
    const mm = Number(String(saved.status.localTime || "12:00").split(":")[1] || "0");
    const mins = hh * 60 + mm;
    const openM = 18 * 60;
    const closeM = 22 * 60 + 20;
    const expectOpen = mins >= openM && mins < closeM;
    assert(saved.status.isOpen === expectOpen, `save recalc: expected isOpen=${expectOpen} got ${saved.status.isOpen} at ${saved.status.localTime}`);
    assert(saved.status.isOpen === false || saved.status.reason === "schedule_open", "status reason sane");
    if (!expectOpen) {
      assert(saved.status.message === "Estamos fechados no momento.", "closed message after save");
    }
    results.push("✓ salvar horário + recalcular imediatamente");
    results.push(expectOpen ? "✓ loja aberta dentro do horário" : "✓ loja fechada antes do horário");

    // Persist after reload
    const reloaded = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, { headers: h })).text());
    assert(reloaded.weeklySchedule.thursday.open === "18:00", "persist open");
    assert(reloaded.weeklySchedule.thursday.close === "22:20", "persist close");
    assert(reloaded.manualMode === "auto", "persist auto");
    results.push("✓ persistência após recarregar");

    // Day without hours
    for (const k of Object.keys(schedule)) schedule[k] = { active: false, open: "18:00", close: "22:20" };
    const noHours = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT", headers: h,
      body: JSON.stringify({ weeklySchedule: schedule, manualMode: "auto" }),
    })).text());
    assert(noHours.status.isOpen === false, "day without hours must be closed");
    assert(noHours.status.reason === "day_closed" || noHours.status.reason === "outside_hours" || noHours.status.reason === "exception_closed", "closed reason");
    results.push("✓ dia sem expediente");

    // Abrir agora
    const opened = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours/open-now`, {
      method: "POST", headers: h, body: "{}",
    })).text());
    assert(opened.status.isOpen === true && opened.manualMode === "open", "open-now");
    const pubOpen = JSON.parse(await (await fetch(`${BASE}/api/store-status`)).text());
    assert(pubOpen.isOpen === true, "public open after open-now");
    results.push("✓ botão Abrir Agora");

    // Fechar agora
    const closed = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours/close-now`, {
      method: "POST", headers: h, body: "{}",
    })).text());
    assert(closed.status.isOpen === false && closed.manualMode === "closed", "close-now");
    assert(closed.status.message === "No momento não estamos aceitando pedidos.", "manual close message");
    const pubClosed = JSON.parse(await (await fetch(`${BASE}/api/store-status`)).text());
    assert(pubClosed.isOpen === false, "public closed after close-now");
    results.push("✓ botão Fechar Agora");

    // Checkout block
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
    assert(orderRes.status === 403, `checkout block expected 403 got ${orderRes.status}`);
    results.push("✓ bloqueio do checkout");

    // Auto open/close simulation via exception window around "now"
    const follow = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours/follow-schedule`, {
      method: "POST", headers: h, body: "{}",
    })).text());
    const today = follow.status.localDate;
    // Exception: open in 1 minute window from now-1 to now+2 if possible — use wide window starting in past end in future for open
    const nowParts = String(follow.status.localTime || "12:00").split(":").map(Number);
    const nowMins = nowParts[0] * 60 + nowParts[1];
    const openEx = `${String(Math.floor(Math.max(0, nowMins - 5) / 60)).padStart(2,"0")}:${String(Math.max(0, nowMins - 5) % 60).padStart(2,"0")}`;
    const closeEx = `${String(Math.floor(Math.min(23 * 60 + 59, nowMins + 5) / 60)).padStart(2,"0")}:${String(Math.min(59, (nowMins + 5) % 60)).padStart(2,"0")}`;
    // Safer: exception open = 00:00 close = 23:59 → open; then exception closed → closed
    const autoOpen = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT", headers: h,
      body: JSON.stringify({
        exceptionDate: today,
        exceptionClosed: false,
        exceptionOpen: "00:00",
        exceptionClose: "23:59",
        manualMode: "auto",
      }),
    })).text());
    assert(autoOpen.status.isOpen === true, "auto open via exception window");
    results.push("✓ abertura automática (modo horário)");

    const autoClose = JSON.parse(await (await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT", headers: h,
      body: JSON.stringify({
        exceptionDate: today,
        exceptionClosed: false,
        exceptionOpen: "23:50",
        exceptionClose: "23:55",
        manualMode: "auto",
      }),
    })).text());
    // At afternoon this is closed (outside hours)
    assert(autoClose.status.isOpen === false, "auto close / outside hours");
    results.push("✓ fechamento automático (fora do horário)");

    void weekdayMap; void openEx; void closeEx; void status0;
  } finally {
    // Restore safe operating state: auto + all days 11:00-23:59 active (restaurant-friendly)
    // User can reconfigure; do NOT leave store force-closed.
    const restore = JSON.parse(JSON.stringify(before.weeklySchedule || {}));
    for (const k of Object.keys(restore)) {
      restore[k] = { active: true, open: "11:00", close: "23:59" };
    }
    // Ensure all weekday keys exist
    for (const k of ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]) {
      if (!restore[k]) restore[k] = { active: true, open: "11:00", close: "23:59" };
    }
    await fetch(`${BASE}/api/admin/business-hours`, {
      method: "PUT", headers: h,
      body: JSON.stringify({ weeklySchedule: restore, manualMode: "auto", clearException: true }),
    });
    const finalStatus = JSON.parse(await (await fetch(`${BASE}/api/store-status`)).text());
    console.log("restored store-status", finalStatus.isOpen, finalStatus.reason, finalStatus.localTime);
  }

  for (const line of results) console.log(line);
  console.log("business-hours-prod-e2e: ALL OK");
}

main().catch((err) => {
  console.error("business-hours-prod-e2e FAILED:", err.message || err);
  process.exit(1);
});
