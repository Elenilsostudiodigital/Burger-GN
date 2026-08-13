/**
 * Checkout-stage delivery analysis: unknown address → request → admin fee → continue.
 * Run: node scripts/delivery-analysis-checkout-e2e.mjs
 */

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");

const API = process.env.API_URL || "http://127.0.0.1:8080";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:burger123@127.0.0.1:55432/burger_gn";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "burger123";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const analysisIds = [];
  const orderIds = [];
  const streetKeys = [];
  try {
    const loginRes = await fetch(`${API}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const login = await json(loginRes);
    assert(loginRes.ok, `login failed: ${loginRes.status} ${JSON.stringify(login.body)}`);
    const cookie = cookieHeader(loginRes.headers.getSetCookie?.() || loginRes.headers.get("set-cookie"));

    const streetName = `Rua Analise Checkout ${Date.now()}`;
    const checkUnknown = await json(await fetch(`${API}/api/delivery/streets/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streetName,
        addressNumber: "50",
        neighborhood: "Itinga",
        city: "Lauro de Freitas",
      }),
    }));
    assert(checkUnknown.status === 200, `street check failed ${checkUnknown.status} ${JSON.stringify(checkUnknown.body)}`);
    assert(checkUnknown.body.needsAnalysis === true, "unknown street should be eligible for analysis");
    assert(checkUnknown.body.pending !== true, "street check must not auto-create a pending street request");
    assert(!String(checkUnknown.body.message || "").includes("Aguarde um instante"), "must not tell the customer it is already waiting");

    const token = randomUUID();
    const sseAbort = new AbortController();
    const sseRes = await fetch(`${API}/api/orders/stream`, {
      headers: { Cookie: cookie, Accept: "text/event-stream" },
      signal: sseAbort.signal,
    });
    assert(sseRes.ok, `SSE failed ${sseRes.status}`);
    const sseChunks = [];
    const sseReader = sseRes.body.getReader();
    const sseText = (async () => {
      const dec = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await sseReader.read();
          if (done) break;
          sseChunks.push(dec.decode(value));
        }
      } catch { /* aborted */ }
    })();

    const created = await json(await fetch(`${API}/api/delivery/checkout-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        customerName: "Cliente Checkout",
        phone: "71988880000",
        address: streetName,
        addressNumber: "50",
        neighborhood: "Itinga",
        complement: "Casa",
        reference: "Perto da praça",
      }),
    }));
    assert(created.status === 201, `checkout analysis create expected 201, got ${created.status} ${JSON.stringify(created.body)}`);
    assert(created.body.deliveryAnalysis?.status === "pending", "should be pending");
    assert(created.body.deliveryAnalysis?.source === "checkout", "source checkout");
    analysisIds.push(created.body.deliveryAnalysis.id);

    await new Promise((r) => setTimeout(r, 400));
    const sseData = sseChunks.join("");
    assert(sseData.includes("event: delivery_analysis"), `SSE missing delivery_analysis: ${sseData.slice(0, 400)}`);
    sseAbort.abort();
    await sseText.catch(() => {});

    const dup = await json(await fetch(`${API}/api/delivery/checkout-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        customerName: "Cliente Checkout",
        phone: "71988880000",
        address: streetName,
        addressNumber: "50",
        neighborhood: "Itinga",
      }),
    }));
    assert(dup.status === 409, `duplicate pending expected 409, got ${dup.status}`);

    const poll = await json(await fetch(`${API}/api/delivery/checkout-analysis/${token}`));
    assert(poll.status === 200 && poll.body.deliveryAnalysis.status === "pending", "customer poll should see pending");

    const listed = await json(await fetch(`${API}/api/admin/delivery-analysis-requests?status=pending`, {
      headers: { Cookie: cookie },
    }));
    const found = listed.body.find((r) => r.id === created.body.deliveryAnalysis.id);
    assert(found, "admin list missing checkout request");
    assert(found.address === streetName, "admin missing address");
    assert(found.neighborhood === "Itinga", "admin missing neighborhood");

    const noFee = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${found.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    }));
    assert(noFee.status === 400, `checkout approve without fee expected 400, got ${noFee.status} ${JSON.stringify(noFee.body)}`);

    const approve = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${found.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ fee: 12 }),
    }));
    assert(approve.status === 200, `approve failed ${approve.status} ${JSON.stringify(approve.body)}`);
    assert(approve.body.deliveryAnalysis.status === "approved", "expected approved");
    assert(parseFloat(approve.body.deliveryAnalysis.deliveryFee) === 12, "fee not saved");
    streetKeys.push(streetName);

    const after = await json(await fetch(`${API}/api/delivery/checkout-analysis/${token}`));
    assert(after.body.deliveryAnalysis.status === "approved", "customer did not see approved");
    assert(parseFloat(after.body.deliveryAnalysis.deliveryFee) === 12, "customer missing fee");

    const rejectToken = randomUUID();
    const rejectCreate = await json(await fetch(`${API}/api/delivery/checkout-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: rejectToken,
        customerName: "Cliente Recusa",
        phone: "71988880001",
        address: `${streetName} Recusa`,
        addressNumber: "80",
        neighborhood: "Itinga",
      }),
    }));
    assert(rejectCreate.status === 201, "reject-path create failed");
    analysisIds.push(rejectCreate.body.deliveryAnalysis.id);

    const rejectNo = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${rejectCreate.body.deliveryAnalysis.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "" }),
    }));
    assert(rejectNo.status === 400, `reject without reason expected 400, got ${rejectNo.status}`);

    const rejectOk = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${rejectCreate.body.deliveryAnalysis.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Entrega não disponível para este endereço" }),
    }));
    assert(rejectOk.status === 200, `reject failed ${rejectOk.status}`);
    const rejectPoll = await json(await fetch(`${API}/api/delivery/checkout-analysis/${rejectToken}`));
    assert(rejectPoll.body.deliveryAnalysis.status === "rejected", "customer did not see rejected");
    assert(rejectPoll.body.deliveryAnalysis.rejectReason === "Entrega não disponível para este endereço", "missing reject reason");

    const { rows: products } = await pool.query(`SELECT id, name, price FROM products WHERE available = true ORDER BY id ASC LIMIT 1`);
    if (products[0]) {
      const orderRes = await json(await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Cliente Checkout",
          phone: "71988880000",
          address: streetName,
          addressNumber: "50",
          neighborhood: "Itinga",
          orderType: "delivery",
          paymentMethod: "cash",
          checkoutAnalysisToken: token,
          items: [{
            productId: products[0].id,
            productName: products[0].name,
            productPrice: parseFloat(products[0].price),
            quantity: 1,
            addons: [],
          }],
        }),
      }));
      assert(orderRes.status === 200 || orderRes.status === 201, `createOrder with approved fee failed ${orderRes.status} ${JSON.stringify(orderRes.body)}`);
      assert(Number(orderRes.body.deliveryFee) === 12, `order should use admin fee 12, got ${orderRes.body.deliveryFee}`);
      if (orderRes.body.orderId) orderIds.push(orderRes.body.orderId);
    }

    console.log("delivery-analysis-checkout-e2e: OK");
    console.log(JSON.stringify({
      unknownStreetNeedsButton: true,
      noAutoPendingStreetRequest: true,
      sseReceived: true,
      duplicateBlocked: true,
      approveRequiresFee: true,
      customerReceivedFee: 12,
      rejectRequiresReason: true,
      orderUsedApprovedFee: !!products[0],
    }, null, 2));
  } finally {
    if (analysisIds.length) {
      await pool.query(`DELETE FROM delivery_analysis_requests WHERE id = ANY($1::int[])`, [analysisIds]);
    }
    if (orderIds.length) {
      await pool.query(`DELETE FROM order_items WHERE order_id = ANY($1::int[])`, [orderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [orderIds]);
    }
    if (streetKeys.length) {
      await pool.query(
        `DELETE FROM delivery_streets WHERE street_name = ANY($1::text[])`,
        [streetKeys],
      );
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error("delivery-analysis-checkout-e2e: FAIL");
  console.error(err);
  process.exit(1);
});
