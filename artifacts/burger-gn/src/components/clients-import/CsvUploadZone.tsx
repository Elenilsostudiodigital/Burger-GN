import React, { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

interface CsvUploadZoneProps {
  disabled?: boolean;
  fileName?: string | null;
  clientCount?: number | null;
  onFile: (file: File) => void;
}

const ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function CsvUploadZone({
  disabled,
  fileName,
  clientCount,
  onFile,
}: CsvUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(
    (file: File | undefined | null) => {
      if (!file || disabled) return;
      onFile(file);
    },
    [disabled, onFile],
  );

  const openPicker = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      data-testid="clientes-csv-upload-zone"
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-2xl border-2 border-dashed px-5 py-12 text-center transition-colors ${
        dragging
          ? "border-amber-500 bg-amber-500/10"
          : "border-amber-500/40 bg-zinc-900 hover:border-amber-500"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="clientes-csv-file-input"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          {fileName ? (
            <FileSpreadsheet size={30} className="text-amber-500" />
          ) : (
            <Upload size={30} className="text-amber-500" />
          )}
        </div>

        {fileName ? (
          <div className="space-y-1">
            <p className="text-white font-bold text-base break-all">{fileName}</p>
            {typeof clientCount === "number" && (
              <p className="text-amber-400 text-sm font-bold">
                {clientCount} cliente{clientCount === 1 ? "" : "s"} encontrado
                {clientCount === 1 ? "" : "s"}
              </p>
            )}
            <p className="text-zinc-500 text-xs">CSV · XLS · XLSX</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-white font-black text-base uppercase tracking-wide">
              Arraste o arquivo aqui
            </p>
            <p className="text-zinc-400 text-sm">
              Importe clientes via CSV ou Excel
            </p>
            <p className="text-zinc-500 text-xs">Aceita .csv · .xlsx · .xls</p>
          </div>
        )}

        <button
          type="button"
          data-testid="clientes-csv-select-btn"
          onClick={openPicker}
          disabled={disabled}
          className="h-12 px-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-black uppercase tracking-wide shadow-lg shadow-amber-500/20"
        >
          {fileName ? "Trocar arquivo" : "Selecionar arquivo"}
        </button>
      </div>
    </div>
  );
}
