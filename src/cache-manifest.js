// App-shell assets precached on install (stale-while-revalidate in sw.js).
// Per-station JSON under ./data/ is cached at runtime on first view (cache-first in sw.js).
// CACHE_VERSION is rewritten by scripts/build-data.mjs on every successful data build, so
// regenerating the dataset auto-invalidates the runtime data cache.
export const CACHE_VERSION = "v843-20260715n";

export const CACHE_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./data/stations.json",
  "./data/mi-stations.json",
  "./data/epa-stations.json",
  "./data/beaches.json",
  "./data/places.json",
  "./data/ireland-outline.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./src/ui.js",
  "./src/engine.js",
  "./src/resolver.js",
  "./src/location.js",
  "./src/correction.js",
  "./src/format.js",
  "./src/theme.js",
  "./src/geo.js",
  "./src/map.js",
];
