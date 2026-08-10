const BASE = "/api";

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch { /* keep raw text */ }
    throw new Error(message);
  }
  return res.json();
}

const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body: unknown) => request("POST", path, body),
  put: (path: string, body: unknown) => request("PUT", path, body),
  patch: (path: string, body: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
};

// ── Haversine (client-side distance) ─────────────────────────────────────────
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findKmTier(
  distanceKm: number,
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }> | null | undefined
): { fee: number | null; consult: boolean } {
  // Guard: API/legacy payloads may omit tiers — spreading null crashes checkout while typing address.
  if (!Array.isArray(tiers) || tiers.length === 0 || !Number.isFinite(distanceKm)) {
    return { fee: null, consult: true };
  }
  const sorted = [...tiers].sort((a, b) => parseFloat(String(a.fromKm)) - parseFloat(String(b.fromKm)));
  for (const tier of sorted) {
    const from = parseFloat(String(tier.fromKm));
    const to = tier.toKm !== null && tier.toKm !== undefined ? parseFloat(String(tier.toKm)) : Infinity;
    if (!Number.isFinite(from)) continue;
    if (distanceKm >= from && distanceKm <= to) {
      return { fee: tier.fee !== null && tier.fee !== undefined ? parseFloat(String(tier.fee)) : null, consult: tier.fee === null };
    }
  }
  return { fee: null, consult: true };
}

// ── Categories ────────────────────────────────────────────────────────────────
export interface Category { id: number; name: string; slug: string; displayOrder: number; active: boolean; }
export const getCategories = () => api.get("/categories") as Promise<Category[]>;
export const getAdminCategories = () => api.get("/admin/categories") as Promise<Category[]>;
export const createCategory = (d: Partial<Category>) => api.post("/admin/categories", d) as Promise<Category>;
export const updateCategory = (id: number, d: Partial<Category>) => api.put(`/admin/categories/${id}`, d) as Promise<Category>;
export const deleteCategory = (id: number) => api.delete(`/admin/categories/${id}`);

// ── Products ──────────────────────────────────────────────────────────────────
export interface Addon { name: string; price: number; }
export interface Product { id: number; name: string; description: string; price: string; categoryId: number | null; image: string; videoUrl: string; ingredients: string[]; addons: Addon[]; available: boolean; displayOrder: number; categorySlug: string | null; categoryName: string | null; }

/** Normalize API product payloads so null JSON fields never crash the mobile UI. */
export function normalizeProduct(p: Product): Product {
  return {
    ...p,
    description: p.description ?? "",
    image: p.image ?? "",
    videoUrl: p.videoUrl ?? "",
    price: p.price ?? "0",
    ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
    addons: Array.isArray(p.addons) ? p.addons : [],
  };
}

export const getProducts = () =>
  api.get("/products").then((list: Product[]) => (Array.isArray(list) ? list.map(normalizeProduct) : [])) as Promise<Product[]>;
export const getAdminProducts = () => api.get("/admin/products") as Promise<Product[]>;
export const createProduct = (d: Partial<Product>) => api.post("/admin/products", d) as Promise<Product>;
export const updateProduct = (id: number, d: Partial<Product>) => api.put(`/admin/products/${id}`, d) as Promise<Product>;
export const deleteProduct = (id: number) => api.delete(`/admin/products/${id}`);

// ── Delivery Zones (neighborhood) ─────────────────────────────────────────────
export interface DeliveryZone { id: number; neighborhood: string; fee: string; active: boolean; createdAt: string; }
export interface DeliveryFeeResult { found: boolean; neighborhood: string; fee: number | null; message?: string; zoneId?: number; }
export const getDeliveryZones = () => api.get("/delivery-zones") as Promise<DeliveryZone[]>;
export const getDeliveryFee = (neighborhood: string) => api.get(`/delivery-zones/fee?neighborhood=${encodeURIComponent(neighborhood)}`) as Promise<DeliveryFeeResult>;
export const getAdminDeliveryZones = () => api.get("/admin/delivery-zones") as Promise<DeliveryZone[]>;
export const createDeliveryZone = (d: { neighborhood: string; fee: string; active?: boolean }) => api.post("/admin/delivery-zones", d) as Promise<DeliveryZone>;
export const updateDeliveryZone = (id: number, d: Partial<DeliveryZone>) => api.put(`/admin/delivery-zones/${id}`, d) as Promise<DeliveryZone>;
export const deleteDeliveryZone = (id: number) => api.delete(`/admin/delivery-zones/${id}`);

// ── KM Delivery ───────────────────────────────────────────────────────────────
export interface KmDeliveryTier { id: number; fromKm: string; toKm: string | null; fee: string | null; displayOrder: number; createdAt: string; }
export interface KmDeliveryConfig { id: number; enabled: boolean; baseAddress: string; baseLat: string; baseLng: string; minFee: string; feePerKm: string; maxDistanceKm: string; updatedAt: string; tiers: KmDeliveryTier[]; }
export interface KmFeeResult { enabled: boolean; distanceKm?: number; fee: number | null; consult?: boolean; message?: string; }

export const getKmDeliveryConfig = () =>
  api.get("/delivery/km-config").then((cfg: KmDeliveryConfig) => ({
    ...cfg,
    enabled: !!cfg?.enabled,
    baseLat: cfg?.baseLat ?? "0",
    baseLng: cfg?.baseLng ?? "0",
    maxDistanceKm: cfg?.maxDistanceKm ?? "0",
    tiers: Array.isArray(cfg?.tiers) ? cfg.tiers : [],
  })) as Promise<KmDeliveryConfig>;
