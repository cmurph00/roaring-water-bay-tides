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
