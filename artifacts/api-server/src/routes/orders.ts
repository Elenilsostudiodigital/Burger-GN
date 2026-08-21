import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, couponsTable, deliveryZonesTable, kmDeliveryConfigTable, kmDeliveryTiersTable, paymentSettingsTable, productsTable, categoriesTable, clubeMembersTable, clubeSettingsTable, deliveryStreetsTable, deliveryStreetRequestsTable, deliveryAreasTable, companiesTable } from "@workspace/db";
import { eq, and, desc, sql, asc, inArray, ne } from "drizzle-orm";
import { requireCompanyAuth, tryGetCompanySession } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { addSSEClient, removeSSEClient, broadcastSSE } from "../lib/sse";
import { calcDiscount } from "./coupons";
import { haversineKm, findKmTier } from "./km_delivery";
import { normalizeStreetKey } from "../lib/deliveryStreets";
import { resolvePointInAreas } from "../lib/deliveryAreas";
import {
  parseOrderNotes, serializeOrderNotes, appendHistory, resolveWorkflow, WORKFLOW_TO_STATUS,
  buildCustomerNotifyMessage, buildPostDeliverySurveyMessage,
  type WorkflowStage, type CardType, type OrderMeta, type OrderReview,
} from "../lib/orderMeta";
import { buildStaticPixPayload, decodePixSettings, normalizePixKey } from "../lib/staticPix";
import { createPixPayment, getMPSettings, getMPAccessToken, fetchMPPayment } from "../lib/mercadopago";
import { mercadoPagoNotificationUrl } from "../lib/publicUrl";
import { applyMercadoPagoStatus } from "../lib/mpReconcile";
import { syncClubeMemberOnOrder } from "../lib/clubeClientSync";
import {
  appendClientLedger,
  hasLedgerForOrder,
  isFidelityFreeBurgerProduct,
  normalizeClientPhone,
  parseClientNotes,
  redeemAvailableReward,
  serializeClientNotes,
} from "../lib/clientMeta";
import {
  applyLazyCashbackExpiry,
  applyLazyFidelityExpiry,
  computeCashbackApplicable,
  readMaxUsePercent,
  roundMoney,
} from "../lib/clubBenefits";
import { applyOrderCompletionRewards } from "../lib/orderRewards";
import { buildPublicClubeMe, type PublicClubeMePayload } from "../lib/clubePublicMe";
import { getOrCreateBusinessHours } from "../lib/businessHoursStore";
import { evaluateStoreStatus } from "../lib/businessHours";
import {
  computePrepDayStats,
  finishPrepTimer,
  isPrepEarlyFinish,
  loadCompanyPrepTimes,
  prepDurationSeconds,
  startPrepTimer,
} from "../lib/prepTimer";
import crypto from "node:crypto";

const router = Router();

const WORKFLOW_VALUES: WorkflowStage[] = [
  "awaiting_payment", "new", "accepted", "preparing", "ready", "out", "done", "finalized",
];

const RECEIPT_MIME_RE = /^data:image\/(png|jpe?g|webp);base64,/i;

