import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "burger-gn-pwa-install-dismissed";

/**
 * Chrome/Edge install affordance. Mounted outside feature modules.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    if (standalone) {
      setInstalled(true);
      return;
    }

    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !visible || !deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed native sheet */
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[60] px-4 pointer-events-none md:bottom-6">
      <div className="max-w-md mx-auto pointer-events-auto rounded-2xl border border-amber-500/40 bg-zinc-950/95 backdrop-blur shadow-xl shadow-black/40 p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden border border-amber-500/50 shrink-0 bg-[#0a0a0a]">
          <img src="/icons/icon-192.png" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm leading-tight">Instalar Burger GN</p>
          <p className="text-zinc-500 text-xs mt-0.5">Abra como aplicativo, sem barra do navegador.</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-wide inline-flex items-center gap-1.5"
        >
          <Download size={14} /> Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-2 text-zinc-500 hover:text-white"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
