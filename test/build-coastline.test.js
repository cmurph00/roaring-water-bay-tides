import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IRELAND_FILTER_BBOX,
  bboxContained,
  computeBbox,
  perpendicularDistance,
  simplifyPolyline,
  ringToLatLon,
  selectIrelandRings,
  selectIslandPolygons,
} from "../scripts/build-coastline.mjs";

// --- bboxContained -----------------------------------------------------------------

test("bboxContained is true when a is fully inside b", () => {
  const a = { minLat: 51.5, maxLat: 55.3, minLon: -10.3, maxLon: -5.5 };
  assert.equal(bboxContained(a, IRELAND_FILTER_BBOX), true);
});

test("bboxContained is false when a extends beyond b (e.g. Great Britain's much wider bbox)", () => {
  const greatBritain = { minLat: 50.0, maxLat: 58.6, minLon: -6.1, maxLon: 1.7 };
  assert.equal(bboxContained(greatBritain, IRELAND_FILTER_BBOX), false);
});

test("bboxContained is false when only one edge pokes outside", () => {
  const a = { minLat: 51.5, maxLat: 55.7, minLon: -10.3, maxLon: -5.5 }; // maxLat just past 55.6
  assert.equal(bboxContained(a, IRELAND_FILTER_BBOX), false);
});

// --- computeBbox ---------------------------------------------------------------------

test("computeBbox finds the min/max lat/lon across a set of points", () => {
  const points = [
    [51.5, -9.5],
    [52.0, -10.0],
    [51.2, -9.0],
  ];
  assert.deepEqual(computeBbox(points), { minLat: 51.2, maxLat: 52.0, minLon: -10.0, maxLon: -9.0 });
});

// --- perpendicularDistance -------------------------------------------------------------

test("perpendicularDistance is 0 for a point on the line", () => {
  assert.equal(perpendicularDistance([1, 1], [0, 0], [2, 2]), 0);
});

test("perpendicularDistance measures the offset of a point off a horizontal line", () => {
  const d = perpendicularDistance([1, 5], [0, 0], [2, 0]);
  assert.ok(Math.abs(d - 5) < 1e-9);
});

test("perpendicularDistance falls back to point-distance when the line has zero length", () => {
  const d = perpendicularDistance([3, 4], [0, 0], [0, 0]);
  assert.equal(d, 5);
});

// --- simplifyPolyline ------------------------------------------------------------------

test("simplifyPolyline leaves a 2-point (or shorter) line untouched", () => {
  assert.deepEqual(simplifyPolyline([[0, 0]], 1), [[0, 0]]);
  assert.deepEqual(simplifyPolyline([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
});

test("simplifyPolyline drops a near-collinear midpoint within tolerance", () => {
  const points = [
    [0, 0],
    [1, 0.001], // tiny deviation from the straight line
    [2, 0],
  ];
  assert.deepEqual(simplifyPolyline(points, 0.01), [
    [0, 0],
    [2, 0],
  ]);
});

test("simplifyPolyline keeps a genuine bend that exceeds tolerance", () => {
  const points = [
    [0, 0],
    [1, 5], // real bend, far off the straight line
    [2, 0],
  ];
  assert.deepEqual(simplifyPolyline(points, 0.01), points);
});

test("simplifyPolyline always keeps the first and last point, preserving a closed ring", () => {
  const ring = [
    [0, 0],
    [0.5, 0.0001],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  const simplified = simplifyPolyline(ring, 0.01);
  assert.deepEqual(simplified[0], ring[0]);
  assert.deepEqual(simplified[simplified.length - 1], ring[ring.length - 1]);
});

// --- ringToLatLon --------------------------------------------------------------------

test("ringToLatLon swaps GeoJSON [lon, lat] pairs into our own [lat, lon] pairs", () => {
  const coords = [
    [-9.5, 51.5],
    [-9.6, 51.6],
  ];
  assert.deepEqual(ringToLatLon(coords), [
    [51.5, -9.5],
    [51.6, -9.6],
  ]);
});

// --- selectIrelandRings ----------------------------------------------------------------

test("selectIrelandRings keeps a LineString ring whose bbox is inside the filter box", () => {
  const geojson = {
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-9.5, 51.5],
            [-9.6, 51.6],
            [-9.5, 51.5],
          ],
        },
      },
    ],
  };
  const rings = selectIrelandRings(geojson);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], [51.5, -9.5]);
});

test("selectIrelandRings drops a ring extending far outside the filter box (e.g. Great Britain)", () => {
  const geojson = {
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-6.1, 50.0],
            [1.7, 58.6],
            [-6.1, 50.0],
          ],
        },
      },
    ],
  };
  assert.deepEqual(selectIrelandRings(geojson), []);
});

// --- selectIslandPolygons ----------------------------------------------------------------

test("selectIslandPolygons keeps an in-box Polygon's outer ring, as [lat, lon] pairs", () => {
  const geojson = {
    features: [
      { geometry: { type: "Polygon", coordinates: [[[-9.5, 51.45], [-9.48, 51.46], [-9.5, 51.45]]] } },
    ],
  };
  const rings = selectIslandPolygons(geojson);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], [51.45, -9.5]);
});

test("selectIslandPolygons handles MultiPolygon and drops out-of-box islands", () => {
  const geojson = {
    features: [
      { geometry: { type: "MultiPolygon", coordinates: [[[[-9.5, 51.45], [-9.48, 51.46], [-9.5, 51.45]]]] } }, // in box
      { geometry: { type: "Polygon", coordinates: [[[2.0, 48.0], [2.1, 48.1], [2.0, 48.0]]] } }, // France, out
    ],
  };
  const rings = selectIslandPolygons(geojson);
  assert.equal(rings.length, 1);
});

test("selectIrelandRings ignores non-LineString features (e.g. Point/Polygon)", () => {
  const geojson = {
    features: [{ geometry: { type: "Polygon", coordinates: [[[-9.5, 51.5]]] } }],
  };
  assert.deepEqual(selectIrelandRings(geojson), []);
});

test("selectIrelandRings respects a custom filter bbox", () => {
  const geojson = {
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        },
      },
    ],
  };
  const tinyBox = { minLat: -0.5, maxLat: 0.5, minLon: -0.5, maxLon: 0.5 };
  assert.deepEqual(selectIrelandRings(geojson, tinyBox), []); // point (1,1) falls outside
  const bigBox = { minLat: -2, maxLat: 2, minLon: -2, maxLon: 2 };
  assert.equal(selectIrelandRings(geojson, bigBox).length, 1);
});
