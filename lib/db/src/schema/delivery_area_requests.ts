import { pgTable, serial, text, numeric, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/**
 * Customer requests to analyze a location currently outside delivery coverage.
 */
export const deliveryAreaRequestsTable = pgTable("delivery_area_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  addressNumber: text("address_number").notNull().default(""),
  addressComplement: text("address_complement").notNull().default(""),
  neighborhood: text("neighborhood").notNull().default(""),
  city: text("city").notNull().default("Lauro de Freitas"),
  cep: text("cep").notNull().default(""),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
  /** pending | approved | rejected */
  status: text("status").notNull().default("pending"),
  /** rua | bairro | regiao — set on approve */
  coverageType: text("coverage_type"),
  areaId: integer("area_id"),
  streetId: integer("street_id"),
  zoneId: integer("zone_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("delivery_area_requests_company_status_idx").on(t.companyId, t.status),
]);

export type DeliveryAreaRequest = typeof deliveryAreaRequestsTable.$inferSelect;
export type InsertDeliveryAreaRequest = typeof deliveryAreaRequestsTable.$inferInsert;
