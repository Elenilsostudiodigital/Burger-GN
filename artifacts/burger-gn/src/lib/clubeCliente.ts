/** Persistência local da área do Clube Burger (cliente). */

const PHONE_KEY = 'bgn_clube_phone';
const PROFILE_KEY = 'bgn_clube_profile';
const SEEN_LEDGER_KEY = 'bgn_clube_seen_ledger';
const CELEBRATED_ORDERS_KEY = 'bgn_clube_celebrated_orders';

export interface ClubeSessionProfile {
  phone: string;
  name: string;
  cashbackBalance: string;
  stamps: number;
  goal: number;
  remaining: number;
  progress: number;
  nextRewardMessage: string;
  rewardTitle: string;
  orderCount: number;
  updatedAt: string;
}

/** Minimal shape from GET /clube/me — avoids circular imports with api.ts */
export interface ClubeMeSnapshot {
  found: boolean;
  member: {
    phone: string;
    name: string;
    cashbackBalance: string;
    orderCount: number;
  } | null;
  fidelity?: {
    stamps: number;
    goal: number;
    remaining: number;
    progress: number;
    nextRewardMessage: string;
    rewardTitle: string;
  };
  summary?: {
    stampsEarned: number;
    cashbackReceived: number;
    cashbackUsed: number;
  };
  ledger?: Array<{
    orderId?: number | null;
    type: string;
    cashbackDelta?: number | null;
  }>;
}

export function getSavedClubePhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveClubePhone(phone: string) {
  try {
    const digits = toNationalWhatsappDigits(phone);
    if (!digits) {
      localStorage.removeItem(PHONE_KEY);
      return;
    }
    localStorage.setItem(PHONE_KEY, digits);
    window.dispatchEvent(new CustomEvent('bgn:clube-session-changed'));
  } catch { /* ignore */ }
}

export function clearClubePhone() {
  try {
    localStorage.removeItem(PHONE_KEY);
    localStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new CustomEvent('bgn:clube-session-changed'));
  } catch { /* ignore */ }
}

/** Digits only, national BR (DDD + número), max 11. Strips leading 55. */
export function toNationalWhatsappDigits(value: string): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

/** Format BR WhatsApp as user types. */
export function formatWhatsappInput(value: string): string {
  const digits = toNationalWhatsappDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatWhatsappDisplay(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function getClubeSessionProfile(): ClubeSessionProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClubeSessionProfile;
    if (!parsed?.phone || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveClubeSessionFromMe(data: ClubeMeSnapshot) {
  if (!data.found || !data.member || !data.fidelity) return;
  const phone = toNationalWhatsappDigits(data.member.phone);
  saveClubePhone(phone);
  const profile: ClubeSessionProfile = {
    phone,
    name: data.member.name,
    cashbackBalance: data.member.cashbackBalance,
    stamps: data.fidelity.stamps,
    goal: data.fidelity.goal,
    remaining: data.fidelity.remaining,
    progress: data.fidelity.progress,
    nextRewardMessage: data.fidelity.nextRewardMessage,
    rewardTitle: data.fidelity.rewardTitle,
    orderCount: data.member.orderCount,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('bgn:clube-session-changed', { detail: profile }));
  } catch { /* ignore */ }
}

export function getSeenLedgerIds(phone: string): Set<string> {
  try {
    const key = phoneIdentityStorageKey(phone);
    const raw = localStorage.getItem(`${SEEN_LEDGER_KEY}:${key}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markLedgerIdsSeen(phone: string, ids: string[]) {
  try {
    const key = phoneIdentityStorageKey(phone);
    const prev = getSeenLedgerIds(phone);
    for (const id of ids) prev.add(id);
    const next = [...prev].slice(-200);
    localStorage.setItem(`${SEEN_LEDGER_KEY}:${key}`, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function hasCelebratedOrder(orderId: number): boolean {
  try {
    const raw = localStorage.getItem(CELEBRATED_ORDERS_KEY);
    const ids = raw ? (JSON.parse(raw) as number[]) : [];
    return Array.isArray(ids) && ids.includes(orderId);
  } catch {
    return false;
  }
}

export function markOrderCelebrated(orderId: number) {
  try {
    const raw = localStorage.getItem(CELEBRATED_ORDERS_KEY);
    const prev = raw ? (JSON.parse(raw) as number[]) : [];
    const next = [orderId, ...(Array.isArray(prev) ? prev : [])].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    ).slice(0, 100);
    localStorage.setItem(CELEBRATED_ORDERS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function detectCelebrationKind(data: ClubeMeSnapshot): 'first' | 'returning' {
  const orderCount = data.member?.orderCount ?? 0;
  const stampsEarned = data.summary?.stampsEarned ?? 0;
  if (orderCount <= 1 || stampsEarned <= 1) return 'first';
  return 'returning';
}

function phoneIdentityStorageKey(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  return digits.slice(-11) || 'unknown';
}

export function fmtCashback(v: string | number): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export function firstName(fullName: string): string {
  return (fullName || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
}
