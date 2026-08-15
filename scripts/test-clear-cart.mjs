/**
 * Cart clear + persistence helpers (mirrors CartContext storage contract).
 * Run: node scripts/test-clear-cart.mjs
 */
import assert from "node:assert/strict";

const CART_STORAGE_KEY = "bgn_cart_v1";

const memory = new Map();

const localStorage = {
  getItem(k) {
    return memory.has(k) ? memory.get(k) : null;
  },
  setItem(k, v) {
    memory.set(k, String(v));
  },
  removeItem(k) {
    memory.delete(k);
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

function clearCart(setItems) {
  setItems([]);
  persistCartToStorage([]);
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const sample = [
  {
    lineId: "1::bacon::",
    item: { id: 1, name: "Smash", description: "", price: 25, image: "", available: true },
    quantity: 2,
    selectedAddons: [{ name: "bacon", price: 3 }],
    notes: "",
  },
];

persistCartToStorage(sample);
ok("persiste itens no storage", loadCartFromStorage().length === 1);
ok("quantidade persistida", loadCartFromStorage()[0].quantity === 2);

let cart = loadCartFromStorage();
clearCart((next) => {
  cart = next;
});
ok("clear zera estado em memória", cart.length === 0);
ok("clear remove chave do storage", localStorage.getItem(CART_STORAGE_KEY) === null);
ok("reload após clear continua vazio", loadCartFromStorage().length === 0);

persistCartToStorage([
  { lineId: "x", item: { id: 1 }, quantity: 1 }, // invalid
]);
ok("dados inválidos → carrinho vazio", loadCartFromStorage().length === 0);

const totalItems = (items) => items.reduce((a, i) => a + i.quantity, 0);
const subtotal = (items) =>
  items.reduce((a, i) => {
    const add = (i.selectedAddons || []).reduce((s, x) => s + (Number(x.price) || 0), 0);
    return a + (Number(i.item.price) + add) * i.quantity;
  }, 0);

persistCartToStorage(sample);
cart = loadCartFromStorage();
ok("badge/contador > 0 com itens", totalItems(cart) === 2);
ok("subtotal com addons", subtotal(cart) === (25 + 3) * 2);
clearCart((next) => {
  cart = next;
});
ok("badge/contador = 0 após limpar", totalItems(cart) === 0);
ok("subtotal = 0 após limpar", subtotal(cart) === 0);

persistCartToStorage([
  {
    lineId: "2::::",
    item: { id: 2, name: "Burger", description: "", price: 30, image: "", available: true },
    quantity: 1,
    selectedAddons: [],
    notes: "",
  },
]);
ok("pode adicionar novo pedido após limpar", loadCartFromStorage().length === 1);

console.log(`\n${passed} checks passed.`);
