import React, { useEffect, useState } from 'react';
import { getStoreStatus, StoreStatusPublic } from '../lib/api';
import { AlertCircle } from 'lucide-react';

const POLL_MS = 30_000;

export function useStoreStatus(poll = true) {
  const [status, setStatus] = useState<StoreStatusPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await getStoreStatus();
        if (alive) setStatus(s);
      } catch {
        /* fail-open for UX if status endpoint blips; API still guards orders */
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    if (!poll) return () => { alive = false; };
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [poll]);

  return { status, loading, isOpen: status?.isOpen !== false, isClosed: status?.isOpen === false };
}

export function StoreClosedBanner({ className = '' }: { className?: string }) {
  const { status, isClosed } = useStoreStatus(true);
  if (!isClosed || !status) return null;

  return (
    <div
      role="status"
      className={`rounded-2xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-left ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-red-200 font-bold text-sm leading-snug">{status.message}</p>
          {status.reason !== 'manual_closed' && status.nextOpenLabel ? (
            <p className="text-red-200/80 text-xs">{status.nextOpenLabel}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
