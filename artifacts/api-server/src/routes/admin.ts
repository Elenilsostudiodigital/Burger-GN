import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, companyUsersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { ensureCompanySchema } from "../lib/ensureCompanySchema";
import { logger } from "../lib/logger";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  signed: true,
};

function loginFailureMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err ?? "");
  if (/relation .* does not exist/i.test(detail)) {
    return "Banco de dados incompleto para login. Aguarde alguns segundos e tente novamente.";
  }
  if (/timeout|ECONNREFUSED|ENOTFOUND|connection/i.test(detail)) {
    return "Não foi possível conectar ao banco de dados. Tente novamente em instantes.";
  }
  return "Falha interna ao autenticar. Tente novamente em instantes.";
}

router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(401).json({ error: "Informe e-mail e senha" });
      return;
    }

    // Ensure tables + default owner exist before the first query.
    await ensureCompanySchema();

    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.email, email.trim().toLowerCase()));

    if (!user || !user.active) {
      res.status(401).json({ error: "E-mail ou senha incorretos" });
      return;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      res.status(401).json({ error: "E-mail ou senha incorretos" });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId));

    if (!company || company.status === "blocked") {
      res.status(403).json({ error: "Empresa bloqueada. Entre em contato com o suporte." });
      return;
    }

    res.cookie(
      "company_session",
      JSON.stringify({ companyId: user.companyId, userId: user.id }),
      COOKIE_OPTS,
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin login failed");
    res.status(500).json({ error: loginFailureMessage(err) });
  }
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie("company_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/admin/me", requireCompanyAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, req.companyUserId!));
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    if (!user || !company) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({
      authenticated: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        logoUrl: company.logoUrl,
        primaryColor: company.primaryColor,
        secondaryColor: company.secondaryColor,
        plan: company.plan,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin me failed");
    res.status(500).json({ error: "Falha ao validar sessão administrativa." });
  }
});

export default router;
