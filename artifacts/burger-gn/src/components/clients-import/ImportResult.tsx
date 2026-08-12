import React from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { CsvImportSummary } from "../../lib/csv";

interface ImportResultProps {
  summary: CsvImportSummary;
}

export function ImportResult({ summary }: ImportResultProps) {
  const items = [
    { ok: true, label: "Clientes importados", value: summary.imported },
    { ok: true, label: "Clientes atualizados", value: summary.updated },
    { ok: true, label: "Clientes ignorados", value: summary.skipped },
    {
      ok: summary.errors.length === 0,
      label: "Erros encontrados",
      value: summary.errors.length,
    },
  ];

  return (
    <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 space-y-4">
      <div>
        <h3 className="text-green-400 font-black uppercase text-base">Importação concluída.</h3>
        <p className="text-zinc-400 text-xs mt-1">Resumo do lote processado.</p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between rounded-xl bg-zinc-950/50 border border-zinc-800 px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm text-zinc-200">
              {item.ok ? (
                <Check size={16} className="text-green-400 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              )}
              {item.label}
            </span>
            <span className="text-white font-black tabular-nums">{item.value}</span>
          </li>
        ))}
      </ul>
      {summary.errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
          {summary.errors.slice(0, 30).map((err, i) => (
            <p key={`${err.line}-${i}`} className="text-red-400 text-xs">
              Linha {err.line}
              {err.phone ? ` (${err.phone})` : ""}: {err.message}
            </p>
          ))}
          {summary.errors.length > 30 && (
            <p className="text-zinc-500 text-xs">
              +{summary.errors.length - 30} erros adicionais no log.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
