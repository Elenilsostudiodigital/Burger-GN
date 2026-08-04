/**
 * Imports menu scraped from Anota Aí into the local admin API.
 * Usage: dotenv -e .env -- pnpm --filter @workspace/scripts exec tsx ./src/import-anota.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const menuPath = path.join(__dirname, "../anota-menu.json");
const BASE = process.env.API_BASE || "http://127.0.0.1:8080/api";
const EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD || "burger123";

type MenuProduct = {
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
  categorySlug: string;
  categoryName: string;
};

type MenuCategory = { name: string; slug: string };

function parseCookies(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(",").map((c) => c.split(";")[0].trim()).join("; ") : "";
}

async function main() {
  const menu = JSON.parse(fs.readFileSync(menuPath, "utf8")) as {
    categories: MenuCategory[];
    products: MenuProduct[];
  };

  const loginRes = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  const cookie = parseCookies(loginRes);
  if (!cookie) throw new Error("No session cookie from login");
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  // Remove seed/demo products so Anota menu is the source of truth
  const existingProducts = (await (await fetch(`${BASE}/admin/products`, { headers })).json()) as Array<{ id: number; name: string }>;
  for (const p of existingProducts) {
    await fetch(`${BASE}/admin/products/${p.id}`, { method: "DELETE", headers });
  }
  console.log(`Deleted ${existingProducts.length} existing products`);

  // Deactivate old seed categories that Anota does not use
  const existingCats = (await (await fetch(`${BASE}/admin/categories`, { headers })).json()) as Array<{
    id: number; slug: string; name: string; active: boolean;
  }>;
  const anotaSlugs = new Set(menu.categories.map((c) => c.slug));
  for (const c of existingCats) {
    if (!anotaSlugs.has(c.slug) && c.active) {
      await fetch(`${BASE}/admin/categories/${c.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ active: false }),
      });
    }
  }

  // Ensure Anota categories exist
  const slugToId = new Map<string, number>();
  for (const c of existingCats) slugToId.set(c.slug, c.id);

  let categoriesCreated = 0;
  let order = existingCats.reduce((m, c) => Math.max(m, 0), 0);
  for (const [i, cat] of menu.categories.entries()) {
    if (slugToId.has(cat.slug)) {
      // reactivate / rename if needed
      await fetch(`${BASE}/admin/categories/${slugToId.get(cat.slug)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ name: cat.name, active: true, displayOrder: i }),
      });
      continue;
    }
    const created = await fetch(`${BASE}/admin/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: cat.name, slug: cat.slug, displayOrder: i, active: true }),
    });
    if (!created.ok) throw new Error(`Category create failed: ${await created.text()}`);
    const row = await created.json();
    slugToId.set(cat.slug, row.id);
    categoriesCreated += 1;
    order += 1;
  }

  const addonSource = menu.products.filter((p) => p.categorySlug === "adicionais");
  const burgerAddons = addonSource.map((a) => ({
    name: a.name.replace(/^\+\s*/, "").trim(),
    price: a.price,
  }));

  let productsCreated = 0;
  let productsFailed: Array<{ name: string; error: string }> = [];
  let addonsAttached = 0;

  for (const [i, prod] of menu.products.entries()) {
    const categoryId = slugToId.get(prod.categorySlug);
    if (!categoryId) {
      productsFailed.push({ name: prod.name, error: `category missing: ${prod.categorySlug}` });
      continue;
    }

    const isBurger =
      prod.categorySlug === "hamburguer-artesanal" ||
      prod.categorySlug === "combos-burger-gn";

    const addons = isBurger ? burgerAddons : [];
    if (addons.length) addonsAttached += addons.length;

    const body = {
      name: prod.name,
      description: prod.description || "",
      price: prod.price.toFixed(2),
      image: prod.image || "",
      categoryId,
      available: prod.available,
      displayOrder: i,
      ingredients: [],
      addons,
      videoUrl: "",
    };

    const res = await fetch(`${BASE}/admin/products`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      productsFailed.push({ name: prod.name, error: await res.text() });
      continue;
    }
    productsCreated += 1;
  }

  // Validation
  const finalProducts = (await (await fetch(`${BASE}/admin/products`, { headers })).json()) as Array<{
    id: number; name: string; categorySlug: string | null; addons: Array<{ name: string; price: number }>; available: boolean; image: string;
  }>;
  const finalCats = (await (await fetch(`${BASE}/admin/categories`, { headers })).json()) as Array<{
    slug: string; name: string; active: boolean;
  }>;

  const activeCats = finalCats.filter((c) => c.active);
  const withAddons = finalProducts.filter((p) => (p.addons?.length ?? 0) > 0);
  const withImages = finalProducts.filter((p) => !!p.image);
  const unavailable = finalProducts.filter((p) => !p.available);

  const report = {
    source: "https://pedido.anota.ai/loja/the-burger-gn?f=ms",
    scraped: {
      categories: menu.categories.length,
      products: menu.products.length,
      adicionaisAsCategoryItems: addonSource.length,
    },
    imported: {
      categoriesCreated,
      productsCreated,
      productsFailed: productsFailed.length,
      activeCategories: activeCats.length,
      productsInDb: finalProducts.length,
      productsWithImages: withImages.length,
      productsUnavailableEsgotado: unavailable.length,
      burgerProductsWithAddons: withAddons.length,
      addonOptionsPerBurger: burgerAddons.length,
      totalAddonLinks: addonsAttached,
    },
    failed: productsFailed,
    categories: activeCats.map((c) => c.name),
    unavailableNames: unavailable.map((p) => p.name),
  };

  fs.writeFileSync(path.join(__dirname, "../anota-import-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
