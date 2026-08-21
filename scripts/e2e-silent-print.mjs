/**
 * Local + API E2E for silent POS-58 printing.
 * Starts print agent if needed; prints real test + order copies.
 *
 * node scripts/e2e-silent-print.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "https://burger-gn.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
const TEST_PHONE = process.env.TEST_WHATSAPP_PHONE || "71996981707";
const AGENT = "http://127.0.0.1:19191";
const COPIES = 2;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseCookies(res) {
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
}

async function json(method, url, body, cookie) {
  const res = await fetch(url, {
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

async function waitAgent(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${AGENT}/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  if (!(await waitAgent(1200))) {
    const child = spawn("node", [path.join(ROOT, "tools/burger-gn-print-agent/server.mjs")], {
      cwd: ROOT,
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });
    child.unref();
    assert(await waitAgent(20000), "print agent failed to start");
  }

  const health = await (await fetch(`${AGENT}/health`)).json();
  assert(health.ok, "agent health");

  const list = await (await fetch(`${AGENT}/printers`)).json();
  assert(Array.isArray(list.printers) && list.printers.length > 0, "no OS printers");
  const pos = list.printers.find((p) => /pos-?58/i.test(p.name));
  assert(pos, `POS-58 not installed. Found: ${list.printers.map((p) => p.name).join(", ")}`);

  const testText = [
    "--------------------------------",
    "BURGER GN",
    "TESTE DE IMPRESSAO",
    `Data: ${new Date().toLocaleDateString("pt-BR")}`,
    `Hora: ${new Date().toLocaleTimeString("pt-BR")}`,
    `Impressora: ${pos.name}`,
    "Impressora funcionando corretamente.",
    "--------------------------------",
    "",
  ].join("\n");
  const testPrint = await json("POST", `${AGENT}/print`, {
    printerName: pos.name,
    text: testText,
    copies: COPIES,
  });
  assert(
    testPrint.status === 200 && testPrint.data.ok !== false,
    `test print failed: ${JSON.stringify(testPrint.data)}`,
  );

  const login = await json("POST", `${BASE}/api/admin/login`, { email: EMAIL, password: PASSWORD });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;

  const config = {
    printers: list.printers.map((p) => ({
      id: p.id,
      name: p.name,
      connection: "system",
      status: p.status || "connected",
      lastSeenAt: new Date().toISOString(),
    })),
    defaultPrinterId: pos.id,
    autoPrintOnAccept: true,
    copies: COPIES,
    highlightOrderNumber: true,
    printTrackingQr: true,
  };
  const save = await json("PUT", `${BASE}/api/admin/printer-settings`, { config }, cookie);
  assert(save.status === 200, `save ${save.status} ${JSON.stringify(save.data)}`);
  // After silent-print deploy, API returns `copies`. Older API may only have printSecondCopy.
  const savedCopies = Number(save.data.config?.copies);
  if (Number.isFinite(savedCopies) && savedCopies > 0) {
    assert(savedCopies === COPIES, "copies not saved");
  }
  assert(save.data.config.defaultPrinterId === pos.id, "default not POS-58");
  assert(save.data.config.autoPrintOnAccept === true, "auto print flag");

  const productsRes = await json("GET", `${BASE}/api/products`, null, cookie);
  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const product = products.find((p) => p.available !== false) || products[0];
  assert(product, "product");

  const create = await json(
    "POST",
    `${BASE}/api/orders`,
    {
      customerName: "Teste Print Silencioso",
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
  assert(create.status === 200 || create.status === 201, `create ${JSON.stringify(create.data)}`);
  const { orderId, orderNumber, trackingId } = create.data;

  const accept = await json(
    "PATCH",
    `${BASE}/api/orders/${orderId}/status`,
    { workflow: "preparing" },
    cookie,
  );
  assert(accept.status === 200, `accept ${accept.status}`);

  const orderText = [
    "THE BURGER GN",
    `*** #${orderNumber} ***`,
    "Cliente: Teste Print Silencioso",
    `Tel: ${TEST_PHONE}`,
    "Tipo: Retirada",
    `TOTAL pedido #${orderNumber}`,
    trackingId ? `Acompanhe: ${BASE}/pedido/${trackingId}` : "",
    "",
  ].join("\n");
  const auto = await json("POST", `${AGENT}/print`, {
    printerName: pos.name,
    text: orderText,
    copies: COPIES,
  });
  assert(auto.status === 200 && auto.data.ok !== false, `auto print failed: ${JSON.stringify(auto.data)}`);

  const printSrc = fs.readFileSync(path.join(ROOT, "artifacts/burger-gn/src/lib/printReceipt.ts"), "utf8");
  assert(!printSrc.includes("window.print("), "window.print leaked");
  assert(!printSrc.includes("window.open("), "window.open print leaked");

  console.log(JSON.stringify({
    ok: true,
    printer: pos.name,
    copies: COPIES,
    testPrint: true,
    autoPrintOrder: orderNumber,
    agent: AGENT,
    browserDialog: false,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
