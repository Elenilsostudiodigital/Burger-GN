import { Router } from "express";
import { db } from "@workspace/db";
import {
  clubeSettingsTable,
  clubeMembersTable,
  clubeLoyaltyRewardsTable,
  clubeExclusiveCouponsTable,
  clubeBirthdayBenefitsTable,
  clubeEarlyPromotionsTable,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import {
  normalizeClientPhone,
  parseClientNotes,
  serializeClientNotes,
} from "../lib/clientMeta";

const router = Router();

type DiscountType = "percentage" | "fixed";
type MemberTier = "bronze" | "prata" | "ouro" | "diamante";

async function ensureSettings(companyId: number) {
  const [existing] = await db
    .select()
    .from(clubeSettingsTable)
    .where(eq(clubeSettingsTable.companyId, companyId));
  if (existing) return existing;
  const [created] = await db
    .insert(clubeSettingsTable)
    .values({ companyId })
    .returning();
  return created;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/admin/clube/dashboard", requireCompanyAuth, async (req, res) => {
  try {
    const companyId = req.companyId!;
    await ensureSettings(companyId);

    const [{ members }] = await db
      .select({ members: sql<number>`COUNT(*)` })
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, companyId));

    const [{ activeMembers }] = await db
      .select({ activeMembers: sql<number>`COUNT(*) FILTER (WHERE active = true)` })
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, companyId));

    const [{ totalPoints }] = await db
      .select({ totalPoints: sql<number>`COALESCE(SUM(points), 0)` })
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, companyId));

    const [{ totalCashback }] = await db
      .select({
        totalCashback: sql<string>`COALESCE(SUM(cashback_balance), 0)`,
      })
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, companyId));

    const [{ exclusiveCoupons }] = await db
      .select({
        exclusiveCoupons: sql<number>`COUNT(*) FILTER (WHERE active = true)`,
      })
      .from(clubeExclusiveCouponsTable)
      .where(eq(clubeExclusiveCouponsTable.companyId, companyId));

    const [{ activePromos }] = await db
      .select({
        activePromos: sql<number>`COUNT(*) FILTER (WHERE active = true)`,
      })
      .from(clubeEarlyPromotionsTable)
      .where(eq(clubeEarlyPromotionsTable.companyId, companyId));

    const [{ loyaltyRewards }] = await db
      .select({
        loyaltyRewards: sql<number>`COUNT(*) FILTER (WHERE active = true)`,
      })
      .from(clubeLoyaltyRewardsTable)
      .where(eq(clubeLoyaltyRewardsTable.companyId, companyId));

    // Aniversariantes nos próximos 7 dias (mês/dia)
    const upcomingBirthdays = await db
      .select()
      .from(clubeMembersTable)
      .where(
        and(
          eq(clubeMembersTable.companyId, companyId),
          eq(clubeMembersTable.active, true),
          sql`${clubeMembersTable.birthDate} IS NOT NULL`,
        ),
      )
      .orderBy(desc(clubeMembersTable.joinedAt))
      .limit(50);

    const now = new Date();
    const birthdaysSoon = upcomingBirthdays
      .filter((m) => {
        if (!m.birthDate) return false;
        const bd = new Date(m.birthDate);
        const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
        const diff = (thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        const adjusted = diff < -1 ? diff + 365 : diff;
        return adjusted >= -1 && adjusted <= 7;
      })
      .slice(0, 10);

    res.json({
      members: Number(members),
      activeMembers: Number(activeMembers),
      totalPoints: Number(totalPoints),
      totalCashback: parseFloat(totalCashback ?? "0"),
      exclusiveCoupons: Number(exclusiveCoupons),
      activePromos: Number(activePromos),
      loyaltyRewards: Number(loyaltyRewards),
      upcomingBirthdays: birthdaysSoon,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch clube dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get("/admin/clube/settings", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await ensureSettings(req.companyId!);
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch clube settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube/settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureSettings(req.companyId!);
    const body = req.body as Partial<{
      enabled: boolean;
      clubName: string;
      welcomeMessage: string;
      pointsPerReal: string;
      pointsRedeemValue: string;
      cashbackPercent: string;
      cashbackMinOrder: string;
      birthdayDiscountType: DiscountType;
      birthdayDiscountValue: string;
      birthdayDaysBefore: number;
      birthdayDaysAfter: number;
      earlyAccessHours: number;
    }>;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "enabled",
      "clubName",
      "welcomeMessage",
      "pointsPerReal",
      "pointsRedeemValue",
      "cashbackPercent",
      "cashbackMinOrder",
      "birthdayDiscountType",
      "birthdayDiscountValue",
      "birthdayDaysBefore",
      "birthdayDaysAfter",
      "earlyAccessHours",
    ] as const) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const [settings] = await db
      .update(clubeSettingsTable)
      .set(updateData)
      .where(eq(clubeSettingsTable.companyId, req.companyId!))
      .returning();
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to update clube settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Members ──────────────────────────────────────────────────────────────────
router.get("/admin/clube/members", requireCompanyAuth, async (req, res) => {
  try {
    const members = await db
      .select()
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, req.companyId!))
      .orderBy(desc(clubeMembersTable.joinedAt));
    res.json(members);
  } catch (err) {
    req.log.error({ err }, "Failed to list clube members");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/clube/members", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      name: string;
      email?: string;
      phone?: string;
      birthDate?: string | null;
      points?: number;
      cashbackBalance?: string;
      tier?: MemberTier;
      active?: boolean;
      notes?: string;
    };
    if (!body.name?.trim()) {
      res.status(400).json({ error: "Nome é obrigatório" });
      return;
    }
    const rawPhone = (body.phone ?? "").trim();
    const phone = rawPhone ? normalizeClientPhone(rawPhone) || rawPhone : "";
    const [member] = await db
      .insert(clubeMembersTable)
      .values({
        companyId: req.companyId!,
        name: body.name.trim(),
        email: (body.email ?? "").trim().toLowerCase(),
        phone,
        birthDate: body.birthDate || null,
        points: body.points ?? 0,
        cashbackBalance: body.cashbackBalance ?? "0",
        tier: body.tier ?? "bronze",
        active: body.active ?? true,
        notes: serializeClientNotes(body.notes ?? "", { origin: "cadastro_administrativo" }),
      })
      .returning();
    res.status(201).json(member);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create clube member");
    const msg =
      err instanceof Error && err.message.includes("unique")
        ? "Telefone já cadastrado"
        : "Internal server error";
    res.status(msg === "Telefone já cadastrado" ? 409 : 500).json({ error: msg });
  }
});

