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
  id: number;
  name: string;
  slug: string;
  displayOrder: number;
  active: boolean;
}

export const getCategories = () => api.get("/categories") as Promise<Category[]>;
export const getAdminCategories = () => api.get("/admin/categories") as Promise<Category[]>;
export const createCategory = (data: Partial<Category>) => api.post("/admin/categories", data) as Promise<Category>;
export const updateCategory = (id: number, data: Partial<Category>) => api.put(`/admin/categories/${id}`, data) as Promise<Category>;
export const deleteCategory = (id: number) => api.delete(`/admin/categories/${id}`);

// ── Products ─────────────────────────────────────────────────────────────────
export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  categoryId: number | null;
  image: string;
  available: boolean;
  displayOrder: number;
  categorySlug: string | null;
  categoryName: string | null;
}

export const getProducts = () => api.get("/products") as Promise<Product[]>;
export const getAdminProducts = () => api.get("/admin/products") as Promise<Product[]>;
export const createProduct = (data: Partial<Product>) => api.post("/admin/products", data) as Promise<Product>;
export const updateProduct = (id: number, data: Partial<Product>) => api.put(`/admin/products/${id}`, data) as Promise<Product>;
export const deleteProduct = (id: number) => api.delete(`/admin/products/${id}`);

// ── Orders ───────────────────────────────────────────────────────────────────
export type OrderStatus = "new" | "preparing" | "delivery" | "done" | "cancelled";
export type OrderType = "delivery" | "pickup" | "local";
export type PaymentMethod = "pix" | "cash" | "card";

export interface OrderItem {
  id: number;
  orderId: number;
  productName: string;
  productPrice: string;
  quantity: number;
  subtotal: string;
}

export interface Order {
  id: number;
  orderNumber: number;
  trackingId: string;
  customerName: string;
  phone: string;
  address: string;
  neighborhood: string;
  reference: string;
  notes: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  changeFor: string | null;
  subtotal: string;
  deliveryFee: string;
  total: string;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
}

export interface CreateOrderPayload {
  customerName: string;
  phone: string;
  address?: string;
  neighborhood?: string;
  reference?: string;
  notes?: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  items: Array<{
    productId?: number;
    productName: string;
    productPrice: number;
    quantity: number;
  }>;
}

export const createOrder = (data: CreateOrderPayload) =>
  api.post("/orders", data) as Promise<{ ok: boolean; trackingId: string; orderNumber: number; orderId: number }>;

export const getOrders = () => api.get("/orders") as Promise<Order[]>;
export const trackOrder = (trackingId: string) => api.get(`/orders/track/${trackingId}`) as Promise<Order>;
export const updateOrderStatus = (id: number, status: OrderStatus) =>
  api.patch(`/orders/${id}/status`, { status }) as Promise<Order>;

// ── Admin Auth ────────────────────────────────────────────────────────────────
export const adminLogin = (password: string) => api.post("/admin/login", { password });
export const adminLogout = () => api.post("/admin/logout", {});
export const adminMe = () => api.get("/admin/me") as Promise<{ authenticated: boolean }>;

// ── Config ────────────────────────────────────────────────────────────────────
// Edite aqui o número do WhatsApp e a taxa de entrega
export const WHATSAPP_NUMBER = "5571999999999";
export const DELIVERY_FEE = 5.0;

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  delivery: "Delivery",
  pickup: "Retirada no balcão",
  local: "Comer no local",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Novo Pedido",
  preparing: "Em Preparo",
  delivery: "Saiu p/ Entrega",
  done: "Finalizado",
  cancelled: "Cancelado",
};
