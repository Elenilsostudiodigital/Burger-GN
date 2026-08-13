import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface BusinessHoursDaySchedule {
  /** When false, the store is closed that weekday. */
  active: boolean;
  /** Local open time HH:mm (America/Sao_Paulo). */
  open: string;
  /** Local close time HH:mm (America/Sao_Paulo). */
  close: string;
}

export type WeeklySchedule = Record<WeekdayKey, BusinessHoursDaySchedule>;

/** `auto` follows weekly schedule (+ today exception). `open`/`closed` force status immediately. */
export type BusinessHoursManualMode = "auto" | "open" | "closed";

export const businessHoursSettingsTable = pgTable("business_hours_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, {
    onDelete: "cascade",
  }),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  manualMode: text("manual_mode").notNull().default("auto").$type<BusinessHoursManualMode>(),
  weeklySchedule: jsonb("weekly_schedule").$type<WeeklySchedule>().notNull(),
  /** YYYY-MM-DD in store timezone; null = no exception. */
  exceptionDate: text("exception_date"),
  exceptionClosed: boolean("exception_closed").notNull().default(false),
  exceptionOpen: text("exception_open"),
  exceptionClose: text("exception_close"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BusinessHoursSettings = typeof businessHoursSettingsTable.$inferSelect;
