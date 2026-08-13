import { Router } from "express";
import { db } from "@workspace/db";
import { notificationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { ensureNotificationSettingsSchema } from "../lib/ensureNotificationSettingsSchema";

const router = Router();

router.get("/admin/notification-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureNotificationSettingsSchema();
    const [row] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.companyId, req.companyId!));
    res.json({ config: row?.config ?? {} });
  } catch (err) {
    req.log.error({ err }, "Failed to get notification settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/notification-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureNotificationSettingsSchema();
    const body = req.body as { config?: Record<string, unknown> };
    const config =
      body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? body.config
        : {};

    const [existing] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.companyId, req.companyId!));

    if (existing) {
      const [updated] = await db
        .update(notificationSettingsTable)
        .set({ config, updatedAt: new Date() })
        .where(eq(notificationSettingsTable.companyId, req.companyId!))
        .returning();
      res.json({ config: updated!.config });
      return;
    }

    const [created] = await db
      .insert(notificationSettingsTable)
      .values({ companyId: req.companyId!, config })
      .returning();
    res.json({ config: created!.config });
  } catch (err) {
    req.log.error({ err }, "Failed to save notification settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
