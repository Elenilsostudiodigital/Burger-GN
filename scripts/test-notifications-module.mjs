const BASE = "https://burger-gn.vercel.app";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
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
    data = { raw: text };
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, data, setCookie };
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    const login = await json("POST", "/api/admin/login", {
      email: "admin@burgergn.com.br",
      password: "burger123",
    });
    if (login.status !== 200) {
      console.log("waiting login...", login.status);
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }
    const cookie = (login.setCookie || []).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    const r = await json("GET", "/api/admin/notification-settings", null, cookie);
    if (r.status === 200 && r.data && typeof r.data.config === "object") {
      return { cookie, config: r.data.config };
    }
    console.log("waiting notification-settings...", r.status);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("notification settings deploy not ready");
}

async function main() {
  console.log("Waiting deploy...");
  const { cookie } = await waitReady();
  console.log("✓ endpoint notification-settings");

  const sample = {
    version: 1,
    masterEnabled: true,
    pushEnabled: true,
    events: {
      newOrder: {
        enabled: true,
        sound: "doorbell",
        volume: 0.8,
        customMessage: "Novo pedido recebido",
        repeatEnabled: true,
        repeatIntervalSec: 10,
      },
      accepted: { enabled: true, sound: "bell", volume: 0.7, customMessage: "Pedido aceito" },
      preparing: { enabled: false, sound: "notification", volume: 0.5, customMessage: "Em preparo" },
      ready: { enabled: true, sound: "alarm", volume: 0.75, customMessage: "Pedido pronto" },
      outForDelivery: { enabled: true, sound: "notification", volume: 0.6, customMessage: "Saiu" },
      delivered: { enabled: false, sound: "bell", volume: 0.5, customMessage: "Entregue" },
    },
    delay: {
      enabled: true,
      sound: "notification",
      volume: 0.65,
      customMessage: "Perto do atraso",
      warnAtMinutes: [15, 10, 5],
      overdueEnabled: true,
      overdueSound: "alarm",
      overdueVolume: 0.9,
      overdueMessage: "Pedido em atraso",
    },
  };

  const saved = await json("PUT", "/api/admin/notification-settings", { config: sample }, cookie);
  assert(saved.status === 200, JSON.stringify(saved.data));
  assert(saved.data.config?.events?.newOrder?.repeatIntervalSec === 10, "repeat saved");
  assert(saved.data.config?.delay?.warnAtMinutes?.includes(5), "delay marks");
  console.log("✓ salvar config (sons / repetição / atraso)");

  const got = await json("GET", "/api/admin/notification-settings", null, cookie);
  assert(got.status === 200, "get after save");
  assert(got.data.config?.events?.ready?.sound === "alarm", "persist ready sound");
  console.log("✓ persistência OK");

  const sw = await fetch(`${BASE}/sw.js`);
  assert(sw.status === 200, "sw.js");
  const swText = await sw.text();
  assert(swText.includes("notificationclick"), "notificationclick handler");
  console.log("✓ PWA SW notificationclick");

  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  assert(manifest.status === 200, "manifest");
  console.log("✓ PWA manifest");

  // restore lighter defaults (keep master on)
  await json(
    "PUT",
    "/api/admin/notification-settings",
    {
      config: {
        ...sample,
        events: {
          ...sample.events,
          preparing: sample.events.preparing,
        },
      },
    },
    cookie,
  );
  console.log("✓ cleanup");

  console.log("\nALL NOTIFICATION MODULE TESTS PASSED");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
