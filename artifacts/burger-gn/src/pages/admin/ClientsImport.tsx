import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Check,
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
 * Clientes → Importação (rota existente /admin/clientes/importar).
 * Importador CSV/Excel + importação manual — sem rotas novas,
 * sem reutilizar Importar Cardápio.
 */
export default function ClientsImport() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();

  // ── Manual (existing) ────────────────────────────────────────────────────
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

  // ── CSV / Excel ──────────────────────────────────────────────────────────
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
        const nextSource: CsvImportSource =
          file.name.toLowerCase().endsWith(".xlsx") ||
          file.name.toLowerCase().endsWith(".xls")
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

  const handleSourceChange = (next: CsvImportSource) => {
    setSource(next);
    resetFileResult();
    if (headers.length) setMapping(autoMapColumns(headers, next));
  };

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
        /* log failure must not keep loading */
      }

      // Refresh phones for next preview
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
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">
                Importação
              </h1>
              <p className="text-zinc-600 text-xs">Clientes · CSV, Excel e manual</p>
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

        {/* ── CSV / Excel (principal) ─────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs leading-relaxed">
              Importe clientes via CSV ou Excel (Anota AI e outros). Telefone é a chave
              principal — números iguais nunca geram duplicata. Independente do Importar Cardápio.
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
            </>
          )}

          {importing && <ImportProgress percent={progress} />}
          {summary && !importing && <ImportResult summary={summary} />}
          {fileError && <p className="text-red-400 text-sm">{fileError}</p>}

          <Button
            type="button"
            onClick={() => void handleImportFile()}
            disabled={
              importing ||
              mappedRows.length === 0 ||
              (importPreview != null &&
                importPreview.newCount === 0 &&
                importPreview.updateCount === 0)
            }
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

        {/* ── Manual (existente) ──────────────────────────────────────────── */}
        <div className="pt-2 border-t border-zinc-800 space-y-4">
          <div>
            <h2 className="text-white font-black uppercase text-sm">Importação manual</h2>
            <p className="text-zinc-500 text-xs mt-1">
              Cadastro um a um — selos e cashback de outro sistema.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
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
                <Label className="text-zinc-400 text-xs">Quantidade de selos</Label>
                <Input
                  type="number"
                  min={0}
                  value={stamps}
                  onChange={(e) => setStamps(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Saldo de Cashback (R$)</Label>
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
              <Label className="text-zinc-400 text-xs">Origem do cadastro *</Label>
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
              <Label className="text-zinc-400 text-xs">Observações (opcional)</Label>
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
                <p className="text-amber-400 text-xs font-bold uppercase">Cliente existente</p>
                <p className="text-white text-sm font-bold">{existing.name}</p>
                <p className="text-zinc-400 text-xs font-mono">{existing.phone}</p>
                <p className="text-zinc-500 text-xs">
                  {existing.stamps} selos · R${" "}
                  {parseFloat(existing.cashbackBalance || "0")
                    .toFixed(2)
                    .replace(".", ",")}{" "}
                  cashback · {existing.orderCount} pedidos
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleSaveManual(true)}
                    disabled={saving}
                    className="flex-1 h-10 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs"
                  >
                    <RefreshCw size={14} className="mr-1" /> Atualizar existente
                  </Button>
                  <Link href={`/admin/clientes/${existing.id}`} className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 border-zinc-700 text-zinc-300 font-bold rounded-xl text-xs"
                    >
                      Ver histórico
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <Button
              onClick={() => void handleSaveManual(false)}
              disabled={
                saving || !name.trim() || phone.replace(/\D/g, "").length < 10
              }
              className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Salvar Cliente
            </Button>
          </div>
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