export const calculateKmFee = (lat: number, lng: number) => api.post("/delivery/calculate-fee", { lat, lng }) as Promise<KmFeeResult>;
export const getAdminKmDelivery = () => api.get("/admin/km-delivery") as Promise<{ config: KmDeliveryConfig | null; tiers: KmDeliveryTier[] }>;
export const updateKmDeliveryConfig = (d: Partial<KmDeliveryConfig>) => api.put("/admin/km-delivery", d) as Promise<KmDeliveryConfig>;
export const createKmTier = (d: { fromKm: string; toKm?: string | null; fee?: string | null; displayOrder?: number }) => api.post("/admin/km-delivery/tiers", d) as Promise<KmDeliveryTier>;
export const updateKmTier = (id: number, d: Partial<KmDeliveryTier>) => api.put(`/admin/km-delivery/tiers/${id}`, d) as Promise<KmDeliveryTier>;
export const deleteKmTier = (id: number) => api.delete(`/admin/km-delivery/tiers/${id}`);

// ── Import Cardápio ────────────────────────────────────────────────────────────
export interface ImportDraftCategory { name: string; slug: string; }
export interface ImportDraftProduct { name: string; description: string; price: number; image: string; available: boolean; categorySlug: string; categoryName: string; include?: boolean; }
export interface ImportDraft { categories: ImportDraftCategory[]; products: ImportDraftProduct[]; }
export interface ImportCommitResult { ok: boolean; categoriesCreated: number; productsCreated: number; productsSkipped: number; }

export const parseImportText = (text: string) => api.post("/admin/import/parse", { text }) as Promise<ImportDraft>;
export const fetchImportLink = (url: string) => api.post("/admin/import/fetch-link", { url }) as Promise<ImportDraft>;
export const commitImport = (draft: ImportDraft) => api.post("/admin/import/commit", draft) as Promise<ImportCommitResult>;

// Nominatim geocoding (free, no API key needed)
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt-BR", "User-Agent": "TheBurgerGN/1.0" } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch { return null; }
}

export interface ReverseGeocodeResult {
  endereco: string;
  numero: string;
  bairro: string;
  displayName: string;
}

