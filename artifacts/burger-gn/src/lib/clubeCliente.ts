/** Persistência local da área do Clube Burger (cliente). */

const PHONE_KEY = 'bgn_clube_phone';
const SEEN_LEDGER_KEY = 'bgn_clube_seen_ledger';

export function getSavedClubePhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveClubePhone(phone: string) {
  try {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) {
      localStorage.removeItem(PHONE_KEY);
      return;
    }
    localStorage.setItem(PHONE_KEY, digits);
  } catch { /* ignore */ }
}

export function clearClubePhone() {
  try {
    localStorage.removeItem(PHONE_KEY);
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

function phoneIdentityStorageKey(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  return digits.slice(-11) || 'unknown';
}
