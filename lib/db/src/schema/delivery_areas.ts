import { pgTable, serial, text, numeric, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/** GeoJSON Polygon or MultiPolygon stored as jsonb (WGS84, [lng, lat]). */
export type DeliveryAreaPolygon =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** [minLng, minLat, maxLng, maxLat] */
export type DeliveryAreaBBox = [number, number, number, number];

/**
 * Map-drawn delivery areas (Áreas de Entrega).
 * - status: active (deliver) | blocked (risk / no delivery)
 * - enabled: quick on/off without redrawing the polygon
 * - Blocked (red) areas always prevail over active ones at resolve time
 */
export const deliveryAreasTable = pgTable("delivery_areas", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  city: text("city").notNull().default("Lauro de Freitas"),
  name: text("name").notNull(),
  color: text("color").notNull().default("#22c55e"),
  /** active = deliver; blocked = no delivery (risk zone) */
  status: text("status").notNull().default("active"),
  /** Quick toggle — disabled areas are ignored without deleting geometry */
  enabled: boolean("enabled").notNull().default(true),
  /** Required when status = blocked */
  blockReason: text("block_reason").notNull().default(""),
  minFee: numeric("min_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  feePerKm: numeric("fee_per_km", { precision: 10, scale: 2 }).notNull().default("0"),
  maxDistanceKm: numeric("max_distance_km", { precision: 10, scale: 2 }),
  notes: text("notes").notNull().default(""),
  priority: integer("priority").notNull().default(0),
  polygon: jsonb("polygon").$type<DeliveryAreaPolygon>().notNull(),
  bbox: jsonb("bbox").$type<DeliveryAreaBBox>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DeliveryArea = typeof deliveryAreasTable.$inferSelect;
export type InsertDeliveryArea = typeof deliveryAreasTable.$inferInsert;
