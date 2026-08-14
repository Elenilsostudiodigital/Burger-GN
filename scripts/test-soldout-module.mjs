import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error(`Missing file: ${rel}`);
  return readFileSync(p, 'utf8');
}

function assert(name, cond, detail = '') {
  checks.push({ name, ok: !!cond, detail });
  if (!cond) console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`✓ ${name}`);
}

const productsRoute = read('artifacts/api-server/src/routes/products.ts');
const menuAdmin = read('artifacts/burger-gn/src/pages/admin/MenuAdmin.tsx');
const rowCard = read('artifacts/burger-gn/src/components/ProductRowCard.tsx');
const modal = read('artifacts/burger-gn/src/components/ProductDetailModal.tsx');
const cart = read('artifacts/burger-gn/src/context/CartContext.tsx');
const menu = read('artifacts/burger-gn/src/pages/Menu.tsx');
const home = read('artifacts/burger-gn/src/pages/Home.tsx');

assert(
  'public products API includes sold-out items',
  /Include sold-out products/.test(productsRoute)
  && !/eq\(productsTable\.available,\s*true\)/.test(productsRoute.split('router.get("/products"')[1]?.slice(0, 800) || ''),
);

assert(
  'admin availability filters',
  /Disponíveis/.test(menuAdmin) && /Esgotados/.test(menuAdmin) && /availabilityFilter/.test(menuAdmin),
);

assert(
  'admin Disponível/Esgotado toggle labels',
  /Marcar como esgotado/.test(menuAdmin) && /\{product\.available \? 'Disponível' : 'Esgotado'\}/.test(menuAdmin),
);

assert(
  'public row card ESGOTADO seal',
  /ESGOTADO/.test(rowCard) && /soldOut/.test(rowCard),
);

assert(
  'modal blocks purchase when sold out',
  /Produto esgotado/.test(modal) && /soldOut/.test(modal),
);

assert(
  'cart rejects unavailable addItem',
  /if\s*\(\s*!item\.available\s*\)\s*return/.test(cart),
);

assert(
  'menu/home guard available before add',
  /if\s*\(\s*!product\.available\s*\)\s*return/.test(menu)
  && /if\s*\(\s*!product\.available\s*\)\s*return/.test(home),
);

const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nALL SOLDOUT CHECKS PASSED');
