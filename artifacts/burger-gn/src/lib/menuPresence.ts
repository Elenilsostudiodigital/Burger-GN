/** Lightweight storefront presence helpers (Clientes Online). */

const SESSION_KEY = "bgn_menu_presence_sid";
const NAME_KEY = "bgn_presence_name";
const PHONE_KEY = "bgn_presence_phone";

export type PresenceStatus = "browsing" | "cart" | "checkout";

export function getOrCreatePresenceSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

export function setPresenceIdentity(name?: string, phone?: string) {
  try {
    if (typeof name === "string" && name.trim()) {
      sessionStorage.setItem(NAME_KEY, name.trim().slice(0, 80));
    }
    if (typeof phone === "string") {
      const digits = phone.replace(/\D/g, "").slice(0, 15);
      if (digits) sessionStorage.setItem(PHONE_KEY, digits);
    }
  } catch { /* ignore */ }
}

export function getPresenceIdentity(): { name: string; phone: string } {
  try {
    return {
      name: sessionStorage.getItem(NAME_KEY)?.trim() || "",
      phone: sessionStorage.getItem(PHONE_KEY)?.replace(/\D/g, "") || "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

export function resolvePresenceStatus(path: string, cartCount: number): PresenceStatus {
  const p = path.split("?")[0] || "/";
  if (p === "/checkout" || p.endsWith("/checkout")) return "checkout";
  if (cartCount > 0) return "cart";
  return "browsing";
}

export function isStorefrontPresencePath(path: string): boolean {
  const p = path.split("?")[0] || "/";
  if (p.startsWith("/admin")) return false;
  if (p.startsWith("/pedido") || p === "/confirmacao" || p === "/meu-pedido") return false;
  return (
    p === "/"
    || p === "/cardapio"
    || p === "/carrinho"
    || p === "/checkout"
    || p === "/clube"
  );
}
