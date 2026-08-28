/* Burger GN PWA — network-safe service worker.
 * Never intercepts /api (incl. SSE).
 * Navigations are network-only (never cache HTML). On 403/429 (Vercel WAF
 * after deploys) retry with backoff so a brief edge block is not shown as
 * a sticky "Forbidden" page.
 */
const CACHE_VERSION = "burger-gn-pwa-v5-edge-403";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname === "/api";
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isCacheableOk(response) {
  return !!response && response.ok && response.status >= 200 && response.status < 300;
}

function isEdgeBlockStatus(status) {
  return status === 403 || status === 429;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithEdgeRetry(request, attempts = 4) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetch(request, { cache: "no-store" });
    if (!isEdgeBlockStatus(last.status)) return last;
    await sleep(700 * (i + 1) + Math.floor(Math.random() * 500));
  }
  return last;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (request.headers.get("accept")?.includes("text/event-stream")) return;

  if (isNavigationRequest(request)) {
    event.respondWith(fetchWithEdgeRetry(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (isEdgeBlockStatus(response.status)) return response;
          if (
            isCacheableOk(response) &&
            (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))
          ) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/admin/pedidos";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
