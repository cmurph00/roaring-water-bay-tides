import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStationIndexes } from "../src/ui.js";

// mergeStationIndexes(ticon, mi): Marine Institute (offline, real published predictions)
// is preferred over the general TICON/NOAA harmonic dataset for Irish stations. Keep every
// MI entry, plus every TICON entry that is NOT within 3 km of any MI entry.

test("mergeStationIndexes keeps all MI entries", () => {
  const ticon = [];
  const mi = [
    { id: "Union_Hall", name: "Union Hall", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin", source: "mi" },
  ];
  const merged = mergeStationIndexes(ticon, mi);
  assert.deepEqual(merged, mi);
});

test("mergeStationIndexes drops a TICON entry within 3km of an MI entry", () => {
  const mi = [{ id: "mi-a", name: "MI A", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin", source: "mi" }];
  const ticon = [
    // ~0km from mi-a — a near-duplicate of the same physical gauge
    { id: "ticon/union-hall-harbor", name: "Union Hall Harbor", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin" },
  ];
  const merged = mergeStationIndexes(ticon, mi);
  assert.deepEqual(merged, mi);
});

test("mergeStationIndexes keeps a TICON entry more than 3km from every MI entry", () => {
  const mi = [{ id: "mi-a", name: "MI A", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin", source: "mi" }];
  const ticon = [
    // Cork city — well over 3km from mi-a (Union Hall, west Cork)
    { id: "ticon/cork", name: "Cork", country: "Ireland", latitude: 51.9, longitude: -8.47, timezone: "Europe/Dublin" },
  ];
  const merged = mergeStationIndexes(ticon, mi);
  assert.deepEqual(merged, [...mi, ...ticon]);
});

test("mergeStationIndexes preserves non-Irish TICON entries untouched (no MI stations nearby)", () => {
  const mi = [{ id: "mi-a", name: "MI A", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin", source: "mi" }];
  const ticon = [
    { id: "ticon/dover", name: "Dover", country: "United Kingdom", latitude: 51.1, longitude: 1.3, timezone: "Europe/London" },
  ];
  const merged = mergeStationIndexes(ticon, mi);
  assert.deepEqual(merged, [...mi, ...ticon]);
});

// mergeStationIndexes(ticon, mi, epa): EPA West Cork model nodes are the most local
// prediction available where they exist (Task 18) — preference order is EPA > MI > TICON.

test("mergeStationIndexes keeps all EPA entries and drops an MI entry within 3km of one", () => {
  const epa = [{ id: "epa-a", name: "Baltimore", country: "Ireland", latitude: 51.4795, longitude: -9.3821, timezone: "Europe/Dublin", source: "epa" }];
  const mi = [
    // ~0km from epa-a — a near-duplicate of the same physical location
    { id: "mi-castletownbere", name: "Castletownbere", country: "Ireland", latitude: 51.4795, longitude: -9.3821, timezone: "Europe/Dublin", source: "mi" },
  ];
  const merged = mergeStationIndexes([], mi, epa);
  assert.deepEqual(merged, epa);
});

test("mergeStationIndexes keeps an MI entry more than 3km from every EPA entry", () => {
  const epa = [{ id: "epa-a", name: "Baltimore", country: "Ireland", latitude: 51.4795, longitude: -9.3821, timezone: "Europe/Dublin", source: "epa" }];
  const mi = [
    // Castletownbere — well over 3km from epa-a
    { id: "mi-castletownbere", name: "Castletownbere", country: "Ireland", latitude: 51.6496, longitude: -9.9034, timezone: "Europe/Dublin", source: "mi" },
  ];
  const merged = mergeStationIndexes([], mi, epa);
  assert.deepEqual(merged, [...epa, ...mi]);
});

test("mergeStationIndexes also drops a TICON entry within 3km of an EPA entry", () => {
  const epa = [{ id: "epa-a", name: "Baltimore", country: "Ireland", latitude: 51.4795, longitude: -9.3821, timezone: "Europe/Dublin", source: "epa" }];
  const ticon = [
    { id: "ticon/baltimore", name: "Baltimore Harbour", country: "Ireland", latitude: 51.4795, longitude: -9.3821, timezone: "Europe/Dublin" },
  ];
  const merged = mergeStationIndexes(ticon, [], epa);
  assert.deepEqual(merged, epa);
});

test("mergeStationIndexes defaults epa to [] and behaves exactly as the 2-arg form", () => {
  const mi = [{ id: "mi-a", name: "MI A", country: "Ireland", latitude: 51.559, longitude: -9.1335, timezone: "Europe/Dublin", source: "mi" }];
  const ticon = [{ id: "ticon/cork", name: "Cork", country: "Ireland", latitude: 51.9, longitude: -8.47, timezone: "Europe/Dublin" }];
  assert.deepEqual(mergeStationIndexes(ticon, mi), mergeStationIndexes(ticon, mi, []));
});
