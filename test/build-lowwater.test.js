import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoastGrid, nearCoast } from "../scripts/build-lowwater.mjs";

// The coast-proximity spatial index is how build-lowwater.mjs discards inland-water low-water marks:
// only features near the sea coast are kept. These cover the pure grid helpers.

test("buildCoastGrid indexes coast vertices into occupied cells (LineString + MultiLineString)", () => {
  const coast = {
    features: [
      { geometry: { type: "LineString", coordinates: [[-9.5, 51.5], [-9.49, 51.51]] } },
      { geometry: { type: "MultiLineString", coordinates: [[[-6.2, 53.3], [-6.19, 53.31]]] } },
    ],
  };
  const cells = buildCoastGrid(coast);
  assert.ok(cells.size >= 2);
});

test("nearCoast is true on/adjacent to a coast vertex, false far inland", () => {
  const coast = { features: [{ geometry: { type: "LineString", coordinates: [[-9.5, 51.5], [-9.49, 51.51]] } }] };
  const cells = buildCoastGrid(coast);
  assert.equal(nearCoast(51.5, -9.5, cells), true); // exactly on a coast vertex
  assert.equal(nearCoast(51.505, -9.495, cells), true); // within the same/neighbour cell
  assert.equal(nearCoast(53.35, -6.26, cells), false); // Dublin — far from this West Cork coast
});
