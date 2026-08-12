/**
 * Client-side phone helpers for import preview.
 * Mirrors server normalizeClientPhone / phonesMatch (clientMeta).
 */

export function normalizeClientPhone(phone: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";

  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length === 10 || national.length === 11) return `55${national}`;
    if (national.length > 11) return `55${national.slice(-11)}`;
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length > 11) return `55${digits.slice(-11)}`;
  return digits;
}

export function phoneIdentityKey(phone: string): string {
  const n = normalizeClientPhone(phone);
  if (!n) return "";
  const national = n.startsWith("55") ? n.slice(2) : n;
  if (!national) return "";
  if (national.length >= 11) return national.slice(-11);
  return national;
}

export function phoneIdentityKeys(phone: string): string[] {
  const key = phoneIdentityKey(phone);
  if (!key) return [];
  const keys = new Set<string>([key]);
  if (key.length === 11 && key[2] === "9") {
    keys.add(key.slice(0, 2) + key.slice(3));
  } else if (key.length === 10) {
    keys.add(key.slice(0, 2) + "9" + key.slice(2));
  }
  return [...keys];
}

export function isPlaceholderPhone(phone: string): boolean {
  const key = phoneIdentityKey(phone);
  if (!key || key.length < 10) return true;
  if (/^0+$/.test(key)) return true;
  return false;
}

export function phonesMatch(a: string, b: string): boolean {
  const ka = phoneIdentityKeys(a);
  const kb = phoneIdentityKeys(b);
  if (!ka.length || !kb.length) return false;
  return ka.some((k) => kb.includes(k));
}

export function pickRowPhone(phone?: string | null, celular?: string | null): string {
  const primary = normalizeClientPhone(String(phone || ""));
  if (primary && !isPlaceholderPhone(primary) && primary.length >= 12) return primary;
  const secondary = normalizeClientPhone(String(celular || ""));
  if (secondary && !isPlaceholderPhone(secondary) && secondary.length >= 12) return secondary;
  return primary || secondary || "";
}
