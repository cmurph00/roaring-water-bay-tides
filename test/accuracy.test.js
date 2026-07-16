import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mergeStationIndexes } from "../src/ui.js";
import { resolveSpot } from "../src/resolve-spot.js";
import { getTides } from "../src/resolver.js";

// Accuracy regression test (Task 22). Validates the app's END-TO-END high-water prediction —
// spot -> resolveSpot (incl. per-spot overrides) -> getTides -> evening HW — against real reference
// tide times in test/fixtures/reference-tides.json. Those reference values are UKHO/Admiralty-derived
// (Crown Copyright) and gitignored, so this test SKIPS cleanly when the fixture is absent (e.g. CI /
// a fresh clone). Thresholds guard against a regression in source selection, not perfection: weather
// moves tide height more than these few minutes, and the offshore-model floor is ~10min in places.
const MEDIAN_MAX_MIN = 6;
const WORST_MAX_MIN = 10;

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/reference-tides.json", import.meta.url));
const rd = (p) => JSON.parse(readFileSync(dataDir + p, "utf8"));

const tzDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
const tzHour = (d) => Number(d.toLocaleString("en-GB", { timeZone: "Europe/Dublin", hour: "2-digit", hour12: false }).slice(0, 2));
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (d) => d.toLocaleTimeString("en-IE", { timeZone: "Europe/Dublin", hour: "2-digit", minute: "2-digit", hour12: false });

// Load the resolved index entry's full prediction input: MI/EPA carry a `tides` array; TICON is a
// harmonic station object (data/stations/<id>.json) the engine runs. Mirrors ui.js loadStation.
function loadFull(station) {
  if (station.source === "epa") return { ...station, tides: rd(`epa/${station.id}.json`).tides };
  if (station.source === "mi") return { ...station, tides: rd(`mi/${station.id}.json`).tides };
  return rd(`stations/${station.id.replace(/\//g, "_")}.json`);
}

const hasFixture = existsSync(fixturePath);

test("HW prediction accuracy vs reference tide times", { skip: hasFixture ? false : "reference-tides.json not present (gitignored — Crown Copyright)" }, async () => {
  const ref = JSON.parse(readFileSync(fixturePath, "utf8"));
  const index = mergeStationIndexes(rd("stations.json"), rd("mi-stations.json"), rd("epa-stations.json"));
  const overrides = existsSync(dataDir + "spot-overrides.json") ? rd("spot-overrides.json") : [];

  const start = new Date(`${ref.date}T00:00:00Z`);
  const end = new Date(start.getTime() + 30 * 3600 * 1000);
  const errors = [];
  const rows = [];

  // RoI points use the shared ref.date; NI points carry their own `date` and are validated
  // in ni-accuracy.test.js instead — skip them here.
  for (const p of ref.points.filter((q) => !q.date)) {
    const resolved = resolveSpot(p.lat, p.lon, index, overrides);
    assert.ok(resolved, `no station resolved for ${p.spot}`);
    const extremes = await getTides(loadFull(resolved.station), { start, end });
    const eveningHigh = extremes.find((t) => t.type === "high" && tzDay(t.time) === ref.date && tzHour(t.time) >= 12);
    assert.ok(eveningHigh, `no evening HW predicted for ${p.spot} (via ${resolved.station.name})`);
    const err = toMin(hhmm(eveningHigh.time)) - toMin(p.hw[p.hw.length - 1]);
    errors.push(Math.abs(err));
    rows.push(`${p.spot.padEnd(20)} truth ${p.hw[p.hw.length - 1]} pred ${hhmm(eveningHigh.time)} Δ${err >= 0 ? "+" : ""}${err}  via ${resolved.station.name}${resolved.overridden ? " [override]" : ""}`);
  }

  const sorted = errors.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const worst = Math.max(...errors);
  console.log(`\nHW accuracy (${errors.length} spots): median ${median} min, worst ${worst} min\n` + rows.join("\n"));

  assert.ok(median <= MEDIAN_MAX_MIN, `median HW error ${median} min exceeds ${MEDIAN_MAX_MIN} min`);
  assert.ok(worst <= WORST_MAX_MIN, `worst HW error ${worst} min exceeds ${WORST_MAX_MIN} min`);
});
