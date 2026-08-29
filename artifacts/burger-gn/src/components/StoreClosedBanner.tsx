import React, { useEffect, useState } from 'react';
import { StoreStatusPublic } from '../lib/api';
import { AlertCircle } from 'lucide-react';
import { refreshStoreStatus, subscribeStoreStatus } from '../lib/storeStatusCache';
import { useSmartPoll } from '../lib/useSmartPoll';

const POLL_MS = 60_000;

export function useStoreStatus(poll = true) {
  const [status, setStatus] = useState<StoreStatusPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeStoreStatus((next) => {
      if (next) setStatus(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let transitionTimer: number | undefined;
    const armTransition = (iso: string | null | undefined) => {
      window.clearTimeout(transitionTimer);
      if (!poll || !iso) return;
      const at = Date.parse(iso);
      if (!Number.isFinite(at)) return;
      const wait = Math.max(500, Math.min(at - Date.now() + 250, 60 * 60 * 1000));
      transitionTimer = window.setTimeout(() => { void refreshStoreStatus(true); }, wait);
    };
    armTransition(status?.nextTransitionAt);
    return () => window.clearTimeout(transitionTimer);
  }, [poll, status?.nextTransitionAt]);

  useSmartPoll(
    async () => { await refreshStoreStatus(false); },
    { intervalMs: POLL_MS, enabled: poll },
  );

  // Fail closed once status is known; before first load, do not block browsing.
  const isClosed = status?.isOpen === false;
  const isOpen = status == null ? true : status.isOpen === true;

  return { status, loading, isOpen, isClosed };
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
