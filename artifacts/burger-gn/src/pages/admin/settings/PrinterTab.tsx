import React, { useEffect, useState } from 'react';
import { Check, Loader2, X, Printer, Search, Usb, Bluetooth, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPrintPrefs, updatePrintPrefs, PrintPrefs } from '../../../lib/api';
import {
  discoverPrinters, requestUsbPrinter, loadDevicePrinter, saveDevicePrinter,
  buildTestPageHTML, printHtml, DiscoveredPrinter,
} from '../../../lib/printer';

export function PrinterTab() {
  const [prefs, setPrefs] = useState<PrintPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [printers, setPrinters] = useState<DiscoveredPrinter[]>([]);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    getPrintPrefs()
      .then((p) => {
        setPrefs(p);
        const device = loadDevicePrinter();
        setDeviceName(device?.name || p.selectedPrinterName || '');
      })
      .catch(() => setError('Erro ao carregar impressora'))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (next: PrintPrefs, msg = 'Preferências salvas!') => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await updatePrintPrefs(next);
      setPrefs(saved);
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!prefs) return;
    setSearching(true); setError(''); setSuccess('');
    try {
      let list = await discoverPrinters(prefs.connectionType, prefs.networkAddress);
      if (prefs.connectionType === 'usb') {
        const picked = await requestUsbPrinter();
        if (picked && !list.some((p) => p.id === picked.id)) list = [...list, picked];
      }
      setPrinters(list);
      if (!list.length) setError('Nenhuma impressora encontrada neste dispositivo.');
    } catch {
      setError('Não foi possível procurar impressoras neste navegador.');
    } finally {
      setSearching(false);
    }
  };

  const selectPrinter = async (p: DiscoveredPrinter) => {
    if (!prefs) return;
    const type = p.type === 'system' ? prefs.connectionType : p.type;
    saveDevicePrinter({
      id: p.id,
      name: p.name,
      type,
      networkAddress: prefs.networkAddress,
      savedAt: new Date().toISOString(),
    });
    setDeviceName(p.name);
    await persist({
      ...prefs,
      selectedPrinterId: p.id,
      selectedPrinterName: p.name,
      connectionType: type,
    }, '✅ Impressora configurada com sucesso.');
  };

  const handleTestPrint = () => {
    const name = deviceName || prefs?.selectedPrinterName || 'Sistema';
    const ok = printHtml(buildTestPageHTML(name));
    if (ok) {
      setSuccess('✅ Impressora configurada com sucesso.');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError('Popup bloqueado. Permita janelas pop-up para imprimir.');
    }
  };

  if (loading || !prefs) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          🖨 Configure a impressora deste dispositivo. A impressão automática de pedidos fica
          <strong className="text-amber-500"> desativada</strong> por padrão.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Tipo de conexão</Label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'usb' as const, label: 'USB', icon: <Usb size={16} /> },
            { id: 'bluetooth' as const, label: 'Bluetooth', icon: <Bluetooth size={16} /> },
            { id: 'network' as const, label: 'Rede', icon: <Wifi size={16} /> },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPrefs({ ...prefs, connectionType: t.id })}
              className={`h-12 rounded-xl text-xs font-bold uppercase flex flex-col items-center justify-center gap-1 ${
                prefs.connectionType === t.id
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {prefs.connectionType === 'network' && (
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">IP / endereço da impressora</Label>
            <Input
              value={prefs.networkAddress}
              onChange={(e) => setPrefs({ ...prefs, networkAddress: e.target.value })}
              placeholder="192.168.0.50"
              className="bg-zinc-950 border-zinc-800 text-white h-11 font-mono focus:border-amber-500"
            />
          </div>
        )}

        <Button onClick={handleSearch} disabled={searching}
          className="w-full h-11 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2">
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          🔍 Procurar Impressoras
        </Button>
      </div>

      {printers.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Disponíveis</Label>
          {printers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void selectPrinter(p)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                prefs.selectedPrinterId === p.id
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
              }`}
            >
              <p className="text-white text-sm font-bold">{p.name}</p>
              {p.detail && <p className="text-zinc-500 text-[11px]">{p.detail}</p>}
            </button>
          ))}
        </div>
      )}

      {deviceName && (
        <div className="rounded-xl border border-green-800/40 bg-green-900/10 px-4 py-3 text-sm text-green-400">
          Selecionada: <strong>{deviceName}</strong>
        </div>
      )}

      <Button onClick={handleTestPrint}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        <Printer size={18} /> 🖨 Imprimir Página de Teste
      </Button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Impressão automática</Label>
        <p className="text-zinc-600 text-[11px]">Estrutura pronta — mantenha desativado por enquanto.</p>
        {([
          { key: 'autoPrintOnAccept' as const, label: 'Imprimir automaticamente pedidos aceitos' },
          { key: 'autoPrintOnPaid' as const, label: 'Imprimir automaticamente pedidos pagos' },
          { key: 'autoPrintOnDone' as const, label: 'Imprimir automaticamente pedidos finalizados' },
        ]).map((opt) => (
          <label key={opt.key} className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(prefs[opt.key])}
              onChange={(e) => {
                const next = { ...prefs, [opt.key]: e.target.checked };
                setPrefs(next);
                void persist(next);
              }}
              className="w-4 h-4 accent-amber-500"
            />
            {opt.label}
          </label>
        ))}
      </div>

      <Button
        onClick={() => void persist(prefs)}
        disabled={saving}
        className="w-full h-11 border border-zinc-700 bg-transparent text-zinc-300 font-bold rounded-xl"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar configuração
      </Button>

      {success && <p className="text-green-400 text-sm flex items-center gap-2"><Check size={16} /> {success}</p>}
      {error && <p className="text-red-400 text-sm flex items-center gap-2"><X size={16} /> {error}</p>}
    </div>
  );
}
