import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getTides } from "../src/resolver.js";

const station = JSON.parse(
  await readFile(new URL("./fixtures/ringaskiddy.json", import.meta.url))
);

test("getTides returns well-formed high/low extremes for a day", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const tides = await getTides(station, { start, end });

  assert.ok(tides.length >= 3, "expected multiple extremes in a day");
  for (const t of tides) {
    assert.ok(t.type === "high" || t.type === "low");
    assert.ok(t.time instanceof Date);
    assert.equal(typeof t.height, "number");
  }
  // Ordered by time
  for (let i = 1; i < tides.length; i++) assert.ok(tides[i].time >= tides[i - 1].time);
});

// --- Optional API-refinement branch ---
// Node has no `navigator` global by default, so these tests stub `globalThis.navigator`
// and restore whatever was there before (undefined, typically) once done.

test("prefers apiConfig.fetchExtremes when online and it resolves a non-empty array", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const priorNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });

  const refined = [{ type: "high", time: new Date("2026-07-14T05:29:00Z"), height: 3.4 }];
  const apiConfig = { fetchExtremes: async () => refined };

  try {
    const tides = await getTides(station, { start, end }, apiConfig);
    assert.deepEqual(tides, refined);
  } finally {
    Object.defineProperty(globalThis, "navigator", priorNavigatorDescriptor);
  }
});

test("falls back silently to offline prediction when fetchExtremes rejects", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const priorNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const priorWarn = console.warn;
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  console.warn = () => {}; // expected console.warn from resolver.js on fallback; silence for clean output

  const apiConfig = {
    fetchExtremes: async () => {
      throw new Error("boom");
    },
  };

  try {
    const tides = await getTides(station, { start, end }, apiConfig);
    assert.ok(tides.length >= 3, "expected offline extremes as fallback");
    for (const t of tides) {
      assert.ok(t.type === "high" || t.type === "low");
      assert.ok(t.time instanceof Date);
      assert.equal(typeof t.height, "number");
    }
  } finally {
    Object.defineProperty(globalThis, "navigator", priorNavigatorDescriptor);
    console.warn = priorWarn;
  }
});

test("falls back silently to offline prediction when fetchExtremes resolves an empty array", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const priorNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });

  const apiConfig = { fetchExtremes: async () => [] };

  try {
    const tides = await getTides(station, { start, end }, apiConfig);
    assert.ok(tides.length >= 3, "expected offline extremes as fallback");
    for (const t of tides) {
      assert.ok(t.type === "high" || t.type === "low");
      assert.ok(t.time instanceof Date);
      assert.equal(typeof t.height, "number");
    }
  } finally {
    Object.defineProperty(globalThis, "navigator", priorNavigatorDescriptor);
  }
});

// --- Marine Institute (precomputed) branch ---
// An MI station carries a flat `tides: [[epochMs, height, "high"|"low"], ...]` array
// instead of harmonic constituents; getTides must slice that array rather than invoke
// the harmonic engine, and must do so even when an apiConfig is supplied.

test("getTides slices a Marine Institute station's precomputed tides array to the range", async () => {
  const miStation = {
    id: "Union_Hall",
    country: "Ireland",
    timezone: "Europe/Dublin",
    chart_datum: "OD Malin",
    tides: [
      [Date.UTC(2026, 6, 14, 4, 30), 1.305, "high"],
      [Date.UTC(2026, 6, 14, 10, 55), -1.639, "low"],
      [Date.UTC(2026, 6, 14, 16, 55), 1.444, "high"],
      [Date.UTC(2026, 6, 15, 0, 0), 2.0, "high"], // outside range, must be excluded
    ],
  };
  const start = new Date(Date.UTC(2026, 6, 14, 0, 0));
  const end = new Date(Date.UTC(2026, 6, 14, 23, 59));

  const tides = await getTides(miStation, { start, end });

  assert.deepEqual(
    tides.map((t) => [t.time.getTime(), t.height, t.type]),
    [
      [Date.UTC(2026, 6, 14, 4, 30), 1.305, "high"],
      [Date.UTC(2026, 6, 14, 10, 55), -1.639, "low"],
      [Date.UTC(2026, 6, 14, 16, 55), 1.444, "high"],
    ]
  );
});

test("getTides returns [] for a Marine Institute station when the range has no entries", async () => {
  const miStation = { tides: [[Date.UTC(2026, 6, 14, 4, 30), 1.305, "high"]] };
  const start = new Date(Date.UTC(2030, 0, 1));
  const end = new Date(Date.UTC(2030, 0, 2));

  assert.deepEqual(await getTides(miStation, { start, end }), []);
});

test("getTides never invokes apiConfig.fetchExtremes for a Marine Institute station", async () => {
  const miStation = { tides: [[Date.UTC(2026, 6, 14, 4, 30), 1.305, "high"]] };
  const start = new Date(Date.UTC(2026, 6, 14, 0, 0));
  const end = new Date(Date.UTC(2026, 6, 14, 23, 59));
  const priorNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });

  let called = false;
  const apiConfig = {
    fetchExtremes: async () => {
      called = true;
      return [];
    },
  };

  try {
    const tides = await getTides(miStation, { start, end }, apiConfig);
    assert.equal(called, false, "fetchExtremes must not be invoked for a precomputed MI station");
    assert.equal(tides.length, 1);
  } finally {
    Object.defineProperty(globalThis, "navigator", priorNavigatorDescriptor);
  }
});

test("uses offline prediction when navigator.onLine is false, even with apiConfig present", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const priorNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });

  let called = false;
  const apiConfig = {
    fetchExtremes: async () => {
      called = true;
      throw new Error("should not be called while offline");
    },
  };

  try {
    const tides = await getTides(station, { start, end }, apiConfig);
    assert.equal(called, false, "fetchExtremes must not be invoked when navigator.onLine is false");
    assert.ok(tides.length >= 3, "expected offline extremes");
    for (const t of tides) {
      assert.ok(t.type === "high" || t.type === "low");
      assert.ok(t.time instanceof Date);
      assert.equal(typeof t.height, "number");
    }
  } finally {
    Object.defineProperty(globalThis, "navigator", priorNavigatorDescriptor);
  }
});
