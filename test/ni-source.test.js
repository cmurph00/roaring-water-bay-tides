import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const niPath = fileURLToPath(new URL("../data/ni/bangor.json", import.meta.url));

test("data/ni/bangor.json is a valid TICON-shaped harmonic station", { skip: existsSync(niPath) ? false : "bangor.json not derived yet" }, () => {
  const s = JSON.parse(readFileSync(niPath, "utf8"));
  assert.equal(s.source, "ni");
  assert.equal(s.timezone, "Europe/London");
  assert.ok(!Array.isArray(s.tides), "must be harmonic (no precomputed tides array)");
  assert.ok(Array.isArray(s.harmonic_constituents) && s.harmonic_constituents.length >= 20);
  for (const c of s.harmonic_constituents) {
    assert.equal(typeof c.name, "string");
    assert.ok(Number.isFinite(c.amplitude) && Number.isFinite(c.phase));
  }
  const m2 = s.harmonic_constituents.find((c) => c.name === "M2");
  assert.ok(m2 && m2.amplitude > 0.3, "M2 amplitude should be the dominant metre-scale constituent");
});
