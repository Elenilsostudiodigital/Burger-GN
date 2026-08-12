/**
 * Modular CSV client import engine.
 * Shared contract for Anota AI / Excel / Outro — ready for future exporters.
 */

import { db, clubeMembersTable, clientImportLogsTable, companyUsersTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import {
  appendClientLedger,
  isPlaceholderPhone,
  normalizeClientPhone,
  parseClientNotes,
  phonesMatch,
  serializeClientNotes,
  type ClientMeta,
} from "./clientMeta";

export type CsvImportSource = "anota_ai" | "excel" | "outro";

export interface CsvImportOptions {
  updateExisting: boolean;
  createMissing: boolean;
  importCashback: boolean;
  importStamps: boolean;
  importBirthDate: boolean;
  importClubPoints: boolean;
  skipWithoutPhone: boolean;
  skipDuplicates: boolean;
}

export interface CsvImportRow {
  /** 1-based CSV line (header = 1). */
  line: number;
  name?: string | null;
  phone?: string | null;
  celular?: string | null;
  email?: string | null;
  cashback?: string | number | null;
  stamps?: string | number | null;
  clubPoints?: string | number | null;
  birthDate?: string | null;
  notes?: string | null;
}

export interface CsvImportError {
  line: number;
  phone?: string;
  message: string;
}

export interface CsvImportBatchResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: CsvImportError[];
  processed: number;
}

export interface CsvImportFinalizeInput {
  companyId: number;
  userId?: number;
  fileName: string;
  source: CsvImportSource;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: CsvImportError[];
  options: CsvImportOptions;
}

const DEFAULT_OPTIONS: CsvImportOptions = {
  updateExisting: true,
  createMissing: true,
  importCashback: true,
  importStamps: true,
  importBirthDate: true,
  importClubPoints: true,
  skipWithoutPhone: true,
  skipDuplicates: false,
};

export function normalizeImportOptions(raw: Partial<CsvImportOptions> | undefined): CsvImportOptions {
  return {
    updateExisting: raw?.updateExisting ?? DEFAULT_OPTIONS.updateExisting,
    createMissing: raw?.createMissing ?? DEFAULT_OPTIONS.createMissing,
    importCashback: raw?.importCashback ?? DEFAULT_OPTIONS.importCashback,
    importStamps: raw?.importStamps ?? DEFAULT_OPTIONS.importStamps,
    importBirthDate: raw?.importBirthDate ?? DEFAULT_OPTIONS.importBirthDate,
    importClubPoints: raw?.importClubPoints ?? DEFAULT_OPTIONS.importClubPoints,
    skipWithoutPhone: raw?.skipWithoutPhone ?? DEFAULT_OPTIONS.skipWithoutPhone,
    skipDuplicates: raw?.skipDuplicates ?? DEFAULT_OPTIONS.skipDuplicates,
  };
}

function parseMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/[R$\s]/gi, "");
  // BR: 1.234,56 → 1234.56
  if (/\d,\d{1,2}$/.test(s) && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseIntSafe(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const s = String(value).trim().replace(/[^\d-]/g, "");
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. */
export function parseBirthDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : s;
  }
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) {
    const day = br[1]!.padStart(2, "0");
    const month = br[2]!.padStart(2, "0");
    const year = br[3]!;
    const iso = `${year}-${month}-${day}`;
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

function pickPhone(row: CsvImportRow): string {
  const primary = normalizeClientPhone(String(row.phone || ""));
  if (primary && !isPlaceholderPhone(primary)) return primary;
  const secondary = normalizeClientPhone(String(row.celular || ""));
  if (secondary && !isPlaceholderPhone(secondary)) return secondary;
  return primary || secondary || "";
}

type Member = typeof clubeMembersTable.$inferSelect;

/**
 * Process one batch of normalized rows.
 * Phone is the unique key — never creates two clients with the same phone.
 */
export async function processCsvImportBatch(opts: {
  companyId: number;
  source: CsvImportSource;
  rows: CsvImportRow[];
  options: CsvImportOptions;
  /** Phones already seen earlier in this import session (normalized). */
  seenPhones?: Set<string>;
}): Promise<CsvImportBatchResult> {
  const { companyId, source, rows, options } = opts;
  const seen = opts.seenPhones ?? new Set<string>();

  const members = await db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, companyId));

  const findByPhone = (phone: string): Member | undefined =>
    members.find((m: Member) => phonesMatch(m.phone, phone));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: CsvImportError[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  for (const row of rows) {
    try {
      const phone = pickPhone(row);
      if (!phone || isPlaceholderPhone(phone) || phone.length < 12) {
        if (options.skipWithoutPhone) {
          skipped += 1;
          continue;
        }
        errors.push({
          line: row.line,
          message: "Linha sem telefone válido.",
        });
        continue;
      }

      const phoneKey = phone;
      const alreadyInFile = [...seen].some((p) => phonesMatch(p, phone));
      if (alreadyInFile) {
        if (options.skipDuplicates) {
          skipped += 1;
          continue;
        }
        // Without skipDuplicates still avoid double-create in same import:
        // subsequent rows with same phone update the same record if updateExisting.
        // Fall through but do not re-add to seen until after process.
      } else {
        seen.add(phoneKey);
      }

      const name = String(row.name || "").trim() || "Cliente";
      const email = String(row.email || "").trim().slice(0, 200);
      const rowNotes = String(row.notes || "").trim().slice(0, 2000);
      const cashback = options.importCashback ? parseMoney(row.cashback) : null;
      // Selos/Pontos: prefer stamps column; fall back to clubPoints when stamps empty
      const stampsRaw =
        row.stamps != null && String(row.stamps).trim() !== ""
          ? row.stamps
          : row.clubPoints;
      const stamps = options.importStamps
        ? Math.min(500, parseIntSafe(stampsRaw))
        : null;
      const clubPoints = options.importClubPoints
        ? Math.min(
            1_000_000,
            parseIntSafe(
              row.clubPoints != null && String(row.clubPoints).trim() !== ""
                ? row.clubPoints
                : row.stamps,
            ),
          )
        : null;
      const birthDate =
        options.importBirthDate ? parseBirthDate(row.birthDate) : undefined;

      const existing = findByPhone(phone);

      if (existing) {
        if (!options.updateExisting) {
          skipped += 1;
          continue;
        }

        const current = parseClientNotes(existing.notes);
        let nextMeta: ClientMeta = {
          ...current.meta,
          origin: "importacao_manual",
        };

        const patch: Record<string, unknown> = {
          name: name !== "Cliente" ? name : existing.name,
          phone,
          importSource: source,
          lastImport: now,
        };
        if (email) patch["email"] = email;
        if (birthDate !== undefined) {
          patch["birthDate"] = birthDate;
        }

        if (stamps != null && stamps !== (existing.points ?? 0)) {
          nextMeta = appendClientLedger(nextMeta, {
            at: nowIso,
            type: "ajuste_selo",
            stampsDelta: stamps - (existing.points ?? 0),
            description: `Importação CSV (${source})`,
          });
          patch["points"] = stamps;
        }

        if (cashback != null) {
          const prevCash = parseFloat(String(existing.cashbackBalance)) || 0;
          if (Math.abs(cashback - prevCash) > 0.001) {
            nextMeta = appendClientLedger(nextMeta, {
              at: nowIso,
              type: "ajuste_cashback",
              cashbackDelta: Math.round((cashback - prevCash) * 100) / 100,
              description: `Importação CSV (${source})`,
            });
            patch["cashbackBalance"] = cashback.toFixed(2);
          }
        }

        if (clubPoints != null) {
          patch["clubPoints"] = clubPoints;
        }

        if (!existing.importedAt) {
          patch["importedAt"] = now;
        }

        const publicNotes = rowNotes || current.publicNotes;
        patch["notes"] = serializeClientNotes(publicNotes, nextMeta);

        const [saved] = await db
          .update(clubeMembersTable)
          .set(patch)
          .where(
            and(
              eq(clubeMembersTable.id, existing.id),
              eq(clubeMembersTable.companyId, companyId),
            ),
          )
          .returning();

        if (saved) {
          const idx = members.findIndex((m: Member) => m.id === existing.id);
          if (idx >= 0) members[idx] = saved;
          updated += 1;
        }
        continue;
      }

      if (!options.createMissing) {
        skipped += 1;
        continue;
      }

      const [created] = await db
        .insert(clubeMembersTable)
        .values({
          companyId,
          name,
          phone,
          email: email || "",
          birthDate: birthDate ?? null,
          points: stamps ?? 0,
          cashbackBalance: (cashback ?? 0).toFixed(2),
          clubPoints: clubPoints ?? 0,
          importSource: source,
          importedAt: now,
          lastImport: now,
          active: true,
          notes: serializeClientNotes(rowNotes, { origin: "importacao_manual" }),
        })
        .returning();

      if (created) {
        members.push(created);
        imported += 1;
      }
    } catch (err) {
      errors.push({
        line: row.line,
        phone: String(row.phone || row.celular || ""),
        message: err instanceof Error ? err.message : "Erro ao importar linha.",
      });
    }
  }

  return {
    imported,
    updated,
    skipped,
    errors,
    processed: rows.length,
  };
}

export async function finalizeCsvImportLog(
  input: CsvImportFinalizeInput,
): Promise<typeof clientImportLogsTable.$inferSelect> {
  let userEmail = "";
  let userName = "";
  if (input.userId) {
    const [user] = await db
      .select()
      .from(companyUsersTable)
      .where(eq(companyUsersTable.id, input.userId));
    if (user) {
      userEmail = user.email;
      userName = user.name;
    }
  }

  const cappedErrors = input.errors.slice(0, 200);

  const [log] = await db
    .insert(clientImportLogsTable)
    .values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      userEmail,
      userName,
      fileName: input.fileName.slice(0, 500),
      source: input.source,
      totalRows: input.totalRows,
      importedCount: input.imported,
      updatedCount: input.updated,
      skippedCount: input.skipped,
      errorCount: input.errors.length,
      errorsJson: JSON.stringify(cappedErrors),
      optionsJson: JSON.stringify(input.options),
    })
    .returning();

  return log!;
}

export async function listCsvImportLogs(companyId: number, limit = 20) {
  return db
    .select()
    .from(clientImportLogsTable)
    .where(eq(clientImportLogsTable.companyId, companyId))
    .orderBy(desc(clientImportLogsTable.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
}
