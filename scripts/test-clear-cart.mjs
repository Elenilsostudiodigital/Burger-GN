/**
 * Validação da função "Limpar Carrinho" (checklist completa).
 * Run: node scripts/test-clear-cart.mjs
 *
 * Espelha CartContext (storage + wipe de lastOrder) e o contrato de Cart.tsx
 * (confirmação, redirect para /cardapio, último item).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CART_STORAGE_KEY = "bgn_cart_v1";
const LAST_ORDER_SESSION_KEY = "lastOrder";
const MY_ORDER_KEY = "bgn_my_order";
const CLUBE_PHONE_KEY = "bgn_clube_phone";
const PRESENCE_KEY = "bgn_menu_presence_sid";

const localMemory = new Map();
const sessionMemory = new Map();

const localStorage = {
  getItem(k) {
    return localMemory.has(k) ? localMemory.get(k) : null;
  },
  setItem(k, v) {
    localMemory.set(k, String(v));
  },
  removeItem(k) {
    localMemory.delete(k);
  },
};

const sessionStorage = {
  getItem(k) {
    return sessionMemory.has(k) ? sessionMemory.get(k) : null;
  },
  setItem(k, v) {
    sessionMemory.set(k, String(v));
  },
  removeItem(k) {
    sessionMemory.delete(k);
  },
};

function isValidCartItem(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.lineId !== "string" || !value.lineId) return false;
  if (!value.item || typeof value.item !== "object") return false;
  if (typeof value.item.id !== "number" || typeof value.item.name !== "string") return false;
  if (typeof value.item.price !== "number") return false;
  if (typeof value.quantity !== "number" || value.quantity <= 0) return false;
  if (!Array.isArray(value.selectedAddons)) return false;
  if (typeof value.notes !== "string") return false;
  return true;
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCartItem);
  } catch {
    return [];
  }
}

function persistCartToStorage(items) {
  if (!items.length) {
    localStorage.removeItem(CART_STORAGE_KEY);
    return;
  }
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

function wipeCartSessionResidue() {
  persistCartToStorage([]);
  sessionStorage.removeItem(LAST_ORDER_SESSION_KEY);
}

function clearCart(setItems) {
  setItems([]);
  wipeCartSessionResidue();
}

function removeItem(items, lineId) {
  const next = items.filter((i) => i.lineId !== lineId);
  if (next.length === 0) wipeCartSessionResidue();
  return next;
}

function updateQuantity(items, lineId, delta) {
  const next = items
    .map((i) => (i.lineId === lineId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
    .filter((i) => i.quantity > 0);
  if (next.length === 0) wipeCartSessionResidue();
  return next;
}

/** Cart.tsx: empty cart → Cardápio. */
function emptyCartRedirect(itemCount) {
  return itemCount === 0 ? "/cardapio" : null;
}

/** Cart.tsx handleClearCart — cancel keeps cart. */
function handleClearCart({ confirmed, items, setLocation }) {
  if (!confirmed) return { items, location: null };
  let next = items;
  clearCart((v) => {
    next = v;
  });
  try {
    sessionStorage.removeItem(LAST_ORDER_SESSION_KEY);
  } catch {
    /* ignore */
  }
  setLocation("/cardapio");
  return { items: next, location: "/cardapio" };
}

const totalItems = (items) => items.reduce((a, i) => a + i.quantity, 0);
const subtotal = (items) =>
  items.reduce((a, i) => {
    const add = (i.selectedAddons || []).reduce((s, x) => s + (Number(x.price) || 0), 0);
    return a + (Number(i.item.price) + add) * i.quantity;
  }, 0);

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const smash = {
  lineId: "1::bacon::",
  item: { id: 1, name: "Smash", description: "", price: 25, image: "", available: true },
  quantity: 2,
  selectedAddons: [{ name: "bacon", price: 3 }],
  notes: "",
};

const burger = {
  lineId: "2::::",
  item: { id: 2, name: "Burger", description: "", price: 30, image: "", available: true },
  quantity: 1,
  selectedAddons: [],
  notes: "",
};

function seedUnrelatedKeys() {
  localStorage.setItem(MY_ORDER_KEY, JSON.stringify({ trackingId: "abc", orderNumber: 9 }));
  localStorage.setItem(CLUBE_PHONE_KEY, "71999999999");
  sessionStorage.setItem(PRESENCE_KEY, "sid-1");
}

