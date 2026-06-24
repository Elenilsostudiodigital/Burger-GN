import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, couponsTable, deliveryZonesTable, kmDeliveryConfigTable, kmDeliveryTiersTable } from "@workspace/db";
import { eq, desc, sql, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { addSSEClient, removeSSEClient, broadcastSSE } from "../lib/sse";
import { calcDiscount } from "./coupons";
import { haversineKm, findKmTier } from "./km_delivery";
import crypto from "node:crypto";

const router = Router();

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
  req.on("close", () => { clearInterval(heartbeat); removeSSEClient(res); });
});

// Create order (public)
router.post("/orders", async (req, res) => {
  try {
    const body = req.body as {
      customerName: string; phone: string;
      address?: string; addressNumber?: string; addressComplement?: string;
      neighborhood?: string; reference?: string; notes?: string;
      customerLat?: number; customerLng?: number;
      orderType: "delivery" | "pickup" | "local";
      paymentMethod: "pix" | "cash" | "card";
      changeFor?: number; couponCode?: string;
      items: Array<{ productId?: number; productName: string; productPrice: number; quantity: number }>;
    };

    if (!body.customerName || !body.phone || !body.orderType || !body.paymentMethod || !body.items?.length) {
      res.status(400).json({ error: "Missing required fields" }); return;
    }

    const subtotal = body.items.reduce((acc, i) => acc + i.productPrice * i.quantity, 0);

    // Delivery fee calculation (KM-based first, neighborhood fallback)
    let deliveryFee = 0;
    let customerDistanceKm: number | null = null;

    if (body.orderType === "delivery") {
      // 1) KM-based (if lat/lng provided and KM mode enabled)
      if (body.customerLat && body.customerLng) {
        const [kmConfig] = await db.select().from(kmDeliveryConfigTable).limit(1);
        if (kmConfig && kmConfig.enabled) {
          const baseLat = parseFloat(kmConfig.baseLat);
          const baseLng = parseFloat(kmConfig.baseLng);
          if (baseLat !== 0 || baseLng !== 0) {
            const distKm = haversineKm(baseLat, baseLng, body.customerLat, body.customerLng);
            customerDistanceKm = parseFloat(distKm.toFixed(2));
            const maxDist = parseFloat(kmConfig.maxDistanceKm);
            if (distKm <= maxDist) {
              const tiers = await db.select().from(kmDeliveryTiersTable).orderBy(asc(kmDeliveryTiersTable.displayOrder));
              const { fee } = findKmTier(distKm, tiers);
              if (fee !== null) deliveryFee = fee;
            }
          }
        }
      }

      // 2) Neighborhood-based fallback
      if (deliveryFee === 0 && !customerDistanceKm && body.neighborhood) {
        const [zone] = await db
          .select()
          .from(deliveryZonesTable)
          .where(sql`LOWER(neighborhood) = LOWER(${body.neighborhood}) AND active = true`);
        if (zone) deliveryFee = parseFloat(zone.fee);
      }
    }

    // Coupon validation
    let discountAmount = 0;
    let validatedCouponCode: string | null = null;
    if (body.couponCode) {
      const [coupon] = await db
        .select()
        .from(couponsTable)
        .where(sql`LOWER(code) = LOWER(${body.couponCode})`);
      if (
        coupon && coupon.active &&
        (!coupon.expiresAt || new Date(coupon.expiresAt) >= new Date()) &&
        (coupon.maxUses === null || coupon.usedCount < coupon.maxUses) &&
        subtotal >= parseFloat(coupon.minOrderValue)
      ) {
        discountAmount = calcDiscount(coupon.discountType, parseFloat(coupon.discountValue), subtotal);
        validatedCouponCode = coupon.code;
      }
    }

    const total = Math.max(0, subtotal + deliveryFee - discountAmount);
    const trackingId = crypto.randomUUID();

    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(order_number), 0)` }).from(ordersTable);
    const orderNumber = (Number(maxNum) || 0) + 1;

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        orderNumber, trackingId,
        customerName: body.customerName, phone: body.phone,
        address: body.address ?? "", addressNumber: body.addressNumber ?? "",
        addressComplement: body.addressComplement ?? "",
        neighborhood: body.neighborhood ?? "", reference: body.reference ?? "",
        notes: body.notes ?? "",
        customerLat: body.customerLat ? String(body.customerLat) : null,
        customerLng: body.customerLng ? String(body.customerLng) : null,
        distanceKm: customerDistanceKm !== null ? String(customerDistanceKm) : null,
        orderType: body.orderType, paymentMethod: body.paymentMethod,
        changeFor: body.changeFor ? String(body.changeFor) : null,
        subtotal: String(subtotal.toFixed(2)),
        deliveryFee: String(deliveryFee.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        couponCode: validatedCouponCode,
        total: String(total.toFixed(2)),
      }).returning();

      await tx.insert(orderItemsTable).values(
        body.items.map(i => ({
          orderId: order.id, productId: i.productId ?? null,
          productName: i.productName, productPrice: String(i.productPrice.toFixed(2)),
          quantity: i.quantity, subtotal: String((i.productPrice * i.quantity).toFixed(2)),
        }))
      );

      if (validatedCouponCode) {
        await tx.update(couponsTable)
          .set({ usedCount: sql`used_count + 1` })
          .where(sql`LOWER(code) = LOWER(${validatedCouponCode})`);
      }

      return order;
    });

    const fullOrder = await getOrderWithItems(result.id);
    broadcastSSE("new_order", fullOrder);

    res.status(201).json({
      ok: true, trackingId, orderNumber, orderId: result.id,
      deliveryFee, distanceKm: customerDistanceKm, discountAmount, couponCode: validatedCouponCode,
    });
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
    res.json(orders.map(o => ({ ...o, items: items.filter(i => i.orderId === o.id) })));
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
