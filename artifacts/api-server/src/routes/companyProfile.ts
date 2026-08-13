import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable, companyUsersTable } from "@workspace/db";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { ensureCompanySchema } from "../lib/ensureCompanySchema";
import { logger } from "../lib/logger";

const router = Router();

export type CompanyProfilePublic = {
  name: string;
  logoUrl: string;
  photoUrl: string;
  slogan: string;
  description: string;
  address: string;
  phone: string;
  profileWhatsapp: string;
  instagramUrl: string;
  facebookUrl: string;
  websiteUrl: string;
  bannerUrl: string;
  displayOpenDays: string;
  displayHoursText: string;
  menuWelcomeMessage: string;
  primaryColor: string;
  secondaryColor: string;
};

function mapProfile(row: typeof companiesTable.$inferSelect): CompanyProfilePublic {
  return {
    name: row.name || "The Burger GN",
    logoUrl: row.logoUrl || "",
    photoUrl: row.photoUrl || "",
    slogan: row.slogan || "",
    description: row.description || "",
    address: row.address || "",
    phone: row.phone || "",
    profileWhatsapp: row.profileWhatsapp || "",
    instagramUrl: row.instagramUrl || "",
    facebookUrl: row.facebookUrl || "",
    websiteUrl: row.websiteUrl || "",
    bannerUrl: row.bannerUrl || "",
    displayOpenDays: row.displayOpenDays || "",
    displayHoursText: row.displayHoursText || "",
    menuWelcomeMessage: row.menuWelcomeMessage || "",
    primaryColor: row.primaryColor || "#f59e0b",
    secondaryColor: row.secondaryColor || "#0a0a0a",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone);
  return digits.length >= 10 && digits.length <= 13;
}

router.get("/company-profile", resolvePublicCompany, async (req, res) => {
  try {
    await ensureCompanySchema();
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));
    if (!company) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json(mapProfile(company));
  } catch (err) {
    logger.error({ err }, "Failed to get public company profile");
    res.status(500).json({ error: "Falha ao carregar perfil da loja." });
  }
});

router.get("/admin/company-profile", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));
    if (!company) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json(mapProfile(company));
  } catch (err) {
    logger.error({ err }, "Failed to get admin company profile");
    res.status(500).json({ error: "Falha ao carregar perfil." });
  }
});

router.put("/admin/company-profile", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const body = req.body ?? {};
    const name = str(body.name);
    if (!name) {
      res.status(400).json({ error: "Informe o nome da empresa." });
      return;
    }

    const websiteUrl = str(body.websiteUrl);
    const instagramUrl = str(body.instagramUrl);
    const facebookUrl = str(body.facebookUrl);
    for (const [label, url] of [
      ["Site", websiteUrl],
      ["Instagram", instagramUrl],
      ["Facebook", facebookUrl],
    ] as const) {
      if (url && !/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: `${label}: use uma URL completa (https://...).` });
        return;
      }
    }

    const phone = str(body.phone);
    if (phone && !isValidPhone(phone)) {
      res.status(400).json({ error: "Telefone inválido. Use DDD + número." });
      return;
    }
    const profileWhatsapp = str(body.profileWhatsapp);
    if (profileWhatsapp && !isValidPhone(profileWhatsapp)) {
      res.status(400).json({ error: "WhatsApp inválido. Use DDI + DDD + número." });
      return;
    }

    const [updated] = await db
      .update(companiesTable)
      .set({
        name,
        logoUrl: str(body.logoUrl),
        photoUrl: str(body.photoUrl),
        slogan: str(body.slogan),
        description: str(body.description),
        address: str(body.address),
        phone,
        profileWhatsapp,
        instagramUrl,
        facebookUrl,
        websiteUrl,
        bannerUrl: str(body.bannerUrl),
        displayOpenDays: str(body.displayOpenDays),
        displayHoursText: str(body.displayHoursText),
        menuWelcomeMessage: str(body.menuWelcomeMessage),
        updatedAt: new Date(),
      })
      .where(eq(companiesTable.id, req.companyId!))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json({ ok: true, message: "Perfil salvo com sucesso.", profile: mapProfile(updated) });
  } catch (err) {
    logger.error({ err }, "Failed to update company profile");
    res.status(500).json({ error: "Não foi possível salvar o perfil." });
  }
});

router.get("/admin/recovery-contacts", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, req.companyUserId!));
    if (!user || user.companyId !== req.companyId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      loginEmail: user.email,
      recoveryEmail: user.recoveryEmail || "",
      recoveryPhone: user.recoveryPhone || "",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get recovery contacts");
    res.status(500).json({ error: "Falha ao carregar contatos de recuperação." });
  }
});

router.put("/admin/recovery-email", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const recoveryEmail = str(req.body?.recoveryEmail ?? req.body?.email);
    if (!recoveryEmail) {
      res.status(400).json({ error: "Informe o e-mail de recuperação." });
      return;
    }
    if (!isValidEmail(recoveryEmail)) {
      res.status(400).json({ error: "E-mail inválido." });
      return;
    }
    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, req.companyUserId!));
    if (!user || user.companyId !== req.companyId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    await db
      .update(companyUsersTable)
      .set({ recoveryEmail })
      .where(eq(companyUsersTable.id, user.id));
    res.json({ ok: true, message: "E-mail de recuperação salvo com sucesso.", recoveryEmail });
  } catch (err) {
    logger.error({ err }, "Failed to update recovery email");
    res.status(500).json({ error: "Não foi possível salvar o e-mail." });
  }
});

router.put("/admin/recovery-phone", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const raw = str(req.body?.recoveryPhone ?? req.body?.phone);
    if (!raw) {
      res.status(400).json({ error: "Informe o telefone de recuperação." });
      return;
    }
    if (!isValidPhone(raw)) {
      res.status(400).json({ error: "Telefone inválido. Use DDD + número." });
      return;
    }
    const recoveryPhone = normalizePhone(raw);
    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, req.companyUserId!));
    if (!user || user.companyId !== req.companyId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    await db
      .update(companyUsersTable)
      .set({ recoveryPhone })
      .where(eq(companyUsersTable.id, user.id));
    res.json({ ok: true, message: "Telefone de recuperação salvo com sucesso.", recoveryPhone });
  } catch (err) {
    logger.error({ err }, "Failed to update recovery phone");
    res.status(500).json({ error: "Não foi possível salvar o telefone." });
  }
});

export default router;
