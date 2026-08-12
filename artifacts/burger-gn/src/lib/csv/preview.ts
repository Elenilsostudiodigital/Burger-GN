/**
 * Build pre-import summary: new / update / invalid (phone key).
 */

import type { CsvImportError, CsvImportPreview, MappedClientRow } from "./types";
import { isPlaceholderPhone, phonesMatch, pickRowPhone } from "./phone";

export function buildImportPreview(
  rows: MappedClientRow[],
  existingPhones: string[],
): CsvImportPreview {
  let newCount = 0;
  let updateCount = 0;
  let invalidCount = 0;
  const invalid: CsvImportError[] = [];
  const seenInFile: string[] = [];

  for (const row of rows) {
    const phone = pickRowPhone(row.phone, row.celular);
    if (!phone || isPlaceholderPhone(phone) || phone.length < 12) {
      invalidCount += 1;
      invalid.push({
        line: row.line,
        phone: String(row.phone || row.celular || ""),
        message: "Telefone inválido ou ausente.",
      });
      continue;
    }

    if (seenInFile.some((p) => phonesMatch(p, phone))) {
      invalidCount += 1;
      invalid.push({
        line: row.line,
        phone,
        message: "Telefone duplicado no arquivo.",
      });
      continue;
    }
    seenInFile.push(phone);

    const exists = existingPhones.some((p) => phonesMatch(p, phone));
    if (exists) updateCount += 1;
    else newCount += 1;
  }

  return { newCount, updateCount, invalidCount, invalid };
}
