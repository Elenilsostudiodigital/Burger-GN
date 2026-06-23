import { Router } from "express";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] || "burger123";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  signed: true,
};

router.post("/admin/login", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Senha incorreta" });
    return;
  }
  res.cookie("admin_session", "true", COOKIE_OPTS);
  res.json({ ok: true });
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie("admin_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/admin/me", requireAdmin, (req, res) => {
  res.json({ authenticated: true });
});

export default router;
