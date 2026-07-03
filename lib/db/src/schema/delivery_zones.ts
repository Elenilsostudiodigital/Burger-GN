import { pgTable, serial, text, numeric, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./company";

export const deliveryZonesTable = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  neighborhood: text("neighborhood").notNull(),
  fee: numeric("fee", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  // Future: lat/lng bounding polygon for map-based calculation
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("delivery_zones_company_neighborhood_idx").on(t.companyId, t.neighborhood),
]);

export const insertDeliveryZoneSchema = createInsertSchema(deliveryZonesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeliveryZone = z.infer<typeof insertDeliveryZoneSchema>;
export type DeliveryZone = typeof deliveryZonesTable.$inferSelect;
