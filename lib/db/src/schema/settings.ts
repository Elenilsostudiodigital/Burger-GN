import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  onlinePaymentEnabled: boolean("online_payment_enabled").notNull().default(false),
  gatewayProvider: text("gateway_provider").notNull().default(""), // 'mercadopago' | 'stripe' | ''
  cashOnDeliveryEnabled: boolean("cash_on_delivery_enabled").notNull().default(true),
  mercadoPagoAccessToken: text("mercado_pago_access_token"),
  mercadoPagoPublicKey: text("mercado_pago_public_key"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const whatsappSettingsTable = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  number: text("number").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const externalLinksTable = pgTable("external_links", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;
export type ExternalLink = typeof externalLinksTable.$inferSelect;
export type WhatsappSettings = typeof whatsappSettingsTable.$inferSelect;
