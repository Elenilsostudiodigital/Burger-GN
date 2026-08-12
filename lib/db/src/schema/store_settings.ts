import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/**
 * Per-company establishment profile: hours, manual open/close, branding, contact.
 * `openingHours` is JSON text: DayHours[].
 */
export const storeSettingsTable = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  /** JSON: [{ day: 0-6 (Sun-Sat), enabled, open: "HH:mm", close: "HH:mm" }, ...] */
  openingHours: text("opening_hours").notNull().default("[]"),
  /** Manual open/close. When false, store is always closed (priority over schedule). */
  manualOpen: boolean("manual_open").notNull().default(true),
  /** When true, also require current time within opening_hours (if manualOpen). */
  useAutomaticSchedule: boolean("use_automatic_schedule").notNull().default(false),
  logoUrl: text("logo_url").notNull().default(""),
  bannerUrl: text("banner_url").notNull().default(""),
  storeName: text("store_name").notNull().default("The Burger GN"),
  description: text("description").notNull().default(""),
  phone: text("phone").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  zipCode: text("zip_code").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
