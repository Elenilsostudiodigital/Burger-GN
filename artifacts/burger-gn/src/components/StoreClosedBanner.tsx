import React, { useEffect, useState } from 'react';
import { getStoreStatus, StoreStatusPublic } from '../lib/api';
import { AlertCircle } from 'lucide-react';

const POLL_MS = 15_000;

export function useStoreStatus(poll = true) {
  const [status, setStatus] = useState<StoreStatusPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let transitionTimer: number | undefined;
    let pollId: number | undefined;

    const load = async () => {
      try {
        const s = await getStoreStatus();
        if (!alive) return;
        setStatus(s);

        if (poll && s.nextTransitionAt) {
          const at = Date.parse(s.nextTransitionAt);
          if (Number.isFinite(at)) {
            const wait = Math.max(500, Math.min(at - Date.now() + 250, 60 * 60 * 1000));
            window.clearTimeout(transitionTimer);
            transitionTimer = window.setTimeout(() => { void load(); }, wait);
          }
        }
      } catch {
        /* fail-closed for ordering UX once we know the endpoint exists;
           while unknown, leave last status. API still guards POST /orders. */
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    if (poll) {
      pollId = window.setInterval(() => { void load(); }, POLL_MS);
      const onFocus = () => { void load(); };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
      return () => {
        alive = false;
        window.clearInterval(pollId);
        window.clearTimeout(transitionTimer);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
      };
    }

    return () => {
      alive = false;
      window.clearTimeout(transitionTimer);
    };
  }, [poll]);

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
