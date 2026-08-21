/**
 * Production E2E: create order → accept (Em preparo) → WhatsApp compose URL + tracking.
 * Run after deploy: node scripts/e2e-whatsapp-preparing-update.mjs
 */
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
/** Owner WhatsApp used on the test order (project WHATSAPP_NUMBER). */
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

function normalizePhoneForWhatsapp(phone) {
  let digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length === 10 || national.length === 11) return `55${national}`;
    if (national.length > 11) return `55${national.slice(-11)}`;
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length > 11) return `55${digits.slice(-11)}`;
  return digits;
}

function buildPreparingUpdateWhatsappMessage(customerName, trackingId, origin) {
  const cliente = (customerName || "cliente").trim().split(/\s+/)[0] || "cliente";
  return (
    `Olá ${cliente} 👋\n` +
    `Seu pedido já entrou em preparo.\n` +
    `Acompanhe em tempo real pelo link abaixo:\n` +
    `${String(origin).replace(/\/$/, "")}/pedido/${trackingId}`
  );
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
  const health = await fetch(`${BASE}/api/healthz`);
  assert(health.ok, "healthz failed");

  const login = await json("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD });
  assert(login.status === 200, `login failed: ${login.status} ${JSON.stringify(login.data)}`);
  const cookie = login.cookie;
  assert(cookie, "missing admin cookie");

  const productsRes = await json("GET", "/api/products", null, cookie);
  assert(productsRes.status === 200, "products failed");
  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const product = products.find((p) => p.available !== false && Number(p.price) > 0) || products[0];
  assert(product, "no product for test order");

  const customerName = "Elenilson Teste WhatsApp";
  const create = await json(
    "POST",
    "/api/orders",
    {
      customerName,
      phone: TEST_PHONE,
      orderType: "pickup",
      paymentMethod: "cash",
      source: "attendant",
      notes: "Pedido teste WhatsApp Em preparo",
      items: [
        {
          productId: product.id,
          productName: product.name,
          productPrice: parseFloat(product.price) || 1,
          quantity: 1,
          addons: [],
          notes: "",
        },
      ],
    },
    cookie,
  );
  assert(create.status === 200 || create.status === 201, `create order failed: ${create.status} ${JSON.stringify(create.data)}`);
  const orderId = create.data.orderId;
  const trackingId = create.data.trackingId;
  const orderNumber = create.data.orderNumber;
  assert(orderId && trackingId, "missing orderId/trackingId");

  const accept = await json("PATCH", `/api/orders/${orderId}/status`, { workflow: "preparing" }, cookie);
  assert(accept.status === 200, `accept failed: ${accept.status} ${JSON.stringify(accept.data)}`);
  assert(
    accept.data.workflow === "preparing" || accept.data.status === "preparing",
    `expected preparing, got workflow=${accept.data.workflow} status=${accept.data.status}`,
  );
  assert(String(accept.data.phone || "").replace(/\D/g, "").includes("71996981707") || normalizePhoneForWhatsapp(accept.data.phone) === "5571996981707",
    `phone on order mismatch: ${accept.data.phone}`);

  const msg = buildPreparingUpdateWhatsappMessage(customerName, trackingId, BASE);
  const waNumber = normalizePhoneForWhatsapp(accept.data.phone || TEST_PHONE);
  assert.equal?.(waNumber, "5571996981707");
  assert(waNumber === "5571996981707", `wa number ${waNumber}`);
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  const decoded = decodeURIComponent(waUrl.split("?text=")[1]);
  assert(decoded === msg, "message mismatch");
  assert(decoded.includes(`Olá Elenilson 👋`), "greeting");
  assert(decoded.includes("Seu pedido já entrou em preparo."), "preparing line");
  assert(decoded.includes(`${BASE}/pedido/${trackingId}`), "tracking link in message");

  const track = await json("GET", `/api/orders/track/${trackingId}`);
  assert(track.status === 200, `track failed: ${track.status}`);
  assert(track.data.trackingId === trackingId, "track id mismatch");
  assert(
    track.data.workflow === "preparing" || track.data.status === "preparing",
    "track not preparing",
  );

  const page = await fetch(`${BASE}/pedido/${trackingId}`);
  assert(page.ok, `tracking page HTTP ${page.status}`);
  const html = await page.text();
  assert(html.includes("pedido") || html.includes("root") || html.includes("script"), "tracking HTML empty");

  console.log(JSON.stringify({
    ok: true,
    orderNumber,
    orderId,
    trackingId,
    phone: waNumber,
    waUrlPreview: waUrl.slice(0, 120) + "…",
    trackingUrl: `${BASE}/pedido/${trackingId}`,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
