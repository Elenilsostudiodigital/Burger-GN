import { useEffect, useRef } from "react";
import { isSystemSleeping, subscribeSystemMode } from "./systemModeClient";

export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

type SmartPollOptions = {
  /** Interval while the tab is visible. */
  intervalMs: number;
  /**
   * Interval while the tab is hidden.
   * 0 (default) pauses the loop until the tab is visible again.
   */
  hiddenIntervalMs?: number;
  enabled?: boolean;
};

/**
 * Runs `fn` immediately (if visible) and then on an interval.
 * Pauses when the tab is hidden unless `hiddenIntervalMs` > 0.
 * Fires once as soon as the tab becomes visible again.
 */
export function useSmartPoll(
  fn: () => void | Promise<void>,
  { intervalMs, hiddenIntervalMs = 0, enabled = true }: SmartPollOptions,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | undefined;

    const run = () => {
      if (cancelled || isSystemSleeping()) return;
      void fnRef.current();
    };

    const schedule = () => {
      window.clearInterval(timer);
      if (isSystemSleeping()) return;
      const hidden = !isDocumentVisible();
      if (hidden && hiddenIntervalMs <= 0) return;
      const ms = hidden && hiddenIntervalMs > 0 ? hiddenIntervalMs : intervalMs;
      timer = window.setInterval(run, ms);
    };

    if (isDocumentVisible() || hiddenIntervalMs > 0) run();
    schedule();

    const onVis = () => {
      if (isDocumentVisible()) run();
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    const unsubMode = subscribeSystemMode(() => {
      if (isSystemSleeping()) {
        window.clearInterval(timer);
        return;
      }
      if (isDocumentVisible() || hiddenIntervalMs > 0) run();
      schedule();
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      unsubMode();
    };
  }, [intervalMs, hiddenIntervalMs, enabled]);
}
