import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Printer, RefreshCw, Check, Save, Star, AlertTriangle,
} from 'lucide-react';
import {
  getAdminPrinterSettings,
  updateAdminPrinterSettings,
} from '../../lib/api';
import {
  DEFAULT_PRINTER_SETTINGS,
  PRINT_AGENT_OFFLINE_HELP,
  PRINTER_STATUS_LABELS,
  PrinterDevice,
  PrinterSettings,
  fetchAgentPrinters,
  loadLastPrintedOrder,
  mergePrinterLists,
  isPrintAgentSupported,
  pingPrintAgent,
  reconnectPrintAgent,
  silentPrintOrder,
  silentPrintTest,
} from '../../lib/printReceipt';
import { PrintAgentReconnectButton } from '../../components/PrintAgentGuard';

export function PrintersTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [config, setConfig] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const online = isPrintAgentSupported() ? await pingPrintAgent() : false;
      setAgentOnline(online);
      const res = await getAdminPrinterSettings();
      let next = res.config as PrinterSettings;
      if (online) {
        try {
          const discovered = await fetchAgentPrinters();
          next = {
            ...next,
            printers: mergePrinterLists(next.printers || [], discovered),
          };
        } catch {
          /* keep saved */
        }
      }
      setConfig({
        ...DEFAULT_PRINTER_SETTINGS,
        ...next,
        copies: Math.max(1, Math.min(4, Number(next.copies) || 1)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar impressoras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!isPrintAgentSupported()) return;
    const id = window.setInterval(() => {
      void pingPrintAgent().then(setAgentOnline);
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const persist = async (next: PrinterSettings, okMsg = 'Salvo') => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...next,
        copies: Math.max(1, Math.min(4, next.copies || 1)),
      };
      const res = await updateAdminPrinterSettings(payload);
      setConfig({
        ...DEFAULT_PRINTER_SETTINGS,
        ...(res.config as PrinterSettings),
        copies: Math.max(1, Math.min(4, Number((res.config as PrinterSettings).copies) || 1)),
      });
      setSuccess(okMsg);
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setScanning(true);
    setError('');
    try {
      let online = await pingPrintAgent();
      if (!online) {
        const wake = await reconnectPrintAgent(10000);
        online = wake.ok;
        setAgentOnline(online);
        if (!online) {
          setError(PRINT_AGENT_OFFLINE_HELP);
          return;
        }
      } else {
        setAgentOnline(true);
      }
      const discovered = await fetchAgentPrinters();
      const next: PrinterSettings = {
        ...config,
        printers: mergePrinterLists(config.printers, discovered),
      };
      // Prefer POS-58 as default when present and none selected
      const pos = next.printers.find((p) => /pos-?58/i.test(p.name));
      if (pos && !next.defaultPrinterId) {
        next.defaultPrinterId = pos.id;
      }
      setConfig(next);
      await persist(next, 'Lista atualizada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao detectar impressoras');
    } finally {
      setScanning(false);
    }
  };

  const setDefault = async (id: string) => {
    const next = { ...config, defaultPrinterId: id };
    setConfig(next);
    await persist(next, 'Impressora padrão definida');
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    try {
      const result = await silentPrintTest(config);
      if (!result.ok) {
        setError(result.message);
      } else {
        setSuccess(`Teste enviado para ${result.printerName} (${result.copies} via${result.copies > 1 ? 's' : ''})`);
        setTimeout(() => setSuccess(''), 3500);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleReprint = async () => {
    setReprinting(true);
    setError('');
    try {
      const last = loadLastPrintedOrder();
      if (!last) {
        setError('Nenhum pedido recente para reimprimir.');
        return;
      }
      const result = await silentPrintOrder(last, config);
      if (!result.ok) setError(result.message);
      else {
        setSuccess(`Reimpresso #${last.orderNumber} em ${result.printerName}`);
        setTimeout(() => setSuccess(''), 3500);
      }
    } finally {
      setReprinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  const defaultPrinter = config.printers.find((p) => p.id === config.defaultPrinterId);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
        <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
          <Printer size={16} className="text-amber-500" /> Impressoras
        </h3>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Impressão silenciosa via agente local (sem janela do navegador). O agente inicia
          com o Windows após a instalação única neste PC da loja.
        </p>
        <p className={`text-xs font-bold ${
          !isPrintAgentSupported()
            ? 'text-zinc-500'
            : agentOnline ? 'text-green-400' : 'text-amber-400'
        }`}>
          {isPrintAgentSupported()
            ? `Agente local: ${agentOnline ? 'Conectado (127.0.0.1:19191)' : 'Desconectado'}`
            : 'Agente de impressão: disponível apenas no PC da loja'}
        </p>
      </div>

      {isPrintAgentSupported() && !agentOnline && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-amber-100 text-sm space-y-2">
          <p className="flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{PRINT_AGENT_OFFLINE_HELP}</span>
          </p>
          <PrintAgentReconnectButton
            onResult={(ok, message) => {
              setAgentOnline(ok);
              if (ok) {
                setError('');
                setSuccess(message);
                setTimeout(() => setSuccess(''), 2500);
                void load();
              } else {
                setError(message);
              }
            }}
          />
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-green-400 text-sm bg-green-950/20 border border-green-900/30 rounded-xl px-3 py-2 flex items-center gap-1">
          <Check size={14} /> {success}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={scanning || saving}
          onClick={() => void handleRefresh()}
          className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-black uppercase flex items-center gap-1.5"
        >
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar lista
        </button>
        <button
          type="button"
          disabled={testing || !config.defaultPrinterId}
          onClick={() => void handleTest()}
          className="h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-40"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          🖨️ Testar impressão
        </button>
        <button
          type="button"
          disabled={reprinting || !config.defaultPrinterId}
          onClick={() => void handleReprint()}
          className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-40"
        >
          {reprinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          🖨️ Reimprimir último pedido
        </button>
      </div>

      <div className="space-y-2">
        {config.printers.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-6">
            Nenhuma impressora detectada. Atualize a lista com o agente online.
          </p>
        ) : (
          config.printers.map((p: PrinterDevice) => {
            const isDefault = config.defaultPrinterId === p.id;
            const statusClass =
              p.status === 'connected' ? 'text-green-400' :
              p.status === 'error' ? 'text-red-400' :
              p.status === 'offline' ? 'text-amber-400' : 'text-zinc-500';
            return (
              <div
                key={p.id}
                className={`rounded-xl border px-3 py-3 flex items-center gap-3 ${
                  isDefault ? 'border-amber-500/50 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/50'
                }`}
              >
                <Printer size={18} className={isDefault ? 'text-amber-500' : 'text-zinc-500'} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{p.name}</p>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                    <span className={statusClass}>{PRINTER_STATUS_LABELS[p.status] || p.status}</span>
                    {/pos-?58/i.test(p.name) ? ' · POS-58' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void setDefault(p.id)}
                  className={`h-9 px-2.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${
                    isDefault
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300 hover:text-white'
                  }`}
                >
                  <Star size={12} /> {isDefault ? 'Padrão' : 'Definir padrão'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {!defaultPrinter && (
        <p className="text-amber-300 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> Selecione uma impressora padrão para a impressão automática.
        </p>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Opções</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.autoPrintOnAccept}
            onChange={() => {
              const next = { ...config, autoPrintOnAccept: !config.autoPrintOnAccept };
              setConfig(next);
              void persist(next);
            }}
            className="size-4 accent-amber-500"
          />
          <span className="text-sm text-zinc-200">Impressão automática</span>
        </label>

        <div>
          <p className="text-sm text-zinc-300 mb-2">Quantidade de vias</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  const next = { ...config, copies: n };
                  setConfig(next);
                  void persist(next);
                }}
                className={`h-10 w-12 rounded-xl font-black text-sm ${
                  config.copies === n
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.highlightOrderNumber}
            onChange={() => {
              const next = { ...config, highlightOrderNumber: !config.highlightOrderNumber };
              setConfig(next);
              void persist(next);
            }}
            className="size-4 accent-amber-500"
          />
          <span className="text-sm text-zinc-200">Número do pedido em destaque</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.printTrackingQr}
            onChange={() => {
              const next = { ...config, printTrackingQr: !config.printTrackingQr };
              setConfig(next);
              void persist(next);
            }}
            className="size-4 accent-amber-500"
          />
          <span className="text-sm text-zinc-200">Incluir link de acompanhamento</span>
        </label>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void persist(config, 'Configurações salvas')}
        className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        Salvar
      </button>
    </div>
  );
}
