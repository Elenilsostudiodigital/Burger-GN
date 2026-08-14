/**
 * Visual layout smoke — ensures shared AdminTabs module exists and
 * CSS tokens for the global tab standard are present (no business logic).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tabsTsx = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/components/AdminTabs.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/index.css'), 'utf8');

assert.match(tabsTsx, /export function AdminTabBar/);
assert.match(tabsTsx, /export function AdminTab/);
assert.match(tabsTsx, /export function AdminTabLink/);
console.log('✓ AdminTabs component exports');

assert.match(css, /\.admin-tab-bar/);
assert.match(css, /\.admin-tab--active/);
assert.match(css, /height:\s*2\.5rem/);
assert.match(css, /flex-wrap:\s*wrap/);
assert.match(css, /@media \(max-width: 639px\)/);
console.log('✓ admin tab CSS standard');

const pages = [
  'SettingsHub.tsx',
  'MenuAdmin.tsx',
  'ClubeBurger.tsx',
  'KmDelivery.tsx',
  'SalesDashboard.tsx',
  'FinalizedOrders.tsx',
  'ClientsList.tsx',
  'ClientsRecovery.tsx',
  'Financial.tsx',
  'NewOrder.tsx',
];

for (const p of pages) {
  const src = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/pages/admin', p), 'utf8');
  assert.match(src, /AdminTab/, `${p} should use AdminTab*`);
}
console.log('✓ admin pages wired to shared tabs');

const subnav = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/components/ClientsSubnav.tsx'), 'utf8');
assert.match(subnav, /AdminTabBar/);
assert.match(subnav, /AdminTabLink/);
console.log('✓ ClientsSubnav standardized');

// Ensure we did not touch API/DB schema in this change set intentionally —
// this file only checks frontend visual wiring.
console.log('\nALL LAYOUT TAB CHECKS PASSED');
