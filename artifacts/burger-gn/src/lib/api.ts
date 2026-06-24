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

// ── Categories ───────────────────────────────────────────────────────────────
export interface Category {
  id: number; name: string; slug: string; displayOrder: number; active: boolean;
}
export const getCategories = () => api.get("/categories") as Promise<Category[]>;
export const getAdminCategories = () => api.get("/admin/categories") as Promise<Category[]>;
export const createCategory = (data: Partial<Category>) => api.post("/admin/categories", data) as Promise<Category>;
export const updateCategory = (id: number, data: Partial<Category>) => api.put(`/admin/categories/${id}`, data) as Promise<Category>;
export const deleteCategory = (id: number) => api.delete(`/admin/categories/${id}`);

// ── Products ─────────────────────────────────────────────────────────────────
export interface Product {
  id: number; name: string; description: string; price: string;
  categoryId: number | null; image: string; available: boolean;
  displayOrder: number; categorySlug: string | null; categoryName: string | null;
}
export const getProducts = () => api.get("/products") as Promise<Product[]>;
export const getAdminProducts = () => api.get("/admin/products") as Promise<Product[]>;
export const createProduct = (data: Partial<Product>) => api.post("/admin/products", data) as Promise<Product>;
export const updateProduct = (id: number, data: Partial<Product>) => api.put(`/admin/products/${id}`, data) as Promise<Product>;
export const deleteProduct = (id: number) => api.delete(`/admin/products/${id}`);

// ── Delivery Zones ────────────────────────────────────────────────────────────
export interface DeliveryZone {
  id: number; neighborhood: string; fee: string; active: boolean; createdAt: string;
}
export interface DeliveryFeeResult {
  found: boolean; neighborhood: string; fee: number | null; message?: string; zoneId?: number;
}
export const getDeliveryZones = () => api.get("/delivery-zones") as Promise<DeliveryZone[]>;
export const getDeliveryFee = (neighborhood: string) =>
  api.get(`/delivery-zones/fee?neighborhood=${encodeURIComponent(neighborhood)}`) as Promise<DeliveryFeeResult>;
export const getAdminDeliveryZones = () => api.get("/admin/delivery-zones") as Promise<DeliveryZone[]>;
export const createDeliveryZone = (data: { neighborhood: string; fee: string; active?: boolean }) =>
  api.post("/admin/delivery-zones", data) as Promise<DeliveryZone>;
export const updateDeliveryZone = (id: number, data: Partial<DeliveryZone>) =>
  api.put(`/admin/delivery-zones/${id}`, data) as Promise<DeliveryZone>;
export const deleteDeliveryZone = (id: number) => api.delete(`/admin/delivery-zones/${id}`);

// ── Orders ───────────────────────────────────────────────────────────────────
export type OrderStatus = "new" | "preparing" | "delivery" | "done" | "cancelled";
export type OrderType = "delivery" | "pickup" | "local";
export type PaymentMethod = "pix" | "cash" | "card";

export interface OrderItem {
  id: number; orderId: number; productName: string;
  productPrice: string; quantity: number; subtotal: string;
}
export interface Order {
  id: number; orderNumber: number; trackingId: string;
  customerName: string; phone: string;
  address: string; addressNumber: string; addressComplement: string;
  neighborhood: string; reference: string; notes: string;
  orderType: OrderType; paymentMethod: PaymentMethod; changeFor: string | null;
  subtotal: string; deliveryFee: string; discountAmount: string; couponCode: string | null;
  total: string; status: OrderStatus; createdAt: string; items: OrderItem[];
}
export interface CreateOrderPayload {
  customerName: string; phone: string;
  address?: string; addressNumber?: string; addressComplement?: string;
  neighborhood?: string; reference?: string; notes?: string;
  orderType: OrderType; paymentMethod: PaymentMethod; changeFor?: number;
  couponCode?: string;
  items: Array<{ productId?: number; productName: string; productPrice: number; quantity: number }>;
}
export const createOrder = (data: CreateOrderPayload) =>
  api.post("/orders", data) as Promise<{
    ok: boolean; trackingId: string; orderNumber: number; orderId: number;
    deliveryFee: number; discountAmount: number; couponCode: string | null;
  }>;
export const getOrders = () => api.get("/orders") as Promise<Order[]>;
export const trackOrder = (trackingId: string) => api.get(`/orders/track/${trackingId}`) as Promise<Order>;
export const updateOrderStatus = (id: number, status: OrderStatus) =>
  api.patch(`/orders/${id}/status`, { status }) as Promise<Order>;

// ── Coupons ───────────────────────────────────────────────────────────────────
export type DiscountType = "percentage" | "fixed";
export interface Coupon {
  id: number; code: string; discountType: DiscountType; discountValue: string;
  minOrderValue: string; maxUses: number | null; usedCount: number;
  active: boolean; expiresAt: string | null; createdAt: string;
}
export interface ValidateCouponResult {
  valid: boolean; message?: string; code?: string;
  discountType?: DiscountType; discountValue?: number; discountAmount?: number;
}
export const validateCoupon = (code: string, subtotal: number) =>
  api.post("/coupons/validate", { code, subtotal }) as Promise<ValidateCouponResult>;
export const getAdminCoupons = () => api.get("/admin/coupons") as Promise<Coupon[]>;
export const getCouponStats = () =>
  api.get("/admin/coupons/stats") as Promise<{ active: number; totalDiscount: number; totalUses: number }>;
export const createCoupon = (data: Partial<Coupon>) => api.post("/admin/coupons", data) as Promise<Coupon>;
export const updateCoupon = (id: number, data: Partial<Coupon>) => api.put(`/admin/coupons/${id}`, data) as Promise<Coupon>;
export const deleteCoupon = (id: number) => api.delete(`/admin/coupons/${id}`);

// ── Admin Auth ────────────────────────────────────────────────────────────────
export const adminLogin = (password: string) => api.post("/admin/login", { password });
export const adminLogout = () => api.post("/admin/logout", {});
export const adminMe = () => api.get("/admin/me") as Promise<{ authenticated: boolean }>;

// ── Config ────────────────────────────────────────────────────────────────────
export const WHATSAPP_NUMBER = "5571996981707";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  delivery: "Delivery", pickup: "Retirada no balcão", local: "Comer no local",
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix", cash: "Dinheiro", card: "Cartão",
};
export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Novo Pedido", preparing: "Em Preparo",
  delivery: "Saiu p/ Entrega", done: "Finalizado", cancelled: "Cancelado",
};
