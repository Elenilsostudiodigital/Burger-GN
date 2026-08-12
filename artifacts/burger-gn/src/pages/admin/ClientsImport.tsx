import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { useAdmin } from "../../context/AdminContext";
import {
  CLIENT_ORIGIN_OPTIONS,
  ClubClient,
  ClientOrigin,
  createClient,
  finalizeClientsCsvImport,
  getClients,
  importClientsCsvBatch,
  type CsvImportErrorApi,
} from "../../lib/api";
import {
  applyMapping,
  autoMapColumns,
  buildImportPreview,
  CSV_SOURCE_LABELS,
  DEFAULT_CSV_IMPORT_OPTIONS,
  readClientImportFile,
  syncMappingHeaders,
  type CsvColumnMapping,
  type CsvImportOptions,
  type CsvImportPreview,
  type CsvImportSource,
  type CsvImportSummary,
  type MappedClientRow,
} from "../../lib/csv";
import { AdminBottomNav } from "../../components/AdminBottomNav";
import { ClientsSubnav } from "../../components/ClientsSubnav";
import { CsvUploadZone } from "../../components/clients-import/CsvUploadZone";
import { ColumnMappingForm } from "../../components/clients-import/ColumnMappingForm";
import { ImportOptionsForm } from "../../components/clients-import/ImportOptionsForm";
import { ImportPreviewSummary } from "../../components/clients-import/ImportPreviewSummary";
import { ImportProgress } from "../../components/clients-import/ImportProgress";
import { ImportResult } from "../../components/clients-import/ImportResult";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BATCH_SIZE = 50;
const PREVIEW_ROWS = 5;
const SOURCES: CsvImportSource[] = ["anota_ai", "excel", "outro"];

