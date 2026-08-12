/**
 * Automatic column mapping for client CSV imports.
 * Presets: Anota AI, Excel, generic Portuguese headers.
 */

import type {
  CsvColumnMapping,
  CsvImportSource,
  CsvTargetField,
  MappedClientRow,
} from "./types";

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ordered matchers: first match wins per header. */
const MATCHERS: { target: CsvTargetField; patterns: RegExp[] }[] = [
  {
    target: "name",
    patterns: [
      /^nome( do cliente)?$/,
      /^name$/,
      /^cliente$/,
      /^customer ?name$/,
      /^nome completo$/,
    ],
  },
  {
    target: "phone",
    patterns: [
      /^telefone$/,
      /^phone$/,
      /^whatsapp$/,
      /^tel$/,
      /^fone$/,
      /^telefone principal$/,
      /^telefone 1$/,
    ],
  },
  {
    target: "celular",
    patterns: [
      /^celular$/,
      /^mobile$/,
      /^cell$/,
      /^telefone 2$/,
      /^telefone celular$/,
      /^whats ?app$/,
    ],
  },
  {
    target: "email",
    patterns: [/^e?-?mail$/, /^correo$/],
  },
  {
    target: "cashback",
    patterns: [
      /^cashback$/,
      /^saldo$/,
      /^saldo cashback$/,
      /^cash back$/,
      /^saldo de cashback$/,
      /^valor cashback$/,
    ],
  },
  {
    target: "stamps",
    patterns: [
      /^selos?$/,
      /^selo$/,
      /^carimbos?$/,
      /^stamps?$/,
      /^fidelidade$/,
      /^qtd selos$/,
      /^quantidade de selos$/,
    ],
  },
  {
    target: "clubPoints",
    patterns: [
      /^pontos?$/,
      /^points?$/,
      /^pontos clube$/,
      /^club points?$/,
      /^pontuacao$/,
    ],
  },
  {
    target: "birthDate",
    patterns: [
      /^nascimento$/,
      /^data de nascimento$/,
      /^data nascimento$/,
      /^birthday$/,
      /^birth ?date$/,
      /^aniversario$/,
    ],
  },
];

/** Extra Anota AI aliases commonly seen in Relatórios exports. */
const ANOTA_ALIASES: Record<string, CsvTargetField> = {
  "nome do cliente": "name",
  "telefone do cliente": "phone",
  "saldo atual": "cashback",
  "saldo cashback": "cashback",
  "qtde selos": "stamps",
  "qtd de selos": "stamps",
};

export function guessTargetForHeader(
  header: string,
  source: CsvImportSource = "outro",
): CsvTargetField {
  const norm = normalizeHeader(header);
  if (!norm) return "ignore";

  if (source === "anota_ai" && ANOTA_ALIASES[norm]) {
    return ANOTA_ALIASES[norm]!;
  }

  for (const m of MATCHERS) {
    if (m.patterns.some((re) => re.test(norm))) return m.target;
  }
  return "ignore";
}

export function autoMapColumns(
  headers: string[],
  source: CsvImportSource = "outro",
): CsvColumnMapping[] {
  const used = new Set<CsvTargetField>();
  return headers.map((header) => {
    let target = guessTargetForHeader(header, source);
    if (target !== "ignore") {
      if (used.has(target)) {
        // Prefer first phone; second phone-like → celular
        if (target === "phone" && !used.has("celular")) {
          target = "celular";
        } else {
          target = "ignore";
        }
      } else {
        used.add(target);
      }
    }
    return { header, target };
  });
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: CsvColumnMapping[],
): MappedClientRow[] {
  const indexByTarget = new Map<CsvTargetField, number>();
  mapping.forEach((m, i) => {
    if (m.target !== "ignore" && !indexByTarget.has(m.target)) {
      indexByTarget.set(m.target, i);
    }
  });

  const cell = (row: string[], target: CsvTargetField): string | null => {
    const idx = indexByTarget.get(target);
    if (idx == null) return null;
    const v = row[idx];
    return v != null && String(v).trim() !== "" ? String(v).trim() : null;
  };

  return rows.map((row, i) => ({
    line: i + 2, // 1-based with header on line 1
    name: cell(row, "name"),
    phone: cell(row, "phone"),
    celular: cell(row, "celular"),
    email: cell(row, "email"),
    cashback: cell(row, "cashback"),
    stamps: cell(row, "stamps"),
    clubPoints: cell(row, "clubPoints"),
    birthDate: cell(row, "birthDate"),
  }));
}

/** Ensure header length stays aligned when remapping manually. */
export function syncMappingHeaders(
  headers: string[],
  mapping: CsvColumnMapping[],
): CsvColumnMapping[] {
  return headers.map((header, i) => ({
    header,
    target: mapping[i]?.target ?? "ignore",
  }));
}
