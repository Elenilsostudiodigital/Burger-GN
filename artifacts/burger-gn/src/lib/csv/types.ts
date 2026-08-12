/**
 * Shared CSV client-import types.
 * Reusable for future export / other CRM systems.
 */

export type CsvImportSource = "anota_ai" | "excel" | "outro";

export type CsvTargetField =
  | "name"
  | "phone"
  | "celular"
  | "email"
  | "cashback"
  | "stamps"
  | "clubPoints"
  | "birthDate"
  | "ignore";

export interface CsvColumnMapping {
  /** Original header from file */
  header: string;
  /** Mapped target field */
  target: CsvTargetField;
}

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

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export interface MappedClientRow {
  line: number;
  name?: string | null;
  phone?: string | null;
  celular?: string | null;
  email?: string | null;
  cashback?: string | null;
  stamps?: string | null;
  clubPoints?: string | null;
  birthDate?: string | null;
}

export interface CsvImportError {
  line: number;
  phone?: string;
  message: string;
}

export interface CsvImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  errors: CsvImportError[];
}

export const DEFAULT_CSV_IMPORT_OPTIONS: CsvImportOptions = {
  updateExisting: true,
  createMissing: true,
  importCashback: true,
  importStamps: true,
  importBirthDate: true,
  importClubPoints: true,
  skipWithoutPhone: true,
  skipDuplicates: false,
};

export const CSV_TARGET_LABELS: Record<CsvTargetField, string> = {
  name: "Nome",
  phone: "Telefone",
  celular: "Celular",
  email: "Email",
  cashback: "Cashback / Saldo",
  stamps: "Selos",
  clubPoints: "Pontos",
  birthDate: "Nascimento",
  ignore: "Ignorar",
};

export const CSV_SOURCE_LABELS: Record<CsvImportSource, string> = {
  anota_ai: "Anota AI",
  excel: "Excel",
  outro: "Outro",
};
