import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./company";

export const clubeMemberTierEnum = pgEnum("clube_member_tier", [
  "bronze",
  "prata",
  "ouro",
  "diamante",
]);

export const clubeDiscountTypeEnum = pgEnum("clube_discount_type", [
  "percentage",
  "fixed",
]);

/** Configurações gerais do Clube Burger (1 por empresa). */
export const clubeSettingsTable = pgTable(
  "clube_settings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    clubName: text("club_name").notNull().default("Clube Burger"),
    welcomeMessage: text("welcome_message").notNull().default(
      "Bem-vindo ao Clube Burger! Acumule pontos, cashback e vantagens exclusivas.",
    ),
    pointsPerReal: numeric("points_per_real", { precision: 10, scale: 2 })
      .notNull()
      .default("1"),
    pointsRedeemValue: numeric("points_redeem_value", { precision: 10, scale: 2 })
      .notNull()
      .default("0.05"),
    cashbackPercent: numeric("cashback_percent", { precision: 10, scale: 2 })
      .notNull()
      .default("5"),
    cashbackMinOrder: numeric("cashback_min_order", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    /** Programa de selos por pedido concluído. */
    fidelityEnabled: boolean("fidelity_enabled").notNull().default(true),
    stampsRequired: integer("stamps_required").notNull().default(10),
    stampRewardTitle: text("stamp_reward_title")
      .notNull()
      .default("1 hambúrguer grátis"),
    /** Cashback automático em pedidos concluídos. */
    cashbackEnabled: boolean("cashback_enabled").notNull().default(true),
    /** Limite máximo de cashback por pedido (null = sem limite). */
    cashbackMaxPerOrder: numeric("cashback_max_per_order", { precision: 10, scale: 2 }),
    birthdayDiscountType: clubeDiscountTypeEnum("birthday_discount_type")
      .notNull()
      .default("percentage"),
    birthdayDiscountValue: numeric("birthday_discount_value", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("15"),
    birthdayDaysBefore: integer("birthday_days_before").notNull().default(3),
    birthdayDaysAfter: integer("birthday_days_after").notNull().default(3),
    earlyAccessHours: integer("early_access_hours").notNull().default(24),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clube_settings_company_idx").on(t.companyId)],
);

/** Membros do clube. */
export const clubeMembersTable = pgTable(
  "clube_members",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    birthDate: date("birth_date"),
    /** Selos de fidelidade (programa de carimbos). */
    points: integer("points").notNull().default(0),
    cashbackBalance: numeric("cashback_balance", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    /** Pontos de clube (distintos de selos; preenchidos em importações). */
    clubPoints: integer("club_points").notNull().default(0),
    /** Origem da última importação CSV (ex.: anota_ai, excel, outro). */
    importSource: text("import_source"),
    /** Primeira importação CSV deste cliente. */
    importedAt: timestamp("imported_at"),
    /** Última importação CSV deste cliente. */
    lastImport: timestamp("last_import"),
    tier: clubeMemberTierEnum("tier").notNull().default("bronze"),
    active: boolean("active").notNull().default(true),
    notes: text("notes").notNull().default(""),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

/**
 * Log de importações CSV de clientes.
 * Preparado para reuso futuro (export / outros sistemas).
 */
export const clientImportLogsTable = pgTable("client_import_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  userEmail: text("user_email").notNull().default(""),
  userName: text("user_name").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  source: text("source").notNull().default("outro"),
  totalRows: integer("total_rows").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorsJson: text("errors_json").notNull().default("[]"),
  optionsJson: text("options_json").notNull().default("{}"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Recompensas do programa de fidelidade (troca de pontos). */
export const clubeLoyaltyRewardsTable = pgTable("clube_loyalty_rewards", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  pointsCost: integer("points_cost").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Cupons exclusivos para membros. */
export const clubeExclusiveCouponsTable = pgTable(
  "clube_exclusive_coupons",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    discountType: clubeDiscountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
    minOrderValue: numeric("min_order_value", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("clube_exclusive_coupons_company_code_idx").on(t.companyId, t.code),
  ],
);

/** Benefícios de aniversário customizados. */
export const clubeBirthdayBenefitsTable = pgTable("clube_birthday_benefits", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  discountType: clubeDiscountTypeEnum("discount_type").notNull().default("percentage"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 })
    .notNull()
    .default("10"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Promoções com acesso antecipado para membros. */
export const clubeEarlyPromotionsTable = pgTable("clube_early_promotions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  discountType: clubeDiscountTypeEnum("discount_type").notNull().default("percentage"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 })
    .notNull()
    .default("10"),
  earlyAccessAt: timestamp("early_access_at").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClubeMemberSchema = createInsertSchema(clubeMembersTable).omit({
  id: true,
  createdAt: true,
  joinedAt: true,
});
export type InsertClubeMember = z.infer<typeof insertClubeMemberSchema>;
export type ClubeMember = typeof clubeMembersTable.$inferSelect;
export type ClubeSettings = typeof clubeSettingsTable.$inferSelect;
export type ClubeLoyaltyReward = typeof clubeLoyaltyRewardsTable.$inferSelect;
export type ClubeExclusiveCoupon = typeof clubeExclusiveCouponsTable.$inferSelect;
export type ClubeBirthdayBenefit = typeof clubeBirthdayBenefitsTable.$inferSelect;
export type ClubeEarlyPromotion = typeof clubeEarlyPromotionsTable.$inferSelect;
export type ClientImportLog = typeof clientImportLogsTable.$inferSelect;
