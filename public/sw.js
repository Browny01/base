/* Bridge offline shell — deliberately dependency-free and versioned. */
const SHELL_CACHE = "bridge-shell-v3";
const DATA_CACHE = "bridge-data-v2";
const SHELL_ROUTES = [
  "/",
  "/tasks",
  "/projects",
  "/notes",
  "/habits",
  "/focus",
  "/finance",
  "/money",
  "/vision",
  "/news",
  "/gym",
  "/learn",
  "/settings",
  "/manifest.json",
  "/bridge-mark.png",
  "/icon-192.png",
  "/icon-512.png",
  "/offline.html",
];
const CACHEABLE_APIS = [
  "/api/news",
  "/api/news/summary",
  "/api/market/charts",
  "/api/live-status",
  "/api/social-feed",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(async (cache) => {
        for (const route of SHELL_ROUTES) {
          try { await cache.add(new Request(route, { credentials: "same-origin" })); } catch {}
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallback ? await caches.match(fallback) : undefined) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (CACHEABLE_APIS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}?`))) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, url.pathname === "/" ? "/" : "/offline.html"));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "bridge-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "BRIDGE_SYNC_NOW" }))),
  );
});
