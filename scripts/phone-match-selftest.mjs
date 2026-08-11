/**
 * Lightweight sanity checks for Clube ↔ pedido phone identity.
 * Mirrors artifacts/api-server/src/lib/clientMeta.ts helpers used in matching.
 * Run: node scripts/phone-match-selftest.mjs
 */

function normalizeClientPhone(phone) {
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

function phoneIdentityKey(phone) {
  const n = normalizeClientPhone(phone);
  if (!n) return "";
  const national = n.startsWith("55") ? n.slice(2) : n;
  if (!national) return "";
  if (national.length >= 11) return national.slice(-11);
  return national;
}

function phoneIdentityKeys(phone) {
  const key = phoneIdentityKey(phone);
  if (!key) return [];
  const keys = new Set([key]);
  if (key.length === 11 && key[2] === "9") {
    keys.add(key.slice(0, 2) + key.slice(3));
  } else if (key.length === 10) {
    keys.add(key.slice(0, 2) + "9" + key.slice(2));
  }
  return [...keys];
}

function isPlaceholderPhone(phone) {
  const key = phoneIdentityKey(phone);
  if (!key || key.length < 10) return true;
  if (/^0+$/.test(key)) return true;
  return false;
}

function phonesMatch(a, b) {
  const ka = phoneIdentityKeys(a);
  const kb = phoneIdentityKeys(b);
  if (!ka.length || !kb.length) return false;
  return ka.some((k) => kb.includes(k));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(normalizeClientPhone("(71) 99999-9999") === "5571999999999", "normalize formatted");
assert(normalizeClientPhone("71999999999") === "5571999999999", "normalize national");
assert(normalizeClientPhone("5571999999999") === "5571999999999", "normalize e164");

assert(phonesMatch("71999999999", "(71) 99999-9999"), "format variants match");
assert(phonesMatch("7199999999", "71999999999"), "8 vs 9 digit mobile match");
assert(phonesMatch("557199999999", "5571999999999"), "e164 8 vs 9 match");
assert(!phonesMatch("71988888888", "71999999999"), "different numbers");

assert(phoneIdentityKeys("71999999999").includes("7199999999"), "keys include without 9");
assert(isPlaceholderPhone("00000000000"), "placeholder zeros");
assert(isPlaceholderPhone("123"), "too short");
assert(!isPlaceholderPhone("71999999999"), "real mobile");

console.log("phone-match-selftest: OK");
