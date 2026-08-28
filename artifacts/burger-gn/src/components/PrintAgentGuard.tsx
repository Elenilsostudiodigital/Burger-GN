import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  PRINT_AGENT_OFFLINE_HELP,
  PRINT_AGENT_PROTOCOL,
  pingPrintAgent,
  launchPrintAgentProtocol,
  reconnectPrintAgent,
  waitForPrintAgent,
} from '../lib/printReceipt';

const LAUNCH_TRY_KEY = 'bgn_print_agent_auto_wake_v1';

export function PrintAgentReconnectButton({
  className = '',
  onResult,
}: {
  className?: string;
  onResult?: (ok: boolean, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await reconnectPrintAgent(12000);
      onResult?.(result.ok, result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={PRINT_AGENT_PROTOCOL}
      onClick={() => {
        launchPrintAgentProtocol();
        void run();
      }}
      className={`inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase ${className}`}
      aria-busy={busy}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      {busy ? 'Reconectando…' : 'Reconectar Impressora'}
    </a>
  );
}

/**
 * Runs on every protected admin page: detects a dead local agent,
 * tries to wake the Windows watchdog, and shows Reconectar Impressora.
 */
export function PrintAgentGuard() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [hint, setHint] = useState('');

  const wakeOnce = useCallback(async () => {
    try {
      if (sessionStorage.getItem(LAUNCH_TRY_KEY) === '1') return false;
      sessionStorage.setItem(LAUNCH_TRY_KEY, '1');
    } catch {
      /* private mode */
    }
    launchPrintAgentProtocol();
    const recovered = await waitForPrintAgent(8000);
    setOnline(recovered);
    if (recovered) {
      try { sessionStorage.removeItem(LAUNCH_TRY_KEY); } catch { /* ignore */ }
      setHint('');
    }
    return recovered;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const ok = await pingPrintAgent();
      if (cancelled) return;
      if (ok) {
        try { sessionStorage.removeItem(LAUNCH_TRY_KEY); } catch { /* ignore */ }
        setOnline(true);
        setHint('');
        return;
      }
      setOnline(false);
      await wakeOnce();
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [wakeOnce]);

  if (online !== false) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-[70] rounded-2xl border border-amber-500/40 bg-zinc-950/95 px-3 py-3 shadow-xl shadow-black/40">
      <div className="flex gap-2">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-amber-200 text-xs font-black uppercase tracking-wide">
            Agente de impressão desconectado
          </p>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            {hint || 'Clique em Reconectar Impressora para religar neste PC. Se não abrir, o agente está fechado — execute uma vez install-autostart.bat neste computador da loja.'}
          </p>
          <Link href="/admin/config?tab=impressoras" className="text-amber-400 text-[11px] font-bold underline">
            Abrir Configurações → Impressoras
          </Link>
        </div>
      </div>
      <div className="mt-2">
        <PrintAgentReconnectButton
          className="w-full"
          onResult={(ok, message) => {
            setOnline(ok);
            setHint(ok ? '' : message || PRINT_AGENT_OFFLINE_HELP);
            if (ok) {
              try { sessionStorage.removeItem(LAUNCH_TRY_KEY); } catch { /* ignore */ }
            }
          }}
        />
      </div>
    </div>
  );
}
