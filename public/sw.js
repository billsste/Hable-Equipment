// EquipDispatch — service worker
// Strategy: network-first for navigation/API (fresh data wins for HIPAA), cache-first for static assets.

const VERSION = "ed-v3";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("ed-") && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache auth, mutating endpoints, or print routes — always network.
  // PHI must never go stale.
  if (
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/users") ||
    url.pathname.startsWith("/api/audit") ||
    url.pathname.startsWith("/api/tracker/orders") ||
    url.pathname.startsWith("/print/")
  ) {
    return;
  }

  // Navigation: network-first, fall back to cached page or tracker shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/tracker")),
        ),
    );
    return;
  }

  // Static assets + images: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|webp|svg|woff2?|ttf|css|js)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Default: network with runtime cache fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((c) => c || new Response("Offline", { status: 503 })),
      ),
  );
});