/** Resolve street/neighborhood from GPS coords for delivery checkout. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt-BR", "User-Agent": "TheBurgerGN/1.0" } });
    const data = await res.json() as {
      display_name?: string;
      address?: {
        road?: string; pedestrian?: string; residential?: string; street?: string;
        house_number?: string; suburb?: string; neighbourhood?: string; city_district?: string;
        quarter?: string; village?: string;
      };
    };
    const addr = data?.address;
    if (!addr) return null;
    const endereco = addr.road || addr.pedestrian || addr.residential || addr.street || "";
    const numero = addr.house_number || "S/N";
    const bairro = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || addr.village || "";
    return {
      endereco,
      numero,
      bairro,
      displayName: data.display_name || [endereco, numero, bairro].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────
export type OrderStatus = "new" | "preparing" | "delivery" | "done" | "cancelled";
export type WorkflowStage = "awaiting_payment" | "new" | "accepted" | "preparing" | "ready" | "out" | "done";
export type OrderType = "delivery" | "pickup" | "local";
export type PaymentMethod = "pix" | "cash" | "card";
export type CardType = "credit" | "debit";

export interface OrderItem { id: number; orderId: number; productName: string; productPrice: string; quantity: number; addons: Addon[]; notes: string; subtotal: string; }
export type PaymentStatus = "pending" | "paid" | "failed";
export interface StatusHistoryEntry { stage: WorkflowStage | "cancelled"; label: string; at: string; }
export interface Order {
  id: number; orderNumber: number; trackingId: string;
  customerName: string; phone: string;
  address: string; addressNumber: string; addressComplement: string;
  neighborhood: string; reference: string; notes: string;
  customerLat: string | null; customerLng: string | null; distanceKm: string | null;
  orderType: OrderType; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus; changeFor: string | null;
  subtotal: string; deliveryFee: string; discountAmount: string; couponCode: string | null;
  total: string; status: OrderStatus; createdAt: string; updatedAt?: string; items: OrderItem[];
  workflow?: WorkflowStage | "cancelled";
  cardType?: CardType | null;
  needsChange?: boolean | null;
  receiptDataUrl?: string | null;
  receiptUploadedAt?: string | null;
  receiptRejectReason?: string | null;
  receiptRejectedAt?: string | null;
  rejectReason?: string | null;
  review?: OrderReview | null;
  deliveredAt?: string | null;
  history?: StatusHistoryEntry[];
  customerNotifyMessage?: string | null;
}

export interface OrderReview {
  stars: number;
  comment: string;
  deliveredOk: boolean;
  createdAt: string;
  orderNumber: number;
}

export interface AdminReviewRow {
  orderId: number;
  orderNumber: number;
  trackingId: string;
  customerName: string;
  phone: string;
  stars: number;
  comment: string;
  deliveredOk: boolean;
  createdAt: string;
  orderCreatedAt: string;
}
export interface CreateOrderPayload {
  customerName: string; phone: string;
  address?: string; addressNumber?: string; addressComplement?: string;
  neighborhood?: string; reference?: string; notes?: string;
  customerLat?: number; customerLng?: number;
  orderType: OrderType; paymentMethod: PaymentMethod; changeFor?: number;
  cardType?: CardType; needsChange?: boolean;
  couponCode?: string;
  items: Array<{ productId?: number; productName: string; productPrice: number; quantity: number; addons?: Addon[]; notes?: string }>;
}
export interface PixPaymentResult { paymentId: string; qrCode: string; qrCodeBase64: string; pixKey?: string; }
export const createOrder = (d: CreateOrderPayload) => api.post("/orders", d) as Promise<{
  ok: boolean; trackingId: string; orderNumber: number; orderId: number;
  deliveryFee: number; distanceKm: number | null; discountAmount: number; couponCode: string | null;
  pixPayment: PixPaymentResult | null; pixConfigured?: boolean; pixUnavailableReason?: string | null;
  cardCheckoutUrl: string | null; paymentStatus?: PaymentStatus; workflow?: WorkflowStage;
}>;
export const getOrders = () => api.get("/orders") as Promise<Order[]>;
export const trackOrder = (trackingId: string) => api.get(`/orders/track/${trackingId}`) as Promise<Order>;
export const updateOrderStatus = (id: number, status: OrderStatus) => api.patch(`/orders/${id}/status`, { status }) as Promise<Order>;
export const updateOrderWorkflow = (
  id: number,
  workflow: WorkflowStage | "cancelled",
  opts?: { rejectReason?: string },
) =>
  api.patch(`/orders/${id}/status`, { workflow, rejectReason: opts?.rejectReason }) as Promise<Order>;
export const uploadOrderReceipt = (trackingId: string, receiptDataUrl: string) =>
  api.post(`/orders/track/${trackingId}/receipt`, { receiptDataUrl }) as Promise<Order>;
export const submitOrderReview = (
  trackingId: string,
  d: { deliveredOk: boolean; stars?: number; comment?: string },
) => api.post(`/orders/track/${trackingId}/review`, d) as Promise<Order & { alreadyReviewed?: boolean }>;
export const getAdminReviews = () => api.get("/admin/reviews") as Promise<AdminReviewRow[]>;
export const updateOrderPaymentStatus = (
  id: number,
  paymentStatus: PaymentStatus,
  opts?: { refuseReason?: string },
) =>
  api.patch(`/orders/${id}/payment-status`, {
    paymentStatus,
    refuseReason: opts?.refuseReason,
  }) as Promise<Order>;
export const getPopularProducts = () =>
  api.get("/products/popular") as Promise<Array<{ productId: number | null; productName: string; quantity: number }>>;

// ── Coupons ───────────────────────────────────────────────────────────────────
export type DiscountType = "percentage" | "fixed";
export interface Coupon { id: number; code: string; discountType: DiscountType; discountValue: string; minOrderValue: string; maxUses: number | null; usedCount: number; active: boolean; expiresAt: string | null; createdAt: string; }
export interface ValidateCouponResult { valid: boolean; message?: string; code?: string; discountType?: DiscountType; discountValue?: number; discountAmount?: number; }
export const validateCoupon = (code: string, subtotal: number) => api.post("/coupons/validate", { code, subtotal }) as Promise<ValidateCouponResult>;
export const getAdminCoupons = () => api.get("/admin/coupons") as Promise<Coupon[]>;
export const getCouponStats = () => api.get("/admin/coupons/stats") as Promise<{ active: number; totalDiscount: number; totalUses: number }>;
export const createCoupon = (d: Partial<Coupon>) => api.post("/admin/coupons", d) as Promise<Coupon>;
export const updateCoupon = (id: number, d: Partial<Coupon>) => api.put(`/admin/coupons/${id}`, d) as Promise<Coupon>;
export const deleteCoupon = (id: number) => api.delete(`/admin/coupons/${id}`);

// ── Payment Settings ──────────────────────────────────────────────────────────
export interface PaymentSettingsPublic {
  onlinePaymentEnabled: boolean;
  cashOnDeliveryEnabled: boolean;
  pixConfigured?: boolean;
  pixKeyPreview?: string;
  mercadoPagoReady?: boolean;
  prepTimeMin?: number;
  prepTimeMax?: number;
}
export interface PaymentSettingsAdmin {
  id: number; onlinePaymentEnabled: boolean; gatewayProvider: string; cashOnDeliveryEnabled: boolean;
  updatedAt: string;
  mercadoPagoConfigured: boolean; mercadoPagoAccessTokenPreview: string; mercadoPagoPublicKey: string;
  pixKey?: string; pixMerchantName?: string; pixMerchantCity?: string; pixConfigured?: boolean;
  prepTimeMin?: number; prepTimeMax?: number;
}
export const getPaymentSettings = () => api.get("/payment-settings") as Promise<PaymentSettingsPublic>;
export const getAdminPaymentSettings = () => api.get("/admin/payment-settings") as Promise<PaymentSettingsAdmin>;
export const updatePaymentSettings = (d: {
  onlinePaymentEnabled?: boolean; gatewayProvider?: string; cashOnDeliveryEnabled?: boolean;
  mercadoPagoAccessToken?: string; mercadoPagoPublicKey?: string; clearMercadoPagoCredentials?: boolean;
  pixKey?: string; pixMerchantName?: string; pixMerchantCity?: string;
  prepTimeMin?: number; prepTimeMax?: number;
}) => api.put("/admin/payment-settings", d) as Promise<PaymentSettingsAdmin>;

// ── External Links ────────────────────────────────────────────────────────────
export interface ExternalLink { id: number; label: string; url: string; active: boolean; displayOrder: number; createdAt: string; }
export const getExternalLinks = () => api.get("/external-links") as Promise<ExternalLink[]>;
export const getAdminExternalLinks = () => api.get("/admin/external-links") as Promise<ExternalLink[]>;
export const createExternalLink = (d: Partial<ExternalLink>) => api.post("/admin/external-links", d) as Promise<ExternalLink>;
export const updateExternalLink = (id: number, d: Partial<ExternalLink>) => api.put(`/admin/external-links/${id}`, d) as Promise<ExternalLink>;
export const deleteExternalLink = (id: number) => api.delete(`/admin/external-links/${id}`);

// ── Admin Auth ────────────────────────────────────────────────────────────────
export const adminLogin = (email: string, password: string) =>
  api.post("/admin/login", { email, password });
export const adminLogout = () => api.post("/admin/logout", {});
export const adminMe = () => api.get("/admin/me") as Promise<{ authenticated: boolean }>;

// ── WhatsApp Settings ─────────────────────────────────────────────────────────
export interface WhatsappSettings { id: number; number: string; updatedAt: string; }
export const getWhatsappSettings = () => api.get("/whatsapp-settings") as Promise<{ number: string }>;
export const getAdminWhatsappSettings = () => api.get("/admin/whatsapp-settings") as Promise<WhatsappSettings>;
export const updateWhatsappSettings = (d: { number: string }) => api.put("/admin/whatsapp-settings", d) as Promise<WhatsappSettings>;

// ── Config ────────────────────────────────────────────────────────────────────
// Fallback used only until the value configured in the admin panel is fetched.
export const WHATSAPP_NUMBER = "5571996981707";

/**
 * Canonical BR WhatsApp digits (with 55). Keep in sync with API
 * `normalizeClientPhone` in artifacts/api-server/src/lib/clientMeta.ts.
 */
