import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  onlinePaymentEnabled: boolean("online_payment_enabled").notNull().default(false),
  gatewayProvider: text("gateway_provider").notNull().default(""), // 'mercadopago' | 'stripe' | ''
  cashOnDeliveryEnabled: boolean("cash_on_delivery_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const externalLinksTable = pgTable("external_links", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;
export type ExternalLink = typeof externalLinksTable.$inferSelect;
