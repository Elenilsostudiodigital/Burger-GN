import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, companyUsersTable, companiesTable, passwordResetTokensTable } from "@workspace/db";
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

/** Shared password rules for change-password (does not alter login). */
function validateNewPassword(password: string): string | null {
  if (!password || !password.trim()) return "Informe a nova senha.";
  if (password.length < 8) return "A nova senha deve ter no mínimo 8 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
    return "A nova senha deve conter letras e números.";
  }
  return null;
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

/**
 * Change password for the authenticated admin user.
 * Does not alter the login flow — only updates password_hash after verifying current password.
 */
router.post("/admin/change-password", requireCompanyAuth, async (req, res) => {
  try {
    await ensureCompanySchema();
    const body = req.body as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword) {
      res.status(400).json({ error: "Informe a senha atual." });
      return;
    }
    if (!confirmPassword) {
      res.status(400).json({ error: "Confirme a nova senha." });
      return;
    }
    const weak = validateNewPassword(newPassword);
    if (weak) {
      res.status(400).json({ error: weak });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "A nova senha e a confirmação não coincidem." });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: "A nova senha deve ser diferente da senha atual." });
      return;
    }

    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, req.companyUserId!));

    if (!user || !user.active || user.companyId !== req.companyId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      res.status(400).json({ error: "Senha atual incorreta." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(companyUsersTable)
      .set({ passwordHash })
      .where(eq(companyUsersTable.id, user.id));

    res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (err) {
    logger.error({ err }, "Admin change-password failed");
    res.status(500).json({ error: "Não foi possível alterar a senha. Tente novamente." });
  }
});

/**
 * Password recovery request — architecture only.
 * Stores a reset token and marks email as pending. Does NOT send email yet.
 * Always returns the same success message (no email enumeration).
 */
router.post("/admin/forgot-password", async (req, res) => {
  try {
    await ensureCompanySchema();
    const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!emailRaw || !emailRaw.includes("@")) {
      res.status(400).json({ error: "Informe um e-mail válido." });
      return;
    }

    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.email, emailRaw));

    if (user && user.active) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await db.insert(passwordResetTokensTable).values({
        companyUserId: user.id,
        email: emailRaw,
        tokenHash,
        expiresAt,
        emailStatus: "pending", // future: queued → sent via email provider
      });
      // Future: send email with reset link containing `token`.
      logger.info(
        { email: emailRaw, userId: user.id, emailStatus: "pending" },
        "Password reset requested (email delivery not implemented yet)",
      );
    }

    res.json({
      ok: true,
      message:
        "Se o e-mail estiver cadastrado, registramos o pedido de recuperação. O envio de e-mail será ativado em breve.",
      emailDelivery: "pending",
    });
  } catch (err) {
    logger.error({ err }, "Admin forgot-password failed");
    res.status(500).json({ error: "Não foi possível registrar a recuperação. Tente novamente." });
  }
});

export default router;
