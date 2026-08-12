/**
 * Lightweight CSV / TSV parser (no external deps).
 * Handles quotes, CRLF, and auto delimiter detection.
 */

import type { ParsedCsv } from "./types";

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim()) || "";
  const counts: Record<string, number> = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };
  let best = ";";
  let bestCount = -1;
  for (const [d, c] of Object.entries(counts)) {
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return bestCount > 0 ? best : ";";
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Strip BOM and normalize newlines. */
export function normalizeCsvText(raw: string): string {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseCsv(raw: string, delimiter?: string): ParsedCsv {
  const text = normalizeCsvText(raw);
  const delim = delimiter || detectDelimiter(text);
  const lines = text.split("\n").filter((l, idx, arr) => {
    // keep empty trailing cells but drop fully blank trailing lines
    if (idx === arr.length - 1 && !l.trim()) return false;
    return true;
  });

  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: delim };
  }

  const headers = parseLine(lines[0]!, delim).map((h) => h.replace(/^\uFEFF/, "").trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cells = parseLine(line, delim);
    // pad/truncate to header length
    while (cells.length < headers.length) cells.push("");
    rows.push(cells.slice(0, headers.length));
  }

  return { headers, rows, delimiter: delim };
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file, "UTF-8");
  });
}
