/**
 * Spreadsheet reader for client imports only.
 * Independent from menu/cardápio ImportMenu — do not share that module.
 */

import * as XLSX from "xlsx";
import type { ParsedCsv } from "./types";
import { parseCsv, readFileAsText } from "./parseCsv";

function sheetToParsedCsv(sheet: XLSX.WorkSheet): ParsedCsv {
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(
    sheet,
    { header: 1, defval: "", raw: false },
  ) as (string | number | boolean | null | undefined)[][];

  if (!matrix.length) {
    return { headers: [], rows: [], delimiter: ";" };
  }

  const headers = (matrix[0] || []).map((c) => String(c ?? "").trim());
  const rows: string[][] = [];
  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    const cells = headers.map((_, idx) => String(raw[idx] ?? "").trim());
    if (cells.every((c) => !c)) continue;
    rows.push(cells);
  }
  return { headers, rows, delimiter: ";" };
}

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".ods") ||
    file.type.includes("spreadsheet") ||
    file.type === "application/vnd.ms-excel" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isCsvLike(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".txt") ||
    file.type === "text/csv" ||
    file.type === "text/plain" ||
    file.type === "text/tab-separated-values"
  );
}

/**
 * Read a client import file (CSV or Excel) into a normalized table.
 * Never routes through /admin/importar or menu import parsers.
 */
export async function readClientImportFile(file: File): Promise<ParsedCsv> {
  if (isExcelFile(file)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const first = wb.SheetNames[0];
    if (!first) {
      return { headers: [], rows: [], delimiter: ";" };
    }
    return sheetToParsedCsv(wb.Sheets[first]!);
  }

  if (!isCsvLike(file) && !isExcelFile(file)) {
    // Still attempt CSV text parse for unknown extensions exported as CSV.
  }

  const text = await readFileAsText(file);
  return parseCsv(text);
}

export { isExcelFile, isCsvLike };
