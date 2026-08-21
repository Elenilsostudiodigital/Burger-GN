import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Printer, RefreshCw, Usb, Bluetooth, Check, Save, Star,
} from 'lucide-react';
import {
  getAdminPrinterSettings,
  updateAdminPrinterSettings,
} from '../../lib/api';
import {
  DEFAULT_PRINTER_SETTINGS,
  PRINTER_STATUS_LABELS,
  SYSTEM_PRINTER_ID,
  PrinterDevice,
  PrinterSettings,
  bluetoothSupported,
  mergePrinterLists,
  printTestReceipt,
  refreshUsbPrinters,
  requestBluetoothPrinter,
  requestUsbPrinter,
} from '../../lib/printReceipt';

export function PrintersTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const usbOk = typeof navigator !== 'undefined' && !!(navigator as Navigator & { usb?: unknown }).usb;
  const btOk = bluetoothSupported();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminPrinterSettings();
      setConfig(res.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar impressoras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: PrinterSettings, okMsg = 'Salvo') => {
    setSaving(true);
    setError('');
    try {
      const res = await updateAdminPrinterSettings(next);
      setConfig(res.config);
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
      const usb = await refreshUsbPrinters();
      const next: PrinterSettings = {
        ...config,
        printers: mergePrinterLists(config.printers, [
          ...usb,
          {
            id: SYSTEM_PRINTER_ID,
            name: 'Impressora do sistema (navegador)',
            connection: 'system',
            status: 'connected',
            lastSeenAt: new Date().toISOString(),
          },
        ]),
      };
      setConfig(next);
      await persist(next, 'Lista atualizada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao detectar impressoras');
    } finally {
      setScanning(false);
    }
  };

  const handleUsb = async () => {
    setScanning(true);
    setError('');
    try {
      const device = await requestUsbPrinter();
      if (!device) {
        setError(usbOk
          ? 'Nenhuma impressora USB selecionada (ou permissão negada).'
          : 'WebUSB não disponível neste navegador. Use Chrome/Edge.');
        return;
      }
      const next: PrinterSettings = {
        ...config,
        printers: mergePrinterLists(config.printers, [device]),
        defaultPrinterId: config.defaultPrinterId || device.id,
      };
      setConfig(next);
      await persist(next, 'USB conectada');
    } finally {
      setScanning(false);
    }
  };

  const handleBluetooth = async () => {
    setScanning(true);
    setError('');
    try {
      const device = await requestBluetoothPrinter();
      if (!device) {
        setError(btOk
          ? 'Nenhuma impressora Bluetooth selecionada (ou permissão negada).'
          : 'Bluetooth não disponível neste sistema/navegador.');
        return;
      }
      const next: PrinterSettings = {
        ...config,
        printers: mergePrinterLists(config.printers, [device]),
        defaultPrinterId: config.defaultPrinterId || device.id,
      };
      setConfig(next);
      await persist(next, 'Bluetooth conectado');
    } finally {
      setScanning(false);
    }
  };

  const setDefault = async (id: string) => {
    const next = { ...config, defaultPrinterId: id, autoPrintOnAccept: config.autoPrintOnAccept };
    setConfig(next);
    await persist(next, 'Impressora padrão definida');
  };

  const toggle = async (key: keyof Pick<
    PrinterSettings,
    'autoPrintOnAccept' | 'printSecondCopy' | 'highlightOrderNumber' | 'printTrackingQr'
  >) => {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    await persist(next);
  };

  const handleTest = () => {
    setTesting(true);
    setError('');
    const selected = config.printers.find((p) => p.id === config.defaultPrinterId);
    const ok = printTestReceipt(selected?.name);
    if (!ok) {
      setError('Pop-up bloqueado. Permita janelas pop-up para imprimir.');
    } else {
      setSuccess('Comprovante de teste enviado à impressão');
      setTimeout(() => setSuccess(''), 3000);
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
        <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
          <Printer size={16} className="text-amber-500" /> Impressoras
        </h3>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Detecte e registre impressoras USB/Bluetooth neste computador. A impressão usa o diálogo do sistema —
          escolha a térmica e marque “lembrar” no navegador.
        </p>
      </div>

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
          disabled={scanning || saving}
          onClick={() => void handleUsb()}
          className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-black uppercase flex items-center gap-1.5"
        >
          <Usb size={14} /> Conectar USB
        </button>
        <button
          type="button"
          disabled={scanning || saving || !btOk}
          onClick={() => void handleBluetooth()}
          className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-40"
          title={btOk ? 'Bluetooth' : 'Bluetooth indisponível'}
        >
          <Bluetooth size={14} /> Conectar Bluetooth
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={handleTest}
          className="h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase flex items-center gap-1.5 ml-auto"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          🖨️ Testar Impressora
        </button>
      </div>

      <div className="space-y-2">
        {config.printers.map((p: PrinterDevice) => {
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
                  {p.connection} · <span className={statusClass}>{PRINTER_STATUS_LABELS[p.status]}</span>
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
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Opções de impressão</p>
        {([
          ['autoPrintOnAccept', 'Impressão automática ao aceitar pedido'],
          ['printSecondCopy', 'Imprimir segunda via'],
          ['highlightOrderNumber', 'Imprimir número do pedido em destaque'],
          ['printTrackingQr', 'Imprimir QR Code do acompanhamento'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!config[key]}
              onChange={() => void toggle(key)}
              className="size-4 accent-amber-500"
            />
            <span className="text-sm text-zinc-200">{label}</span>
          </label>
        ))}
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
