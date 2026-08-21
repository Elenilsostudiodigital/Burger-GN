import { pgTable, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/** Company-scoped kitchen printer preferences (JSON document). */
export const printerSettingsTable = pgTable("printer_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .unique()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PrinterSettingsRow = typeof printerSettingsTable.$inferSelect;
