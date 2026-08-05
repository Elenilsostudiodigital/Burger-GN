import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, couponsTable, deliveryZonesTable, kmDeliveryConfigTable, kmDeliveryTiersTable, paymentSettingsTable, productsTable } from "@workspace/db";
import { eq, and, desc, sql, asc, inArray, ne } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { addSSEClient, removeSSEClient, broadcastSSE } from "../lib/sse";
import { calcDiscount } from "./coupons";
import { haversineKm, findKmTier } from "./km_delivery";
import {
  parseOrderNotes, serializeOrderNotes, appendHistory, resolveWorkflow, WORKFLOW_TO_STATUS,
  buildCustomerNotifyMessage, buildPostDeliverySurveyMessage,
  type WorkflowStage, type CardType, type OrderMeta, type OrderReview,
} from "../lib/orderMeta";
import { buildStaticPixPayload, decodePixSettings, normalizePixKey } from "../lib/staticPix";
import crypto from "node:crypto";

const router = Router();

const WORKFLOW_VALUES: WorkflowStage[] = [
  "awaiting_payment", "new", "accepted", "preparing", "ready", "out", "done",
];

const RECEIPT_MIME_RE = /^data:image\/(png|jpe?g|webp);base64,/i;

function enrichOrder<T extends { notes: string; status: string }>(order: T) {
  const { publicNotes, meta } = parseOrderNotes(order.notes);
  const workflow = resolveWorkflow(order.status, meta);
  return {
    ...order,
    notes: publicNotes,
    meta,
    workflow,
    cardType: meta.cardType ?? null,
    needsChange: meta.needsChange ?? null,
    receiptDataUrl: meta.receiptDataUrl ?? null,
    receiptUploadedAt: meta.receiptUploadedAt ?? null,
    receiptRejectReason: meta.receiptRejectReason ?? null,
    receiptRejectedAt: meta.receiptRejectedAt ?? null,
    rejectReason: meta.rejectReason ?? null,
    review: meta.review ?? null,
    deliveredAt: meta.deliveredAt ?? null,
    history: meta.history ?? [],
  };
}

async function getOrderWithItems(orderId: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  return { ...enrichOrder(order), items };
}

// SSE stream for admin real-time notifications
router.get("/orders/stream", requireCompanyAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  addSSEClient(res, req.companyId!);
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);
  req.on("close", () => { clearInterval(heartbeat); removeSSEClient(res); });
});

// Popular products (no schema change — aggregates existing order_items)
router.get("/products/popular", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(eq(ordersTable.companyId, companyId), ne(ordersTable.status, "cancelled")))
      .groupBy(orderItemsTable.productId, orderItemsTable.productName)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
      .limit(8);
    res.json(rows.map(r => ({ ...r, quantity: Number(r.quantity) })));
  } catch (err) {
    req.log.error({ err }, "Failed to get popular products");
    res.json([]);
  }
});

