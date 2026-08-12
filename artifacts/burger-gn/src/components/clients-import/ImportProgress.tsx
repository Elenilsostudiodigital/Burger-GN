import React from "react";

interface ImportProgressProps {
  percent: number;
  label?: string;
}

export function ImportProgress({ percent, label }: ImportProgressProps) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const blocks = 10;
  const filled = Math.round((p / 100) * blocks);
  const bar = "█".repeat(filled) + "░".repeat(blocks - filled);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
      <p className="text-amber-400 text-sm font-bold uppercase tracking-wide">
        {label || "Importando..."}
      </p>
      <p className="font-mono text-2xl text-white tracking-widest text-center" aria-hidden>
        {bar}
      </p>
      <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
        <div
          className="h-full bg-amber-500 transition-all duration-300 ease-out"
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="text-center text-white font-black text-lg">{p}%</p>
    </div>
  );
}
