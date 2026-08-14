/**
 * Divulgação module — static wiring checks (no network, no DB).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const page = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/pages/admin/Divulgacao.tsx'), 'utf8');
assert.match(page, /Copiar Link/);
assert.match(page, /wa\.me\/\?text=/);
assert.match(page, /navigator\.share/);
assert.match(page, /QRCode\.toCanvas/);
assert.match(page, /Baixar PNG/);
assert.match(page, /\/cardapio/);
assert.match(page, /Confira nosso cardápio digital/);
console.log('✓ Divulgacao page features');

const app = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/App.tsx'), 'utf8');
assert.match(app, /AdminDivulgacao/);
assert.match(app, /\/admin\/divulgacao/);
console.log('✓ route registered');

const nav = fs.readFileSync(path.join(root, 'artifacts/burger-gn/src/components/AdminBottomNav.tsx'), 'utf8');
assert.match(nav, /\/admin\/divulgacao/);
assert.match(nav, /Divulgação/);
console.log('✓ bottom nav item');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/burger-gn/package.json'), 'utf8'));
assert.ok(pkg.dependencies?.qrcode || pkg.devDependencies?.qrcode);
console.log('✓ qrcode dependency');

// Ensure we did not add DB schema for this module
const schemaFiles = fs.readdirSync(path.join(root, 'lib/db/src/schema'));
assert.ok(!schemaFiles.some((f) => /divulg/i.test(f)));
console.log('✓ no DB schema for Divulgação');

console.log('\nALL DIVULGACAO CHECKS PASSED');
