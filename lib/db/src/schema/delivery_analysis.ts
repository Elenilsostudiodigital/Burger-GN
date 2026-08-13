import {
  pgTable, serial, text, numeric, timestamp, integer, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/**
 * Customer requests for the team to review a delivery.
 * Statuses are independent of order.status and paymentStatus.
 * orderId is soft (no FK) to avoid schema cycles with orders.
 */
export const deliveryAnalysisRequestsTable = pgTable("delivery_analysis_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  /** Null during checkout (before the order exists). */
  orderId: integer("order_id"),
  orderNumber: integer("order_number"),
  trackingId: text("tracking_id").notNull(),
  /** order = Meu Pedido; checkout = address analysis before placing the order */
  source: text("source").notNull().default("order"),
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  addressNumber: text("address_number").notNull().default(""),
  neighborhood: text("neighborhood").notNull().default(""),
  city: text("city").notNull().default(""),
  complement: text("complement").notNull().default(""),
  reference: text("reference").notNull().default(""),
  lat: numeric("lat", { precision: 12, scale: 8 }),
  lng: numeric("lng", { precision: 12, scale: 8 }),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default(""),
  customerNote: text("customer_note").notNull().default(""),
  /** pending | approved | rejected — NOT order/payment status */
  status: text("status").notNull().default("pending"),
  rejectReason: text("reject_reason").notNull().default(""),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: integer("reviewed_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("delivery_analysis_requests_company_status_idx").on(t.companyId, t.status),
  index("delivery_analysis_requests_order_idx").on(t.orderId),
  index("delivery_analysis_requests_tracking_idx").on(t.trackingId),
]);

export type DeliveryAnalysisRequest = typeof deliveryAnalysisRequestsTable.$inferSelect;
