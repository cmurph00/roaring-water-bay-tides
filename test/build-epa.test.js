import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BBOX,
  COASTAL_NAME_RADIUS_KM,
  inBbox,
  parseNodeListCsv,
  parseSeriesCsv,
  parabolicPeak,
  extractExtrema,
  labelNodeFromCoastalPlaces,
} from "../scripts/build-epa.mjs";

// --- inBbox ---------------------------------------------------------------

test("inBbox keeps a point inside the West Cork box", () => {
  assert.equal(inBbox(51.48, -9.38), true); // Baltimore
});

test("inBbox rejects a point outside the box", () => {
  assert.equal(inBbox(53.34, -6.22), false); // Dublin
});

test("BBOX is sane (West Cork)", () => {
  assert.ok(BBOX.minLat < BBOX.maxLat && BBOX.minLon < BBOX.maxLon);
});

// --- parseNodeListCsv -------------------------------------------------------

test("parseNodeListCsv skips the two header rows and the blank placeholder row", () => {
  const csv = "stationID,longitude,latitude\n,degrees_east,degrees_north\nNODE_A,-9.5,51.5\nNODE_B,-8.1,51.8\n";
  const nodes = parseNodeListCsv(csv);
  assert.deepEqual(nodes, [
    { id: "NODE_A", latitude: 51.5, longitude: -9.5 },
    { id: "NODE_B", latitude: 51.8, longitude: -8.1 },
  ]);
});

// --- parseSeriesCsv ----------------------------------------------------------

test("parseSeriesCsv skips the two header rows and parses ISO times to epoch ms", () => {
  const csv = "time,sea_surface_height\nUTC,metres\n2026-01-01T00:00:00Z,0.38\n2026-01-01T00:10:00Z,0.48\n";
  const series = parseSeriesCsv(csv);
  assert.deepEqual(series, [
    { t: Date.UTC(2026, 0, 1, 0, 0), h: 0.38 },
    { t: Date.UTC(2026, 0, 1, 0, 10), h: 0.48 },
  ]);
});

test("parseSeriesCsv drops rows with a missing or NaN height", () => {
  const csv = "time,sea_surface_height\nUTC,metres\n2026-01-01T00:00:00Z,\n2026-01-01T00:10:00Z,NaN\n2026-01-01T00:20:00Z,0.5\n";
  const series = parseSeriesCsv(csv);
  assert.deepEqual(series, [{ t: Date.UTC(2026, 0, 1, 0, 20), h: 0.5 }]);
});

// --- parabolicPeak (Task 21, Part A) -----------------------------------------

test("parabolicPeak reconstructs the exact vertex of a true parabola sampled off-grid", () => {
  // h(t) = 5 - 0.01*(t-23)^2 in minutes — a genuine parabola whose peak (23min) falls
  // between the 20min and 30min samples, not on either of them. Parabolic interpolation
  // of 3 samples around a parabola is exact (not approximate), so this recovers the true
  // vertex to floating-point precision — the strongest possible regression check.
  const h = (tMin) => 5 - 0.01 * (tMin - 23) ** 2;
  const prev = { t: 10 * 60000, h: h(10) };
  const cur = { t: 20 * 60000, h: h(20) }; // the raw-sample "peak" (highest of the 3)
  const next = { t: 30 * 60000, h: h(30) };
  const refined = parabolicPeak(prev, cur, next);
  assert.ok(Math.abs(refined.t - 23 * 60000) < 1e-6, `expected ~23min, got ${refined.t / 60000}min`);
  assert.ok(Math.abs(refined.h - 5) < 1e-9, `expected height ~5, got ${refined.h}`);
});

test("parabolicPeak falls back to the raw sample when spacing either side is uneven", () => {
  const prev = { t: 0, h: 1 };
  const cur = { t: 15, h: 2 }; // not equidistant from prev/next (dt 15 vs 10)
  const next = { t: 25, h: 1.5 };
  assert.deepEqual(parabolicPeak(prev, cur, next), { t: 15, h: 2 });
});

test("parabolicPeak falls back to the raw sample when the 3 points are collinear (no vertex)", () => {
  const prev = { t: 0, h: 1 };
  const cur = { t: 10, h: 2 }; // perfectly linear — not a real extremum, denom would be 0
  const next = { t: 20, h: 3 };
  assert.deepEqual(parabolicPeak(prev, cur, next), { t: 10, h: 2 });
});

// --- extractExtrema: interpolation + plateau handling (Task 21, Part A) ------

