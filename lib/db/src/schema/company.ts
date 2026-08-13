import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companyPlanEnum = pgEnum("company_plan", ["basico", "pro", "premium"]);
export const companyStatusEnum = pgEnum("company_status", ["active", "blocked"]);
export const companyUserRoleEnum = pgEnum("company_user_role", ["owner", "staff"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing", "active", "past_due", "canceled",
]);

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDefaultStorefront: boolean("is_default_storefront").notNull().default(false),
  logoUrl: text("logo_url").notNull().default(""),
  primaryColor: text("primary_color").notNull().default("#f59e0b"),
  secondaryColor: text("secondary_color").notNull().default("#0a0a0a"),
  /** Public storefront profile (Configurações → Perfil) */
  photoUrl: text("photo_url").notNull().default(""),
  slogan: text("slogan").notNull().default(""),
  description: text("description").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  profileWhatsapp: text("profile_whatsapp").notNull().default(""),
  instagramUrl: text("instagram_url").notNull().default(""),
  facebookUrl: text("facebook_url").notNull().default(""),
  websiteUrl: text("website_url").notNull().default(""),
  bannerUrl: text("banner_url").notNull().default(""),
  displayOpenDays: text("display_open_days").notNull().default(""),
  displayHoursText: text("display_hours_text").notNull().default(""),
  menuWelcomeMessage: text("menu_welcome_message").notNull().default(""),
  plan: companyPlanEnum("plan").notNull().default("basico"),
  status: companyStatusEnum("status").notNull().default("active"),
  maxProducts: integer("max_products").notNull().default(30),
  maxUsers: integer("max_users").notNull().default(1),
  // Future billing (SaaS subscription), not yet wired to any payment processor
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("trialing"),
  planPriceCents: integer("plan_price_cents").notNull().default(0),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companyUsersTable = pgTable("company_users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Recovery contacts — delivery via email/SMS wired later */
  recoveryEmail: text("recovery_email").notNull().default(""),
  recoveryPhone: text("recovery_phone").notNull().default(""),
  role: companyUserRoleEnum("role").notNull().default("owner"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Password recovery tokens — email delivery wired later; structure only for now. */
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  companyUserId: integer("company_user_id").notNull().references(() => companyUsersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  /** reserved for future email provider status */
  emailStatus: text("email_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertCompanyUserSchema = createInsertSchema(companyUsersTable).omit({
  id: true, createdAt: true, passwordHash: true,
}).extend({ password: z.string().min(6) });

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
export type InsertCompanyUser = z.infer<typeof insertCompanyUserSchema>;
export type CompanyUser = typeof companyUsersTable.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
