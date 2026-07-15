import { useStation } from "./engine.js";

// Offline harmonic prediction. Heights are the engine's water levels (station's chart datum).
function offlineTides(station, { start, end }) {
  const predictor = useStation(station);
  const pad = 12 * 3600 * 1000;
  const { extremes } = predictor.getExtremesPrediction({
    start: new Date(start.getTime() - pad),
    end: new Date(end.getTime() + pad),
  });
  return extremes
    .map((e) => ({ type: e.high ? "high" : "low", time: new Date(e.time), height: e.level }))
    .filter((t) => t.time >= start && t.time <= end)
    .sort((a, b) => a.time - b.time);
}

// Marine Institute (and OPW) stations ship pre-computed offline predictions instead of
// harmonic constituents: `station.tides` is a flat [epochMs, heightMetres, "high"|"low"]
// array covering a fixed calendar window (2026-2028). Slice it to the requested range
// rather than running the harmonic engine.
function precomputedTides(station, { start, end }) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return station.tides
    .filter(([epoch]) => epoch >= startMs && epoch <= endMs)
    .map(([epoch, level, type]) => ({ type, time: new Date(epoch), height: level }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Optional online refinement. `apiConfig` (from settings) = { fetchExtremes } — an injected
 * function returning the same shape. Any error falls back silently to offline.
 */
export async function getTides(station, range, apiConfig = null) {
  if (Array.isArray(station.tides)) return precomputedTides(station, range);

  if (apiConfig && typeof apiConfig.fetchExtremes === "function" && globalThis.navigator?.onLine) {
    try {
      const refined = await apiConfig.fetchExtremes(station, range);
      if (Array.isArray(refined) && refined.length) return refined;
    } catch (err) {
      console.warn("Tide API refinement failed; using offline prediction.", err);
    }
  }
  return offlineTides(station, range);
}
