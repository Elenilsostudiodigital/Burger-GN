import React from "react";
import { useStore } from "../context/StoreContext";

export function StoreBrandMark({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const { store } = useStore();
  if (store.logoUrl) {
    return (
      <img
        src={store.logoUrl}
        alt={store.storeName || "Logo"}
        width={size}
        height={size}
        className={`rounded-full object-cover border-2 border-amber-500 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`border-2 border-amber-500 rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="text-amber-500 font-black text-xs tracking-tight">GN</span>
    </div>
  );
}

export function StoreOpenBadge({ className = "" }: { className?: string }) {
  const { store, loading } = useStore();
  if (loading) return null;

  if (store.isOpen) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wide">Aberto agora</span>
      </div>
    );
  }

  const label = store.closedReason === "manual"
    ? "Estabelecimento fechado temporariamente."
    : store.nextOpenTime
      ? `Voltamos às ${store.nextOpenTime}`
      : store.statusMessage || "Fechado";

  return (
    <div className={`inline-flex flex-col items-start gap-0.5 rounded-xl bg-red-500/10 border border-red-500/30 px-2.5 py-1.5 ${className}`}>
      <div className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        <span className="text-red-400 text-[10px] font-bold uppercase tracking-wide">Fechado</span>
      </div>
      <span className="text-zinc-400 text-[10px] leading-snug">{label}</span>
    </div>
  );
}
