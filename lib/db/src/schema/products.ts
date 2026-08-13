import { pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { companiesTable } from "./company";

export interface ProductAddon {
  name: string;
  price: number;
}

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  image: text("image").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
  addons: jsonb("addons").$type<ProductAddon[]>().notNull().default([]),
  available: boolean("available").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  /** Marketing / promotions — defaults keep legacy products unchanged */
  isFeatured: boolean("is_featured").notNull().default(false),
  isPromotion: boolean("is_promotion").notNull().default(false),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  isFlashOffer: boolean("is_flash_offer").notNull().default(false),
  isClubeExclusive: boolean("is_clube_exclusive").notNull().default(false),
  promoOriginalPrice: numeric("promo_original_price", { precision: 10, scale: 2 }),
  promoPrice: numeric("promo_price", { precision: 10, scale: 2 }),
  promoStartsAt: timestamp("promo_starts_at"),
  promoEndsAt: timestamp("promo_ends_at"),
  marketingBadge: text("marketing_badge").notNull().default(""),
  /** Free-text promo headline shown on the menu (e.g. "Oferta da Semana") */
  promoText: text("promo_text").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
