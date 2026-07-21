// Chart-Datum height offset (Task: flagship accuracy / trust).
//
// The prediction sources reference heights to different (all ~mean-sea-level-ish) datums —
// TICON to LAT via its observed `datums`, Marine Institute to OD Malin, EPA to "Model MSL",
// the derived NI gauges to MSL. That means low waters come out NEGATIVE and highs look small
// (e.g. HW +1.5 m / LW -1.8 m), whereas every printed tide table / pro app references
// heights to CHART DATUM (~Lowest Astronomical Tide) — all positive, LW near 0, HW the real
// spring/neap range. Users comparing to a tide table read the negative numbers as "broken",
// even though the TIMES are right. This normalises displayed heights to chart datum.
//
// Z0 = metres to ADD to a station's predicted heights so they read against chart datum:
//   - Prefer the station's OWN observed datums (TICON): Z0 = MSL - LAT (exact).
//   - Otherwise approximate LAT as the lowest low water in a representative set of tides
//     (the full precomputed MI/EPA series, or ~a year of harmonic prediction) and use Z0 = -LAT.
// This is a DISPLAY convention only — it never changes predicted times or the stored data, and
// it's derived entirely from our own open data (no UKHO/Admiralty chart-datum values shipped).
export function chartDatumOffset(station, representativeTides) {
  const d = station?.datums;
  if (d && Number.isFinite(d.MSL) && Number.isFinite(d.LAT)) return d.MSL - d.LAT;

  const tides = representativeTides ?? station?.tides ?? [];
  const lows = tides
    .filter((t) => (Array.isArray(t) ? t[2] : t.type) === "low")
    .map((t) => (Array.isArray(t) ? t[1] : t.height))
    .filter((h) => Number.isFinite(h));
  return lows.length ? -Math.min(...lows) : 0;
}
