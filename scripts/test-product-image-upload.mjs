import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error(`Missing: ${rel}`);
  return readFileSync(p, "utf8");
}

function assert(name, ok) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
  } else console.log(`✓ ${name}`);
}

const field = read("artifacts/burger-gn/src/components/ProductImageField.tsx");
const lib = read("artifacts/burger-gn/src/lib/productImage.ts");
const menu = read("artifacts/burger-gn/src/pages/admin/MenuAdmin.tsx");
const uploads = read("artifacts/api-server/src/routes/uploads.ts");
const index = read("artifacts/api-server/src/routes/index.ts");
const api = read("artifacts/burger-gn/src/lib/api.ts");
const app = read("artifacts/api-server/src/app.ts");
const products = read("artifacts/api-server/src/routes/products.ts");
const schema = read("lib/db/src/schema/products.ts");

assert("ProductImageField with select + drag/drop", /Selecionar Imagem/.test(field) && /onDrop/.test(field));
assert("crop editor zoom/rotate/center", /Recortar imagem/.test(field) && /Girar|RotateCw/.test(field) && /Centralizar/.test(field));
assert("preview amplify/replace/remove", /Ampliar/.test(field) && /Trocar/.test(field) && /Remover/.test(field));
assert("URL advanced option auto-filled", /Opção avançada/.test(field) && /URL da Imagem/.test(field));
assert("formats + compression helpers", /image\/webp/.test(lib) && /compressCanvasToJpeg/.test(lib));
assert("MenuAdmin uses ProductImageField", /ProductImageField/.test(menu));
assert("upload API route", /\/admin\/uploads\/product-image/.test(uploads) && /uploadsRouter/.test(index));
assert("client uploadProductImage", /uploadProductImage/.test(api));
assert("json body limit raised for images", /4mb/.test(app));
assert("no product schema change", /image: text\("image"\)/.test(schema));
assert("product create/update still string image", /image: String\(body\.image/.test(products) || /updateValues\.image = String/.test(products));
assert("orders untouched", !/uploadProductImage|product-image/.test(read("artifacts/api-server/src/routes/orders.ts")));

if (process.exitCode) {
  console.error("\nPRODUCT IMAGE CHECKS FAILED");
  process.exit(1);
}
console.log("\nALL PRODUCT IMAGE CHECKS PASSED");
