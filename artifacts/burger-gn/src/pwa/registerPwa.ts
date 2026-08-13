/**
 * Registers the Burger GN service worker (production only).
 * Isolated from business modules.
 */
export function registerBurgerGnPwa() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // Allow local testing when explicitly forced
  const force = new URLSearchParams(window.location.search).has("pwa");
  if (import.meta.env.DEV && !force) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Soft update check
        reg.update().catch(() => {});
        if (isLocal) {
          console.info("[PWA] Service worker registered", reg.scope);
        }
      })
      .catch((err) => {
        console.warn("[PWA] Service worker registration failed", err);
      });
  });
}
