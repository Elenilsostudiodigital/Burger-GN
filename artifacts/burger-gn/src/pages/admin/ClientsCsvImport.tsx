import React, { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { FileSpreadsheet, Loader2, LogOut, Users } from "lucide-react";
import { useAdmin } from "../../context/AdminContext";
import {
  finalizeClientsCsvImport,
  importClientsCsvBatch,
  type CsvImportErrorApi,
} from "../../lib/api";
import {
  applyMapping,
  autoMapColumns,
  CSV_SOURCE_LABELS,
  DEFAULT_CSV_IMPORT_OPTIONS,
  parseCsv,
  readFileAsText,
  syncMappingHeaders,
  type CsvColumnMapping,
  type CsvImportOptions,
  type CsvImportSource,
  type CsvImportSummary,
  type MappedClientRow,
} from "../../lib/csv";
import { CsvUploadZone } from "../../components/clients-import/CsvUploadZone";
import { ColumnMappingForm } from "../../components/clients-import/ColumnMappingForm";
import { ImportOptionsForm } from "../../components/clients-import/ImportOptionsForm";
import { ImportProgress } from "../../components/clients-import/ImportProgress";
import { ImportResult } from "../../components/clients-import/ImportResult";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const BATCH_SIZE = 50;
const PREVIEW_ROWS = 5;

const SOURCES: CsvImportSource[] = ["anota_ai", "excel", "outro"];

interface ClientsCsvImportProps {
  /** When embedded under Configurações > Clientes */
  embedded?: boolean;
}

export default function ClientsCsvImport({ embedded = false }: ClientsCsvImportProps) {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();

  const [source, setSource] = useState<CsvImportSource>("anota_ai");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping[]>([]);
  const [options, setOptions] = useState<CsvImportOptions>({ ...DEFAULT_CSV_IMPORT_OPTIONS });

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [error, setError] = useState("");

  const mappedRows: MappedClientRow[] = useMemo(
    () => (headers.length ? applyMapping(headers, rawRows, mapping) : []),
    [headers, rawRows, mapping],
  );

  const previewRows = useMemo(() => rawRows.slice(0, PREVIEW_ROWS), [rawRows]);

  const resetResult = () => {
    setSummary(null);
    setProgress(0);
    setError("");
  };

  const handleFile = useCallback(
    async (file: File) => {
      resetResult();
      try {
        const text = await readFileAsText(file);
        const parsed = parseCsv(text);
        if (!parsed.headers.length) {
          setError("Arquivo CSV sem cabeçalho.");
          setFileName(null);
          setHeaders([]);
          setRawRows([]);
          setMapping([]);
          return;
        }
        setFileName(file.name);
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
        setMapping(autoMapColumns(parsed.headers, source));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
        setFileName(null);
        setHeaders([]);
        setRawRows([]);
        setMapping([]);
      }
    },
    [source],
  );

  const handleSourceChange = (next: CsvImportSource) => {
    setSource(next);
    resetResult();
    if (headers.length) {
      setMapping(autoMapColumns(headers, next));
    }
  };

  const handleImport = async () => {
    if (!mappedRows.length || importing) return;

    const hasPhone =
      mapping.some((m) => m.target === "phone") ||
      mapping.some((m) => m.target === "celular");
    if (!hasPhone) {
      setError("Mapeie ao menos uma coluna de Telefone ou Celular.");
      return;
    }

    setImporting(true);
    setError("");
    setSummary(null);
    setProgress(0);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: CsvImportErrorApi[] = [];
    let seenPhones: string[] = [];

    try {
      const total = mappedRows.length;
      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const chunk = mappedRows.slice(offset, offset + BATCH_SIZE);
        const result = await importClientsCsvBatch({
          source,
          rows: chunk,
          options,
          seenPhones,
        });
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
        errors.push(...(result.errors || []));
        seenPhones = result.seenPhones || seenPhones;
        setProgress(Math.min(100, Math.round(((offset + chunk.length) / total) * 100)));
      }

      setProgress(100);
      const finalSummary: CsvImportSummary = { imported, updated, skipped, errors };
      setSummary(finalSummary);

      try {
        await finalizeClientsCsvImport({
          fileName: fileName || "import.csv",
          source,
          totalRows: total,
          imported,
          updated,
          skipped,
          errors,
          options,
        });
      } catch {
        // Import succeeded; log failure should not keep spinner
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
      setSummary({
        imported,
        updated,
        skipped,
        errors: [
          ...errors,
          {
            line: 0,
            message: err instanceof Error ? err.message : "Falha na importação.",
          },
        ],
      });
    } finally {
      setImporting(false);
      setProgress((p) => (p < 100 && !error ? p : p));
    }
  };

  const body = (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex gap-2">
          <Link href="/admin/config/clientes" className="flex-1">
            <div className="h-11 rounded-xl font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-amber-500/40">
              <Users size={15} /> Clientes
            </div>
          </Link>
          <div className="flex-1 h-11 rounded-xl font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 bg-amber-500 text-zinc-950">
            <FileSpreadsheet size={15} /> Importar CSV
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Importe clientes de exportações do Anota AI, Excel ou qualquer CSV.
          O telefone é a chave única — nunca gera cadastro duplicado.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Origem</Label>
        <div className="grid grid-cols-3 gap-2">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={importing}
              onClick={() => handleSourceChange(s)}
              className={`h-11 rounded-xl text-[11px] font-bold uppercase ${
                source === s
                  ? "bg-amber-500 text-zinc-950"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {CSV_SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <CsvUploadZone
        disabled={importing}
        fileName={fileName}
        onFile={(f) => void handleFile(f)}
      />

      {headers.length > 0 && (
        <>
          <div className="space-y-2">
            <h3 className="text-white font-black uppercase text-sm">Pré-visualização</h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-zinc-900">
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-zinc-400 font-bold whitespace-nowrap border-b border-zinc-800"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-zinc-900">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 text-zinc-300 whitespace-nowrap max-w-[10rem] truncate"
                          title={cell}
                        >
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-zinc-600 text-[11px]">
              {rawRows.length} linha{rawRows.length === 1 ? "" : "s"} · mostrando{" "}
              {Math.min(PREVIEW_ROWS, rawRows.length)}
            </p>
          </div>

          <ColumnMappingForm
            mapping={mapping}
            disabled={importing}
            onChange={(next) => {
              resetResult();
              setMapping(syncMappingHeaders(headers, next));
            }}
          />

          <ImportOptionsForm
            value={options}
            disabled={importing}
            onChange={(next) => {
              resetResult();
              setOptions(next);
            }}
          />
        </>
      )}

      {importing && <ImportProgress percent={progress} />}

      {summary && !importing && <ImportResult summary={summary} />}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Button
        type="button"
        onClick={() => void handleImport()}
        disabled={importing || mappedRows.length === 0}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2"
      >
        {importing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <FileSpreadsheet size={18} />
            Importar Clientes
          </>
        )}
      </Button>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">
                Importar CSV
              </h1>
              <p className="text-zinc-600 text-xs">Clientes · Anota AI e outros</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              setLocation("/");
            }}
            className="p-2 text-zinc-400 hover:text-red-400"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">{body}</main>
    </div>
  );
}
