/**
 * Stress-test Localizar Endereço on Ruas de Entrega.
 * Usage:
 *   BASE_URL=https://… ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/localizar-stress-playwright.mjs
 */
import { chromium } from "playwright";

const BASE_URL = (process.env.BASE_URL || "https://burger-gn.vercel.app").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@burgergn.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "burger123";
const CLICKS = Number(process.env.CLICKS || 30);

const addresses = [
  { street: "Rua São Mateus", neighborhood: "Itinga", city: "Lauro de Freitas", cep: "42700000" },
  { street: "Avenida Santos Dumont", neighborhood: "Centro", city: "Lauro de Freitas", cep: "42700001" },
  { street: "Rua das Flores", neighborhood: "Vilas do Atlântico", city: "Lauro de Freitas", cep: "42700025" },
  { street: "Rua Chile", neighborhood: "Centro", city: "Salvador", cep: "40020000" },
  { street: "Avenida Paralela", neighborhood: "Patamares", city: "Salvador", cep: "41680010" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readCrash(page) {
  return page.evaluate(() => {
    try {
      return sessionStorage.getItem("lastUiCrash");
    } catch {
      return null;
    }
  });
}

async function hasErrorBoundary(page) {
  const text = await page.locator("body").innerText().catch(() => "");
  return (
    /algo deu errado|error boundary|insertBefore|toFixed is not a function/i.test(text) ||
    (await page.getByText(/Algo deu errado/i).count()) > 0
  );
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME || "/usr/local/bin/google-chrome",
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  console.log(`Login → ${BASE_URL}/admin/login`);
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Flexible login fields
  const email = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
  const password = page.locator('input[type="password"]').first();
  if (await email.count()) {
    await email.fill(ADMIN_EMAIL);
  }
  await password.fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /entrar|login|acessar/i }).first().click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 }).catch(() => {});
  await sleep(800);

  console.log(`Open ruas-entrega`);
  await page.goto(`${BASE_URL}/admin/ruas-entrega`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1000);

  // Open create form
  const openBtn = page.getByRole("button", { name: /Cadastrar Nova Rua/i }).first();
  await openBtn.click();
  await sleep(400);

  const streetInput = page.getByPlaceholder(/Rua São Mateus|Ex: Rua/i).first();
  const neighborhoodInput = page.getByPlaceholder(/Itinga|bairro/i).first();
  // City: label-based or value Lauro
  const cityInput = page.locator('input').filter({ has: page.locator("xpath=ancestor::div[.//text()[contains(.,'Cidade')]]") }).first();
  const cepInputs = page.locator("input").nth(3); // fallback; we fill by placeholders when possible

  let locateBtn = page.getByRole("button", { name: /Localizar Endereço|Localizando/i }).first();
  if (!(await locateBtn.count())) {
    throw new Error("Botão Localizar Endereço não encontrado");
  }

  for (let i = 1; i <= CLICKS; i++) {
    const addr = addresses[(i - 1) % addresses.length];
    console.log(`[${i}/${CLICKS}] ${addr.street} / ${addr.neighborhood}`);

    // Fill fields — prefer placeholders
    const rua = page.getByPlaceholder(/Rua São Mateus/i);
    const bairro = page.getByPlaceholder(/Itinga/i);
    await rua.fill(addr.street);
    await bairro.fill(addr.neighborhood);

    // City field: find by nearby label text
    const cityField = page.locator("label:text-is('Cidade')").locator("..").locator("input").first();
    if (await cityField.count()) await cityField.fill(addr.city);

    const cepField = page.locator("label:text-is('CEP')").locator("..").locator("input").first();
    if (await cepField.count()) await cepField.fill(addr.cep);

    locateBtn = page.getByRole("button", { name: /Localizar Endereço|Localizando/i }).first();
    await locateBtn.click();

    // Wait for loading to finish (button text back or overlay gone)
    await page
      .getByRole("button", { name: /Localizar Endereço/i })
      .first()
      .waitFor({ state: "visible", timeout: 45000 })
      .catch(() => {});
    await sleep(350);

    if (await hasErrorBoundary(page)) {
      const crash = await readCrash(page);
      console.error("FAIL: Error Boundary detected after click", i, crash);
      await page.screenshot({ path: `/tmp/localizar-stress-fail-${i}.png`, fullPage: true });
      process.exit(1);
    }
    const crash = await readCrash(page);
    if (crash) {
      console.error("FAIL: lastUiCrash set after click", i, crash);
      await page.screenshot({ path: `/tmp/localizar-stress-fail-${i}.png`, fullPage: true });
      process.exit(1);
    }

    // Select first candidate when available (exercises map update)
    const firstResult = page.locator("button").filter({ hasText: /—/ }).first();
    if (await firstResult.count()) {
      await firstResult.click().catch(() => {});
      await sleep(200);
      if (await hasErrorBoundary(page)) {
        console.error("FAIL: Error Boundary after selecting candidate", i);
        process.exit(1);
      }
    }
  }

  const insertBeforeHits = consoleErrors.filter((e) => /insertBefore/i.test(e));
  if (insertBeforeHits.length) {
    console.error("FAIL: insertBefore in console/pageerror", insertBeforeHits.slice(0, 5));
    process.exit(1);
  }

  console.log(`PASS: ${CLICKS} Localizar clicks, no Error Boundary, no lastUiCrash`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
