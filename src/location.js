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

// Rough all-Ireland bounding box — a cheap pre-filter so assignCounties skips the ~800 non-Irish
// European TICON gauges without running the nearest-place loop over each of them.
const IE_BBOX = { minLat: 51, maxLat: 56, minLon: -11, maxLon: -5 };
const COUNTY_MAX_KM = 25; // a coastal station is always well within this of a coastal place; a mis-boxed non-Irish one won't be

// Assigns each Irish station its county by inheriting it from the nearest gazetteer place that
// carries one (data/places.json — county derived from GeoNames admin codes in build-places.mjs).
// Stations have only lat/lon, no admin data of their own, so this coastal nearest-place lookup is
// how the county filter gets its values. Mutates each in-box station (adds `county`) and returns
// the same array; out-of-box (non-Irish) stations and any with no county-place within
// COUNTY_MAX_KM are left without a `county`, so they never appear in the county dropdown.
export function assignCounties(stations, places) {
  const withCounty = places.filter((p) => p.county);
  if (withCounty.length === 0) return stations;
  for (const s of stations) {
    if (s.latitude < IE_BBOX.minLat || s.latitude > IE_BBOX.maxLat || s.longitude < IE_BBOX.minLon || s.longitude > IE_BBOX.maxLon) continue;
    let best = null;
    let bestD = Infinity;
    for (const p of withCounty) {
      const d = haversineKm({ lat: s.latitude, lon: s.longitude }, { lat: p.latitude, lon: p.longitude });
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD <= COUNTY_MAX_KM) s.county = best.county;
  }
  return stations;
}

export function distinctCounties(stations) {
  const counties = new Set(stations.map((s) => s.county).filter(Boolean));
  return [...counties].sort();
}

export function filterByCounty(stations, county) {
  if (!county) return [];
  return stations.filter((s) => s.county === county);
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

// Same search-only-alias contract as searchBeaches above, for the GeoNames coastal-place
// gazetteer (data/places.json, scripts/build-places.mjs — towns, harbours, bays, coves,
// islands, ...). Also matches a place's alternate names (`alt`, e.g. an Irish-language name
// like Sherkin Island's "Inis Arcáin") so a user typing either form finds it — the one way
// this differs from searchBeaches' plain name-only match.
export function searchPlaces(query, places) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return places.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.alt ?? []).some((a) => a.toLowerCase().includes(q))
  );
}

// Isolated here so the Phase 2 Capacitor wrap swaps only this function. On a native
// Capacitor shell (globalThis.Capacitor.isNativePlatform() true, with the Geolocation
// plugin registered), use the native plugin via the Capacitor GLOBAL — never a bare
// `import "@capacitor/..."`, since this file is loaded unbundled by the browser too and
// a static import would break the plain GitHub Pages web app. On the web,
// globalThis.Capacitor is undefined, so this falls through to the original
// navigator.geolocation path, unchanged.
export function detectLocation() {
  const cap = globalThis.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Geolocation) {
    const Geo = cap.Plugins.Geolocation;
    // On Android, Geolocation.getCurrentPosition does NOT itself trigger the runtime permission
    // prompt — it just fails if the permission was never granted. So request it first (this shows
    // the Android dialog; a no-op once granted). enableHighAccuracy:false to match our coarse-only
    // permission. If the user denies, getCurrentPosition rejects and useMyLocation surfaces the
    // actionable "permission is off" message.
    const requested = Geo.requestPermissions ? Promise.resolve(Geo.requestPermissions()).catch(() => {}) : Promise.resolve();
    return requested
      .then(() => Geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }))
      .then((pos) => ({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
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
