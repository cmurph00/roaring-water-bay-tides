import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mergeStationIndexes } from "../src/ui.js";
import { resolveSpot } from "../src/resolve-spot.js";
import { getTides } from "../src/resolver.js";

// NI HW-accuracy regression (Task 29). Same gitignored-fixture + never-shipped contract as
// accuracy.test.js. NI-only thresholds: Bangor is a freshly utide-derived gauge and some
// south-Down spots resolve to a distant gauge, so bounds are looser than the RoI test.
const MEDIAN_MAX_MIN = 12;
const WORST_MAX_MIN = 25;
const NI_SPOTS = new Set(["Bangor", "Belfast", "Portrush", "Portstewart", "Ballyholme", "Benone", "Newcastle"]);

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/reference-tides.json", import.meta.url));
const rd = (p) => JSON.parse(readFileSync(dataDir + p, "utf8"));
const tzDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const tzHour = (d) => Number(d.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).slice(0, 2));
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (d) => d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });

const rdOrEmpty = (p) => (existsSync(dataDir + p) ? rd(p) : []);
function loadFull(station) {
  if (station.source === "epa") return { ...station, tides: rd(`epa/${station.id}.json`).tides };
  if (station.source === "mi") return { ...station, tides: rd(`mi/${station.id}.json`).tides };
  if (station.source === "ni") return rd(`ni/${station.id.replace(/\//g, "_")}.json`);
  return rd(`stations/${station.id.replace(/\//g, "_")}.json`);
}

const hasFixture = existsSync(fixturePath);
test("NI HW prediction accuracy vs reference", { skip: hasFixture ? false : "reference-tides.json not present (gitignored)" }, async () => {
  const ref = JSON.parse(readFileSync(fixturePath, "utf8"));
  const niPoints = ref.points.filter((p) => NI_SPOTS.has(p.spot));
  if (niPoints.length === 0) return; // no NI points added yet — nothing to assert

  const index = mergeStationIndexes(rd("stations.json"), rd("mi-stations.json"), rdOrEmpty("epa-stations.json"), rdOrEmpty("ni-stations.json"));
  const overrides = rdOrEmpty("spot-overrides.json");
  const errors = [];
  const rows = [];

  for (const p of niPoints) {
    const date = p.date ?? ref.date; // NI points carry their own date; fall back to the shared one
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(start.getTime() + 30 * 3600 * 1000);
    const resolved = resolveSpot(p.lat, p.lon, index, overrides);
    assert.ok(resolved, `no station resolved for ${p.spot}`);
    const extremes = await getTides(loadFull(resolved.station), { start, end });
    const eveningHigh = extremes.find((t) => t.type === "high" && tzDay(t.time) === date && tzHour(t.time) >= 12);
    assert.ok(eveningHigh, `no evening HW predicted for ${p.spot} on ${date} (via ${resolved.station.name})`);
    const err = toMin(hhmm(eveningHigh.time)) - toMin(p.hw[p.hw.length - 1]);
    errors.push(Math.abs(err));
    rows.push(`${p.spot.padEnd(14)} ${date} truth ${p.hw[p.hw.length - 1]} pred ${hhmm(eveningHigh.time)} Δ${err >= 0 ? "+" : ""}${err}  via ${resolved.station.name}`);
  }
  const sorted = errors.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const worst = Math.max(...errors);
  console.log(`\nNI HW accuracy (${errors.length} spots): median ${median} min, worst ${worst} min\n` + rows.join("\n"));
  assert.ok(median <= MEDIAN_MAX_MIN, `NI median HW error ${median} exceeds ${MEDIAN_MAX_MIN} min`);
  assert.ok(worst <= WORST_MAX_MIN, `NI worst HW error ${worst} exceeds ${WORST_MAX_MIN} min`);
});
