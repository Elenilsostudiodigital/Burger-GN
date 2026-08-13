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
      // Probe that v2 fields round-trip (API is schema-free JSON).
      const probe = await json(
        "PUT",
        "/api/admin/notification-settings",
        {
          config: {
            ...(r.data.config || {}),
            version: 2,
            masterVolume: 0.5,
            smartVoicePrepared: true,
          },
        },
        cookie,
      );
      if (probe.status === 200 && probe.data?.config?.version === 2) {
        return { cookie, config: probe.data.config };
      }
    }
    console.log("waiting notification-settings v2...", r.status);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("notification settings deploy not ready");
}

async function main() {
  console.log("Waiting deploy...");
  const { cookie } = await waitReady();
  console.log("✓ endpoint notification-settings");

  const tinyWav =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  const sample = {
    version: 2,
    masterEnabled: true,
    masterVolume: 0.75,
    pushEnabled: true,
    pushDevices: { notebook: true, android: true, tablet: true, pwa: true },
    schedule: {
      enabled: true,
      start: "08:00",
      end: "23:30",
      outsideMode: "silent_push",
    },
    smartVoicePrepared: true,
    events: {
      newOrder: {
        enabled: true,
        sound: "new_order",
        volume: 0.8,
        customMessage: "Novo pedido recebido",
        repeatMode: "until_accepted",
        repeatIntervalSec: 10,
        repeatEnabled: true,
      },
      accepted: { enabled: true, sound: "restaurant_bell", volume: 0.7, customMessage: "Pedido aceito", repeatMode: "none" },
      preparing: { enabled: false, sound: "classic", volume: 0.5, customMessage: "Em preparo", repeatMode: "none" },
      ready: { enabled: true, sound: "alarm", volume: 0.75, customMessage: "Pedido pronto", repeatMode: "none" },
      outForDelivery: { enabled: true, sound: "classic", volume: 0.6, customMessage: "Saiu", repeatMode: "none" },
      delivered: { enabled: false, sound: "soft", volume: 0.5, customMessage: "Entregue", repeatMode: "none" },
      overdue: {
        enabled: true,
        sound: "alarm",
        volume: 0.9,
        customMessage: "Pedido em atraso",
        repeatMode: "times_3",
        repeatIntervalSec: 15,
      },
    },
    delay: {
      enabled: true,
      sound: "classic",
      volume: 0.65,
      customMessage: "Perto do atraso",
      warnAtMinutes: [15, 10, 5],
      overdueEnabled: true,
      overdueSound: "alarm",
      overdueVolume: 0.9,
      overdueMessage: "Pedido em atraso",
      repeatMode: "times_3",
      repeatIntervalSec: 15,
    },
    customSounds: [
      {
        id: "ctest1",
        name: "Teste WAV",
        mime: "audio/wav",
        dataUrl: tinyWav,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  const saved = await json("PUT", "/api/admin/notification-settings", { config: sample }, cookie);
  assert(saved.status === 200, JSON.stringify(saved.data));
  assert(saved.data.config?.masterVolume === 0.75, "master volume");
  assert(saved.data.config?.events?.newOrder?.repeatMode === "until_accepted", "repeat mode");
  assert(saved.data.config?.schedule?.start === "08:00", "schedule start");
  assert(saved.data.config?.pushDevices?.pwa === true, "push devices");
  assert(saved.data.config?.customSounds?.length >= 1, "custom upload");
  assert(saved.data.config?.events?.overdue?.sound === "alarm", "overdue stage");
  assert(saved.data.config?.smartVoicePrepared === true, "smart voice prepared");
  console.log("✓ biblioteca / upload / volume / repetição / horário / push / etapas");

  const got = await json("GET", "/api/admin/notification-settings", null, cookie);
  assert(got.status === 200, "get after save");
  assert(got.data.config?.events?.ready?.sound === "alarm", "persist ready sound");
  assert(got.data.config?.version === 2, "version 2");
  console.log("✓ persistência OK");

  // legacy payload still accepted by API (raw store)
  const legacy = await json(
    "PUT",
    "/api/admin/notification-settings",
    {
      config: {
        version: 1,
        masterEnabled: true,
        pushEnabled: true,
        events: {
          newOrder: {
            enabled: true,
            sound: "doorbell",
            volume: 0.8,
            customMessage: "Novo",
            repeatEnabled: true,
            repeatIntervalSec: 5,
          },
        },
      },
    },
    cookie,
  );
  assert(legacy.status === 200, "legacy save");
  console.log("✓ compatibilidade legado OK");

  const sw = await fetch(`${BASE}/sw.js`);
  assert(sw.status === 200, "sw.js");
  const swText = await sw.text();
  assert(swText.includes("notificationclick"), "notificationclick handler");
  console.log("✓ PWA SW notificationclick");

  const products = await json("GET", "/api/products");
  assert(products.status === 200 && Array.isArray(products.data), "catalog intact");
  console.log("✓ outras APIs intactas");

  // restore sample v2 defaults without huge audio
  await json(
    "PUT",
    "/api/admin/notification-settings",
    { config: { ...sample, customSounds: [] } },
    cookie,
  );
  console.log("✓ cleanup");

  console.log("\nALL NOTIFICATION MODULE TESTS PASSED");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
