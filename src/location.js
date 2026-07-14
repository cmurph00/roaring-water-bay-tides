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

// Browser-only. Isolated here so the Phase 2 Capacitor wrap swaps only this function.
export function detectLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}
