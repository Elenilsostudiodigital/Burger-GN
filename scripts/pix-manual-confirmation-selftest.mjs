/**
 * PIX Manual confirmation DOM contract (removeChild/insertBefore fix).
 * Run: node scripts/pix-manual-confirmation-selftest.mjs
 *
 * Mirrors Confirmation.tsx: pix step panels stay mounted; visibility is CSS-only.
 * Never use AnimatePresence mode="wait" to swap pay/upload/sent/confirmed.
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Which panels must remain mounted once PIX QR flow is active. */
function mountedPanels({ showPixQr, pixStep }) {
  if (!showPixQr && pixStep !== 'sent' && pixStep !== 'confirmed') return [];
  return ['confirmed', 'sent', 'pay', 'upload'];
}

function visiblePanel({ showPixQr, pixStep }) {
  if (pixStep === 'confirmed') return 'confirmed';
  if (pixStep === 'sent') return 'sent';
  if (showPixQr && pixStep === 'pay') return 'pay';
  if (showPixQr && pixStep === 'upload') return 'upload';
  return null;
}

/** Sequence: pay → upload → sent → confirmed — hosts never drop. */
function simulateManualFlow() {
  const snapshots = [];
  let showPixQr = true;
  let pixStep = 'pay';

  const snap = (label) => {
    const mounted = mountedPanels({ showPixQr, pixStep });
    const visible = visiblePanel({ showPixQr, pixStep });
    snapshots.push({ label, mounted, visible, pixStep });
    assert(mounted.includes('pay') && mounted.includes('upload') && mounted.includes('sent') && mounted.includes('confirmed'),
      `${label}: all four hosts must stay mounted`);
    assert(visible === pixStep || (pixStep === 'pay' && visible === 'pay'),
      `${label}: visible=${visible} expected for step=${pixStep}`);
  };

  snap('land-pay');
  pixStep = 'upload';
  snap('after-ja-paguei');
  pixStep = 'sent';
  snap('after-comprovante');
  pixStep = 'confirmed';
  snap('after-admin-confirm');

  // Step changes must not change mounted set.
  const sets = snapshots.map((s) => s.mounted.join(','));
  assert(sets.every((s) => s === sets[0]), 'mounted panel set must be stable across steps');
  return snapshots;
}

const snaps = simulateManualFlow();
assert(snaps.length === 4, 'expected 4 steps');
assert(snaps[0].visible === 'pay', 'start on pay');
assert(snaps[1].visible === 'upload', 'then upload');
assert(snaps[2].visible === 'sent', 'then sent');
assert(snaps[3].visible === 'confirmed', 'then confirmed');

console.log('pix-manual-confirmation-selftest: OK');
console.log(JSON.stringify(snaps, null, 2));