test("extractExtrema finds the correct count and position of highs/lows on a clean sine series", () => {
  // Amplitude 2m, period 72 samples (12h at 10-min sampling), 3 full periods. Each
  // extremum sits exactly ON a sample here (symmetric cosine), so interpolation should
  // leave the time/height unchanged (offset 0 by symmetry) — this is the un-shifted
  // control case, distinct from the off-grid interpolation tests below.
  function sineSeries({ samples, period, amplitude = 2, intervalMs = 600000 }) {
    const series = [];
    for (let i = 0; i < samples; i++) {
      series.push({ t: i * intervalMs, h: amplitude * Math.cos((2 * Math.PI * i) / period) });
    }
    return series;
  }
  const series = sineSeries({ samples: 217, period: 72 });
  const extrema = extractExtrema(series);

  assert.equal(extrema.length, 5);
  assert.deepEqual(
    extrema.map((e) => e[2]),
    ["low", "high", "low", "high", "low"]
  );
  const expectedIndices = [36, 72, 108, 144, 180];
  extrema.forEach((e, k) => {
    assert.equal(e[0], expectedIndices[k] * 600000, `extremum ${k} at wrong time`);
  });
  for (const [, h, type] of extrema) {
    if (type === "high") assert.ok(Math.abs(h - 2) < 1e-9);
    else assert.ok(Math.abs(h - -2) < 1e-9);
  }
});

test("extractExtrema interpolates a true peak that falls BETWEEN two 10-min samples", () => {
  // Same parabola as the parabolicPeak test above, embedded in a realistic 10-min-sampled
  // series — the true peak (23min) is neither snapped to the 20min sample (old,
  // pre-interpolation behaviour) nor left exactly on it: it lands strictly between the
  // 20min and 30min samples, within one sample interval of the raw "highest sample" guess.
  const h = (tMin) => 5 - 0.01 * (tMin - 23) ** 2;
  const mins = [0, 10, 20, 30, 40, 50];
  const series = mins.map((t) => ({ t: t * 60000, h: h(t) }));
  const extrema = extractExtrema(series, 0);

  assert.equal(extrema.length, 1);
  const [t, height, type] = extrema[0];
  assert.equal(type, "high");
  assert.ok(t > 20 * 60000 && t < 30 * 60000, `expected time strictly between samples, got ${t / 60000}min`);
  assert.ok(Math.abs(t / 60000 - 23) <= 10, "expected within ~1 sample (10min) of the true 23min peak");
  assert.ok(Math.abs(height - 5) < 1e-6);
});

test("extractExtrema resolves a real EPA plateau (Schull, 2026-07-15 evening HW) to the TIME MIDPOINT of the tie, not the first sample", () => {
  // Actual raw ERDDAP samples for EPA node BPNBF050000200001_MODELLED, 2026-07-15: the
  // continuous model peaks at 17:30Z=1.61 / 17:40Z=1.61 (tied) / 17:50Z=1.59 (falling) —
  // before this fix, the extractor reported the FIRST of the tied pair (17:30Z = 18:30
  // IST), quantizing the true peak by up to a full sample. The true peak is the
  // continuous-time midpoint of the tie, 17:35Z = 18:35 IST — within ~2min of the
  // independently-verified real high water (18:37 IST).
  const series = [
    { t: Date.UTC(2026, 6, 15, 17, 0), h: 1.54 },
    { t: Date.UTC(2026, 6, 15, 17, 10), h: 1.58 },
    { t: Date.UTC(2026, 6, 15, 17, 20), h: 1.6 },
    { t: Date.UTC(2026, 6, 15, 17, 30), h: 1.61 },
    { t: Date.UTC(2026, 6, 15, 17, 40), h: 1.61 },
    { t: Date.UTC(2026, 6, 15, 17, 50), h: 1.59 },
    { t: Date.UTC(2026, 6, 15, 18, 0), h: 1.57 },
    { t: Date.UTC(2026, 6, 15, 18, 10), h: 1.53 },
  ];
  const extrema = extractExtrema(series, 0);
  assert.equal(extrema.length, 1);
  const [t, height, type] = extrema[0];
  assert.equal(type, "high");
  assert.equal(t, Date.UTC(2026, 6, 15, 17, 35)); // midpoint of the 17:30/17:40 tie
  assert.equal(height, 1.61);
});

