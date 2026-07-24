// ENVI service worker — enables PWA install. Kept intentionally conservative:
// it never caches API responses or SSR HTML, so data stays fresh and the app
// keeps working exactly as online. Its only job is installability + a light
// cache for hashed static assets.
const CACHE = "envi-shell-v2";
const PRECACHE = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Clicking a native notification focuses the app (or opens it) and tells the page
// which delivery to open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if (data && data.projectId) {
            client.postMessage({ type: "OPEN_DELIVERY", projectId: data.projectId, email: data.email, document: data.document });
          }
          return;
        }
      }
      await self.clients.openWindow("/admin");
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API or uploaded files — always hit the network.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/uploads")) return;

  // Hashed build assets are immutable → cache-first for speed/offline.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  // Everything else (navigations, icons, etc.): network-first so SSR meta and
  // fresh content always win; fall back to cache only when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && (url.pathname === "/manifest.json" || url.pathname === "/icon.svg")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/manifest.json")))
  );
});