function formatPhone(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 13);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `+${n.slice(0, 2)} ${n.slice(2)}`;
  if (n.length <= 9) return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4)}`;
  return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
}

/**
 * Clientes → Importação (/admin/clientes/importar).
 * UI de upload CSV/Excel VISÍVEL nesta aba — sem rota nova.
 */
export default function ClientsImport() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();

  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stamps, setStamps] = useState("0");
  const [cashback, setCashback] = useState("0");
  const [origin, setOrigin] = useState<ClientOrigin>("importacao_manual");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [manualError, setManualError] = useState("");
  const [existing, setExisting] = useState<ClubClient | null>(null);

  const [source, setSource] = useState<CsvImportSource>("anota_ai");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping[]>([]);
  const [options, setOptions] = useState<CsvImportOptions>({
    ...DEFAULT_CSV_IMPORT_OPTIONS,
  });
  const [existingPhones, setExistingPhones] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    void getClients()
      .then((data) => setExistingPhones(data.clients.map((c) => c.phone)))
      .catch(() => setExistingPhones([]));
  }, []);

  const mappedRows: MappedClientRow[] = useMemo(
    () => (headers.length ? applyMapping(headers, rawRows, mapping) : []),
    [headers, rawRows, mapping],
  );

  const previewRows = useMemo(() => rawRows.slice(0, PREVIEW_ROWS), [rawRows]);

  const importPreview: CsvImportPreview | null = useMemo(() => {
    if (!mappedRows.length) return null;
    return buildImportPreview(mappedRows, existingPhones);
  }, [mappedRows, existingPhones]);

  const resetFileResult = () => {
    setSummary(null);
    setProgress(0);
    setFileError("");
  };

  const handleFile = useCallback(
    async (file: File) => {
      resetFileResult();
      try {
        const parsed = await readClientImportFile(file);
        if (!parsed.headers.length) {
          setFileError("Arquivo sem cabeçalho. Use CSV ou Excel de clientes.");
          setFileName(null);
          setHeaders([]);
          setRawRows([]);
          setMapping([]);
          return;
        }
        const isExcel =
          file.name.toLowerCase().endsWith(".xlsx") ||
          file.name.toLowerCase().endsWith(".xls");
        const nextSource: CsvImportSource = isExcel
          ? source === "outro"
            ? "excel"
            : source
          : source;
        setFileName(file.name);
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
        if (nextSource !== source) setSource(nextSource);
        setMapping(autoMapColumns(parsed.headers, nextSource));
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
        setFileName(null);
        setHeaders([]);
        setRawRows([]);
        setMapping([]);
      }
    },
    [source],
  );

  const handleImportFile = async () => {
    if (!mappedRows.length || importing) return;
    const hasPhone =
      mapping.some((m) => m.target === "phone") ||
      mapping.some((m) => m.target === "celular");
    if (!hasPhone) {
      setFileError("Mapeie ao menos uma coluna de Telefone ou Celular.");
      return;
    }

    setImporting(true);
    setFileError("");
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
      setSummary({ imported, updated, skipped, errors });

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
        /* ignore log errors */
      }

      try {
        const data = await getClients();
        setExistingPhones(data.clients.map((c) => c.phone));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Falha na importação.");
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
    }
  };

  const manualPayload = () => ({
    name: name.trim(),
    phone: phone.replace(/\D/g, ""),
    stamps: Math.max(0, parseInt(stamps || "0", 10) || 0),
    cashbackBalance: Math.max(0, parseFloat(cashback.replace(",", ".") || "0") || 0),
    origin,
    notes: notes.trim(),
  });

  const handleSaveManual = async (updateIfExists = false) => {
    setSaving(true);
    setManualError("");
    setSuccess("");
    if (!updateIfExists) setExisting(null);
    try {
      const result = await createClient({ ...manualPayload(), updateIfExists });
      if (!result.ok) {
        setExisting(result.client);
        setManualError(result.error);
        return;
      }
      setSuccess(
        result.updated
          ? `${result.client.name} atualizado no Clube Burger GN.`
          : `${result.client.name} entrou no Clube Burger GN.`,
      );
      setName("");
      setPhone("");
      setStamps("0");
      setCashback("0");
      setNotes("");
      setOrigin("importacao_manual");
      setExisting(null);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Erro ao salvar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24" data-testid="clientes-importacao-page">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">
                Importação
              </h1>
              <p className="text-zinc-600 text-xs">Clientes · CSV e Excel</p>
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

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <ClientsSubnav active="importar" />

        {/* ═══ IMPORTADOR CSV/EXCEL — interface principal da aba ═══ */}
        <section className="space-y-4" data-testid="clientes-csv-importer">
          <div>
            <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-amber-500" />
              Importar clientes (CSV / Excel)
            </h2>
            <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
              Selecione um arquivo do computador. Aceita CSV, XLS e XLSX.
              Telefone é a chave — sem duplicatas.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={importing}
                onClick={() => {
                  setSource(s);
                  resetFileResult();
                  if (headers.length) setMapping(autoMapColumns(headers, s));
                }}
                className={`h-10 rounded-xl text-[11px] font-bold uppercase ${
                  source === s
                    ? "bg-amber-500 text-zinc-950"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                }`}
              >
                {CSV_SOURCE_LABELS[s]}
              </button>
            ))}
          </div>

          <CsvUploadZone
            disabled={importing}
            fileName={fileName}
            clientCount={fileName ? rawRows.length : null}
            onFile={(f) => void handleFile(f)}
          />

          {fileError && (
            <p className="text-red-400 text-sm" data-testid="clientes-csv-error">
              {fileError}
            </p>
          )}

          {headers.length > 0 && (
            <div className="space-y-4" data-testid="clientes-csv-preview-block">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-1">
                <p className="text-zinc-400 text-xs uppercase font-bold">Arquivo</p>
                <p className="text-white font-bold text-sm break-all">{fileName}</p>
                <p className="text-amber-400 text-sm font-bold">
                  {rawRows.length} cliente{rawRows.length === 1 ? "" : "s"} encontrado
                  {rawRows.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-black uppercase text-sm">
                  Pré-visualização
                </h3>
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
              </div>

              <ColumnMappingForm
                mapping={mapping}
                disabled={importing}
                onChange={(next) => {
                  resetFileResult();
                  setMapping(syncMappingHeaders(headers, next));
                }}
              />

              <ImportOptionsForm
                value={options}
                disabled={importing}
                onChange={(next) => {
                  resetFileResult();
                  setOptions(next);
                }}
              />

              {importPreview && !importing && !summary && (
                <ImportPreviewSummary
                  preview={importPreview}
                  totalRows={mappedRows.length}
                />
              )}
            </div>
          )}

          {importing && (
            <div data-testid="clientes-csv-progress">
              <ImportProgress percent={progress} />
            </div>
          )}

          {summary && !importing && (
            <div data-testid="clientes-csv-result">
              <ImportResult summary={summary} />
            </div>
          )}

          <Button
            type="button"
            data-testid="clientes-csv-import-btn"
            onClick={() => void handleImportFile()}
            disabled={
              importing ||
              mappedRows.length === 0 ||
              (importPreview != null &&
                importPreview.newCount === 0 &&
                importPreview.updateCount === 0)
            }
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase rounded-xl flex items-center justify-center gap-2 text-sm"
          >
            {importing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <FileSpreadsheet size={20} />
                Importar Clientes
              </>
            )}
          </Button>
        </section>

        {/* ═══ Manual (secundário, recolhido) ═══ */}
        <div className="pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <span>
              <span className="text-zinc-300 font-bold text-sm uppercase">
                Importação manual
              </span>
              <span className="block text-zinc-600 text-xs mt-0.5">
                Cadastro um a um (opcional)
              </span>
            </span>
            {showManual ? (
              <ChevronUp size={18} className="text-zinc-500" />
            ) : (
              <ChevronDown size={18} className="text-zinc-500" />
            )}
          </button>

          {showManual && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 mb-2">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Nome completo *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">WhatsApp *</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="+55 (71) 99999-0000"
                  className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Selos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={stamps}
                    onChange={(e) => setStamps(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Cashback (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashback}
                    onChange={(e) => setCashback(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Origem *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CLIENT_ORIGIN_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOrigin(o.id)}
                      className={`h-11 rounded-xl text-[11px] font-bold uppercase px-1 ${
                        origin === o.id
                          ? "bg-amber-500 text-zinc-950"
                          : "bg-zinc-950 border border-zinc-800 text-zinc-400"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Observações</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Importado do Anota Aí"
                  className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                />
              </div>
              {success && (
                <p className="text-green-400 text-sm flex items-center gap-2">
                  <Check size={16} /> {success}
                </p>
              )}
              {manualError && <p className="text-red-400 text-sm">{manualError}</p>}
              {existing && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-amber-400 text-xs font-bold uppercase">
                    Cliente existente
                  </p>
                  <p className="text-white text-sm font-bold">{existing.name}</p>
                  <Button
                    type="button"
                    onClick={() => void handleSaveManual(true)}
                    disabled={saving}
                    className="w-full h-10 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs"
                  >
                    <RefreshCw size={14} className="mr-1" /> Atualizar existente
                  </Button>
                </div>
              )}
              <Button
                onClick={() => void handleSaveManual(false)}
                disabled={
                  saving || !name.trim() || phone.replace(/\D/g, "").length < 10
                }
                className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                Salvar Cliente
              </Button>
            </div>
          )}
        </div>

        <Link
          href="/admin/clientes"
          className="block text-center text-zinc-500 text-xs font-bold uppercase tracking-wider hover:text-amber-500"
        >
          <Users size={14} className="inline mr-1" /> Ver lista de clientes
        </Link>
      </main>

      <AdminBottomNav active="/admin/clientes" />
    </div>
  );
}
