import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

export const kmDeliveryConfigTable = pgTable("km_delivery_config", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  baseAddress: text("base_address").notNull().default(""),
  baseLat: numeric("base_lat", { precision: 12, scale: 8 }).notNull().default("0"),
  baseLng: numeric("base_lng", { precision: 12, scale: 8 }).notNull().default("0"),
  minFee: numeric("min_fee", { precision: 10, scale: 2 }).notNull().default("5.00"),
  feePerKm: numeric("fee_per_km", { precision: 10, scale: 2 }).notNull().default("2.00"),
  maxDistanceKm: numeric("max_distance_km", { precision: 10, scale: 2 }).notNull().default("10.00"),
  /** When true, checkout resolves fee/coverage via drawn delivery areas first. */
  areasEnabled: boolean("areas_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kmDeliveryTiersTable = pgTable("km_delivery_tiers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  fromKm: numeric("from_km", { precision: 10, scale: 2 }).notNull(),
  toKm: numeric("to_km", { precision: 10, scale: 2 }), // null = "above fromKm"
  fee: numeric("fee", { precision: 10, scale: 2 }),    // null = consult WhatsApp
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type KmDeliveryConfig = typeof kmDeliveryConfigTable.$inferSelect;
export type KmDeliveryTier = typeof kmDeliveryTiersTable.$inferSelect;
