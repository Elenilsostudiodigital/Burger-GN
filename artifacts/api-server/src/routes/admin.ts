import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, companyUsersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  signed: true,
};

router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(401).json({ error: "Informe e-mail e senha" });
    return;
  }

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
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie("company_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/admin/me", requireCompanyAuth, async (req, res) => {
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
});

export default router;
