/**
 * Sanity checks for street key normalization.
 * Run: node scripts/street-key-selftest.mjs
 */
function normalizeStreetKey(street) {
  return String(street || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rodovia|rod\.?)\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(normalizeStreetKey("Rua das Flores") === "das flores", "strip rua");
assert(normalizeStreetKey("Av. Brasil") === normalizeStreetKey("Avenida Brasil"), "av variants");
assert(normalizeStreetKey("RUA DAS FLORES") === normalizeStreetKey("rua das flores"), "case");
assert(normalizeStreetKey("Rua das Flores!") === normalizeStreetKey("rua das flores"), "punct");
console.log(normalizeStreetKey("Av. Brasil"), normalizeStreetKey("Avenida Brasil"));
console.log("street-key-selftest: OK");
