import React from "react";
import { AlertTriangle, UserPlus, RefreshCw } from "lucide-react";
import type { CsvImportPreview } from "../../lib/csv";

interface ImportPreviewSummaryProps {
  preview: CsvImportPreview;
  totalRows: number;
}

export function ImportPreviewSummary({ preview, totalRows }: ImportPreviewSummaryProps) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <div>
        <h3 className="text-white font-black uppercase text-sm">Resumo antes de importar</h3>
        <p className="text-zinc-500 text-xs mt-1">
          {totalRows} registro{totalRows === 1 ? "" : "s"} no arquivo · telefone como chave
        </p>
      </div>
      <ul className="space-y-2">
        <li className="flex items-center justify-between rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-zinc-200">
            <UserPlus size={16} className="text-green-400" />
            Clientes novos
          </span>
          <span className="text-white font-black tabular-nums">{preview.newCount}</span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-zinc-200">
            <RefreshCw size={16} className="text-amber-400" />
            Clientes que serão atualizados
          </span>
          <span className="text-white font-black tabular-nums">{preview.updateCount}</span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-zinc-200">
            <AlertTriangle size={16} className="text-red-400" />
            Registros inválidos
          </span>
          <span className="text-white font-black tabular-nums">{preview.invalidCount}</span>
        </li>
      </ul>
      {preview.invalid.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
          {preview.invalid.slice(0, 20).map((err, i) => (
            <p key={`${err.line}-${i}`} className="text-red-400 text-xs">
              Linha {err.line}
              {err.phone ? ` (${err.phone})` : ""}: {err.message}
            </p>
          ))}
          {preview.invalid.length > 20 && (
            <p className="text-zinc-500 text-xs">+{preview.invalid.length - 20} inválidos</p>
          )}
        </div>
      )}
    </div>
  );
}
