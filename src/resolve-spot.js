import { haversineKm, nearestStation } from "./location.js";

// Validated per-spot source overrides (Task 22). Most coastal spots resolve fine to their nearest
// prediction point, but a few have a nearest point that is a poor TIDAL match — e.g. the EPA node
// closest to Baltimore is ~4km offshore in open bay and reads its high water ~15min early, and the
// nearest TICON harmonic station to Castletownshend is ~25min off. Validation against real reference
// tide times (test/accuracy.test.js, test/fixtures/reference-tides.json) showed the Marine Institute
// Union Hall gauge fits both far better. `data/spot-overrides.json` pins such spots to a chosen
// station id; any query within OVERRIDE_RADIUS_KM of the spot uses that station instead of the
// geometric nearest. The override is a routing decision (spot -> station id), not shipped tide data.
export const OVERRIDE_RADIUS_KM = 2;

/**
 * Resolves a coordinate to a prediction station: a pinned override station when the point is within
 * OVERRIDE_RADIUS_KM of a listed spot, otherwise the geometric nearest. Returns the same shape as
 * nearestStation ({ station, distanceKm }), plus `overridden: <spot name>` when an override applied,
 * or null if the index is empty. Pure, unit-tested — used by both search-alias clicks and geolocation.
 */
export function resolveSpot(lat, lon, index, overrides = []) {
  for (const o of overrides) {
    if (o == null || o.station == null) continue;
    if (haversineKm({ lat, lon }, { lat: o.lat, lon: o.lon }) <= OVERRIDE_RADIUS_KM) {
      const pinned = index.find((s) => s.id === o.station);
      if (pinned) {
        return {
          station: pinned,
          distanceKm: haversineKm({ lat, lon }, { lat: pinned.latitude, lon: pinned.longitude }),
          overridden: o.name ?? o.station,
        };
      }
    }
  }
  return nearestStation(lat, lon, index);
}
