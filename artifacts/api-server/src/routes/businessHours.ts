import { Router } from "express";
import { db, businessHoursSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { getOrCreateBusinessHours } from "../lib/businessHoursStore";
import {
  evaluateStoreStatus,
  normalizeManualMode,
  normalizeTimeHHmm,
  normalizeWeeklySchedule,
  toAdminBusinessHoursPayload,
} from "../lib/businessHours";

const router = Router();

function publicStatusPayload(settings: Awaited<ReturnType<typeof getOrCreateBusinessHours>>) {
  const status = evaluateStoreStatus(settings);
  return {
    isOpen: status.isOpen,
    reason: status.reason,
    message: status.message,
    nextOpenTime: status.nextOpenTime,
    nextOpenLabel: status.nextOpenLabel,
    timezone: status.timezone,
    manualMode: status.manualMode,
    localTime: status.localTime,
    localDate: status.localDate,
    acceptingOrders: status.isOpen,
  };
}

router.get("/store-status", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    res.json(publicStatusPayload(settings));
  } catch (err) {
    req.log.error({ err }, "Failed to get store status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/business-hours", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    const status = evaluateStoreStatus(settings);
    res.json({
      timezone: settings.timezone || "America/Sao_Paulo",
      weeklySchedule: normalizeWeeklySchedule(settings.weeklySchedule),
      status: publicStatusPayload(settings),
      today: status.today,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get business hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/business-hours", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    res.json(toAdminBusinessHoursPayload(settings));
  } catch (err) {
    req.log.error({ err }, "Failed to get admin business hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/business-hours", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      manualMode?: unknown;
      weeklySchedule?: unknown;
      exceptionDate?: string | null;
      exceptionClosed?: boolean;
      exceptionOpen?: string | null;
      exceptionClose?: string | null;
      clearException?: boolean;
    };

    const settings = await getOrCreateBusinessHours(req.companyId!);
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.manualMode !== undefined) {
      patch.manualMode = normalizeManualMode(body.manualMode);
    }
    if (body.weeklySchedule !== undefined) {
      patch.weeklySchedule = normalizeWeeklySchedule(body.weeklySchedule);
    }

    if (body.clearException) {
      patch.exceptionDate = null;
      patch.exceptionClosed = false;
      patch.exceptionOpen = null;
      patch.exceptionClose = null;
    } else if (body.exceptionDate !== undefined) {
      const date = typeof body.exceptionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.exceptionDate)
        ? body.exceptionDate
        : null;
      patch.exceptionDate = date;
      if (date) {
        patch.exceptionClosed = body.exceptionClosed === true;
        if (body.exceptionClosed === true) {
          patch.exceptionOpen = null;
          patch.exceptionClose = null;
        } else {
          const open = normalizeTimeHHmm(body.exceptionOpen);
          const close = normalizeTimeHHmm(body.exceptionClose);
          if (!open || !close) {
            res.status(400).json({ error: "Informe abertura e fechamento válidos para a exceção de hoje." });
            return;
          }
          patch.exceptionOpen = open;
          patch.exceptionClose = close;
          patch.exceptionClosed = false;
        }
      } else {
        patch.exceptionClosed = false;
        patch.exceptionOpen = null;
        patch.exceptionClose = null;
      }
    }

    const [updated] = await db
      .update(businessHoursSettingsTable)
      .set(patch)
      .where(eq(businessHoursSettingsTable.id, settings.id))
      .returning();

    res.json(toAdminBusinessHoursPayload(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update business hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/business-hours/open-now", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    const [updated] = await db
      .update(businessHoursSettingsTable)
      .set({ manualMode: "open", updatedAt: new Date() })
      .where(eq(businessHoursSettingsTable.id, settings.id))
      .returning();
    res.json(toAdminBusinessHoursPayload(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to open store now");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/business-hours/close-now", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    const [updated] = await db
      .update(businessHoursSettingsTable)
      .set({ manualMode: "closed", updatedAt: new Date() })
      .where(eq(businessHoursSettingsTable.id, settings.id))
      .returning();
    res.json(toAdminBusinessHoursPayload(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to close store now");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/business-hours/follow-schedule", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreateBusinessHours(req.companyId!);
    const [updated] = await db
      .update(businessHoursSettingsTable)
      .set({ manualMode: "auto", updatedAt: new Date() })
      .where(eq(businessHoursSettingsTable.id, settings.id))
      .returning();
    res.json(toAdminBusinessHoursPayload(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to restore schedule mode");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
