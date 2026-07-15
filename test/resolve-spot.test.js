import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSpot, OVERRIDE_RADIUS_KM } from "../src/resolve-spot.js";

const index = [
  { id: "SHERKIN", name: "Sherkin Island", latitude: 51.472, longitude: -9.416, source: "epa" },
  { id: "Union_Hall", name: "Union Hall", latitude: 51.559, longitude: -9.1335, source: "mi" },
];
const overrides = [{ name: "Baltimore", lat: 51.482, lon: -9.373, station: "Union_Hall" }];

test("resolveSpot pins an override station when the query is within the override radius", () => {
  const r = resolveSpot(51.482, -9.373, index, overrides); // Baltimore
  assert.equal(r.station.id, "Union_Hall");
  assert.equal(r.overridden, "Baltimore");
});

test("resolveSpot falls back to nearest when no override is in range", () => {
  const r = resolveSpot(51.472, -9.416, index, overrides); // at Sherkin, >2km from Baltimore spot
  assert.equal(r.station.id, "SHERKIN");
  assert.equal(r.overridden, undefined);
});

test("resolveSpot falls back to nearest when the pinned station id isn't in the index", () => {
  const r = resolveSpot(51.482, -9.373, index, [{ name: "X", lat: 51.482, lon: -9.373, station: "NOPE" }]);
  assert.ok(r.station); // didn't throw; resolved to nearest instead
  assert.equal(r.overridden, undefined);
});

test("resolveSpot with no overrides behaves like nearestStation", () => {
  const r = resolveSpot(51.55, -9.14, index, []);
  assert.equal(r.station.id, "Union_Hall");
});

test("OVERRIDE_RADIUS_KM is a small, sane radius", () => {
  assert.ok(OVERRIDE_RADIUS_KM > 0 && OVERRIDE_RADIUS_KM <= 5);
});
