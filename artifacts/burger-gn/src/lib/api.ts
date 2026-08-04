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
    throw new Error(text || `HTTP ${res.status}`);
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
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }>
): { fee: number | null; consult: boolean } {
  const sorted = [...tiers].sort((a, b) => parseFloat(a.fromKm) - parseFloat(b.fromKm));
  for (const tier of sorted) {
    const from = parseFloat(tier.fromKm);
    const to = tier.toKm !== null ? parseFloat(tier.toKm) : Infinity;
    if (distanceKm >= from && distanceKm <= to) {
      return { fee: tier.fee !== null ? parseFloat(tier.fee) : null, consult: tier.fee === null };
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
export const getProducts = () => api.get("/products") as Promise<Product[]>;
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

export const getKmDeliveryConfig = () => api.get("/delivery/km-config") as Promise<KmDeliveryConfig>;
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
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

// ── Orders ────────────────────────────────────────────────────────────────────
export type OrderStatus = "new" | "preparing" | "delivery" | "done" | "cancelled";
export type OrderType = "delivery" | "pickup" | "local";
export type PaymentMethod = "pix" | "cash" | "card";

export interface OrderItem { id: number; orderId: number; productName: string; productPrice: string; quantity: number; addons: Addon[]; notes: string; subtotal: string; }
export type PaymentStatus = "pending" | "paid" | "failed";
export interface Order {
  id: number; orderNumber: number; trackingId: string;
  customerName: string; phone: string;
  address: string; addressNumber: string; addressComplement: string;
  neighborhood: string; reference: string; notes: string;
  customerLat: string | null; customerLng: string | null; distanceKm: string | null;
  orderType: OrderType; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus; changeFor: string | null;
  subtotal: string; deliveryFee: string; discountAmount: string; couponCode: string | null;
  total: string; status: OrderStatus; createdAt: string; items: OrderItem[];
}
export interface CreateOrderPayload {
  customerName: string; phone: string;
  address?: string; addressNumber?: string; addressComplement?: string;
  neighborhood?: string; reference?: string; notes?: string;
  customerLat?: number; customerLng?: number;
  orderType: OrderType; paymentMethod: PaymentMethod; changeFor?: number;
  couponCode?: string;
  items: Array<{ productId?: number; productName: string; productPrice: number; quantity: number; addons?: Addon[]; notes?: string }>;
}
export interface PixPaymentResult { paymentId: string; qrCode: string; qrCodeBase64: string; }
export const createOrder = (d: CreateOrderPayload) => api.post("/orders", d) as Promise<{
  ok: boolean; trackingId: string; orderNumber: number; orderId: number;
  deliveryFee: number; distanceKm: number | null; discountAmount: number; couponCode: string | null;
  pixPayment: PixPaymentResult | null; cardCheckoutUrl: string | null;
}>;
export const getOrders = () => api.get("/orders") as Promise<Order[]>;
export const trackOrder = (trackingId: string) => api.get(`/orders/track/${trackingId}`) as Promise<Order>;
export const updateOrderStatus = (id: number, status: OrderStatus) => api.patch(`/orders/${id}/status`, { status }) as Promise<Order>;

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
export interface PaymentSettingsPublic { onlinePaymentEnabled: boolean; cashOnDeliveryEnabled: boolean; }
export interface PaymentSettingsAdmin {
  id: number; onlinePaymentEnabled: boolean; gatewayProvider: string; cashOnDeliveryEnabled: boolean;
  updatedAt: string;
  mercadoPagoConfigured: boolean; mercadoPagoAccessTokenPreview: string; mercadoPagoPublicKey: string;
}
export const getPaymentSettings = () => api.get("/payment-settings") as Promise<PaymentSettingsPublic>;
export const getAdminPaymentSettings = () => api.get("/admin/payment-settings") as Promise<PaymentSettingsAdmin>;
export const updatePaymentSettings = (d: {
  onlinePaymentEnabled?: boolean; gatewayProvider?: string; cashOnDeliveryEnabled?: boolean;
  mercadoPagoAccessToken?: string; mercadoPagoPublicKey?: string; clearMercadoPagoCredentials?: boolean;
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

export function normalizePhoneForWhatsapp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = { delivery: "Delivery", pickup: "Retirada no balcão", local: "Comer no local" };
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão" };
export const STATUS_LABELS: Record<OrderStatus, string> = { new: "Novo Pedido", preparing: "Em Preparo", delivery: "Saiu p/ Entrega", done: "Finalizado", cancelled: "Cancelado" };
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = { pending: "Pendente", paid: "Pago", failed: "Falhou" };

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
  birthdayDiscountType: ClubeDiscountType;
  birthdayDiscountValue: string;
  birthdayDaysBefore: number;
  birthdayDaysAfter: number;
  earlyAccessHours: number;
  updatedAt: string;
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
export const updateClubeCashback = (d: { cashbackPercent?: string; cashbackMinOrder?: string }) =>
  api.put("/admin/clube/cashback", d) as Promise<ClubeSettings>;

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
