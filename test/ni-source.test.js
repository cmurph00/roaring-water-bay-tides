import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStationIndexes, mapMarkerSources } from "../src/ui.js";

const bangor = { id: "bangor", name: "Bangor", country: "United Kingdom", latitude: 54.665, longitude: -5.669, source: "ni" };
const portrush = { id: "ticon/portrush-pru-gbr-bodc", name: "Portrush", country: "United Kingdom", latitude: 55.2068, longitude: -6.6568 };
const portpatrick = { id: "ticon/portpatrick", name: "Portpatrick", country: "United Kingdom", latitude: 54.843, longitude: -5.120 };
const cork = { id: "ticon/cork", name: "Cork", country: "Ireland", latitude: 51.85, longitude: -8.30 };

test("mergeStationIndexes keeps ni stations (4th arg), no RoI overlap", () => {
  const merged = mergeStationIndexes([portrush, portpatrick, cork], [], [], [bangor]);
  assert.ok(merged.some((s) => s.id === "bangor" && s.source === "ni"));
  assert.equal(merged.filter((s) => s.id === "bangor").length, 1);
});

test("mapMarkerSources plots NI gauges (Portrush + Bangor) but not GB gauges", () => {
  const index = mergeStationIndexes([portrush, portpatrick, cork], [], [], [bangor]);
  const { gauges } = mapMarkerSources(index);
  const names = gauges.map((g) => g.name);
  assert.ok(names.includes("Portrush"), "Portrush (NI, UK country) should be a marker");
  assert.ok(names.includes("Bangor"), "Bangor (ni source) should be a marker");
  assert.ok(names.includes("Cork"), "RoI gauge should still be a marker");
  assert.ok(!names.includes("Portpatrick"), "Scottish gauge must NOT be a marker");
});
