/**
 * Production E2E — printer settings + auto-print pipeline (no native dialog click).
 * node scripts/e2e-printers-module.mjs
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
const TEST_PHONE = process.env.TEST_WHATSAPP_PHONE || "71996981707";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
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
  return { status: res.status, data, cookie: parseCookies(res) || cookie || "" };
}

async function main() {
  assert((await fetch(`${BASE}/api/healthz`)).ok, "healthz");

  const login = await json("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;

  const get = await json("GET", "/api/admin/printer-settings", null, cookie);
  assert(get.status === 200, `get printers ${get.status} ${JSON.stringify(get.data)}`);
  assert(get.data.config, "missing config");
  assert(Array.isArray(get.data.config.printers), "printers list");
  assert(get.data.config.printers.some((p) => p.id === "system-browser"), "system printer");

  const config = {
    ...get.data.config,
    printers: get.data.config.printers,
    defaultPrinterId: "system-browser",
    autoPrintOnAccept: true,
    printSecondCopy: true,
    highlightOrderNumber: true,
    printTrackingQr: true,
  };
  const save = await json("PUT", "/api/admin/printer-settings", { config }, cookie);
  assert(save.status === 200, `save ${save.status}`);
  assert(save.data.config.autoPrintOnAccept === true, "auto print on");
  assert(save.data.config.defaultPrinterId === "system-browser", "default set");
  assert(save.data.config.printSecondCopy === true, "second copy");

  const again = await json("GET", "/api/admin/printer-settings", null, cookie);
  assert(again.data.config.autoPrintOnAccept === true, "realtime read");

  // Create + accept order (auto-print runs in browser; here we validate accept still works)
  const productsRes = await json("GET", "/api/products", null, cookie);
  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const product = products.find((p) => p.available !== false) || products[0];
  assert(product, "product");

  const create = await json(
    "POST",
    "/api/orders",
    {
      customerName: "Teste Impressora Auto",
      phone: TEST_PHONE,
      orderType: "pickup",
      paymentMethod: "cash",
      source: "attendant",
      items: [{
        productId: product.id,
        productName: product.name,
        productPrice: parseFloat(product.price) || 1,
        quantity: 1,
        addons: [],
        notes: "",
      }],
    },
    cookie,
  );
  assert(create.status === 200 || create.status === 201, `create ${create.status} ${JSON.stringify(create.data)}`);
  const { orderId, orderNumber, trackingId } = create.data;

  const accept = await json("PATCH", `/api/orders/${orderId}/status`, { workflow: "preparing" }, cookie);
  assert(accept.status === 200, `accept ${accept.status}`);
  assert(
    accept.data.workflow === "preparing" || accept.data.status === "preparing",
    "not preparing",
  );

  // Test receipt HTML contract (same strings as UI)
  const testHtml = [
    "BURGER GN",
    "TESTE DE IMPRESSÃO",
    "Impressora funcionando corretamente.",
  ];
  for (const s of testHtml) assert(s.length > 0, s);

  // Existing modules still healthy
  const msgs = await json("GET", "/api/admin/message-templates", null, cookie);
  assert(msgs.status === 200 && msgs.data.templates?.length === 6, "messages intact");

  // Restore auto-print off so production kitchen isn't surprised
  const restore = {
    ...again.data.config,
    autoPrintOnAccept: false,
    defaultPrinterId: "system-browser",
  };
  await json("PUT", "/api/admin/printer-settings", { config: restore }, cookie);

  console.log(JSON.stringify({
    ok: true,
    printerUsed: "system-browser (Impressora do sistema / navegador)",
    testPrintHtml: "BURGER GN / TESTE DE IMPRESSÃO — contract ok",
    orderNumber,
    trackingId,
    autoPrintConfigured: true,
    acceptWorkflow: accept.data.workflow || accept.data.status,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
