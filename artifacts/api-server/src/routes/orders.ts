import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { addSSEClient, removeSSEClient, broadcastSSE } from "../lib/sse";
import crypto from "node:crypto";

const router = Router();

const DELIVERY_FEE = 5.00;

// SSE stream for admin real-time notifications
router.get("/orders/stream", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");

  addSSEClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(res);
  });
});

// Create order (public)
router.post("/orders", async (req, res) => {
  try {
    const body = req.body as {
      customerName: string;
      phone: string;
      address?: string;
      neighborhood?: string;
      reference?: string;
      notes?: string;
      orderType: "delivery" | "pickup" | "local";
      paymentMethod: "pix" | "cash" | "card";
      changeFor?: number;
      items: Array<{ productId?: number; productName: string; productPrice: number; quantity: number }>;
    };

    if (!body.customerName || !body.phone || !body.orderType || !body.paymentMethod || !body.items?.length) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const trackingId = crypto.randomUUID();
    const subtotal = body.items.reduce((acc, i) => acc + i.productPrice * i.quantity, 0);
    const deliveryFee = body.orderType === "delivery" ? DELIVERY_FEE : 0;
    const total = subtotal + deliveryFee;

    // Get next order number
    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(order_number), 0)` }).from(ordersTable);
    const orderNumber = (Number(maxNum) || 0) + 1;

    const [order] = await db.insert(ordersTable).values({
      orderNumber,
      trackingId,
      customerName: body.customerName,
      phone: body.phone,
      address: body.address ?? "",
      neighborhood: body.neighborhood ?? "",
      reference: body.reference ?? "",
      notes: body.notes ?? "",
      orderType: body.orderType,
      paymentMethod: body.paymentMethod,
      changeFor: body.changeFor ? String(body.changeFor) : null,
      subtotal: String(subtotal.toFixed(2)),
      deliveryFee: String(deliveryFee.toFixed(2)),
      total: String(total.toFixed(2)),
    }).returning();

    await db.insert(orderItemsTable).values(
      body.items.map(i => ({
        orderId: order.id,
        productId: i.productId ?? null,
        productName: i.productName,
        productPrice: String(i.productPrice.toFixed(2)),
        quantity: i.quantity,
        subtotal: String((i.productPrice * i.quantity).toFixed(2)),
      }))
    );

    const fullOrder = await getOrderWithItems(order.id);
    broadcastSSE("new_order", fullOrder);

    res.status(201).json({ ok: true, trackingId, orderNumber, orderId: order.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all orders (admin)
router.get("/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    const ids = orders.map(o => o.id);
    if (ids.length === 0) { res.json([]); return; }
    const items = await db.select().from(orderItemsTable).where(sql`order_id = ANY(${ids})`);
    const result = orders.map(o => ({ ...o, items: items.filter(i => i.orderId === o.id) }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Track order (public)
router.get("/orders/track/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params as { trackingId: string };
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    res.json({ ...order, items });
  } catch (err) {
    req.log.error({ err }, "Failed to track order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update order status (admin)
router.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { status } = req.body as { status: "new" | "preparing" | "delivery" | "done" | "cancelled" };
    if (!["new","preparing","delivery","done","cancelled"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }
    const [order] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.id, id))
      .returning();
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    broadcastSSE("order_status", { id: order.id, trackingId: order.trackingId, status: order.status });
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to update order status");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function getOrderWithItems(orderId: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  return { ...order, items };
}

export default router;
