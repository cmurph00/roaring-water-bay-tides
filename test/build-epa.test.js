import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BBOX,
  NAMED_SPOTS,
  inBbox,
  parseNodeListCsv,
  parseSeriesCsv,
  extractExtrema,
  assignNamedSpots,
  resolveNodeName,
} from "../scripts/build-epa.mjs";

// --- inBbox ---------------------------------------------------------------

test("inBbox keeps a point inside the West Cork box", () => {
  assert.equal(inBbox(51.48, -9.38), true); // Baltimore
});

test("inBbox rejects a point outside the box", () => {
  assert.equal(inBbox(53.34, -6.22), false); // Dublin
});

test("BBOX/NAMED_SPOTS are sane (West Cork)", () => {
  assert.ok(BBOX.minLat < BBOX.maxLat && BBOX.minLon < BBOX.maxLon);
  assert.equal(NAMED_SPOTS.length, 4);
  for (const spot of NAMED_SPOTS) assert.ok(inBbox(spot.latitude, spot.longitude));
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

// --- extractExtrema ----------------------------------------------------------

// A clean synthetic sine-like series: amplitude 2m, period 72 samples (12h at 10-min
// sampling), 3 full periods (217 samples, t in ms as plain sample offsets — the algorithm
// only cares about relative ordering/spacing, not calendar semantics). The two boundary
// samples (i=0, i=216) sit exactly at a peak/trough but aren't detected as turning points
// (no interior neighbour on one side) — matching rawTurningPoints' requirement of a
// neighbour on both sides — so the expected extrema are the 3 interior troughs (i=36,108,180)
// and 2 interior crests (i=72,144), alternating low/high/low/high/low.
function sineSeries({ samples, period, amplitude = 2, intervalMs = 600000 }) {
  const series = [];
  for (let i = 0; i < samples; i++) {
    series.push({ t: i * intervalMs, h: amplitude * Math.cos((2 * Math.PI * i) / period) });
  }
  return series;
}

test("extractExtrema finds the correct count and position of highs/lows on a clean sine series", () => {
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

test("extractExtrema ignores a near-flat wobble below the prominence threshold", () => {
  // A clear -2m low -> +2m high tidal swing, with a tiny 0.05m dip-then-bump ("wobble")
  // embedded on the rising slope. The wobble's prominence relative to its immediate
  // turning-point neighbours is ~0.05m, far below the 0.15m default threshold, so both
  // sides of it must be pruned away, leaving just the one true low and one true high.
  const series = [
    { t: 0, h: -1.5 },
    { t: 1, h: -2.0 }, // true low
    { t: 2, h: -1.0 },
    { t: 3, h: -0.5 },
    { t: 4, h: -0.55 }, // wobble: tiny dip
    { t: 5, h: -0.45 }, // wobble: tiny bump back up
    { t: 6, h: 0.5 },
    { t: 7, h: 1.5 },
    { t: 8, h: 2.0 }, // true high
    { t: 9, h: 1.0 },
    { t: 10, h: 0.0 },
  ];
  const extrema = extractExtrema(series);
  assert.deepEqual(extrema, [
    [1, -2.0, "low"],
    [8, 2.0, "high"],
  ]);
});

test("extractExtrema returns [] for a too-short series", () => {
  assert.deepEqual(extractExtrema([{ t: 0, h: 1 }, { t: 1, h: 2 }]), []);
});

// --- assignNamedSpots / resolveNodeName --------------------------------------

test("assignNamedSpots maps each named spot to its nearest node only", () => {
  const nodes = [
    { id: "n1", latitude: 51.4795, longitude: -9.3821 }, // exactly Baltimore's coords
    { id: "n2", latitude: 51.9, longitude: -8.0 }, // far away
  ];
  const map = assignNamedSpots(nodes, [{ name: "Baltimore", latitude: 51.4795, longitude: -9.3821 }]);
  assert.equal(map.get("n1"), "Baltimore");
  assert.equal(map.size, 1);
});

test("assignNamedSpots gives a contested node to the closer spot only", () => {
  const nodes = [{ id: "n1", latitude: 51.5, longitude: -9.5 }];
  const spots = [
    { name: "Near", latitude: 51.5, longitude: -9.5 },
    { name: "Far", latitude: 51.6, longitude: -9.6 },
  ];
  const map = assignNamedSpots(nodes, spots);
  assert.deepEqual([...map.values()], ["Near"]);
});

test("resolveNodeName prefers the explicit named-spot assignment over a nearby beach", () => {
  const node = { id: "n1", latitude: 51.4795, longitude: -9.3821 };
  const beaches = [{ name: "Some Beach", latitude: 51.48, longitude: -9.38 }];
  const namedSpotAssignments = new Map([["n1", "Baltimore"]]);
  assert.equal(resolveNodeName(node, { namedSpotAssignments, beaches }), "Baltimore");
});

test("resolveNodeName falls back to the nearest beach within radius, formatted '<Beach> (EPA model)'", () => {
  const node = { id: "n2", latitude: 51.50148784, longitude: -9.2658542 }; // Tragumna's coords
  const beaches = [{ name: "Tragumna", latitude: 51.50148784, longitude: -9.2658542 }];
  assert.equal(resolveNodeName(node, { namedSpotAssignments: new Map(), beaches }), "Tragumna (EPA model)");
});

test("resolveNodeName ignores a beach farther than the naming radius", () => {
  const node = { id: "n3", latitude: 51.9, longitude: -8.01 };
  const beaches = [{ name: "Far Beach", latitude: 51.3, longitude: -10.3 }];
  assert.equal(resolveNodeName(node, { namedSpotAssignments: new Map(), beaches }), "EPA node n3");
});

test("resolveNodeName falls back to a generic 'EPA node <short-id>' label with no beaches nearby", () => {
  const node = { id: "BPNBF050000999999_MODELLED", latitude: 51.9, longitude: -8.01 };
  assert.equal(
    resolveNodeName(node, { namedSpotAssignments: new Map(), beaches: [] }),
    "EPA node BPNBF050000999999"
  );
});
