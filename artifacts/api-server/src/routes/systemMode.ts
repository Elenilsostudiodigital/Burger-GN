import { Router } from "express";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { readSystemMode, writeSystemModeOverride } from "../lib/systemModeStore";

const router = Router();

router.get("/system-mode", resolvePublicCompany, async (req, res) => {
  try {
    res.json(await readSystemMode(req.companyId!));
  } catch (err) {
    req.log.error({ err }, "Failed to read system mode");
    res.status(500).json({ error: "Falha ao ler o modo do sistema." });
  }
});

router.get("/admin/system-mode", requireCompanyAuth, async (req, res) => {
  try {
    res.json(await readSystemMode(req.companyId!));
  } catch (err) {
    req.log.error({ err }, "Failed to read admin system mode");
    res.status(500).json({ error: "Falha ao ler o modo do sistema." });
  }
});

router.post("/admin/system-mode", requireCompanyAuth, async (req, res) => {
  try {
    const raw = (req.body as { mode?: unknown } | undefined)?.mode;
    if (raw !== "operation" && raw !== "sleep") {
      res.status(400).json({ error: "Modo inválido" });
      return;
    }
    res.json(await writeSystemModeOverride(req.companyId!, raw));
  } catch (err) {
    req.log.error({ err }, "Failed to write system mode");
    res.status(500).json({ error: "Falha ao salvar o modo do sistema." });
  }
});

export default router;
