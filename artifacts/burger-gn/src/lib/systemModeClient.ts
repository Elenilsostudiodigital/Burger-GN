export type SystemMode = "operation" | "sleep";

export type SystemModeSnapshot = {
  mode: SystemMode;
  source: "schedule" | "manual";
  nextWakeAt: string;
  nextSleepAt: string;
  nextWakeLabel: string;
  nextSleepLabel: string;
};

type Listener = (snapshot: SystemModeSnapshot) => void;

const listeners = new Set<Listener>();
let snapshot: SystemModeSnapshot | null = null;
let ready = false;
let sleeping = false;
let wakeTimer: number | undefined;

export function isSystemModeReady(): boolean {
  return ready;
}

export function isSystemSleeping(): boolean {
  return sleeping;
}

export function peekSystemMode(): SystemModeSnapshot | null {
  return snapshot;
}

export function subscribeSystemMode(listener: Listener): () => void {
  listeners.add(listener);
  if (snapshot) listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

function apply(next: SystemModeSnapshot) {
  snapshot = next;
  ready = true;
  sleeping = next.mode === "sleep";
  armWakeTimer(next);
  for (const listener of listeners) listener(next);
}

function armWakeTimer(next: SystemModeSnapshot) {
  if (typeof window === "undefined") return;
  window.clearTimeout(wakeTimer);
  const soonest = [next.nextWakeAt, next.nextSleepAt]
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms) && ms > Date.now())
    .sort((a, b) => a - b)[0];
  if (!soonest) return;
  const wait = Math.min(soonest - Date.now() + 400, 24 * 60 * 60 * 1000);
  wakeTimer = window.setTimeout(() => {
    void refreshSystemMode();
  }, wait);
}

export async function refreshSystemMode(): Promise<SystemModeSnapshot | null> {
  try {
    const res = await fetch("/api/system-mode", { credentials: "include", cache: "no-store" });
    if (!res.ok) return snapshot;
    const data = (await res.json()) as SystemModeSnapshot;
    if (data?.mode === "operation" || data?.mode === "sleep") apply(data);
    return snapshot;
  } catch {
    return snapshot;
  }
}

export async function setAdminSystemMode(mode: SystemMode): Promise<SystemModeSnapshot> {
  const res = await fetch("/api/admin/system-mode", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as SystemModeSnapshot;
  apply(data);
  return data;
}
