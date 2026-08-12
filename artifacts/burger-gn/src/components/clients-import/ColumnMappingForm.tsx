import React from "react";
import {
  CSV_TARGET_LABELS,
  type CsvColumnMapping,
  type CsvTargetField,
} from "../../lib/csv";
import { Label } from "@/components/ui/label";

const TARGETS = Object.keys(CSV_TARGET_LABELS) as CsvTargetField[];

interface ColumnMappingFormProps {
  mapping: CsvColumnMapping[];
  disabled?: boolean;
  onChange: (next: CsvColumnMapping[]) => void;
}

export function ColumnMappingForm({ mapping, disabled, onChange }: ColumnMappingFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-white font-black uppercase text-sm">Mapeamento de colunas</h3>
        <p className="text-zinc-500 text-xs mt-1">
          Detectado automaticamente. Ajuste se necessário.
        </p>
      </div>
      <div className="space-y-2">
        {mapping.map((col, idx) => (
          <div
            key={`${col.header}-${idx}`}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3"
          >
            <div>
              <Label className="text-zinc-500 text-[10px] uppercase">Coluna no arquivo</Label>
              <p className="text-white text-sm font-medium truncate" title={col.header}>
                {col.header || `(coluna ${idx + 1})`}
              </p>
            </div>
            <div>
              <Label className="text-zinc-500 text-[10px] uppercase">Campo no Burger GN</Label>
              <select
                disabled={disabled}
                value={col.target}
                onChange={(e) => {
                  const target = e.target.value as CsvTargetField;
                  const next = mapping.map((m, i) =>
                    i === idx ? { ...m, target } : m,
                  );
                  onChange(next);
                }}
                className="mt-1 w-full h-10 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm px-3 focus:outline-none focus:border-amber-500"
              >
                {TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {CSV_TARGET_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
