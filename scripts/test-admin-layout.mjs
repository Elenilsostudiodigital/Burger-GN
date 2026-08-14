/**
 * Admin layout polish checks (visual only).
 * Ensures desktop shell + tabs exist and public storefront pages were not touched.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/index.css'), 'utf8');
const tabs = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/components/AdminTabs.tsx'), 'utf8');

assert.match(css, /\.admin-shell\s*\{/);
assert.match(css, /max-width:\s*42rem/); // mobile unchanged
assert.match(css, /@media \(min-width: 768px\)[\s\S]*?\.admin-shell[\s\S]*?64rem/);
assert.match(css, /\.admin-card-grid-2/);
assert.match(css, /\.admin-tab-bar/);
assert.match(tabs, /export function AdminTabBar/);
console.log('✓ admin-shell + tabs CSS/component');

const publicPages = ['Home.tsx', 'Menu.tsx', 'Cart.tsx', 'Checkout.tsx'];
for (const p of publicPages) {
  const src = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/pages', p), 'utf8');
  assert.doesNotMatch(src, /admin-shell|AdminTabBar|admin-card-grid/);
}
console.log('✓ public storefront pages untouched');

const adminPages = [
  'SettingsHub.tsx', 'MenuAdmin.tsx', 'ClientsList.tsx', 'Coupons.tsx',
  'SalesDashboard.tsx', 'Financial.tsx', 'FinalizedOrders.tsx', 'Dashboard.tsx',
];
for (const p of adminPages) {
  const src = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/pages/admin', p), 'utf8');
  if (p === 'Dashboard.tsx') {
    assert.match(src, /admin-shell-wide/);
  } else {
    assert.match(src, /admin-shell/);
  }
}
console.log('✓ admin pages use wide shell');

console.log('\nALL ADMIN LAYOUT CHECKS PASSED');
