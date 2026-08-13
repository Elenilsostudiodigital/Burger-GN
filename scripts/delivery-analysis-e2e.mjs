/**
 * HTTP e2e for delivery-analysis requests.
 * Does not touch Mercado Pago, PIX, cashback, or order refuse/refund.
 *
 * Run: node scripts/delivery-analysis-e2e.mjs
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

async function insertOrder(client, { orderType = "delivery", paymentStatus = "paid", status = "preparing" } = {}) {
  const trackingId = randomUUID();
  const { rows: companyRows } = await client.query(
    `SELECT id FROM companies ORDER BY is_default_storefront DESC, id ASC LIMIT 1`,
  );
  const companyId = companyRows[0].id;
  const { rows: numRows } = await client.query(
    `SELECT COALESCE(MAX(order_number), 0) + 1 AS n FROM orders WHERE company_id = $1`,
    [companyId],
  );
  const orderNumber = Number(numRows[0].n);
  const { rows } = await client.query(
    `INSERT INTO orders (
      company_id, order_number, tracking_id, customer_name, phone,
      address, address_number, neighborhood, notes,
      order_type, payment_method, payment_status,
      subtotal, delivery_fee, discount_amount, total, status
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, '',
      $9, 'cash', $10,
      30, 5, 0, 35, $11
    ) RETURNING id, order_number, tracking_id, status, payment_status, company_id`,
    [
      companyId, orderNumber, trackingId, "Cliente Análise", "71988887777",
      "Rua Teste Análise", "100", "Centro",
      orderType, paymentStatus, status,
    ],
  );
  return rows[0];
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  const createdIds = [];
  try {
    const loginRes = await fetch(`${API}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const login = await json(loginRes);
    assert(loginRes.ok, `login failed: ${loginRes.status} ${JSON.stringify(login.body)}`);
    const cookie = cookieHeader(loginRes.headers.getSetCookie?.() || loginRes.headers.get("set-cookie"));
    assert(cookie.includes("company_session"), "admin cookie missing");

    const unauth = await fetch(`${API}/api/admin/delivery-analysis-requests`);
    assert(unauth.status === 401, `expected 401 without auth, got ${unauth.status}`);

    const approveOrder = await insertOrder(client);
    const rejectOrder = await insertOrder(client);
    const pickupOrder = await insertOrder(client, { orderType: "pickup" });
    createdIds.push(approveOrder.id, rejectOrder.id, pickupOrder.id);

    const sseAbort = new AbortController();
    const sseRes = await fetch(`${API}/api/orders/stream`, {
      headers: { Cookie: cookie, Accept: "text/event-stream" },
      signal: sseAbort.signal,
    });
    assert(sseRes.ok, `SSE failed: ${sseRes.status}`);
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
      } catch {
        /* aborted */
      }
    })();

    const create1 = await json(await fetch(`${API}/api/orders/track/${approveOrder.tracking_id}/delivery-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Entrega atrasou" }),
    }));
    assert(create1.status === 201, `create analysis expected 201, got ${create1.status} ${JSON.stringify(create1.body)}`);
    assert(create1.body.deliveryAnalysis?.status === "pending", "status should be pending");
    assert(create1.body.deliveryAnalysis?.orderId === approveOrder.id, "linked to wrong order");
    assert(create1.body.deliveryAnalysis?.customerNote === "Entrega atrasou", "note not saved");

    await new Promise((r) => setTimeout(r, 400));
    const sseData = sseChunks.join("");
    assert(
      sseData.includes("event: delivery_analysis") && sseData.includes(String(approveOrder.order_number)),
      `SSE did not receive delivery_analysis. got: ${sseData.slice(0, 500)}`,
    );
    sseAbort.abort();
    await sseText.catch(() => {});

    const dup = await json(await fetch(`${API}/api/orders/track/${approveOrder.tracking_id}/delivery-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "segunda" }),
    }));
    assert(dup.status === 409, `duplicate pending expected 409, got ${dup.status} ${JSON.stringify(dup.body)}`);

    const other = await json(await fetch(`${API}/api/orders/track/${randomUUID()}/delivery-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "hack" }),
    }));
    assert(other.status === 404, `other tracking expected 404, got ${other.status}`);

    const pickup = await json(await fetch(`${API}/api/orders/track/${pickupOrder.tracking_id}/delivery-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    assert(pickup.status === 400, `pickup expected 400, got ${pickup.status} ${JSON.stringify(pickup.body)}`);

    const track = await json(await fetch(`${API}/api/orders/track/${approveOrder.tracking_id}`));
    assert(track.status === 200, "track failed");
    assert(track.body.deliveryAnalysis?.status === "pending", "track should include pending analysis");
    assert(track.body.status === approveOrder.status, "order status changed after request");
    assert(track.body.paymentStatus === approveOrder.payment_status, "payment status changed after request");

    const listed = await json(await fetch(`${API}/api/admin/delivery-analysis-requests?status=pending`, {
      headers: { Cookie: cookie },
    }));
    assert(listed.status === 200, `list failed ${listed.status}`);
    const found = listed.body.find((r) => r.orderId === approveOrder.id);
    assert(found, "admin list missing pending request");
    assert(found.customerName === "Cliente Análise", "customer snapshot missing");
    assert(found.neighborhood === "Centro", "neighborhood snapshot missing");

    const approve = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${found.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    }));
    assert(approve.status === 200, `approve failed ${approve.status} ${JSON.stringify(approve.body)}`);
    assert(approve.body.deliveryAnalysis.status === "approved", "expected approved");
    assert(approve.body.deliveryAnalysis.reviewedAt, "reviewedAt missing");

    const trackApproved = await json(await fetch(`${API}/api/orders/track/${approveOrder.tracking_id}`));
    assert(trackApproved.body.deliveryAnalysis?.status === "approved", "customer did not see approved");
    assert(trackApproved.body.status === approveOrder.status, "order status changed on approve");
    assert(trackApproved.body.paymentStatus === approveOrder.payment_status, "payment changed on approve");

    const createReject = await json(await fetch(`${API}/api/orders/track/${rejectOrder.tracking_id}/delivery-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Endereço errado" }),
    }));
    assert(createReject.status === 201, `reject-path create failed ${createReject.status}`);
    const rejectId = createReject.body.deliveryAnalysis.id;

    const rejectNoReason = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${rejectId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "" }),
    }));
    assert(rejectNoReason.status === 400, `reject without reason expected 400, got ${rejectNoReason.status}`);

    const rejectOk = await json(await fetch(`${API}/api/admin/delivery-analysis-requests/${rejectId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Fora da área combinada" }),
    }));
    assert(rejectOk.status === 200, `reject failed ${rejectOk.status} ${JSON.stringify(rejectOk.body)}`);
    assert(rejectOk.body.deliveryAnalysis.status === "rejected", "expected rejected");
    assert(rejectOk.body.deliveryAnalysis.rejectReason === "Fora da área combinada", "reject reason not saved");

    const trackRejected = await json(await fetch(`${API}/api/orders/track/${rejectOrder.tracking_id}`));
    assert(trackRejected.body.deliveryAnalysis?.status === "rejected", "customer did not see rejected");
    assert(trackRejected.body.deliveryAnalysis?.rejectReason === "Fora da área combinada", "customer missing reject reason");
    assert(trackRejected.body.status === rejectOrder.status, "order status changed on analysis reject");
    assert(trackRejected.body.paymentStatus === rejectOrder.payment_status, "payment changed on analysis reject");

    const { rows: mpCols } = await client.query(
      `SELECT status, payment_status, mp_payment_id FROM orders WHERE id = ANY($1::int[])`,
      [[approveOrder.id, rejectOrder.id]],
    );
    for (const row of mpCols) {
      assert(row.status !== "cancelled", "analysis must not cancel the order");
      assert(row.payment_status === "paid", "analysis must not change payment");
    }

    console.log("delivery-analysis-e2e: OK");
    console.log(JSON.stringify({
      approveOrder: approveOrder.order_number,
      rejectOrder: rejectOrder.order_number,
      sseReceived: true,
      duplicateBlocked: true,
      foreignTrackingBlocked: true,
      rejectReasonRequired: true,
      orderAndPaymentIntact: true,
    }, null, 2));
  } finally {
    if (createdIds.length) {
      await client.query(`DELETE FROM delivery_analysis_requests WHERE order_id = ANY($1::int[])`, [createdIds]);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [createdIds]);
    }
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("delivery-analysis-e2e: FAIL");
  console.error(err);
  process.exit(1);
});
