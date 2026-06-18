// Jazz Bar Service Worker — Enables PWA installation + offline support
const CACHE_NAME = "jazzbar-v1";

// Static assets to cache on install
const PRECACHE_ASSETS = [
  "/",
  "/alarm.wav",
  "/timerstart.wav",
  "/rain.ogg",
  "/fireplace.ogg",
  "/bar_murmur.ogg",
  "/bar-bg.jpeg",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for static assets
        if (
          response.ok &&
          event.request.method === "GET" &&
          (event.request.url.match(/\.(ogg|wav|mp4|jpeg|jpg|png|ico|woff2?)$/) ||
            event.request.url === self.location.origin + "/")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