export function normalizePhoneForWhatsapp(phone: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
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

export function buildCustomerNotifyMessage(
  orderNumber: number,
  customerName: string,
  workflow: WorkflowStage | "cancelled" | "payment_confirmed" | "receipt_refused",
  rejectReason?: string | null,
): string {
  const name = (customerName || "cliente").trim().split(/\s+/)[0] || "cliente";
  switch (workflow) {
    case "payment_confirmed":
      return (
        `🎉 Pagamento confirmado com sucesso.\n\n` +
        `Olá ${name}! Seu pedido #${orderNumber} foi enviado para análise da loja.\n` +
        `Aguarde enquanto nossa equipe confirma seu pedido. — The Burger GN`
      );
    case "receipt_refused":
      return (
        `Olá ${name}! Seu comprovante do pedido #${orderNumber} foi recusado.` +
        `${rejectReason ? ` Motivo: ${rejectReason}.` : ""} ` +
        `Você pode enviar um novo comprovante pelo app. — The Burger GN`
      );
    case "preparing":
    case "accepted":
      return `Olá ${name}! Seu pedido #${orderNumber} foi aceito e já está sendo preparado. — The Burger GN`;
    case "ready":
      return `Olá ${name}! Seu pedido #${orderNumber} está pronto! — The Burger GN`;
    case "out":
      return `Olá ${name}! Seu pedido #${orderNumber} saiu para entrega. — The Burger GN`;
    case "done":
      return `Olá ${name}! Seu pedido #${orderNumber} foi entregue. Bom apetite! — The Burger GN`;
    case "cancelled":
      return `Olá ${name}! Infelizmente seu pedido #${orderNumber} foi recusado.${
        rejectReason ? ` Motivo: ${rejectReason}.` : ""
      } — The Burger GN`;
    case "awaiting_payment":
      return `Olá ${name}! Recebemos o comprovante do pedido #${orderNumber}. Estamos conferindo o pagamento. — The Burger GN`;
    default:
      return `Olá ${name}! Recebemos seu pedido #${orderNumber} e ele está pendente de confirmação. — The Burger GN`;
  }
}

/**
 * TEMP (dev/test): all external WhatsApp communication is OFF.
 * Structure kept for future official WhatsApp Business API reactivation.
 * Flip to `true` only when the API integration is ready.
 */
export const WHATSAPP_EXTERNAL_ENABLED = false;

/** Opens WhatsApp (wa.me). No-op while WHATSAPP_EXTERNAL_ENABLED is false. */
export function openCustomerWhatsapp(phone: string, message: string) {
  if (!WHATSAPP_EXTERNAL_ENABLED) return;
  const number = normalizePhoneForWhatsapp(phone);
  if (!number || number === "5500000000000" || number.replace(/\D/g, "").replace(/^55/, "").length < 10) return;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
}

/** Short in-app labels for Meu Pedido status banners. */
export function customerInAppStatusMessage(
  workflow: string,
  opts?: { paymentStatus?: PaymentStatus; rejectReason?: string | null; receiptRejectReason?: string | null },
): { title: string; body: string } {
  if (workflow === "cancelled") {
    return {
      title: "Pedido recusado",
      body: opts?.rejectReason ? `Motivo: ${opts.rejectReason}` : "A loja recusou este pedido.",
    };
  }
  if (opts?.paymentStatus === "paid" && (workflow === "new" || workflow === "payment_confirmed")) {
    return {
      title: "Pagamento confirmado",
      body: "Seu pedido foi enviado para análise da loja.",
    };
  }
  if (opts?.paymentStatus === "failed" || opts?.receiptRejectReason) {
    return {
      title: "Comprovante recusado",
      body: opts.receiptRejectReason
        ? `Motivo: ${opts.receiptRejectReason}. Você pode reenviar pelo app.`
        : "Envie um novo comprovante pelo app.",
    };
  }
  switch (workflow) {
    case "awaiting_payment":
      return {
        title: "Pagamento aguardando conferência",
        body: "Seu comprovante foi recebido e será analisado pela equipe.",
      };
    case "new":
      return { title: "Pedido recebido", body: "Aguardando a loja confirmar seu pedido." };
    case "accepted":
    case "preparing":
      return { title: "Pedido aceito", body: "Seu pedido já está em preparo." };
    case "ready":
      return { title: "Pedido pronto", body: "Seu pedido está pronto!" };
    case "out":
      return { title: "Saiu para entrega", body: "Seu pedido está a caminho." };
    case "done":
      return { title: "Entregue", body: "Bom apetite! Avalie sua experiência quando quiser." };
    default:
      return { title: "Atualização do pedido", body: "Status atualizado. Acompanhe em Meu Pedido." };
  }
}

export const REJECT_REASON_SUGGESTIONS = [
  "Produto esgotado",
  "Fora da área de entrega",
  "Loja fechando",
  "Pagamento não confirmado",
] as const;

export const RECEIPT_REJECT_SUGGESTIONS = [
  "Comprovante ilegível",
  "Pagamento não localizado",
  "Valor incorreto",
] as const;

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  local: "Consumir na loja",
  pickup: "Retirar no balcão",
  delivery: "Receber em casa",
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão" };
export const CARD_TYPE_LABELS: Record<CardType, string> = { credit: "Crédito", debit: "Débito" };
export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Pendente",
  preparing: "Em Preparo",
  delivery: "Saiu p/ Entrega",
  done: "Entregue",
  cancelled: "Recusado",
};
export const WORKFLOW_LABELS: Record<WorkflowStage | "cancelled", string> = {
  awaiting_payment: "Aguardando conferência do pagamento",
  new: "Pendente",
  accepted: "Em Preparo",
  preparing: "Em Preparo",
  ready: "Pronto",
  out: "Saiu para Entrega",
  done: "Entregue",
  cancelled: "Recusado",
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pagamento Confirmado",
  failed: "Comprovante recusado",
};