router.put("/admin/clube/members/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      name: string;
      email: string;
      phone: string;
      birthDate: string | null;
      points: number;
      cashbackBalance: string;
      tier: MemberTier;
      active: boolean;
      notes: string;
    }>;
    const updateData: Record<string, unknown> = { ...body };
    if (body.email !== undefined) updateData["email"] = body.email.trim().toLowerCase();
    if (body.phone !== undefined) {
      const raw = body.phone.trim();
      updateData["phone"] = raw ? normalizeClientPhone(raw) || raw : "";
    }
    if (body.name !== undefined) updateData["name"] = body.name.trim();
    if (body.birthDate !== undefined) updateData["birthDate"] = body.birthDate || null;

    // Preserve CRM origin meta embedded in notes (Clientes module).
    if (body.notes !== undefined) {
      const [existing] = await db
        .select()
        .from(clubeMembersTable)
        .where(
          and(
            eq(clubeMembersTable.id, id),
            eq(clubeMembersTable.companyId, req.companyId!),
          ),
        );
      if (existing) {
        const { meta } = parseClientNotes(existing.notes);
        updateData["notes"] = serializeClientNotes(String(body.notes || ""), meta);
      }
    }

    const [member] = await db
      .update(clubeMembersTable)
      .set(updateData)
      .where(
        and(
          eq(clubeMembersTable.id, id),
          eq(clubeMembersTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!member) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(member);
  } catch (err) {
    req.log.error({ err }, "Failed to update clube member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/clube/members/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeMembersTable)
      .where(
        and(
          eq(clubeMembersTable.id, id),
          eq(clubeMembersTable.companyId, req.companyId!),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete clube member");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Loyalty rewards ──────────────────────────────────────────────────────────
router.get("/admin/clube/loyalty", requireCompanyAuth, async (req, res) => {
  try {
    const rewards = await db
      .select()
      .from(clubeLoyaltyRewardsTable)
      .where(eq(clubeLoyaltyRewardsTable.companyId, req.companyId!))
      .orderBy(desc(clubeLoyaltyRewardsTable.createdAt));
    res.json(rewards);
  } catch (err) {
    req.log.error({ err }, "Failed to list loyalty rewards");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/clube/loyalty", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      title: string;
      description?: string;
      pointsCost: number;
      active?: boolean;
    };
    if (!body.title?.trim() || body.pointsCost == null) {
      res.status(400).json({ error: "Título e custo em pontos são obrigatórios" });
      return;
    }
    const [reward] = await db
      .insert(clubeLoyaltyRewardsTable)
      .values({
        companyId: req.companyId!,
        title: body.title.trim(),
        description: body.description ?? "",
        pointsCost: Number(body.pointsCost),
        active: body.active ?? true,
      })
      .returning();
    res.status(201).json(reward);
  } catch (err) {
    req.log.error({ err }, "Failed to create loyalty reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube/loyalty/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      title: string;
      description: string;
      pointsCost: number;
      active: boolean;
    }>;
    const [reward] = await db
      .update(clubeLoyaltyRewardsTable)
      .set(body)
      .where(
        and(
          eq(clubeLoyaltyRewardsTable.id, id),
          eq(clubeLoyaltyRewardsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!reward) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(reward);
  } catch (err) {
    req.log.error({ err }, "Failed to update loyalty reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/clube/loyalty/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeLoyaltyRewardsTable)
      .where(
        and(
          eq(clubeLoyaltyRewardsTable.id, id),
          eq(clubeLoyaltyRewardsTable.companyId, req.companyId!),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete loyalty reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Cashback (usa settings + saldo dos membros) ───────────────────────────────
router.get("/admin/clube/cashback", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await ensureSettings(req.companyId!);
    const members = await db
      .select()
      .from(clubeMembersTable)
      .where(
        and(
          eq(clubeMembersTable.companyId, req.companyId!),
          sql`CAST(${clubeMembersTable.cashbackBalance} AS NUMERIC) > 0`,
        ),
      )
      .orderBy(desc(clubeMembersTable.cashbackBalance))
      .limit(50);

    const [{ totalBalance }] = await db
      .select({
        totalBalance: sql<string>`COALESCE(SUM(cashback_balance), 0)`,
      })
      .from(clubeMembersTable)
      .where(eq(clubeMembersTable.companyId, req.companyId!));

    res.json({
      cashbackPercent: settings.cashbackPercent,
      cashbackMinOrder: settings.cashbackMinOrder,
      totalBalance: parseFloat(totalBalance ?? "0"),
      membersWithBalance: members,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch cashback data");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube/cashback", requireCompanyAuth, async (req, res) => {
  try {
    await ensureSettings(req.companyId!);
    const body = req.body as Partial<{
      cashbackPercent: string;
      cashbackMinOrder: string;
    }>;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.cashbackPercent !== undefined) updateData["cashbackPercent"] = body.cashbackPercent;
    if (body.cashbackMinOrder !== undefined) updateData["cashbackMinOrder"] = body.cashbackMinOrder;

    const [settings] = await db
      .update(clubeSettingsTable)
      .set(updateData)
      .where(eq(clubeSettingsTable.companyId, req.companyId!))
      .returning();
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to update cashback settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Exclusive coupons ────────────────────────────────────────────────────────
router.get("/admin/clube/exclusive-coupons", requireCompanyAuth, async (req, res) => {
  try {
    const coupons = await db
      .select()
      .from(clubeExclusiveCouponsTable)
      .where(eq(clubeExclusiveCouponsTable.companyId, req.companyId!))
      .orderBy(desc(clubeExclusiveCouponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    req.log.error({ err }, "Failed to list exclusive coupons");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/clube/exclusive-coupons", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      code: string;
      title?: string;
      description?: string;
      discountType: DiscountType;
      discountValue: string;
      minOrderValue?: string;
      maxUses?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };
    if (!body.code || !body.discountType || !body.discountValue) {
      res.status(400).json({ error: "code, discountType and discountValue are required" });
      return;
    }
    const [coupon] = await db
      .insert(clubeExclusiveCouponsTable)
      .values({
        companyId: req.companyId!,
        code: body.code.toUpperCase().trim(),
        title: body.title ?? "",
        description: body.description ?? "",
        discountType: body.discountType,
        discountValue: body.discountValue,
        minOrderValue: body.minOrderValue ?? "0",
        maxUses: body.maxUses ?? null,
        active: body.active ?? true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning();
    res.status(201).json(coupon);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create exclusive coupon");
    const msg =
      err instanceof Error && err.message.includes("unique")
        ? "Código já existe"
        : "Internal server error";
    res.status(msg === "Código já existe" ? 409 : 500).json({ error: msg });
  }
});

router.put("/admin/clube/exclusive-coupons/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      code: string;
      title: string;
      description: string;
      discountType: DiscountType;
      discountValue: string;
      minOrderValue: string;
      maxUses: number | null;
      active: boolean;
      expiresAt: string | null;
    }>;
    const updateData: Record<string, unknown> = { ...body };
    if (body.code) updateData["code"] = body.code.toUpperCase().trim();
    if (body.expiresAt !== undefined) {
      updateData["expiresAt"] = body.expiresAt ? new Date(body.expiresAt) : null;
    }
    const [coupon] = await db
      .update(clubeExclusiveCouponsTable)
      .set(updateData)
      .where(
        and(
          eq(clubeExclusiveCouponsTable.id, id),
          eq(clubeExclusiveCouponsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!coupon) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(coupon);
  } catch (err) {
    req.log.error({ err }, "Failed to update exclusive coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/clube/exclusive-coupons/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeExclusiveCouponsTable)
      .where(
        and(
          eq(clubeExclusiveCouponsTable.id, id),
          eq(clubeExclusiveCouponsTable.companyId, req.companyId!),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete exclusive coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Birthday benefits ────────────────────────────────────────────────────────
router.get("/admin/clube/birthday-benefits", requireCompanyAuth, async (req, res) => {
  try {
    const benefits = await db
      .select()
      .from(clubeBirthdayBenefitsTable)
      .where(eq(clubeBirthdayBenefitsTable.companyId, req.companyId!))
      .orderBy(desc(clubeBirthdayBenefitsTable.createdAt));
    res.json(benefits);
  } catch (err) {
    req.log.error({ err }, "Failed to list birthday benefits");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/clube/birthday-benefits", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      title: string;
      description?: string;
      discountType?: DiscountType;
      discountValue?: string;
      active?: boolean;
    };
    if (!body.title?.trim()) {
      res.status(400).json({ error: "Título é obrigatório" });
      return;
    }
    const [benefit] = await db
      .insert(clubeBirthdayBenefitsTable)
      .values({
        companyId: req.companyId!,
        title: body.title.trim(),
        description: body.description ?? "",
        discountType: body.discountType ?? "percentage",
        discountValue: body.discountValue ?? "10",
        active: body.active ?? true,
      })
      .returning();
    res.status(201).json(benefit);
  } catch (err) {
    req.log.error({ err }, "Failed to create birthday benefit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube/birthday-benefits/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      title: string;
      description: string;
      discountType: DiscountType;
      discountValue: string;
      active: boolean;
    }>;
    const [benefit] = await db
      .update(clubeBirthdayBenefitsTable)
      .set(body)
      .where(
        and(
          eq(clubeBirthdayBenefitsTable.id, id),
          eq(clubeBirthdayBenefitsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!benefit) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(benefit);
  } catch (err) {
    req.log.error({ err }, "Failed to update birthday benefit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/clube/birthday-benefits/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeBirthdayBenefitsTable)
      .where(
        and(
          eq(clubeBirthdayBenefitsTable.id, id),
          eq(clubeBirthdayBenefitsTable.companyId, req.companyId!),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete birthday benefit");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Early promotions ─────────────────────────────────────────────────────────
router.get("/admin/clube/early-promotions", requireCompanyAuth, async (req, res) => {
  try {
    const promos = await db
      .select()
      .from(clubeEarlyPromotionsTable)
      .where(eq(clubeEarlyPromotionsTable.companyId, req.companyId!))
      .orderBy(desc(clubeEarlyPromotionsTable.createdAt));
    res.json(promos);
  } catch (err) {
    req.log.error({ err }, "Failed to list early promotions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/clube/early-promotions", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      title: string;
      description?: string;
      discountType?: DiscountType;
      discountValue?: string;
      earlyAccessAt: string;
      startsAt: string;
      endsAt?: string | null;
      active?: boolean;
    };
    if (!body.title?.trim() || !body.earlyAccessAt || !body.startsAt) {
      res.status(400).json({ error: "Título, acesso antecipado e início são obrigatórios" });
      return;
    }
    const [promo] = await db
      .insert(clubeEarlyPromotionsTable)
      .values({
        companyId: req.companyId!,
        title: body.title.trim(),
        description: body.description ?? "",
        discountType: body.discountType ?? "percentage",
        discountValue: body.discountValue ?? "10",
        earlyAccessAt: new Date(body.earlyAccessAt),
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        active: body.active ?? true,
      })
      .returning();
    res.status(201).json(promo);
  } catch (err) {
    req.log.error({ err }, "Failed to create early promotion");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube/early-promotions/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      title: string;
      description: string;
      discountType: DiscountType;
      discountValue: string;
      earlyAccessAt: string;
      startsAt: string;
      endsAt: string | null;
      active: boolean;
    }>;
    const updateData: Record<string, unknown> = { ...body };
    if (body.earlyAccessAt) updateData["earlyAccessAt"] = new Date(body.earlyAccessAt);
    if (body.startsAt) updateData["startsAt"] = new Date(body.startsAt);
    if (body.endsAt !== undefined) {
      updateData["endsAt"] = body.endsAt ? new Date(body.endsAt) : null;
    }
    const [promo] = await db
      .update(clubeEarlyPromotionsTable)
      .set(updateData)
      .where(
        and(
          eq(clubeEarlyPromotionsTable.id, id),
          eq(clubeEarlyPromotionsTable.companyId, req.companyId!),
        ),
      )
      .returning();
    if (!promo) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(promo);
  } catch (err) {
    req.log.error({ err }, "Failed to update early promotion");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/clube/early-promotions/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeEarlyPromotionsTable)
      .where(
        and(
          eq(clubeEarlyPromotionsTable.id, id),
          eq(clubeEarlyPromotionsTable.companyId, req.companyId!),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete early promotion");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