// Create order (public)
router.post("/orders", resolvePublicCompany, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const body = req.body as {
      customerName: string; phone: string;
      address?: string; addressNumber?: string; addressComplement?: string;
      neighborhood?: string; reference?: string; notes?: string;
      customerLat?: number; customerLng?: number;
      orderType: "delivery" | "pickup" | "local";
      paymentMethod: "pix" | "cash" | "card";
      changeFor?: number;
      cardType?: CardType;
      needsChange?: boolean;
      couponCode?: string;
      items: Array<{
        productId?: number; productName: string; productPrice: number; quantity: number;
        addons?: Array<{ name: string; price: number }>; notes?: string;
      }>;
    };

    if (!body.customerName || !body.phone || !body.orderType || !body.paymentMethod || !body.items?.length) {
      res.status(400).json({ error: "Missing required fields" }); return;
    }
    if (body.items.some(i => !i.quantity || i.quantity <= 0)) {
      res.status(400).json({ error: "Invalid item quantity" }); return;
    }
    if (body.paymentMethod === "card" && body.cardType && !["credit", "debit"].includes(body.cardType)) {
      res.status(400).json({ error: "Invalid card type" }); return;
    }

    if (body.orderType === "delivery" && body.paymentMethod === "cash") {
      const [paySettings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
      if (paySettings && !paySettings.cashOnDeliveryEnabled) {
        res.status(400).json({ error: "Pagamento em dinheiro não está disponível para entrega. Escolha Pix, cartão ou retire no balcão." });
        return;
      }
    }

    const productIds = [...new Set(body.items.map(i => i.productId).filter((id): id is number => typeof id === "number"))];
    const dbProducts = productIds.length
      ? await db.select().from(productsTable).where(and(eq(productsTable.companyId, companyId), inArray(productsTable.id, productIds)))
      : [];
    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    const validatedItems: Array<{
      productId: number | null; productName: string; productPrice: number; quantity: number;
      addons: Array<{ name: string; price: number }>; notes: string; subtotal: number;
    }> = [];

    for (const i of body.items) {
      let productPrice = i.productPrice;
      let validatedAddons: Array<{ name: string; price: number }> = [];

      if (i.productId !== undefined) {
        const product = productMap.get(i.productId);
        if (!product || !product.available) {
          res.status(400).json({ error: `Produto "${i.productName}" não está mais disponível.` }); return;
        }
        productPrice = parseFloat(product.price);
        const dbAddons = (product.addons ?? []) as Array<{ name: string; price: number }>;
        validatedAddons = (i.addons ?? [])
          .map(sel => dbAddons.find(a => a.name === sel.name))
          .filter((a): a is { name: string; price: number } => !!a);
      }

      const addonsTotal = validatedAddons.reduce((acc, a) => acc + a.price, 0);
      const lineSubtotal = (productPrice + addonsTotal) * i.quantity;
      validatedItems.push({
        productId: i.productId ?? null, productName: i.productName, productPrice,
        quantity: i.quantity, addons: validatedAddons, notes: i.notes ?? "", subtotal: lineSubtotal,
      });
    }

    const subtotal = validatedItems.reduce((acc, i) => acc + i.subtotal, 0);

    let deliveryFee = 0;
    let customerDistanceKm: number | null = null;

    if (body.orderType === "delivery") {
      if (body.customerLat && body.customerLng) {
        const [kmConfig] = await db.select().from(kmDeliveryConfigTable).where(eq(kmDeliveryConfigTable.companyId, companyId));
        if (kmConfig && kmConfig.enabled) {
          const baseLat = parseFloat(kmConfig.baseLat);
          const baseLng = parseFloat(kmConfig.baseLng);
          if (baseLat !== 0 || baseLng !== 0) {
            const distKm = haversineKm(baseLat, baseLng, body.customerLat, body.customerLng);
            customerDistanceKm = parseFloat(distKm.toFixed(2));
            const maxDist = parseFloat(kmConfig.maxDistanceKm);
            if (distKm <= maxDist) {
              const tiers = await db.select().from(kmDeliveryTiersTable).where(eq(kmDeliveryTiersTable.companyId, companyId)).orderBy(asc(kmDeliveryTiersTable.displayOrder));
              const { fee } = findKmTier(distKm, tiers);
              if (fee !== null) deliveryFee = fee;
            }
          }
        }
      }

      if (deliveryFee === 0 && !customerDistanceKm && body.neighborhood) {
        const [zone] = await db
          .select()
          .from(deliveryZonesTable)
          .where(and(eq(deliveryZonesTable.companyId, companyId), sql`LOWER(neighborhood) = LOWER(${body.neighborhood})`));
        if (zone) deliveryFee = parseFloat(zone.fee);
      }
    }

    let discountAmount = 0;
    let validatedCouponCode: string | null = null;
    if (body.couponCode) {
      const [coupon] = await db
        .select()
        .from(couponsTable)
        .where(and(eq(couponsTable.companyId, companyId), sql`LOWER(code) = LOWER(${body.couponCode})`));
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

    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(order_number), 0)` }).from(ordersTable).where(eq(ordersTable.companyId, companyId));
    const orderNumber = (Number(maxNum) || 0) + 1;

    // Non-Pix: start as Pendente. Pix: waits for receipt → conferência → then Pendente.
    // Never auto-accepted.
    let pixPayment: { paymentId: string; qrCode: string; qrCodeBase64: string; pixKey: string } | null = null;
    let pixConfigured = false;
    let pixUnavailableReason: string | null = null;
    const isPix = body.paymentMethod === "pix";
    let meta: OrderMeta = isPix
      ? {
          workflow: "awaiting_payment",
          history: [{
            stage: "awaiting_payment",
            label: "Aguardando pagamento Pix",
            at: new Date().toISOString(),
          }],
        }
      : {
          workflow: "new",
          history: [{ stage: "new", label: "Pendente", at: new Date().toISOString() }],
        };
    if (body.paymentMethod === "card" && body.cardType) meta.cardType = body.cardType;
    if (body.paymentMethod === "cash") meta.needsChange = !!body.needsChange || !!body.changeFor;

    if (isPix) {
      const [paySettings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
      const pixCfg = decodePixSettings(paySettings?.gatewayProvider)
        ?? (paySettings?.mercadoPagoPublicKey && !paySettings.mercadoPagoPublicKey.startsWith("APP_USR")
          ? { key: paySettings.mercadoPagoPublicKey, name: "THE BURGER GN", city: "LAURO DE FREITAS" }
          : null);

      const pixKey = pixCfg?.key?.trim() || "";
      if (pixKey) {
        pixConfigured = true;
        const qrCode = buildStaticPixPayload({
          key: pixKey,
          merchantName: pixCfg!.name,
          merchantCity: pixCfg!.city,
          amount: total,
          // Referência só na descrição (MAI 02). TXID deve permanecer "***" no BR Code estático.
          description: `PEDIDO${orderNumber}`,
        });
        // Never return an empty/invalid payload as a QR.
        if (qrCode && qrCode.length > 20) {
          const normalizedKey = normalizePixKey(pixKey);
          pixPayment = {
            paymentId: `static_${trackingId}`,
            qrCode,
            qrCodeBase64: "",
            pixKey: normalizedKey,
          };
          meta.pixCopyPaste = qrCode;
          meta.pixKey = normalizedKey;
        } else {
          pixConfigured = false;
          pixUnavailableReason = "Não foi possível gerar o QR Code Pix. Verifique a chave cadastrada no painel.";
        }
      } else {
        pixUnavailableReason = "A chave Pix da loja precisa ser cadastrada em Admin → Config → Pagamento.";
      }
    }

    const notesSerialized = serializeOrderNotes(body.notes ?? "", meta);

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        companyId,
        orderNumber, trackingId,
        customerName: body.customerName, phone: body.phone,
        address: body.address ?? "", addressNumber: body.addressNumber ?? "",
        addressComplement: body.addressComplement ?? "",
        neighborhood: body.neighborhood ?? "", reference: body.reference ?? "",
        notes: notesSerialized,
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
        validatedItems.map(i => ({
          orderId: order.id, productId: i.productId,
          productName: i.productName, productPrice: String(i.productPrice.toFixed(2)),
          quantity: i.quantity, addons: i.addons, notes: i.notes,
          subtotal: String(i.subtotal.toFixed(2)),
        }))
      );

      if (validatedCouponCode) {
        await tx.update(couponsTable)
          .set({ usedCount: sql`used_count + 1` })
          .where(and(eq(couponsTable.companyId, companyId), sql`LOWER(code) = LOWER(${validatedCouponCode})`));
      }

      return order;
    });

    const fullOrder = await getOrderWithItems(result.id);
    // Pix only enters the admin "new order" queue after receipt upload.
    if (!isPix) {
      broadcastSSE(companyId, "new_order", fullOrder);
    }

    // cardCheckoutUrl kept null — Mercado Pago intentionally not wired yet (future-ready)
    // paymentStatus stays DB default "pending"; Pix/receipt never auto-accepts the order.
    res.status(201).json({
      ok: true, trackingId, orderNumber, orderId: result.id,
      deliveryFee, distanceKm: customerDistanceKm, discountAmount, couponCode: validatedCouponCode,
      pixPayment, pixConfigured, pixUnavailableReason, cardCheckoutUrl: null,
      paymentStatus: "pending",
      workflow: isPix ? "awaiting_payment" : "new",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all orders (admin)
router.get("/orders", requireCompanyAuth, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.companyId, req.companyId!))
      .orderBy(desc(ordersTable.createdAt));
    const ids = orders.map(o => o.id);
    if (ids.length === 0) { res.json([]); return; }
    const items = await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, ids));
    res.json(orders.map(o => ({
      ...enrichOrder(o),
      items: items.filter(i => i.orderId === o.id),
    })));
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
    res.json({ ...enrichOrder(order), items });
  } catch (err) {
    req.log.error({ err }, "Failed to track order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update order status / workflow (admin)
router.patch("/orders/:id/status", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as {
      status?: "new" | "preparing" | "delivery" | "done" | "cancelled";
      workflow?: WorkflowStage | "cancelled";
      /** Required when refusing / cancelling. */
      rejectReason?: string;
    };

    const [existing] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, req.companyId!)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const { publicNotes, meta } = parseOrderNotes(existing.notes);
    let nextStatus = existing.status as "new" | "preparing" | "delivery" | "done" | "cancelled";
    let nextMeta = { ...meta };
    let notifyStage: WorkflowStage | "cancelled" | null = null;

    // Accepting a pending order jumps straight to "Em preparo" (no auto-accept on create).
    let requestedWorkflow = body.workflow;
    if (requestedWorkflow === "accepted") {
      requestedWorkflow = "preparing";
    }

    // Pix: kitchen accept only after admin confirms payment manually.
    const advancingToKitchen =
      requestedWorkflow === "preparing" ||
      requestedWorkflow === "ready" ||
      requestedWorkflow === "out" ||
      requestedWorkflow === "done" ||
      body.status === "preparing" ||
      body.status === "delivery" ||
      body.status === "done";
    if (
      advancingToKitchen &&
      existing.paymentMethod === "pix" &&
      existing.paymentStatus !== "paid"
    ) {
      res.status(400).json({
        error: "Confirme o pagamento Pix antes de aceitar este pedido.",
      });
      return;
    }

    if (requestedWorkflow === "cancelled" || body.status === "cancelled") {
      const reason = typeof body.rejectReason === "string" ? body.rejectReason.trim() : "";
      if (!reason) {
        res.status(400).json({ error: "Informe o motivo da recusa do pedido." });
        return;
      }
      nextStatus = "cancelled";
      nextMeta.rejectReason = reason;
      nextMeta = appendHistory(nextMeta, "cancelled", `Recusado: ${reason}`);
      notifyStage = "cancelled";
    } else if (requestedWorkflow === "awaiting_payment") {
      res.status(400).json({ error: "Status inválido para alteração manual." });
      return;
    } else if (requestedWorkflow && WORKFLOW_VALUES.includes(requestedWorkflow)) {
      const wf = requestedWorkflow as WorkflowStage;
      nextStatus = WORKFLOW_TO_STATUS[wf];
      nextMeta = appendHistory(nextMeta, wf);
      nextMeta.workflow = wf;
      notifyStage = wf;
      if (wf === "done" && !nextMeta.deliveredAt) {
        nextMeta.deliveredAt = new Date().toISOString();
      }
    } else if (body.status && ["new", "preparing", "delivery", "done"].includes(body.status)) {
      nextStatus = body.status;
      const mapped: WorkflowStage =
        body.status === "new" ? "new" :
        body.status === "preparing" ? "preparing" :
        body.status === "delivery" ? "out" : "done";
      nextMeta = appendHistory(nextMeta, mapped);
      notifyStage = mapped;
      if (mapped === "done" && !nextMeta.deliveredAt) {
        nextMeta.deliveredAt = new Date().toISOString();
      }
    } else {
      res.status(400).json({ error: "Invalid status" }); return;
    }

    const [order] = await db.update(ordersTable)
      .set({
        status: nextStatus,
        notes: serializeOrderNotes(publicNotes, nextMeta),
        updatedAt: new Date(),
      })
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, req.companyId!)))
      .returning();

    const enriched = enrichOrder(order);
    const customerNotifyMessage = notifyStage
      ? buildCustomerNotifyMessage(
          order.orderNumber,
          order.customerName,
          notifyStage,
          nextMeta.rejectReason,
        )
      : null;

    // Future WhatsApp: post-delivery survey message is prepared but NOT sent (no API yet).
    const futureWhatsappSurvey =
      notifyStage === "done"
        ? buildPostDeliverySurveyMessage(order.orderNumber, order.customerName)
        : null;

    broadcastSSE(req.companyId!, "order_status", {
      id: order.id,
      trackingId: order.trackingId,
      status: order.status,
      workflow: enriched.workflow,
      rejectReason: nextMeta.rejectReason ?? null,
      customerNotifyMessage,
      futureWhatsappSurvey,
    });
    res.json({
      ...enriched,
      items: (await getOrderWithItems(order.id))?.items ?? [],
      customerNotifyMessage,
      futureWhatsappSurvey,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update order status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public: submit delivery confirmation / review
router.post("/orders/track/:trackingId/review", async (req, res) => {
  try {
    const { trackingId } = req.params as { trackingId: string };
    const body = req.body as {
      deliveredOk?: boolean;
      stars?: number;
      comment?: string;
    };

    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
    if (existing.status !== "done") {
      res.status(400).json({ error: "Avaliação disponível apenas após a entrega." }); return;
    }

    const { publicNotes, meta } = parseOrderNotes(existing.notes);
    if (meta.review) {
      res.json({ ...enrichOrder(existing), alreadyReviewed: true });
      return;
    }

    const deliveredOk = body.deliveredOk !== false;
    let stars = Number(body.stars);
    if (deliveredOk) {
      if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
        res.status(400).json({ error: "Informe uma nota de 1 a 5 estrelas." }); return;
      }
      stars = Math.round(stars);
    } else {
      stars = 0;
    }

    const review: OrderReview = {
      stars,
      comment: typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : "",
      deliveredOk,
      createdAt: new Date().toISOString(),
      orderNumber: existing.orderNumber,
    };

    const nextMeta: OrderMeta = { ...meta, review };
    const [order] = await db.update(ordersTable)
      .set({ notes: serializeOrderNotes(publicNotes, nextMeta), updatedAt: new Date() })
      .where(eq(ordersTable.id, existing.id))
      .returning();

    broadcastSSE(existing.companyId, "order_review", {
      id: order.id,
      trackingId: order.trackingId,
      orderNumber: order.orderNumber,
      review,
    });

    res.json(enrichOrder(order));
  } catch (err) {
    req.log.error({ err }, "Failed to save review");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: list customer reviews
router.get("/admin/reviews", requireCompanyAuth, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.companyId, req.companyId!))
      .orderBy(desc(ordersTable.createdAt));

    const reviews = orders
      .map(o => {
        const enriched = enrichOrder(o);
        if (!enriched.review) return null;
        return {
          orderId: o.id,
          orderNumber: o.orderNumber,
          trackingId: o.trackingId,
          customerName: o.customerName,
          phone: o.phone,
          stars: enriched.review.stars,
          comment: enriched.review.comment,
          deliveredOk: enriched.review.deliveredOk,
          createdAt: enriched.review.createdAt,
          orderCreatedAt: o.createdAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(reviews);
  } catch (err) {
    req.log.error({ err }, "Failed to list reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upload payment receipt (public via trackingId)
router.post("/orders/track/:trackingId/receipt", async (req, res) => {
  try {
    const { trackingId } = req.params as { trackingId: string };
    const { receiptDataUrl } = req.body as { receiptDataUrl?: string };
    if (!receiptDataUrl || typeof receiptDataUrl !== "string" || !RECEIPT_MIME_RE.test(receiptDataUrl)) {
      res.status(400).json({ error: "Envie uma imagem PNG, JPG, JPEG ou WEBP do comprovante." }); return;
    }
    if (receiptDataUrl.length > 1_200_000) {
      res.status(400).json({ error: "Comprovante muito grande. Use uma imagem menor (até ~900KB)." }); return;
    }

    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
    if (existing.status === "cancelled") {
      res.status(400).json({ error: "Este pedido foi recusado e não aceita novo comprovante." }); return;
    }
    if (existing.paymentStatus === "paid") {
      res.status(400).json({ error: "Pagamento já confirmado. Não é necessário reenviar o comprovante." }); return;
    }

    const { publicNotes, meta } = parseOrderNotes(existing.notes);
    let nextMeta: OrderMeta = {
      ...meta,
      receiptDataUrl,
      receiptUploadedAt: new Date().toISOString(),
    };
    delete nextMeta.receiptRejectReason;
    delete nextMeta.receiptRejectedAt;
    nextMeta = appendHistory(
      nextMeta,
      "awaiting_payment",
      "Aguardando conferência do pagamento",
    );

    // Receipt does NOT mark paid and does NOT accept the order.
    const [order] = await db.update(ordersTable)
      .set({
        paymentStatus: "pending",
        status: "new",
        notes: serializeOrderNotes(publicNotes, nextMeta),
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, existing.id))
      .returning();

    const enriched = { ...enrichOrder(order), items: (await getOrderWithItems(order.id))?.items ?? [] };

    // First receipt (or resubmit after refuse) surfaces the order in the admin queue.
    broadcastSSE(existing.companyId, "new_order", enriched);
    broadcastSSE(existing.companyId, "order_receipt", {
      id: order.id,
      trackingId: order.trackingId,
      receiptUploadedAt: nextMeta.receiptUploadedAt,
      workflow: "awaiting_payment",
    });

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to upload receipt");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: confirm or refuse Pix payment (manual conference)
router.patch("/orders/:id/payment-status", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as {
      paymentStatus: "pending" | "paid" | "failed";
      refuseReason?: string;
    };
    const { paymentStatus } = body;
    if (!["pending", "paid", "failed"].includes(paymentStatus)) {
      res.status(400).json({ error: "Invalid payment status" }); return;
    }

    const [existing] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, req.companyId!)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const { publicNotes, meta } = parseOrderNotes(existing.notes);
    let nextMeta = { ...meta };
    let customerNotifyMessage: string | null = null;
    let notifyKind: "payment_confirmed" | "receipt_refused" | null = null;

    if (paymentStatus === "paid") {
      nextMeta = appendHistory(nextMeta, "new", "Pendente");
      delete nextMeta.receiptRejectReason;
      delete nextMeta.receiptRejectedAt;
      notifyKind = "payment_confirmed";
      customerNotifyMessage = buildCustomerNotifyMessage(
        existing.orderNumber,
        existing.customerName,
        "payment_confirmed",
      );
    } else if (paymentStatus === "failed") {
      const reason = typeof body.refuseReason === "string" ? body.refuseReason.trim() : "";
      if (!reason) {
        res.status(400).json({ error: "Informe o motivo da recusa do comprovante." }); return;
      }
      nextMeta.receiptRejectReason = reason;
      nextMeta.receiptRejectedAt = new Date().toISOString();
      // Keep image for audit; clear upload stamp so UI treats as rejected / awaiting resubmit.
      nextMeta = appendHistory(
        nextMeta,
        "awaiting_payment",
        `Comprovante recusado: ${reason}`,
      );
      notifyKind = "receipt_refused";
      customerNotifyMessage = buildCustomerNotifyMessage(
        existing.orderNumber,
        existing.customerName,
        "receipt_refused",
        reason,
      );
    }

    const [order] = await db.update(ordersTable)
      .set({
        paymentStatus,
        status: "new",
        notes: serializeOrderNotes(publicNotes, nextMeta),
        updatedAt: new Date(),
      })
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, req.companyId!)))
      .returning();

    const enriched = enrichOrder(order);
    broadcastSSE(req.companyId!, "order_payment", {
      id: order.id,
      trackingId: order.trackingId,
      paymentStatus,
      workflow: enriched.workflow,
      receiptRejectReason: nextMeta.receiptRejectReason ?? null,
      customerNotifyMessage,
      notifyKind,
    });

    if (paymentStatus === "paid") {
      // Re-enter "Novos Pedidos" queue as Pendente after payment conference.
      broadcastSSE(req.companyId!, "new_order", {
        ...enriched,
        items: (await getOrderWithItems(order.id))?.items ?? [],
      });
    }

    res.json({
      ...enriched,
      items: (await getOrderWithItems(order.id))?.items ?? [],
      customerNotifyMessage,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update payment status");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
