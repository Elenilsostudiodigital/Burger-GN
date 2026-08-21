import { Router } from "express";
import { db, printerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { ensurePrinterSettingsSchema } from "../lib/ensurePrinterSettingsSchema";
import { normalizePrinterSettings } from "../lib/printerSettings";

const router = Router();

router.get("/admin/printer-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensurePrinterSettingsSchema();
    const [row] = await db
      .select()
      .from(printerSettingsTable)
      .where(eq(printerSettingsTable.companyId, req.companyId!));
    res.json({ config: normalizePrinterSettings(row?.config ?? {}) });
  } catch (err) {
    req.log.error({ err }, "Failed to get printer settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/printer-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensurePrinterSettingsSchema();
    const body = req.body as { config?: unknown };
    const config = normalizePrinterSettings(body.config ?? {});
    const configJson = config as unknown as Record<string, unknown>;

    const [existing] = await db
      .select()
      .from(printerSettingsTable)
      .where(eq(printerSettingsTable.companyId, req.companyId!));

    if (existing) {
      const [updated] = await db
        .update(printerSettingsTable)
        .set({ config: configJson, updatedAt: new Date() })
        .where(eq(printerSettingsTable.companyId, req.companyId!))
        .returning();
      res.json({ config: normalizePrinterSettings(updated!.config) });
      return;
    }

    const [created] = await db
      .insert(printerSettingsTable)
      .values({ companyId: req.companyId!, config: configJson })
      .returning();
    res.json({ config: normalizePrinterSettings(created!.config) });
  } catch (err) {
    req.log.error({ err }, "Failed to save printer settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