function enrichOrder<T extends { notes: string; status: string }>(
  order: T,
  opts?: { includeReceiptBytes?: boolean },
) {
  const { publicNotes, meta } = parseOrderNotes(order.notes);
  const workflow = resolveWorkflow(order.status, meta);
  const durationSec = prepDurationSeconds(meta);
  const hasReceipt = !!(meta.receiptDataUrl || meta.receiptUploadedAt);
  const includeBytes = opts?.includeReceiptBytes !== false;
  return {
    ...order,
    notes: publicNotes,
    meta,
    workflow,
    cardType: meta.cardType ?? null,
    needsChange: meta.needsChange ?? null,
    receiptDataUrl: includeBytes ? (meta.receiptDataUrl ?? null) : null,
    hasReceipt,
    receiptUploadedAt: meta.receiptUploadedAt ?? null,
    receiptRejectReason: meta.receiptRejectReason ?? null,
    receiptRejectedAt: meta.receiptRejectedAt ?? null,
    rejectReason: meta.rejectReason ?? null,
    review: meta.review ?? null,
    deliveredAt: meta.deliveredAt ?? null,
    finalizedAt: meta.finalizedAt ?? null,
    history: meta.history ?? [],
    pixMode: meta.pixMode ?? null,
    pixCopyPaste: meta.pixCopyPaste ?? null,
    pixKey: meta.pixKey ?? null,
    prepStartedAt: meta.prepStartedAt ?? null,
    prepFinishedAt: meta.prepFinishedAt ?? null,
    prepTimeMin: meta.prepTimeMin ?? null,
    prepTimeMax: meta.prepTimeMax ?? null,
    prepDurationSeconds: durationSec,
    prepEarlyFinish: isPrepEarlyFinish(meta),
    stampsAwarded: meta.stampsAwarded ?? false,
    stampSkipped: meta.stampSkipped ?? false,
    stampSkipMessage: meta.stampSkipMessage ?? null,
    cashbackAwarded: meta.cashbackAwarded ?? false,
    cashbackAmountAwarded: meta.cashbackAmountAwarded ?? null,
    fidelityRewardGranted: meta.fidelityRewardGranted ?? false,
    fidelityRewardTitle: meta.fidelityRewardTitle ?? null,
    fidelityRewardId: meta.fidelityRewardId ?? null,
    source: meta.source ?? null,
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
    if (req.companyBlocked) {
      res.status(403).json({ error: "Esta loja está temporariamente indisponível" });
      return;
    }
    const body = req.body as {
      customerName: string; phone: string;
      address?: string; addressNumber?: string; addressComplement?: string;
      neighborhood?: string; reference?: string; notes?: string;
      customerLat?: number; customerLng?: number;
      orderType: "delivery" | "pickup" | "local";
      paymentMethod: "pix" | "cash" | "card";
      pixMode?: "online" | "manual";
      changeFor?: number;
      cardType?: CardType;
      needsChange?: boolean;
      couponCode?: string;
      /** Optional Clube fidelity free-burger redemption (additive). */
      fidelityRewardId?: string;
      fidelityFreeProductId?: number;
      /** Opt-in: use available cashback on this order (server recalculates amount). */
      useCashback?: boolean;
      /** Attendant panel only — honored when admin session cookie is present. */
      source?: "online" | "attendant";
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
    if (body.orderType === "delivery") {
      const street = String(body.address || "").trim();
      const number = String(body.addressNumber || "").trim();
      if (!street) {
        res.status(400).json({ error: "Informe o endereço de entrega." }); return;
      }
      if (!number) {
        res.status(400).json({ error: "Informe o número do imóvel." }); return;
      }
    }

    const adminSession = tryGetCompanySession(req);
    const isAttendantOrder =
      body.source === "attendant"
      && !!adminSession
      && adminSession.companyId === companyId;

    // Online storefront must respect business hours / manual close.
    // Attendant panel orders (authenticated) may still be placed when closed.
    if (!isAttendantOrder) {
      const hours = await getOrCreateBusinessHours(companyId);
      const storeStatus = evaluateStoreStatus(hours);
      if (!storeStatus.isOpen) {
        const detail = storeStatus.nextOpenLabel ? ` ${storeStatus.nextOpenLabel}` : "";
        res.status(403).json({
          error: `${storeStatus.message}${detail}`.trim(),
          storeClosed: true,
          reason: storeStatus.reason,
          nextOpenTime: storeStatus.nextOpenTime,
          nextOpenLabel: storeStatus.nextOpenLabel,
        });
        return;
      }
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

    const DELIVERY_FEE_UNAVAILABLE =
      "Ainda não conseguimos calcular a taxa de entrega para este endereço. Verifique o endereço ou fale conosco.";

    let deliveryFee = 0;
    /** True only when a KM tier or active neighborhood zone produced a fee (0 is allowed if configured). */
    let deliveryFeeResolved = false;
    let customerDistanceKm: number | null = null;

    if (body.orderType === "delivery") {
      // Áreas de Entrega (map polygons) — when enabled, they own coverage + fee.
      const [kmConfigForAreas] = await db
        .select()
        .from(kmDeliveryConfigTable)
        .where(eq(kmDeliveryConfigTable.companyId, companyId))
        .limit(1);
      if (kmConfigForAreas?.areasEnabled) {
        if (!body.customerLat || !body.customerLng) {
          res.status(400).json({
            error: "Informe sua localização para calcular a área de entrega.",
          });
          return;
        }
        const areas = await db
          .select()
          .from(deliveryAreasTable)
          .where(eq(deliveryAreasTable.companyId, companyId));
        const resolved = resolvePointInAreas({
          areasEnabled: true,
          areas,
          lat: body.customerLat,
          lng: body.customerLng,
          baseLat: parseFloat(String(kmConfigForAreas.baseLat ?? 0)),
          baseLng: parseFloat(String(kmConfigForAreas.baseLng ?? 0)),
        });
        if (resolved.status === "blocked") {
          res.status(400).json({
            error: resolved.message || "Não entregamos nesta área.",
            areaStatus: "blocked",
            area: resolved.area,
          });
          return;
        }
        if (resolved.status === "outside" || resolved.fee == null) {
          res.status(400).json({
            error: resolved.message || "Não entregamos nesta região.",
            areaStatus: "outside",
          });
          return;
        }
        deliveryFee = resolved.fee;
        deliveryFeeResolved = true;
        if (resolved.distanceKm != null) customerDistanceKm = resolved.distanceKm;
      }

      // Priority: approved street registry (learned streets) — exact key match.
      const streetKey = normalizeStreetKey(body.address || "");
      if (!deliveryFeeResolved && streetKey) {
        const [knownStreetAny] = await db
          .select()
          .from(deliveryStreetsTable)
          .where(
            and(
              eq(deliveryStreetsTable.companyId, companyId),
              eq(deliveryStreetsTable.streetKey, streetKey),
            ),
          )
          .limit(1);
        if (knownStreetAny && !knownStreetAny.active) {
          res.status(400).json({
            error:
              "Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.",
          });
          return;
        }
        if (knownStreetAny && knownStreetAny.active) {
          const fee = parseFloat(String(knownStreetAny.fee));
          if (Number.isFinite(fee)) {
            deliveryFee = fee;
            deliveryFeeResolved = true;
          }
          if (knownStreetAny.distanceKm != null) {
            customerDistanceKm = parseFloat(String(knownStreetAny.distanceKm));
          }
        }
      }

      if (!deliveryFeeResolved && body.customerLat && body.customerLng) {
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
              if (fee !== null && Number.isFinite(fee)) {
                deliveryFee = fee;
                deliveryFeeResolved = true;
              }
            }
          }
        }
      }

      // Neighborhood fallback — same conditions as before (only when KM did not measure distance).
      if (!deliveryFeeResolved && deliveryFee === 0 && !customerDistanceKm && body.neighborhood) {
        const [zone] = await db
          .select()
          .from(deliveryZonesTable)
          .where(
            and(
              eq(deliveryZonesTable.companyId, companyId),
              eq(deliveryZonesTable.active, true),
              sql`LOWER(neighborhood) = LOWER(${body.neighborhood})`,
            ),
          );
        if (zone) {
          const fee = parseFloat(zone.fee);
          if (Number.isFinite(fee)) {
            deliveryFee = fee;
            deliveryFeeResolved = true;
          }
        }
      }

      if (!deliveryFeeResolved) {
        res.status(400).json({ error: DELIVERY_FEE_UNAVAILABLE });
        return;
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

    // Clube fidelity: 100% off one eligible hamburger (never combos). Delivery fee still charged.
    let fidelityDiscount = 0;
    let fidelityRewardId: string | null = null;
    let fidelityFreeProductId: number | null = null;
    let fidelityFreeProductName: string | null = null;
    const wantFidelity =
      typeof body.fidelityRewardId === "string" &&
      body.fidelityRewardId.trim() &&
      typeof body.fidelityFreeProductId === "number";

    if (wantFidelity) {
      const freeProductId = body.fidelityFreeProductId!;
      const freeItem = validatedItems.find((i) => i.productId === freeProductId);
      if (!freeItem) {
        res.status(400).json({ error: "Inclua o hambúrguer gratuito no pedido para resgatar a recompensa." });
        return;
      }
      const product = productMap.get(freeProductId);
      if (!product) {
        res.status(400).json({ error: "Produto da recompensa inválido." });
        return;
      }
      let categorySlug: string | null = null;
      let categoryName: string | null = null;
      if (product.categoryId != null) {
        const [cat] = await db
          .select()
          .from(categoriesTable)
          .where(and(eq(categoriesTable.id, product.categoryId), eq(categoriesTable.companyId, companyId)));
        categorySlug = cat?.slug ?? null;
        categoryName = cat?.name ?? null;
      }
      if (!isFidelityFreeBurgerProduct({
        categorySlug,
        categoryName,
        productName: product.name,
      })) {
        res.status(400).json({
          error: "O prêmio é válido apenas para hambúrgueres do cardápio (não inclui Combos).",
        });
        return;
      }

      const orderPhonePreview = normalizeClientPhone(body.phone) || body.phone;
      const memberPreview = await syncClubeMemberOnOrder({
        companyId,
        customerName: body.customerName,
        phone: orderPhonePreview,
        origin: "pedido",
      });
      if (!memberPreview) {
        res.status(400).json({ error: "Não foi possível localizar seu cadastro no Clube Burger." });
        return;
      }
      const { meta: memberMeta } = parseClientNotes(memberPreview.notes);
      const reward = (memberMeta.availableRewards ?? []).find(
        (r) => r.id === body.fidelityRewardId && !r.redeemedAt,
      );
      if (!reward) {
        res.status(400).json({ error: "Recompensa de fidelidade indisponível ou já resgatada." });
        return;
      }

      // 100% off the hamburger unit price (addons still charged).
      fidelityDiscount = Math.min(subtotal, Math.round(freeItem.productPrice * 100) / 100);
      fidelityRewardId = reward.id;
      fidelityFreeProductId = freeProductId;
      fidelityFreeProductName = freeItem.productName;
      discountAmount = Math.min(subtotal, Math.round((discountAmount + fidelityDiscount) * 100) / 100);
    }

    // Cashback redeem — server-side only; never negative / never over balance / respects % cap.
    let cashbackUsedAmount = 0;
    let cashbackMemberId: number | null = null;
    const wantCashback = body.useCashback === true;
    const payableBeforeCashback = roundMoney(Math.max(0, subtotal + deliveryFee - discountAmount));

    if (wantCashback) {
      const orderPhonePreview = normalizeClientPhone(body.phone) || body.phone;
      const memberForCash = await syncClubeMemberOnOrder({
        companyId,
        customerName: body.customerName,
        phone: orderPhonePreview,
        origin: "pedido",
      });

      if (!memberForCash) {
        res.status(400).json({ error: "Não foi possível localizar seu cadastro no Clube Burger para usar cashback." });
        return;
      }

      const [cbSettings] = await db
        .select()
        .from(clubeSettingsTable)
        .where(eq(clubeSettingsTable.companyId, companyId));

      if (cbSettings && cbSettings.cashbackEnabled === false) {
        res.status(400).json({ error: "Cashback está desativado no momento." });
        return;
      }

      const { publicNotes: cbNotes, meta: cbMetaRaw } = parseClientNotes(memberForCash.notes);
      let cbMeta = cbMetaRaw;
      let liveBalance = parseFloat(String(memberForCash.cashbackBalance)) || 0;
      let liveStamps = memberForCash.points ?? 0;

      const expiredCb = applyLazyCashbackExpiry({ balance: liveBalance, meta: cbMeta });
      liveBalance = expiredCb.balance;
      cbMeta = expiredCb.meta;
      const expiredFid = applyLazyFidelityExpiry({ stamps: liveStamps, meta: cbMeta });
      liveStamps = expiredFid.stamps;
      cbMeta = expiredFid.meta;

      if (expiredCb.changed || expiredFid.changed) {
        await db
          .update(clubeMembersTable)
          .set({
            cashbackBalance: liveBalance.toFixed(2),
            points: liveStamps,
            notes: serializeClientNotes(cbNotes, cbMeta),
          })
          .where(and(
            eq(clubeMembersTable.id, memberForCash.id),
            eq(clubeMembersTable.companyId, companyId),
          ));
      }

      cashbackUsedAmount = computeCashbackApplicable({
        balance: liveBalance,
        payableTotal: payableBeforeCashback,
        maxUsePercent: readMaxUsePercent(cbSettings?.cashbackMaxUsePercent),
      });

      if (cashbackUsedAmount <= 0) {
        res.status(400).json({ error: "Você não possui cashback disponível para este pedido." });
        return;
      }
      cashbackMemberId = memberForCash.id;
    }

    const total = Math.max(0, roundMoney(payableBeforeCashback - cashbackUsedAmount));
    const discountAmountStored = roundMoney(discountAmount + cashbackUsedAmount);
    const trackingId = crypto.randomUUID();

    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(order_number), 0)` }).from(ordersTable).where(eq(ordersTable.companyId, companyId));
    const orderNumber = (Number(maxNum) || 0) + 1;

    // Non-Pix: start as Pendente. Pix: waits for payment (MP webhook or manual receipt).
    let pixPayment: { paymentId: string; qrCode: string; qrCodeBase64: string; pixKey?: string } | null = null;
    let pixConfigured = false;
    let pixUnavailableReason: string | null = null;
    const isPix = body.paymentMethod === "pix";
    let pixMode: "online" | "manual" | null = null;
    let mpPaymentId: string | null = null;
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
    if (isAttendantOrder) meta.source = "attendant";

    if (isPix) {
      const [paySettings] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
      const pixCfg = decodePixSettings(paySettings?.gatewayProvider)
        ?? (paySettings?.mercadoPagoPublicKey && !paySettings.mercadoPagoPublicKey.startsWith("APP_USR")
          ? { key: paySettings.mercadoPagoPublicKey, name: "THE BURGER GN", city: "LAURO DE FREITAS" }
          : null);
      const pixManualEnabled = paySettings?.pixManualEnabled !== false;
      const mpSettings = await getMPSettings(companyId);
      const onlineAvailable = !!mpSettings;
      const requestedMode = body.pixMode === "online" || body.pixMode === "manual" ? body.pixMode : null;
      const useOnline = requestedMode === "online"
        ? true
        : requestedMode === "manual"
          ? false
          : onlineAvailable;

      if (useOnline) {
        if (!mpSettings) {
          res.status(400).json({
            error: "PIX Online indisponível no momento. Use o PIX Manual ou tente novamente.",
          });
          return;
        }
        const [companyRow] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
        const slug = companyRow?.slug || req.companySlug || "burger-gn";
        const notificationUrl = mercadoPagoNotificationUrl(req, slug);
        const mp = await createPixPayment({
          accessToken: mpSettings.accessToken,
          total,
          trackingId,
          customerName: body.customerName,
          phone: body.phone,
          notificationUrl,
        });
        if (!mp?.qrCode) {
          res.status(502).json({
            error: "Não foi possível gerar o PIX Online do Mercado Pago. Tente novamente ou use o PIX Manual.",
          });
          return;
        }
        pixMode = "online";
        pixConfigured = true;
        mpPaymentId = mp.paymentId;
        pixPayment = {
          paymentId: mp.paymentId,
          qrCode: mp.qrCode,
          qrCodeBase64: mp.qrCodeBase64 || "",
        };
        meta.pixMode = "online";
        meta.pixCopyPaste = mp.qrCode;
      } else {
        if (!pixManualEnabled) {
          res.status(400).json({ error: "PIX Manual está desativado. Use o PIX Online." });
          return;
        }
        pixMode = "manual";
        meta.pixMode = "manual";
        const pixKey = pixCfg?.key?.trim() || "";
        if (pixKey) {
          pixConfigured = true;
          const qrCode = buildStaticPixPayload({
            key: pixKey,
            merchantName: pixCfg!.name,
            merchantCity: pixCfg!.city,
            amount: total,
            description: `PEDIDO${orderNumber}`,
          });
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
    }

    // CRM: find/create client by WhatsApp (origin "Pedido"). Never blocks the order.
    const orderPhone = normalizeClientPhone(body.phone) || body.phone;
    let syncedMemberId: number | null = null;
    try {
      const member = await syncClubeMemberOnOrder({
        companyId,
        customerName: body.customerName,
        phone: orderPhone,
        origin: "pedido",
      });
      if (member?.id) {
        meta.clientMemberId = member.id;
        syncedMemberId = member.id;
      }
      if (fidelityRewardId) {
        meta.fidelityRewardId = fidelityRewardId;
        if (fidelityFreeProductId != null) meta.fidelityFreeProductId = fidelityFreeProductId;
        if (fidelityFreeProductName) meta.fidelityFreeProductName = fidelityFreeProductName;
        meta.fidelityDiscountAmount = fidelityDiscount;
      }
      if (cashbackUsedAmount > 0) {
        meta.cashbackUsedAmount = cashbackUsedAmount;
      }
    } catch (syncErr) {
      req.log.warn({ err: syncErr }, "Clube/CRM member sync skipped");
    }

    const notesSerialized = serializeOrderNotes(body.notes ?? "", meta);

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        companyId,
        orderNumber, trackingId,
        customerName: body.customerName, phone: orderPhone,
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
        discountAmount: String(discountAmountStored.toFixed(2)),
        couponCode: validatedCouponCode,
        total: String(total.toFixed(2)),
        mpPaymentId,
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

      // Finalize fidelity redeem after the order exists (same cadastro, no duplicate).
      if (fidelityRewardId && syncedMemberId) {
        const [memberRow] = await tx
          .select()
          .from(clubeMembersTable)
          .where(and(
            eq(clubeMembersTable.id, syncedMemberId),
            eq(clubeMembersTable.companyId, companyId),
          ));
        if (memberRow) {
          const { publicNotes, meta: memberMeta } = parseClientNotes(memberRow.notes);
          const redeemed = redeemAvailableReward(memberMeta, fidelityRewardId, {
            orderId: order.id,
            orderNumber,
          });
          if (redeemed) {
            await tx
              .update(clubeMembersTable)
              .set({ notes: serializeClientNotes(publicNotes, redeemed.meta) })
              .where(and(
                eq(clubeMembersTable.id, syncedMemberId),
                eq(clubeMembersTable.companyId, companyId),
              ));
          }
        }
      }

      // Debit cashback atomically (balance check prevents overdraft / double-spend races).
      if (cashbackUsedAmount > 0 && cashbackMemberId) {
        const [memberRow] = await tx
          .select()
          .from(clubeMembersTable)
          .where(and(
            eq(clubeMembersTable.id, cashbackMemberId),
            eq(clubeMembersTable.companyId, companyId),
          ));
        if (!memberRow) {
          throw new Error("CASHBACK_MEMBER_MISSING");
        }
        const { publicNotes, meta: memberMeta } = parseClientNotes(memberRow.notes);
        if (hasLedgerForOrder(memberMeta, order.id, "cashback_utilizado")) {
          // Already debited for this order — skip.
        } else {
          let liveBalance = parseFloat(String(memberRow.cashbackBalance)) || 0;
          const expired = applyLazyCashbackExpiry({ balance: liveBalance, meta: memberMeta });
          liveBalance = expired.balance;
          let nextMeta = expired.meta;
          const apply = Math.min(cashbackUsedAmount, liveBalance);
          if (apply + 0.001 < cashbackUsedAmount || apply <= 0) {
            throw new Error("CASHBACK_INSUFFICIENT");
          }
          const before = liveBalance;
          const after = roundMoney(liveBalance - apply);
          nextMeta = appendClientLedger(nextMeta, {
            at: new Date().toISOString(),
            type: "cashback_utilizado",
            orderId: order.id,
            orderNumber,
            cashbackDelta: -apply,
            balanceBefore: before,
            balanceAfter: after,
            description: `Cashback utilizado no pedido #${orderNumber}`,
          });
          const updated = await tx
            .update(clubeMembersTable)
            .set({
              cashbackBalance: after.toFixed(2),
              notes: serializeClientNotes(publicNotes, nextMeta),
            })
            .where(and(
              eq(clubeMembersTable.id, cashbackMemberId),
              eq(clubeMembersTable.companyId, companyId),
              sql`CAST(${clubeMembersTable.cashbackBalance} AS NUMERIC) >= ${apply}`,
            ))
            .returning({ id: clubeMembersTable.id });
          if (!updated.length) {
            throw new Error("CASHBACK_INSUFFICIENT");
          }
        }
      }

      return order;
    });

    const fullOrder = await getOrderWithItems(result.id);
    // Public Pix waits for receipt/webhook before the board. Attendant orders show immediately.
    if (!isPix || isAttendantOrder) {
      broadcastSSE(companyId, "new_order", fullOrder);
    }

    // Link pending street analysis request to this order (learning module).
    if (body.orderType === "delivery" && body.address) {
      try {
        const streetKey = normalizeStreetKey(body.address);
        if (streetKey) {
          const [pending] = await db
            .select()
            .from(deliveryStreetRequestsTable)
            .where(
              and(
                eq(deliveryStreetRequestsTable.companyId, companyId),
                eq(deliveryStreetRequestsTable.streetKey, streetKey),
                eq(deliveryStreetRequestsTable.status, "pending"),
              ),
            )
            .limit(1);
          if (pending) {
            await db
              .update(deliveryStreetRequestsTable)
              .set({
                orderId: result.id,
                orderNumber,
                customerName: body.customerName,
                phone: orderPhone,
                updatedAt: new Date(),
              })
              .where(eq(deliveryStreetRequestsTable.id, pending.id));
          }
        }
      } catch (linkErr) {
        req.log.warn({ err: linkErr }, "Street request link skipped");
      }
    }

    // cardCheckoutUrl kept null — online card checkout is reserved for a later switch.
    res.status(201).json({
      ok: true, trackingId, orderNumber, orderId: result.id,
      deliveryFee, distanceKm: customerDistanceKm,
      discountAmount: discountAmountStored,
      cashbackUsedAmount,
      couponCode: validatedCouponCode,
      pixPayment, pixConfigured, pixUnavailableReason, pixMode,
      cardCheckoutUrl: null,
      paymentStatus: "pending",
      workflow: isPix ? "awaiting_payment" : "new",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "CASHBACK_INSUFFICIENT" || msg === "CASHBACK_MEMBER_MISSING") {
      res.status(409).json({
        error: "Cashback indisponível ou saldo insuficiente. Atualize a página e tente novamente.",
      });
      return;
    }
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

/** Daily prep-timer stats for the kitchen dashboard (additive). */
router.get("/admin/prep-stats", requireCompanyAuth, async (req, res) => {
  try {
    const orders = await db
      .select({ notes: ordersTable.notes })
      .from(ordersTable)
      .where(eq(ordersTable.companyId, req.companyId!));
    const metas = orders.map((o) => parseOrderNotes(o.notes).meta);
    res.json(computePrepDayStats(metas));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch prep stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Track order (public)
router.get("/orders/track/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params as { trackingId: string };
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    // Backup to the official webhook: if PIX Online is still pending, re-fetch Mercado Pago.
    if (order.paymentMethod === "pix" && order.paymentStatus === "pending" && order.mpPaymentId) {
      const token = await getMPAccessToken(order.companyId);
      if (token) {
        const payment = await fetchMPPayment(token, order.mpPaymentId);
        if (payment?.status) {
          await applyMercadoPagoStatus({
            companyId: order.companyId,
            trackingId: order.trackingId,
            paymentId: payment.id,
            mpStatus: payment.status,
          });
        }
      }
    }

    const [fresh] = await db.select().from(ordersTable).where(eq(ordersTable.trackingId, trackingId));
    let live = fresh ?? order;
    const { publicNotes, meta } = parseOrderNotes(live.notes);
    if (
      live.status === "done"
      && !meta.rewardsProcessedAt
      && !meta.cashbackAwarded
      && !meta.stampsAwarded
    ) {
      try {
        const rewardResult = await applyOrderCompletionRewards(
          {
            id: live.id,
            orderNumber: live.orderNumber,
            companyId: live.companyId,
            customerName: live.customerName,
            phone: live.phone,
            total: live.total,
            status: live.status,
            paymentMethod: live.paymentMethod,
            paymentStatus: live.paymentStatus,
          },
          meta,
        );
        const rewarded = rewardResult.meta;
        if (
          rewarded.cashbackAwarded
          || rewarded.stampsAwarded
          || rewarded.rewardsProcessedAt
          || rewarded.clientMemberId !== meta.clientMemberId
        ) {
          const [updated] = await db.update(ordersTable)
            .set({
              notes: serializeOrderNotes(publicNotes, rewarded),
              updatedAt: new Date(),
            })
            .where(eq(ordersTable.id, live.id))
            .returning();
          if (updated) live = updated;
        }
      } catch (rewardErr) {
        req.log.error({ err: rewardErr }, "Failed to sync rewards on track");
      }
    }

    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, live.id));
    res.json({ ...enrichOrder(live, { includeReceiptBytes: false }), items });
  } catch (err) {
    req.log.error({ err }, "Failed to track order");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Edit items of an existing accepted order (admin).
 * Does NOT create a new order, does NOT reset workflow/prep timer/order number.
 */
router.put("/orders/:id/items", requireCompanyAuth, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params["id"]);
    const body = req.body as {
      items?: Array<{
        productId?: number;
        productName: string;
        productPrice: number;
        quantity: number;
        addons?: Array<{ name: string; price: number }>;
        notes?: string;
      }>;
      notes?: string;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: "Informe ao menos um item." });
      return;
    }
    if (body.items.some((i) => !i.quantity || i.quantity <= 0)) {
      res.status(400).json({ error: "Quantidade inválida." });
      return;
    }

    const [existing] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, companyId)));
    if (!existing) {
      res.status(404).json({ error: "Pedido não encontrado" });
      return;
    }

    const { publicNotes, meta } = parseOrderNotes(existing.notes);
    const workflow = resolveWorkflow(existing.status, meta);

    if (
      existing.status === "cancelled"
      || workflow === "cancelled"
      || workflow === "finalized"
      || workflow === "done"
      || workflow === "awaiting_payment"
    ) {
      res.status(400).json({
        error: "Este pedido não pode ser editado no status atual.",
      });
      return;
    }

    // Accepted kitchen orders only (not pending "new" / awaiting payment).
    const editable =
      workflow === "preparing"
      || workflow === "ready"
      || workflow === "out"
      || workflow === "accepted";
    if (!editable) {
      res.status(400).json({ error: "Pedido não elegível para edição." });
      return;
    }

    const productIds = [
      ...new Set(
        body.items
          .map((i) => i.productId)
          .filter((pid): pid is number => typeof pid === "number"),
      ),
    ];
    const dbProducts = productIds.length
      ? await db
          .select()
          .from(productsTable)
          .where(and(eq(productsTable.companyId, companyId), inArray(productsTable.id, productIds)))
      : [];
    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    const validatedItems: Array<{
      productId: number | null;
      productName: string;
      productPrice: number;
      quantity: number;
      addons: Array<{ name: string; price: number }>;
      notes: string;
      subtotal: number;
    }> = [];

    for (const i of body.items) {
      let productPrice = Number(i.productPrice) || 0;
      let validatedAddons: Array<{ name: string; price: number }> = [];
      let productName = String(i.productName || "").trim();

      if (typeof i.productId === "number") {
        const product = productMap.get(i.productId);
        if (!product) {
          res.status(400).json({ error: `Produto "${productName || i.productId}" inválido.` });
          return;
        }
        // Keep kitchen edits even if product later marked sold-out.
        productPrice = parseFloat(product.price);
        productName = product.name;
        const dbAddons = (product.addons ?? []) as Array<{ name: string; price: number }>;
        validatedAddons = (i.addons ?? [])
          .map((sel) => dbAddons.find((a) => a.name === sel.name))
          .filter((a): a is { name: string; price: number } => !!a);
      } else {
        validatedAddons = (i.addons ?? []).map((a) => ({
          name: String(a.name || "").slice(0, 120),
          price: Number(a.price) || 0,
        }));
      }

      if (!productName) {
        res.status(400).json({ error: "Nome do produto obrigatório." });
        return;
      }

      const addonsTotal = validatedAddons.reduce((acc, a) => acc + a.price, 0);
      const lineSubtotal = (productPrice + addonsTotal) * i.quantity;
      validatedItems.push({
        productId: typeof i.productId === "number" ? i.productId : null,
        productName,
        productPrice,
        quantity: i.quantity,
        addons: validatedAddons,
        notes: String(i.notes ?? "").slice(0, 500),
        subtotal: lineSubtotal,
      });
    }

    const subtotal = validatedItems.reduce((acc, i) => acc + i.subtotal, 0);
    const deliveryFee = parseFloat(String(existing.deliveryFee)) || 0;
    const discountAmount = parseFloat(String(existing.discountAmount)) || 0;
    const total = Math.max(0, Math.round((subtotal + deliveryFee - discountAmount) * 100) / 100);

    // Preserve prep timer, payment, rewards — only append edit history.
    const editAt = new Date().toISOString();
    const historyStage: WorkflowStage =
      workflow === "accepted" ? "preparing" : (workflow as WorkflowStage);
    const history = [...(meta.history ?? [])];
    history.push({
      stage: historyStage,
      label: "Pedido editado",
      at: editAt,
    });
    const nextMeta: OrderMeta = { ...meta, history };

    const nextPublicNotes =
      body.notes !== undefined ? String(body.notes).slice(0, 2000) : publicNotes;

    await db.transaction(async (tx) => {
      await tx.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
      await tx.insert(orderItemsTable).values(
        validatedItems.map((i) => ({
          orderId: id,
          productId: i.productId,
          productName: i.productName,
          productPrice: String(i.productPrice.toFixed(2)),
          quantity: i.quantity,
          addons: i.addons,
          notes: i.notes,
          subtotal: String(i.subtotal.toFixed(2)),
        })),
      );
      await tx
        .update(ordersTable)
        .set({
          subtotal: String(subtotal.toFixed(2)),
          total: String(total.toFixed(2)),
          notes: serializeOrderNotes(nextPublicNotes, nextMeta),
        })
        .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, companyId)));
    });

    const fullOrder = await getOrderWithItems(id);
    broadcastSSE(companyId, "order_updated", fullOrder);
    res.json(fullOrder);
  } catch (err) {
    req.log.error({ err }, "Failed to edit order items");
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
    const currentWorkflow = resolveWorkflow(existing.status, meta);
    let nextStatus = existing.status as "new" | "preparing" | "delivery" | "done" | "cancelled";
    let nextMeta = { ...meta };
    let notifyStage: WorkflowStage | "cancelled" | null = null;

    // Accepting a pending order jumps straight to "Em preparo" (no auto-accept on create).
    let requestedWorkflow = body.workflow;
    if (requestedWorkflow === "accepted") {
      requestedWorkflow = "preparing";
    }

    // Finalized orders are closed — never return to operational stages.
    if (
      currentWorkflow === "finalized"
      && requestedWorkflow
      && requestedWorkflow !== "finalized"
    ) {
      res.status(400).json({
        error: "Pedido finalizado não pode voltar ao fluxo operacional.",
      });
      return;
    }

    // Finalize only from Entregue (done), or idempotent re-finalize.
    if (requestedWorkflow === "finalized" && currentWorkflow !== "done" && currentWorkflow !== "finalized") {
      res.status(400).json({
        error: "Só é possível finalizar pedidos com status Entregue.",
      });
      return;
    }

    // Pix: kitchen accept only after admin confirms payment manually.
    const advancingToKitchen =
      requestedWorkflow === "preparing" ||
      requestedWorkflow === "ready" ||
      requestedWorkflow === "out" ||
      requestedWorkflow === "done" ||
      requestedWorkflow === "finalized" ||
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
      if (currentWorkflow === "finalized") {
        res.status(400).json({
          error: "Pedido finalizado não pode ser alterado.",
        });
        return;
      }
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
      notifyStage = wf === "finalized" ? null : wf;
      if ((wf === "done" || wf === "finalized") && !nextMeta.deliveredAt) {
        nextMeta.deliveredAt = new Date().toISOString();
      }
      if (wf === "finalized" && !nextMeta.finalizedAt) {
        nextMeta.finalizedAt = new Date().toISOString();
      }
      if (wf === "preparing") {
        const times = await loadCompanyPrepTimes(req.companyId!);
        nextMeta = startPrepTimer(nextMeta, times);
      }
      if (wf === "ready" || wf === "out" || wf === "done" || wf === "finalized") {
        nextMeta = finishPrepTimer(nextMeta);
      }
    } else if (body.status && ["new", "preparing", "delivery", "done"].includes(body.status)) {
      if (currentWorkflow === "finalized") {
        res.status(400).json({
          error: "Pedido finalizado não pode voltar ao fluxo operacional.",
        });
        return;
      }
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
      if (mapped === "preparing") {
        const times = await loadCompanyPrepTimes(req.companyId!);
        nextMeta = startPrepTimer(nextMeta, times);
      }
      if (mapped === "out" || mapped === "done") {
        nextMeta = finishPrepTimer(nextMeta);
      }
    } else {
      res.status(400).json({ error: "Invalid status" }); return;
    }

    // Automatic fidelity + cashback when order reaches done (idempotent).
    if (nextStatus === "done") {
      try {
        const rewardResult = await applyOrderCompletionRewards(
          {
            id: existing.id,
            orderNumber: existing.orderNumber,
            companyId: req.companyId!,
            customerName: existing.customerName,
            phone: existing.phone,
            total: existing.total,
            status: "done",
            paymentMethod: existing.paymentMethod,
            paymentStatus: existing.paymentStatus,
          },
          nextMeta,
        );
        nextMeta = rewardResult.meta;
      } catch (rewardErr) {
        // Never block order completion if CRM rewards fail.
        req.log.error({ err: rewardErr }, "Failed to apply order completion rewards");
      }
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

    // Ensure CRM member + stamp/cashback for this delivered order (idempotent).
    // Runs even when the review was already saved, so the Clube area always syncs.
    let nextMeta: OrderMeta = { ...meta };
    try {
      const rewardResult = await applyOrderCompletionRewards(
        {
          id: existing.id,
          orderNumber: existing.orderNumber,
          companyId: existing.companyId,
          customerName: existing.customerName,
          phone: existing.phone,
          total: existing.total,
          status: "done",
          paymentMethod: existing.paymentMethod,
          paymentStatus: existing.paymentStatus,
        },
        nextMeta,
      );
      nextMeta = rewardResult.meta;
    } catch (rewardErr) {
      req.log.error({ err: rewardErr }, "Failed to sync Clube rewards on review");
    }

    let alreadyReviewed = false;
    let order = existing;

    if (meta.review) {
      alreadyReviewed = true;
      // Persist reward meta / clientMemberId if they were missing before.
      if (
        nextMeta.clientMemberId !== meta.clientMemberId ||
        nextMeta.stampsAwarded !== meta.stampsAwarded ||
        nextMeta.cashbackAwarded !== meta.cashbackAwarded ||
        nextMeta.rewardsProcessedAt !== meta.rewardsProcessedAt
      ) {
        const [updated] = await db.update(ordersTable)
          .set({
            notes: serializeOrderNotes(publicNotes, { ...nextMeta, review: meta.review }),
            updatedAt: new Date(),
          })
          .where(eq(ordersTable.id, existing.id))
          .returning();
        if (updated) order = updated;
        else nextMeta = { ...nextMeta, review: meta.review };
      } else {
        nextMeta = { ...nextMeta, review: meta.review };
      }
    } else {
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

      nextMeta = { ...nextMeta, review };
      const [updated] = await db.update(ordersTable)
        .set({ notes: serializeOrderNotes(publicNotes, nextMeta), updatedAt: new Date() })
        .where(eq(ordersTable.id, existing.id))
        .returning();
      order = updated;

      broadcastSSE(existing.companyId, "order_review", {
        id: order.id,
        trackingId: order.trackingId,
        orderNumber: order.orderNumber,
        review,
      });
    }

    let clube: PublicClubeMePayload | null = null;
    try {
      clube = await buildPublicClubeMe(existing.companyId, existing.phone, {
        memberId: typeof nextMeta.clientMemberId === "number" ? nextMeta.clientMemberId : null,
      });
    } catch (clubeErr) {
      req.log.warn({ err: clubeErr }, "Clube payload after review unavailable");
    }

    res.json({
      ...enrichOrder(order),
      alreadyReviewed,
      clube,
    });
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
    if (meta.pixMode === "online") {
      res.status(400).json({
        error: "Este pedido usa PIX Online. O pagamento é confirmado automaticamente pelo Mercado Pago.",
      });
      return;
    }
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

    const enriched = {
      ...enrichOrder(order, { includeReceiptBytes: false }),
      items: (await getOrderWithItems(order.id))?.items ?? [],
    };

    // First receipt (or resubmit after refuse) surfaces the order in the admin queue.
    // Do not broadcast/return the raw image bytes — that payload is large enough to
    // fail the HTTP response after the comprovante was already saved.
    broadcastSSE(existing.companyId, "new_order", enriched);
    broadcastSSE(existing.companyId, "order_receipt", {
      id: order.id,
      trackingId: order.trackingId,
      receiptUploadedAt: nextMeta.receiptUploadedAt,
      hasReceipt: true,
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

/**
 * One-shot data repair for legacy orders #3 and #7 only.
 * They reached Entregue (done) on 2026-08-05 with PIX still pending — before the
 * payment-conference gate. Finalize is correctly blocked for unpaid PIX; this
 * does NOT change that logic. It only marks those two already-delivered records
 * as paid so the existing FINALIZAR PEDIDO path can run.
 */
const LEGACY_STUCK_DELIVERED_PIX = new Set([3, 7]);

router.post("/admin/repair-legacy-delivered-pix", requireCompanyAuth, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.companyId, req.companyId!));
    const repaired: Array<{ id: number; orderNumber: number }> = [];
    const skipped: Array<{ orderNumber: number; reason: string }> = [];

    for (const existing of orders) {
      if (!LEGACY_STUCK_DELIVERED_PIX.has(existing.orderNumber)) continue;
      const { publicNotes, meta } = parseOrderNotes(existing.notes);
      const wf = resolveWorkflow(existing.status, meta);
      if (existing.paymentMethod !== "pix" || existing.paymentStatus !== "pending") {
        skipped.push({ orderNumber: existing.orderNumber, reason: "not unpaid pix" });
        continue;
      }
      if (existing.status !== "done" || wf !== "done") {
        skipped.push({ orderNumber: existing.orderNumber, reason: `not delivered (status=${existing.status} wf=${wf})` });
        continue;
      }
      const nextMeta = appendHistory(
        meta,
        "done",
        "Pagamento PIX regularizado (pedido legado já entregue)",
      );
      await db.update(ordersTable)
        .set({
          paymentStatus: "paid",
          notes: serializeOrderNotes(publicNotes, nextMeta),
          updatedAt: new Date(),
        })
        .where(and(eq(ordersTable.id, existing.id), eq(ordersTable.companyId, req.companyId!)));
      repaired.push({ id: existing.id, orderNumber: existing.orderNumber });
    }

    res.json({ ok: true, repaired, skipped });
  } catch (err) {
    req.log.error({ err }, "Failed to repair legacy delivered PIX orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