export const RECEIPT_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";
export function isAllowedReceiptFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg" || type === "image/webp") return true;
  const name = file.name.toLowerCase();
  return /\.(png|jpe?g|webp)$/.test(name);
}

// ── Financial Report ────────────────────────────────────────────────────────
export interface FinancialChartPoint { label: string; total: number; orders: number; }
export interface FinancialReport {
  period: { from: string; to: string };
  fixedRevenue: { today: number; week: number; month: number; year: number };
  totals: { totalOrders: number; deliveredOrders: number; cancelledOrders: number; pendingOrders: number };
  revenue: number;
  averageTicket: number;
  totalDeliveryFees: number;
  topProduct: { name: string; quantity: number } | null;
  topCategory: { name: string; quantity: number } | null;
  topCustomer: { name: string; phone: string; total: number; orderCount: number } | null;
  customers: { new: number; returning: number };
  paymentMethods: Record<PaymentMethod, { revenue: number; count: number }>;
  charts: { daily: FinancialChartPoint[]; weekly: FinancialChartPoint[]; monthly: FinancialChartPoint[]; yearly: FinancialChartPoint[] };
}
export const getFinancialReport = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return api.get(`/admin/financial-report${qs ? `?${qs}` : ""}`) as Promise<FinancialReport>;
};

// ── Sales Dashboard (home) ───────────────────────────────────────────────────
export type SalesPeriodPreset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
export type SalesChartGranularity = "hour" | "day" | "month";

export interface SalesKpi {
  value: number;
  previous: number;
  changePercent: number | null;
}

export interface SalesDashboardReport {
  period: {
    preset: SalesPeriodPreset;
    from: string;
    to: string;
    fromAt: string;
    toAt: string;
    previousFrom: string;
    previousTo: string;
    granularity: SalesChartGranularity;
    comparisonLabel: string;
    timezone: string;
  };
  kpis: {
    revenue: SalesKpi;
    orders: SalesKpi;
    averageTicket: SalesKpi;
    uniqueCustomers: SalesKpi;
  };
  ordersBreakdown: {
    completed: number;
    cancelled: number;
    inProgress: number;
    total: number;
    validRevenue: number;
    cancelledExcludedFromRevenue: boolean;
  };
  customers: { new: number; returning: number; unique: number };
  paymentMethods: Record<PaymentMethod, { revenue: number; count: number; percent: number }>;
  orderTypes: Record<OrderType, { count: number; doneCount: number; revenue: number }>;
  topProducts: Array<{ rank: number; name: string; quantity: number; revenue: number }>;
  chart: {
    granularity: SalesChartGranularity;
    series: Array<{ label: string; total: number; orders: number }>;
  };
  performance: {
    peakHour: { hour: string; orders: number } | null;
    bestDay: { day: string; revenue: number; orders: number } | null;
    topProduct: { name: string; quantity: number; revenue: number } | null;
    averageTicket: number;
    avgItemsPerOrder: number;
  };
}

