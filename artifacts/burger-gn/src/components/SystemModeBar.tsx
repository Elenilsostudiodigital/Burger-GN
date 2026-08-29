import { useEffect, useState } from "react";
import {
  peekSystemMode,
  setAdminSystemMode,
  subscribeSystemMode,
  type SystemModeSnapshot,
} from "../lib/systemModeClient";

/**
 * Isolated admin control for Operation / Sleep.
 * Lives only on Configurações (`/admin/config`), above the tabs.
 */
export function SystemModeBar() {
  const [state, setState] = useState<SystemModeSnapshot | null>(() => peekSystemMode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeSystemMode(setState), []);

  if (!state) return null;

  const sleeping = state.mode === "sleep";

  const apply = async (mode: "operation" | "sleep") => {
    setBusy(true);
    setError("");
    try {
      await setAdminSystemMode(mode);
    } catch {
      setError("Não foi possível alterar o modo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Status do sistema</p>
          <p className={`text-lg font-black ${sleeping ? "text-sky-300" : "text-emerald-400"}`}>
            {sleeping ? "😴 Dormindo" : "🟢 Operando"}
          </p>
          <p className="text-[12px] text-zinc-500 mt-1">
            Próximo despertar: {state.nextWakeLabel}
          </p>
          <p className="text-[12px] text-zinc-500">
            Próximo descanso: {state.nextSleepLabel}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          {sleeping ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("operation")}
              className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black uppercase disabled:opacity-60"
            >
              🟢 Ligar Sistema
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("sleep")}
              className="h-11 px-4 rounded-xl bg-sky-800 hover:bg-sky-700 text-white text-xs font-black uppercase disabled:opacity-60"
            >
              😴 Colocar Sistema para Dormir
            </button>
          )}
        </div>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}
