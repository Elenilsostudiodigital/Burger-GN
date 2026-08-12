/**
 * Selftest: point-in-polygon + blocked precedence for Áreas de Entrega.
 * Usage: node scripts/delivery-areas-selftest.mjs
 */
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon) {
  if (polygon.type === "Polygon") {
    const outer = polygon.coordinates[0];
    if (!pointInRing(lng, lat, outer)) return false;
    for (let i = 1; i < polygon.coordinates.length; i++) {
      if (pointInRing(lng, lat, polygon.coordinates[i])) return false;
    }
    return true;
  }
  return false;
}

function calcAreaFee(minFee, feePerKm, distanceKm) {
  return Math.max(minFee, feePerKm * distanceKm);
}

const square = {
  type: "Polygon",
  coordinates: [[
    [-38.33, -12.90],
    [-38.32, -12.90],
    [-38.32, -12.89],
    [-38.33, -12.89],
    [-38.33, -12.90],
  ]],
};

if (!pointInPolygon(-38.325, -12.895, square)) throw new Error("FAIL: inside point");
if (pointInPolygon(-38.35, -12.895, square)) throw new Error("FAIL: outside point");

if (calcAreaFee(5, 2, 3) !== 6) throw new Error("FAIL: fee formula");
if (calcAreaFee(10, 2, 3) !== 10) throw new Error("FAIL: min fee");

// Blocked precedence: simulate resolve
const areas = [
  { id: 1, status: "active", enabled: true, priority: 10, polygon: square },
  { id: 2, status: "blocked", enabled: true, priority: 0, polygon: square, blockReason: "Risco" },
];
const containing = areas.filter((a) => a.enabled && pointInPolygon(-38.325, -12.895, a.polygon));
const blocked = containing.filter((a) => a.status === "blocked");
if (blocked.length === 0) throw new Error("FAIL: blocked should match");
if (blocked[0].blockReason !== "Risco") throw new Error("FAIL: block reason");

console.log("delivery-areas-selftest: PASS");
