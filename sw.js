import { CACHE_ASSETS, CACHE_VERSION } from "./src/cache-manifest.js";

const CACHE = `tides-${CACHE_VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return url.pathname.includes("/data/");
}

// App shell: stale-while-revalidate. Serve cache immediately if present, and in
// parallel refetch + update the cache for next load. Falls back to network-only
// (and caches the result) when nothing is cached yet.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);

  if (cached) {
    // Update cache in the background; don't block the response on it. networkFetch
    // already swallows its own rejections above, so it never needs a second catch here.
    return cached;
  }
  const fresh = await networkFetch;
  if (fresh) return fresh;
  throw new Error("offline and not cached");
}

// Station data: cache-first. Serve cached copy if present; otherwise fetch and
// populate the cache for next time.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  const handler = isDataRequest(url) ? cacheFirst(e.request) : staleWhileRevalidate(e.request);
  e.respondWith(
    handler.catch(async () => {
      // Network unavailable and nothing cached: last-ditch cache lookup so a
      // misbehaving network never throws past a cached load.
      const cache = await caches.open(CACHE);
      const fallback = await cache.match(e.request);
      if (fallback) return fallback;
      return new Response("", { status: 504, statusText: "offline" });
    })
  );
});
