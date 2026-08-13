import { db, businessHoursSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureBusinessHoursSchema } from "./ensureBusinessHoursSchema";
import {
  defaultWeeklySchedule,
  normalizeWeeklySchedule,
  WEEKDAY_KEYS,
} from "./businessHours";

export async function getOrCreateBusinessHours(companyId: number) {
  await ensureBusinessHoursSchema();
  const [existing] = await db
    .select()
    .from(businessHoursSettingsTable)
    .where(eq(businessHoursSettingsTable.companyId, companyId));
  if (existing) {
    const schedule = normalizeWeeklySchedule(existing.weeklySchedule);
    const needsRepair =
      !existing.weeklySchedule ||
      typeof existing.weeklySchedule !== "object" ||
      WEEKDAY_KEYS.some((k) => !(existing.weeklySchedule as Record<string, unknown>)?.[k]);
    if (needsRepair) {
      const [updated] = await db
        .update(businessHoursSettingsTable)
        .set({ weeklySchedule: schedule, updatedAt: new Date() })
        .where(eq(businessHoursSettingsTable.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(businessHoursSettingsTable)
    .values({
      companyId,
      timezone: "America/Sao_Paulo",
      manualMode: "auto",
      weeklySchedule: defaultWeeklySchedule(),
    })
    .returning();
  return created;
}
