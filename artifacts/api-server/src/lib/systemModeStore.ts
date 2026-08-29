import { pool } from "@workspace/db";
import { ensureSystemModeSchema } from "./ensureSystemModeSchema";
import {
  formatSaoPauloLabel,
  nextSleepAt,
  nextTransitionAfter,
  nextWakeAt,
  scheduledSystemMode,
  type SystemMode,
} from "./systemModeSchedule";

export type SystemModeSnapshot = {
  mode: SystemMode;
  source: "schedule" | "manual";
  nextWakeAt: string;
  nextSleepAt: string;
  nextWakeLabel: string;
  nextSleepLabel: string;
};

function toSnapshot(now: Date, mode: SystemMode, source: "schedule" | "manual"): SystemModeSnapshot {
  const wake = nextWakeAt(now);
  const sleep = nextSleepAt(now);
  return {
    mode,
    source,
    nextWakeAt: wake.toISOString(),
    nextSleepAt: sleep.toISOString(),
    nextWakeLabel: formatSaoPauloLabel(wake),
    nextSleepLabel: formatSaoPauloLabel(sleep),
  };
}

export async function readSystemMode(companyId: number, now = new Date()): Promise<SystemModeSnapshot> {
  await ensureSystemModeSchema();
  const scheduled = scheduledSystemMode(now);
  const { rows } = await pool.query(
    `SELECT override, override_at FROM system_operation_mode WHERE company_id = $1`,
    [companyId],
  );
  const override = rows[0]?.override === "operation" || rows[0]?.override === "sleep"
    ? (rows[0].override as SystemMode)
    : null;
  const overrideAt = rows[0]?.override_at ? new Date(rows[0].override_at) : null;

  if (override && overrideAt && Number.isFinite(overrideAt.getTime())) {
    const expires = nextTransitionAfter(overrideAt);
    if (now.getTime() < expires.getTime()) {
      return toSnapshot(now, override, "manual");
    }
  }
  return toSnapshot(now, scheduled, "schedule");
}

export async function writeSystemModeOverride(
  companyId: number,
  mode: SystemMode,
  now = new Date(),
): Promise<SystemModeSnapshot> {
  await ensureSystemModeSchema();
  await pool.query(
    `INSERT INTO system_operation_mode (company_id, override, override_at, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (company_id) DO UPDATE SET
       override = EXCLUDED.override,
       override_at = EXCLUDED.override_at,
       updated_at = NOW()`,
    [companyId, mode, now],
  );
  return readSystemMode(companyId, now);
}