function unrelatedKeysIntact() {
  return (
    localStorage.getItem(MY_ORDER_KEY) != null &&
    localStorage.getItem(CLUBE_PHONE_KEY) === "71999999999" &&
    sessionStorage.getItem(PRESENCE_KEY) === "sid-1"
  );
}

function resetStores() {
  localMemory.clear();
  sessionMemory.clear();
}

// ---------------------------------------------------------------------------
// 1) Clicar em Limpar Carrinho remove todos os itens
// ---------------------------------------------------------------------------
resetStores();
seedUnrelatedKeys();
persistCartToStorage([smash, burger]);
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, JSON.stringify({ orderNumber: 42, items: [smash] }));
let cart = loadCartFromStorage();
ok("1. pré: dois itens no carrinho", cart.length === 2);

let redirected = null;
const cleared = handleClearCart({
  confirmed: true,
  items: cart,
  setLocation: (to) => {
    redirected = to;
  },
});
ok("1. Limpar Carrinho remove todos os itens", cleared.items.length === 0);
ok("1. subtotal e badge zerados", totalItems(cleared.items) === 0 && subtotal(cleared.items) === 0);

const cancelled = handleClearCart({
  confirmed: false,
  items: [smash],
  setLocation: () => {
    throw new Error("não deve redirecionar se cancelar");
  },
});
ok("1. cancelar confirmação não limpa o carrinho", cancelled.items.length === 1 && cancelled.location === null);

// ---------------------------------------------------------------------------
// 2) Storage do carrinho + lastOrder da sessão
// ---------------------------------------------------------------------------
ok("2. localStorage do carrinho removido (não fica [])", localStorage.getItem(CART_STORAGE_KEY) === null);
ok("2. sessionStorage lastOrder removido", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === null);
ok("2. reload após limpar continua vazio", loadCartFromStorage().length === 0);
ok("2. não apaga Meu Pedido / clube / presença", unrelatedKeysIntact());

// ---------------------------------------------------------------------------
// 3) Após limpar, redireciona para o Cardápio
// ---------------------------------------------------------------------------
ok("3. Limpar Carrinho redireciona para /cardapio", redirected === "/cardapio");
ok("3. carrinho vazio → /cardapio", emptyCartRedirect(0) === "/cardapio");
ok("3. carrinho com itens não redireciona", emptyCartRedirect(2) === null);

// ---------------------------------------------------------------------------
// 4) Remover o último item: mesmo comportamento (wipe + redirect)
// ---------------------------------------------------------------------------
resetStores();
seedUnrelatedKeys();
persistCartToStorage([smash, burger]);
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, JSON.stringify({ orderNumber: 7 }));
cart = loadCartFromStorage();
cart = removeItem(cart, smash.lineId);
ok("4. remover um item (ainda há outro) mantém o carrinho", cart.length === 1);
ok("4. lastOrder ainda presente enquanto há itens", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) != null);
ok("4. chave do carrinho ainda persistida", localStorage.getItem(CART_STORAGE_KEY) != null);

cart = removeItem(cart, burger.lineId);
ok("4. remover o último item zera o carrinho", cart.length === 0);
ok("4. último item remove localStorage do carrinho", localStorage.getItem(CART_STORAGE_KEY) === null);
ok("4. último item remove lastOrder", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === null);
ok("4. último item → redirect Cardápio", emptyCartRedirect(cart.length) === "/cardapio");
ok("4. último item não apaga outras chaves", unrelatedKeysIntact());

resetStores();
persistCartToStorage([{ ...burger, quantity: 1 }]);
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, "{}");
cart = loadCartFromStorage();
cart = updateQuantity(cart, burger.lineId, -1);
ok("4. quantidade 1→0 no último item zera o carrinho", cart.length === 0);
ok("4. quantidade 1→0 remove lastOrder", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === null);
ok("4. quantidade 1→0 → redirect Cardápio", emptyCartRedirect(cart.length) === "/cardapio");

resetStores();
persistCartToStorage([{ ...burger, quantity: 2 }]);
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, "{}");
cart = updateQuantity(loadCartFromStorage(), burger.lineId, -1);
ok("4. quantidade 2→1 não limpa sessão", cart.length === 1 && sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === "{}");

