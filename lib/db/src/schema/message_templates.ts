import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./company";

/** Per-company automatic WhatsApp / status message templates. */
export const messageTemplatesTable = pgTable(
  "message_templates",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    templateKey: text("template_key").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_templates_company_key_uidx").on(t.companyId, t.templateKey),
  ],
);

export type MessageTemplateRow = typeof messageTemplatesTable.$inferSelect;
