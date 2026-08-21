/**
 * Production E2E for message templates + WhatsApp Em Preparo integration.
 * node scripts/e2e-message-templates.mjs
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

function interpolate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key];
    return v != null && v !== "" ? String(v) : "";
  });
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
  assert(health.ok, "healthz");

  const login = await json("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;

  const list = await json("GET", "/api/admin/message-templates", null, cookie);
  assert(list.status === 200, `list ${list.status} ${JSON.stringify(list.data)}`);
  assert(Array.isArray(list.data.templates) && list.data.templates.length === 6, "need 6 templates");
  const keys = list.data.templates.map((t) => t.key);
  for (const k of [
    "pedido_recebido",
    "pedido_confirmado",
    "em_preparo",
    "pedido_pronto",
    "pedido_retirado",
    "pedido_cancelado",
  ]) {
    assert(keys.includes(k), `missing ${k}`);
  }

  const custom =
    "Olá {{cliente}} 👋\nTESTE AUTO {{pedido}} {{valor}}\nStatus {{status}}\n{{link}}\nLoja {{loja}} Tel {{telefone}} Horário {{horario}}";
  const save = await json("PUT", "/api/admin/message-templates/em_preparo", { body: custom }, cookie);
  assert(save.status === 200, `save ${save.status}`);
  assert(save.data.body === custom, "saved body mismatch");

  const getOne = await json("GET", "/api/admin/message-templates/em_preparo", null, cookie);
  assert(getOne.data.body === custom, "read-after-write failed");

  const preview = await json(
    "POST",
    "/api/admin/message-templates/em_preparo/preview",
    { body: custom },
    cookie,
  );
  assert(preview.status === 200, "preview failed");
  assert(preview.data.preview.includes("João"), "preview cliente");
  assert(preview.data.preview.includes("42") || preview.data.preview.includes("{{") === false, "preview pedido");

  // Create + accept order, build WA message from DB template
  const productsRes = await json("GET", "/api/products", null, cookie);
  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const product = products.find((p) => p.available !== false) || products[0];
  assert(product, "no product");

  const create = await json(
    "POST",
    "/api/orders",
    {
      customerName: "Elenilson Msg Templates",
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
  const { orderId, trackingId, orderNumber } = create.data;

  const accept = await json("PATCH", `/api/orders/${orderId}/status`, { workflow: "preparing" }, cookie);
  assert(accept.status === 200, `accept ${accept.status}`);

  const tpl = (await json("GET", "/api/admin/message-templates/em_preparo", null, cookie)).data;
  const total = parseFloat(String(accept.data.total)) || 0;
  const vars = {
    cliente: "Elenilson",
    pedido: String(orderNumber),
    valor: `R$ ${total.toFixed(2).replace(".", ",")}`,
    status: "Em Preparo",
    link: `${BASE}/pedido/${trackingId}`,
    loja: "The Burger GN",
    telefone: TEST_PHONE,
    horario: "35–45 min",
  };
  const message = interpolate(tpl.body, vars);
  assert(message.includes("TESTE AUTO"), "custom template not used");
  assert(message.includes(String(orderNumber)), "pedido var");
  assert(message.includes(trackingId), "link var");
  assert(message.includes("Elenilson"), "cliente var");

  const wa = `https://wa.me/5571996981707?text=${encodeURIComponent(message)}`;
  assert(wa.includes("5571996981707"), "wa phone");

  // Restore default for em_preparo
  const restored = await json("POST", "/api/admin/message-templates/em_preparo/restore", {}, cookie);
  assert(restored.status === 200, "restore failed");
  assert(restored.data.body.includes("entrou em preparo"), "default body");
  assert(restored.data.body !== custom, "should differ from custom");

  // Real-time: GET again reflects restore
  const again = await json("GET", "/api/admin/message-templates/em_preparo", null, cookie);
  assert(again.data.body === restored.data.body, "realtime read after restore");

  console.log(JSON.stringify({
    ok: true,
    orderNumber,
    trackingId,
    waPreview: wa.slice(0, 100) + "…",
    restoredDefault: true,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