// ---------------------------------------------------------------------------
// 5) Novo pedido começa com carrinho totalmente limpo
// ---------------------------------------------------------------------------
resetStores();
persistCartToStorage([smash]);
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, JSON.stringify({ orderNumber: 1, items: [smash] }));
clearCart((next) => {
  cart = next;
});
ok("5. após limpar, storage vazio para um novo pedido", loadCartFromStorage().length === 0);
ok("5. lastOrder ausente no início do novo pedido", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === null);

persistCartToStorage([burger]);
const novo = loadCartFromStorage();
ok("5. novo item pode ser adicionado após limpar", novo.length === 1 && novo[0].item.name === "Burger");
ok("5. novo pedido não herda itens anteriores", !novo.some((i) => i.item.name === "Smash"));
ok("5. lastOrder continua ausente após novo item", sessionStorage.getItem(LAST_ORDER_SESSION_KEY) === null);

// ---------------------------------------------------------------------------
// 6) Nenhum resíduo do pedido anterior
// ---------------------------------------------------------------------------
resetStores();
const leftover = JSON.stringify({
  trackingId: "old",
  orderNumber: 99,
  items: [{ name: "Smash", quantity: 2 }],
  total: 56,
});
localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([smash]));
sessionStorage.setItem(LAST_ORDER_SESSION_KEY, leftover);
clearCart(() => {});
ok("6. sem chave bgn_cart_v1", !localMemory.has(CART_STORAGE_KEY));
ok("6. sem lastOrder residual", !sessionMemory.has(LAST_ORDER_SESSION_KEY));
ok("6. loadCartFromStorage não devolve pedido antigo", loadCartFromStorage().length === 0);

persistCartToStorage([{ lineId: "x", item: { id: 1 }, quantity: 1 }]); // inválido
ok("6. dados inválidos não reconstituem pedido antigo", loadCartFromStorage().length === 0);

// ---------------------------------------------------------------------------
// Contrato de código (somente Limpar Carrinho — não altera outros módulos)
// ---------------------------------------------------------------------------
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cartPage = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/pages/Cart.tsx"), "utf8");
const cartCtx = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/context/CartContext.tsx"), "utf8");
const confirmation = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/pages/Confirmation.tsx"), "utf8");
const checkout = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/pages/Checkout.tsx"), "utf8");

ok("código: botão Limpar carrinho", cartPage.includes("Limpar carrinho") && cartPage.includes("handleClearCart"));
ok("código: confirmação antes de limpar", cartPage.includes("window.confirm") && cartPage.includes("Limpar carrinho?"));
ok("código: handleClearCart chama clearCart", /handleClearCart[\s\S]*clearCart\(\)/.test(cartPage));
ok("código: handleClearCart remove lastOrder", cartPage.includes("sessionStorage.removeItem('lastOrder')"));
ok("código: handleClearCart redireciona /cardapio", /handleClearCart[\s\S]*setLocation\('\/cardapio'\)/.test(cartPage));
ok(
  "código: carrinho vazio redireciona /cardapio",
  /if \(cartItems\.length === 0\)[\s\S]*setLocation\('\/cardapio'\)/.test(cartPage),
);
ok(
  "código: carrinho vazio também limpa lastOrder",
  /if \(cartItems\.length === 0\)[\s\S]*sessionStorage\.removeItem\('lastOrder'\)[\s\S]*setLocation\('\/cardapio'\)/.test(
    cartPage,
  ),
);
ok("código: persistência vazia remove a chave", cartCtx.includes("localStorage.removeItem(CART_STORAGE_KEY)"));
ok("código: wipeCartSessionResidue existe", cartCtx.includes("wipeCartSessionResidue"));
ok("código: clearCart usa wipe da sessão", /clearCart[\s\S]*wipeCartSessionResidue\(\)/.test(cartCtx));
ok("código: último item (remove) usa wipe da sessão", /removeItem[\s\S]*wipeCartSessionResidue\(\)/.test(cartCtx));
ok("código: último item (qty) usa wipe da sessão", /updateQuantity[\s\S]*wipeCartSessionResidue\(\)/.test(cartCtx));
ok("código: wipe não toca bgn_my_order", !cartCtx.includes("bgn_my_order") && !cartPage.includes("bgn_my_order"));
ok("código: Confirmation ainda lê lastOrder antes de clearCart", /getItem\('lastOrder'\)[\s\S]*clearCart\(\)/.test(confirmation));
ok("código: Checkout ainda grava lastOrder após pedido", checkout.includes("sessionStorage.setItem('lastOrder'"));

console.log(`\n${passed} checks passed.`);