test("extractExtrema ignores a near-flat wobble below the prominence threshold (values now parabola-refined off their raw samples)", () => {
  // A clear -2m low -> +2m high tidal swing, with a tiny 0.05m dip-then-bump ("wobble")
  // embedded on the rising slope. The wobble's prominence relative to its immediate
  // turning-point neighbours is ~0.05m, far below the 0.15m default threshold, so both
  // sides of it must be pruned away, leaving just the one true low and one true high —
  // each now refined by parabolic interpolation against its (asymmetric) raw neighbours,
  // rather than reported at the exact raw-sample time/height.
  const series = [
    { t: 0, h: -1.5 },
    { t: 1, h: -2.0 }, // true low (raw sample)
    { t: 2, h: -1.0 },
    { t: 3, h: -0.5 },
    { t: 4, h: -0.55 }, // wobble: tiny dip
    { t: 5, h: -0.45 }, // wobble: tiny bump back up
    { t: 6, h: 0.5 },
    { t: 7, h: 1.5 },
    { t: 8, h: 2.0 }, // true high (raw sample)
    { t: 9, h: 1.0 },
    { t: 10, h: 0.0 },
  ];
  const extrema = extractExtrema(series);
  assert.equal(extrema.length, 2);
  const [lowT, lowH, lowType] = extrema[0];
  const [highT, highH, highType] = extrema[1];
  assert.equal(lowType, "low");
  assert.equal(highType, "high");
  // Exact values per the parabolic-vertex formula against asymmetric neighbours
  // (prev=-1.5/next=-1.0 around the low; prev=1.5/next=1.0 around the high) — refined
  // off the raw t=1/t=8 samples, not snapped to them.
  assert.ok(Math.abs(lowT - 0.8333333333333334) < 1e-9);
  assert.ok(Math.abs(lowH - -2.0208333333333335) < 1e-9);
  assert.ok(Math.abs(highT - 7.833333333333333) < 1e-9);
  assert.ok(Math.abs(highH - 2.0208333333333335) < 1e-9);
});

test("extractExtrema returns [] for a too-short series", () => {
  assert.deepEqual(
    extractExtrema([
      { t: 0, h: 1 },
      { t: 1, h: 2 },
    ]),
    []
  );
});

// --- labelNodeFromCoastalPlaces (Task 21 registered-beach rule; broadened Task 24) -------

test("labelNodeFromCoastalPlaces names a node by the nearest register beach within 2km", () => {
  const node = { id: "n1", latitude: 51.50148784, longitude: -9.2658542 }; // Tragumna's coords
  const beaches = [{ name: "Tragumna", latitude: 51.50148784, longitude: -9.2658542 }];
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, []), "Tragumna");
});

test("labelNodeFromCoastalPlaces returns null (OFFSHORE) when no beach or place is within 2km", () => {
  // ~12km from the only beach/place in range — the real "Baltimore" mislabel case Task 21
  // fixed: an offshore node must not inherit a nearby town/beach's name.
  const node = { id: "n2", latitude: 51.47199, longitude: -9.432116 };
  const beaches = [{ name: "Tragumna", latitude: 51.50148784, longitude: -9.2658542 }];
  const places = [{ name: "Some Town", latitude: 51.6, longitude: -9.6 }];
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, places, 2), null);
});

test("labelNodeFromCoastalPlaces respects a custom maxKm radius", () => {
  const node = { id: "n3", latitude: 51.5, longitude: -9.5 };
  // ~1.11km away
  const beaches = [{ name: "Near Beach", latitude: 51.51, longitude: -9.5 }];
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, [], 1), null);
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, [], 2), "Near Beach");
});

test("labelNodeFromCoastalPlaces returns null when both beaches and places are empty", () => {
  const node = { id: "n4", latitude: 51.5, longitude: -9.5 };
  assert.equal(labelNodeFromCoastalPlaces(node, [], []), null);
});

// Task 24: the core fix. A node with no register beach within 2km but a GeoNames coastal
// place (town/harbour/etc) that close is now KEPT and named after that place, instead of
// being dropped as offshore — this is exactly the real Schull node case (2.2km from Schull
// town, ~18km from any bathing beach) validation found predicts well (18:35 vs a verified
// real 18:37) but Task 21's beaches-only rule wrongly dropped.

test("labelNodeFromCoastalPlaces names a node by a nearby GeoNames place when no beach is close", () => {
  const node = { id: "schull-node", latitude: 51.5245, longitude: -9.548 }; // ~2.1km from Schull town
  const beaches = [{ name: "Tragumna", latitude: 51.50148784, longitude: -9.2658542 }]; // far away
  const places = [{ name: "Schull", latitude: 51.52487, longitude: -9.54798, kind: "town" }];
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, places), "Schull");
});

test("labelNodeFromCoastalPlaces prefers a beach name over a closer-but-still-in-range place", () => {
  const node = { id: "n5", latitude: 51.5, longitude: -9.5 };
  // Place is nearer than beach, but the beach is still within maxKm — beach wins.
  const places = [{ name: "Some Locality", latitude: 51.501, longitude: -9.5, kind: "locality" }]; // ~0.11km
  const beaches = [{ name: "Some Beach", latitude: 51.515, longitude: -9.5 }]; // ~1.67km, still <=2km
  assert.equal(labelNodeFromCoastalPlaces(node, beaches, places, 2), "Some Beach");
});

test("COASTAL_NAME_RADIUS_KM default matches the documented 2km keep/naming radius", () => {
  assert.equal(COASTAL_NAME_RADIUS_KM, 2);
});
