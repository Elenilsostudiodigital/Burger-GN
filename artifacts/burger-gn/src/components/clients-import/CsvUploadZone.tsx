import React, { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

interface CsvUploadZoneProps {
  disabled?: boolean;
  fileName?: string | null;
  onFile: (file: File) => void;
}

const ACCEPT = ".csv,.txt,.tsv,text/csv,text/plain,application/vnd.ms-excel";

export function CsvUploadZone({ disabled, fileName, onFile }: CsvUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(
    (file: File | undefined | null) => {
      if (!file || disabled) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && !lower.endsWith(".tsv")) {
        // still allow — Excel often exports .csv; accept any text-ish
      }
      onFile(file);
    },
    [disabled, onFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
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
      onClick={() => !disabled && inputRef.current?.click()}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
        dragging
          ? "border-amber-500 bg-amber-500/10"
          : "border-zinc-700 bg-zinc-900/60 hover:border-amber-500/50"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
          {fileName ? (
            <FileSpreadsheet size={26} className="text-amber-500" />
          ) : (
            <Upload size={26} className="text-zinc-400" />
          )}
        </div>
        <div>
          <p className="text-white font-bold text-sm">
            {fileName ? fileName : "Arraste o CSV aqui"}
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            ou clique para selecionar · .csv / .tsv / .txt
          </p>
        </div>
        <span className="inline-flex h-10 px-4 items-center rounded-xl bg-amber-500 text-zinc-950 text-xs font-black uppercase tracking-wide">
          Selecionar Arquivo
        </span>
      </div>
    </div>
  );
}
