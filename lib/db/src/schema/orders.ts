import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderStatusEnum = pgEnum("order_status", [
  "new", "preparing", "delivery", "done", "cancelled",
]);
export const orderTypeEnum = pgEnum("order_type", ["delivery", "pickup", "local"]);
export const paymentMethodEnum = pgEnum("payment_method", ["pix", "cash", "card"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: integer("order_number").notNull(),
  trackingId: text("tracking_id").notNull().unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull().default(""),
  addressNumber: text("address_number").notNull().default(""),
  addressComplement: text("address_complement").notNull().default(""),
  neighborhood: text("neighborhood").notNull().default(""),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  customerLat: numeric("customer_lat", { precision: 12, scale: 8 }),
  customerLng: numeric("customer_lng", { precision: 12, scale: 8 }),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
  orderType: orderTypeEnum("order_type").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  changeFor: numeric("change_for", { precision: 10, scale: 2 }),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  couponCode: text("coupon_code"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum("status").notNull().default("new"),
  mpPaymentId: text("mp_payment_id"),
  mpPreferenceId: text("mp_preference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true, orderNumber: true, createdAt: true, updatedAt: true, status: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
