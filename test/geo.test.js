import { test } from "node:test";
import assert from "node:assert/strict";
import { project, computeViewBox } from "../src/geo.js";

const viewBox = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.9, width: 300, height: 400 };

test("project maps the bottom-left corner (minLat, minLon) to (0, height) — south is at the bottom", () => {
  const { x, y } = project(51.2, -10.7, viewBox);
  assert.equal(x, 0);
  assert.equal(y, 400);
});

test("project maps the top-left corner (maxLat, minLon) to (0, 0) — north is at the top", () => {
  const { x, y } = project(55.5, -10.7, viewBox);
  assert.equal(x, 0);
  assert.equal(y, 0);
});

test("project maps the bottom-right corner (minLat, maxLon) to (width, height)", () => {
  const { x, y } = project(51.2, -5.9, viewBox);
  assert.equal(x, 300);
  assert.equal(y, 400);
});

test("project maps the top-right corner (maxLat, maxLon) to (width, 0)", () => {
  const { x, y } = project(55.5, -5.9, viewBox);
  assert.equal(x, 300);
  assert.equal(y, 0);
});

test("project maps the bbox centre to the viewBox centre", () => {
  const midLat = (51.2 + 55.5) / 2;
  const midLon = (-10.7 + -5.9) / 2;
  const { x, y } = project(midLat, midLon, viewBox);
  assert.ok(Math.abs(x - 150) < 1e-9);
  assert.ok(Math.abs(y - 200) < 1e-9);
});

test("project: a higher latitude always yields a smaller (or equal) y than a lower latitude", () => {
  const north = project(55.0, -8, viewBox);
  const south = project(51.5, -8, viewBox);
  assert.ok(north.y < south.y);
});

test("computeViewBox returns the same bbox fields plus width/height", () => {
  const bbox = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.9 };
  const vb = computeViewBox(bbox, 300);
  assert.equal(vb.minLat, bbox.minLat);
  assert.equal(vb.maxLat, bbox.maxLat);
  assert.equal(vb.minLon, bbox.minLon);
  assert.equal(vb.maxLon, bbox.maxLon);
  assert.equal(vb.width, 300);
  assert.ok(vb.height > 0);
});

test("computeViewBox makes Ireland's tall, narrow bbox taller than it is wide", () => {
  // Ireland: ~4.3 degrees of latitude, ~4.8 degrees of longitude, at ~53.5N — the cos(lat)
  // correction should make height clearly exceed width for a bbox this shape.
  const bbox = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.9 };
  const vb = computeViewBox(bbox, 300);
  assert.ok(vb.height > vb.width, `expected height (${vb.height}) > width (${vb.width})`);
});

test("computeViewBox degenerates gracefully to targetWidth when latSpan is 0", () => {
  const bbox = { minLat: 51.5, maxLat: 51.5, minLon: -10, maxLon: -5 };
  const vb = computeViewBox(bbox, 300);
  assert.equal(vb.height, 300);
});

test("project + computeViewBox: a point at the exact NE corner of the bbox lands at the top-right pixel", () => {
  const bbox = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.9 };
  const vb = computeViewBox(bbox, 300);
  const { x, y } = project(55.5, -5.9, vb);
  assert.ok(Math.abs(x - vb.width) < 1e-9);
  assert.ok(Math.abs(y - 0) < 1e-9);
});
