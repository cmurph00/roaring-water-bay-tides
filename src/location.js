export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestStation(lat, lon, stations) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineKm({ lat, lon }, { lat: s.latitude, lon: s.longitude });
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best ? { station: best, distanceKm: bestDist } : null;
}

export function searchStations(query, stations) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return stations.filter(
    (s) => s.name.toLowerCase().includes(q) || (s.country ?? "").toLowerCase().includes(q)
  );
}

export function distinctCountries(stations) {
  const countries = new Set(stations.map((s) => s.country).filter(Boolean));
  return [...countries].sort();
}

export function filterByCountry(stations, country) {
  if (!country) return [];
  return stations.filter((s) => s.country === country);
}

// Named localities (e.g. EPA-registered beaches) that resolve to their nearest real
// tide-prediction station at click-time — see mergeStationIndexes/nearestStation in
// src/ui.js. Search-only substring match, same shape as searchStations but scoped to
// `name` only (beaches don't carry a `country` filter axis worth matching on).
export function searchBeaches(query, beaches) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return beaches.filter((b) => b.name.toLowerCase().includes(q));
}

// Isolated here so the Phase 2 Capacitor wrap swaps only this function. On a native
// Capacitor shell (globalThis.Capacitor.isNativePlatform() true, with the Geolocation
// plugin registered), use the native plugin via the Capacitor GLOBAL — never a bare
// `import "@capacitor/..."`, since this file is loaded unbundled by the browser too and
// a static import would break the plain GitHub Pages web app. On the web,
// globalThis.Capacitor is undefined, so this falls through to the original
// navigator.geolocation path, unchanged.
export function detectLocation() {
  if (globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor.Plugins?.Geolocation) {
    return globalThis.Capacitor.Plugins.Geolocation.getCurrentPosition({ timeout: 10000 }).then(
      (pos) => ({ lat: pos.coords.latitude, lon: pos.coords.longitude })
    );
  }

  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}
