import {
  pgTable, serial, text, numeric, boolean, timestamp, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/**
 * Permanent approved delivery streets — learned from admin analysis.
 */
export const deliveryStreetsTable = pgTable("delivery_streets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  streetName: text("street_name").notNull(),
  /** Normalized key for exact match (lowercase, no accents/punctuation). */
  streetKey: text("street_key").notNull(),
  neighborhood: text("neighborhood").notNull().default(""),
  city: text("city").notNull().default("Lauro de Freitas"),
  cep: text("cep").notNull().default(""),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
  /** Estimated average travel time in minutes. */
  etaMinutes: integer("eta_minutes"),
  fee: numeric("fee", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  /** manual | pedido | importada */
  origin: text("origin").notNull().default("manual"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("delivery_streets_company_key_idx").on(t.companyId, t.streetKey),
  index("delivery_streets_company_active_idx").on(t.companyId, t.active),
]);

/**
 * Pending / resolved street analysis requests from customer checkouts.
 * orderId is soft (no FK) to avoid schema cycles with orders.
 */
export const deliveryStreetRequestsTable = pgTable("delivery_street_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  orderNumber: integer("order_number"),
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  streetName: text("street_name").notNull(),
  streetKey: text("street_key").notNull(),
  addressNumber: text("address_number").notNull().default(""),
  neighborhood: text("neighborhood").notNull().default(""),
  city: text("city").notNull().default("Lauro de Freitas"),
  cep: text("cep").notNull().default(""),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  /** Distance from existing checkout calc (haversine / KM system). */
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
  /** Optional route distance when OSRM is available (same lat/lng). */
  routeDistanceKm: numeric("route_distance_km", { precision: 10, scale: 2 }),
  etaMinutes: integer("eta_minutes"),
  suggestedFee: numeric("suggested_fee", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedAt: timestamp("reviewed_at"),
  streetId: integer("street_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("delivery_street_requests_company_status_idx").on(t.companyId, t.status),
  index("delivery_street_requests_company_key_idx").on(t.companyId, t.streetKey),
]);

export type DeliveryStreet = typeof deliveryStreetsTable.$inferSelect;
export type DeliveryStreetRequest = typeof deliveryStreetRequestsTable.$inferSelect;