export const getSalesDashboard = (opts: {
  preset?: SalesPeriodPreset;
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams();
  if (opts.preset) params.set("preset", opts.preset);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const qs = params.toString();
  return api.get(`/admin/sales-dashboard${qs ? `?${qs}` : ""}`) as Promise<SalesDashboardReport>;
};

// ── Clube Burger ──────────────────────────────────────────────────────────────
export type ClubeMemberTier = "bronze" | "prata" | "ouro" | "diamante";
export type ClubeDiscountType = "percentage" | "fixed";

export interface ClubeSettings {
  id: number;
  companyId: number;
  enabled: boolean;
  clubName: string;
  welcomeMessage: string;
  pointsPerReal: string;
  pointsRedeemValue: string;
  cashbackPercent: string;
  cashbackMinOrder: string;
  fidelityEnabled?: boolean;
  stampsRequired?: number;
  stampRewardTitle?: string;
  cashbackEnabled?: boolean;
  cashbackMaxPerOrder?: string | null;
  birthdayDiscountType: ClubeDiscountType;
  birthdayDiscountValue: string;
  birthdayDaysBefore: number;
  birthdayDaysAfter: number;
  earlyAccessHours: number;
  updatedAt: string;
}

export interface ClubeFidelitySettings {
  fidelityEnabled: boolean;
  stampsRequired: number;
  stampRewardTitle: string;
}

export interface ClubeMember {
  id: number;
  companyId: number;
  name: string;
  email: string;
  phone: string;
  birthDate: string | null;
  points: number;
  cashbackBalance: string;
  tier: ClubeMemberTier;
  active: boolean;
  notes: string;
  joinedAt: string;
  createdAt: string;
}

export interface ClubeLoyaltyReward {
  id: number;
  companyId: number;
  title: string;
  description: string;
  pointsCost: number;
  active: boolean;
  createdAt: string;
}

export interface ClubeExclusiveCoupon {
  id: number;
  companyId: number;
  code: string;
  title: string;
  description: string;
  discountType: ClubeDiscountType;
  discountValue: string;
  minOrderValue: string;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface ClubeBirthdayBenefit {
  id: number;
  companyId: number;
  title: string;
  description: string;
  discountType: ClubeDiscountType;
  discountValue: string;
  active: boolean;
  createdAt: string;
}

export interface ClubeEarlyPromotion {
  id: number;
  companyId: number;
  title: string;
  description: string;
  discountType: ClubeDiscountType;
  discountValue: string;
  earlyAccessAt: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface ClubeDashboard {
  members: number;
  activeMembers: number;
  totalPoints: number;
  totalCashback: number;
  exclusiveCoupons: number;
  activePromos: number;
  loyaltyRewards: number;
  upcomingBirthdays: ClubeMember[];
}

export interface ClubeCashbackData {
  cashbackPercent: string;
  cashbackMinOrder: string;
  cashbackEnabled?: boolean;
  cashbackMaxPerOrder?: string | null;
  totalBalance: number;
  membersWithBalance: ClubeMember[];
}

export const getClubeDashboard = () => api.get("/admin/clube/dashboard") as Promise<ClubeDashboard>;
export const getClubeSettings = () => api.get("/admin/clube/settings") as Promise<ClubeSettings>;
export const updateClubeSettings = (d: Partial<ClubeSettings>) =>
  api.put("/admin/clube/settings", d) as Promise<ClubeSettings>;

export const getClubeMembers = () => api.get("/admin/clube/members") as Promise<ClubeMember[]>;
export const createClubeMember = (d: Partial<ClubeMember>) =>
  api.post("/admin/clube/members", d) as Promise<ClubeMember>;
export const updateClubeMember = (id: number, d: Partial<ClubeMember>) =>
  api.put(`/admin/clube/members/${id}`, d) as Promise<ClubeMember>;
export const deleteClubeMember = (id: number) => api.delete(`/admin/clube/members/${id}`);

export const getClubeLoyalty = () => api.get("/admin/clube/loyalty") as Promise<ClubeLoyaltyReward[]>;
export const createClubeLoyalty = (d: Partial<ClubeLoyaltyReward>) =>
  api.post("/admin/clube/loyalty", d) as Promise<ClubeLoyaltyReward>;
export const updateClubeLoyalty = (id: number, d: Partial<ClubeLoyaltyReward>) =>
  api.put(`/admin/clube/loyalty/${id}`, d) as Promise<ClubeLoyaltyReward>;
export const deleteClubeLoyalty = (id: number) => api.delete(`/admin/clube/loyalty/${id}`);

export const getClubeCashback = () => api.get("/admin/clube/cashback") as Promise<ClubeCashbackData>;
export const updateClubeCashback = (d: {
  cashbackPercent?: string;
  cashbackMinOrder?: string;
  cashbackEnabled?: boolean;
  cashbackMaxPerOrder?: string | null;
}) => api.put("/admin/clube/cashback", d) as Promise<ClubeSettings>;

export const getClubeFidelity = () =>
  api.get("/admin/clube/fidelity") as Promise<ClubeFidelitySettings>;
export const updateClubeFidelity = (d: Partial<ClubeFidelitySettings>) =>
  api.put("/admin/clube/fidelity", d) as Promise<ClubeFidelitySettings>;

export const getClubeExclusiveCoupons = () =>
  api.get("/admin/clube/exclusive-coupons") as Promise<ClubeExclusiveCoupon[]>;
export const createClubeExclusiveCoupon = (d: Partial<ClubeExclusiveCoupon>) =>
  api.post("/admin/clube/exclusive-coupons", d) as Promise<ClubeExclusiveCoupon>;
export const updateClubeExclusiveCoupon = (id: number, d: Partial<ClubeExclusiveCoupon>) =>
  api.put(`/admin/clube/exclusive-coupons/${id}`, d) as Promise<ClubeExclusiveCoupon>;
export const deleteClubeExclusiveCoupon = (id: number) =>
  api.delete(`/admin/clube/exclusive-coupons/${id}`);

export const getClubeBirthdayBenefits = () =>
  api.get("/admin/clube/birthday-benefits") as Promise<ClubeBirthdayBenefit[]>;
export const createClubeBirthdayBenefit = (d: Partial<ClubeBirthdayBenefit>) =>
  api.post("/admin/clube/birthday-benefits", d) as Promise<ClubeBirthdayBenefit>;
export const updateClubeBirthdayBenefit = (id: number, d: Partial<ClubeBirthdayBenefit>) =>
  api.put(`/admin/clube/birthday-benefits/${id}`, d) as Promise<ClubeBirthdayBenefit>;
export const deleteClubeBirthdayBenefit = (id: number) =>
  api.delete(`/admin/clube/birthday-benefits/${id}`);

export const getClubeEarlyPromotions = () =>
  api.get("/admin/clube/early-promotions") as Promise<ClubeEarlyPromotion[]>;
export const createClubeEarlyPromotion = (d: Partial<ClubeEarlyPromotion>) =>
  api.post("/admin/clube/early-promotions", d) as Promise<ClubeEarlyPromotion>;
export const updateClubeEarlyPromotion = (id: number, d: Partial<ClubeEarlyPromotion>) =>
  api.put(`/admin/clube/early-promotions/${id}`, d) as Promise<ClubeEarlyPromotion>;
export const deleteClubeEarlyPromotion = (id: number) =>
  api.delete(`/admin/clube/early-promotions/${id}`);

// ── Clientes (CRM — reutiliza clube_members; telefone = identificador) ────────
export type ClientOrigin =
  | "pedido"
  | "importacao_manual"
  | "cadastro_administrativo"
  | "outro";

export type ClientRecoverySegment =
  | "novo"
  | "recorrente"
  | "vip"
  | "inativo_7"
  | "inativo_15"
  | "inativo_30"
  | "ativo";

export const CLIENT_ORIGIN_OPTIONS: { id: ClientOrigin; label: string }[] = [
  { id: "pedido", label: "Pedido" },
  { id: "importacao_manual", label: "Importação manual" },
  { id: "cadastro_administrativo", label: "Cadastro administrativo" },
  { id: "outro", label: "Outro" },
];

export type RecoveryStatus = "ativo" | "esfriando" | "em_risco" | "perdido";
export type RecoveryFilter = "todos" | "esfriando" | "em_risco" | "perdido" | "vip_inativo";

export interface ClubClient {
  id: number;
  name: string;
  phone: string;
  stamps: number;
  cashbackBalance: string;
  origin: ClientOrigin;
  notes: string;
  joinedAt: string;
  createdAt: string;
  active: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastOrderNumber: number | null;
  segments: ClientRecoverySegment[];
  daysWithoutOrder?: number | null;
  recoveryStatus?: RecoveryStatus;
  isVip?: boolean;
  vipInativo?: boolean;
  lastRecoveryAt?: string | null;
  lastRecoveryCoupon?: string | null;
}

export interface RecoverySummary {
  total: number;
  esfriando: number;
  emRisco: number;
  perdidos: number;
  vipsInativos: number;
  historicalRevenue: number;
}

export interface RecoveryListResponse {
  filter: RecoveryFilter;
  summary: RecoverySummary;
  count: number;
  clients: ClubClient[];
}

export interface ClientsListResponse {
  count: number;
  origins: Record<ClientOrigin, string>;
  clients: ClubClient[];
}

export interface ClientOrderHistoryItem {
  id: number;
  orderNumber: number;
  total: number;
  status: string;
  createdAt: string;
}

export type ClientLedgerType =
  | "selo_pedido"
  | "cashback_pedido"
  | "cashback_utilizado"
  | "ajuste_selo"
  | "ajuste_cashback"
  | "recompensa_disponivel"
  | "recompensa_resgatada";

export interface ClientLedgerEntry {
  id: string;
  at: string;
  type: ClientLedgerType;
  orderId: number | null;
  orderNumber: number | null;
  stampsDelta: number | null;
  cashbackDelta: number | null;
  description: string | null;
  rewardId: string | null;
  rewardTitle: string | null;
}

export interface ClientAvailableReward {
  id: string;
  title: string;
  earnedAt: string;
  orderId: number | null;
  orderNumber: number | null;
  redeemedAt: string | null;
  available: boolean;
}

export interface ClientDetailResponse {
  client: ClubClient;
  history: ClientOrderHistoryItem[];
  fidelity: {
    enabled: boolean;
    stamps: number;
    goal: number;
    progress: number;
    remaining: number;
    rewardTitle: string;
    availableRewards: ClientAvailableReward[];
  };
  cashbackProgram: {
    enabled: boolean;
    percent: string;
    minOrder: string;
    maxPerOrder: string | null;
    balance: string;
  };
  ledger: ClientLedgerEntry[];
  recoveryHints: {
    novo: boolean;
    recorrente: boolean;
    vip: boolean;
    semComprar7dias: boolean;
    semComprar15dias: boolean;
    semComprar30dias: boolean;
  };
}

export const getClients = (opts?: { q?: string; origin?: string }) => {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.origin) params.set("origin", opts.origin);
  const qs = params.toString();
  return api.get(`/admin/clientes${qs ? `?${qs}` : ""}`) as Promise<ClientsListResponse>;
};

export const getClientDetail = (id: number) =>
  api.get(`/admin/clientes/${id}`) as Promise<ClientDetailResponse>;

export type CreateClientResult =
  | { ok: true; updated: boolean; client: ClubClient }
  | { ok: false; conflict: true; error: string; client: ClubClient };

/** Create client; on duplicate WhatsApp returns conflict + existing client (no throw). */
export async function createClient(d: {
  name: string;
  phone: string;
  stamps?: number;
  cashbackBalance?: number | string;
  origin?: ClientOrigin;
  notes?: string;
  updateIfExists?: boolean;
}): Promise<CreateClientResult> {
  const res = await fetch(`${BASE}/admin/clientes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  const data = await res.json().catch(() => ({})) as {
    error?: string;
    client?: ClubClient;
    updated?: boolean;
  };
  if (res.status === 409 && data.client) {
    return {
      ok: false,
      conflict: true,
      error: data.error || "Já existe um cliente com este WhatsApp.",
      client: data.client,
    };
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return {
    ok: true,
    updated: Boolean(data.updated),
    client: (data as { client: ClubClient }).client,
  };
}

export const updateClient = (
  id: number,
  d: Partial<{
    name: string;
    phone: string;
    stamps: number;
    cashbackBalance: number | string;
    origin: ClientOrigin;
    notes: string;
    active: boolean;
  }>,
) => api.put(`/admin/clientes/${id}`, d) as Promise<ClubClient>;

export const deleteClient = (id: number) =>
  api.delete(`/admin/clientes/${id}`) as Promise<{ ok: boolean }>;

export const adjustClientStamps = (id: number, delta: 1 | -1) =>
  api.post(`/admin/clientes/${id}/stamps`, { delta }) as Promise<{
    client: ClubClient;
    stamps: number;
  }>;

export const adjustClientCashback = (id: number, amount: number) =>
  api.post(`/admin/clientes/${id}/cashback`, { amount }) as Promise<{
    client: ClubClient;
    previous: number;
    next: number;
  }>;

export const redeemClientReward = (clientId: number, rewardId: string) =>
  api.post(`/admin/clientes/${clientId}/rewards/${rewardId}/redeem`, {}) as Promise<{
    ok: boolean;
    client: ClubClient;
    reward: ClientAvailableReward;
  }>;

export const getRecoveryClients = (opts?: { q?: string; status?: RecoveryFilter }) => {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString();
  return api.get(`/admin/clientes/recuperacao${qs ? `?${qs}` : ""}`) as Promise<RecoveryListResponse>;
};

export const registerRecoveryContact = (
  id: number,
  d: { message: string; couponCode?: string | null },
) =>
  api.post(`/admin/clientes/${id}/recuperacao/contato`, d) as Promise<{
    ok: boolean;
    result: "contato_iniciado";
    client: ClubClient;
    lastRecoveryAt: string;
    previousRecoveryAt: string | null;
    daysSincePreviousContact: number | null;
    warning: string | null;
  }>;

/** Admin recovery: always opens wa.me (manual send). Does not use storefront WhatsApp kill-switch. */
export function openRecoveryWhatsapp(phone: string, message: string) {
  const number = normalizePhoneForWhatsapp(phone);
  if (!number || number.replace(/\D/g, "").replace(/^55/, "").length < 10) return false;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  return true;
}

export function firstName(fullName: string): string {
  const part = (fullName || "").trim().split(/\s+/)[0];
  return part || "cliente";
}

/** Default recovery copy by status (VIP inactive uses dedicated template). */
export function buildRecoveryMessage(
  client: Pick<ClubClient, "name" | "recoveryStatus" | "vipInativo">,
  couponCode?: string | null,
): string {
  const nome = firstName(client.name);
  let body: string;
  if (client.vipInativo) {
    body =
      `Fala, ${nome}! 👑\n` +
      `Cliente especial não pode ficar tanto tempo longe da The Burger GN 😂🍔\n` +
      `Passando para dizer que sentimos sua falta. Bora de Burger GN hoje?`;
  } else if (client.recoveryStatus === "esfriando") {
    body =
      `Oi, ${nome}! 👋 Sentimos sua falta por aqui 😋\n` +
      `Passando para lembrar que a The Burger GN está te esperando.\n` +
      `Que tal matar a saudade hoje? 🍔🔥`;
  } else if (client.recoveryStatus === "em_risco") {
    body =
      `Fala, ${nome}! 👀 Já faz um tempinho que você não aparece por aqui.\n` +
      `A The Burger GN continua daquele jeito que você conhece. 🍔🔥\n` +
      `Bora fazer seu pedido hoje?`;
  } else {
    // perdido (default)
    body =
      `${nome}, você sumiu! 😂🍔\n` +
      `Já passou da hora de matar a saudade da The Burger GN.\n` +
      `Estamos te esperando por aqui. 🔥`;
  }
  if (couponCode && couponCode.trim()) {
    body += `\n\nUse o cupom ${couponCode.trim()} no seu próximo pedido.`;
  }
  return body;
}

export function daysSinceIso(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / (1000 * 60 * 60 * 24)));
}

