# Global Tide Predictor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-location app into an offline-first, global tide predictor (installable PWA) that predicts from the nearest real tide-gauge station, with no non-commercial data bundled.

**Architecture:** Static site, no deploy-time build. The MIT harmonic engine stays inlined as an ES module. A dev-only Node build script generates a region-filtered, NC-free station dataset from `@neaps/tide-database`. The browser loads the dataset as same-origin static JSON (service-worker cached for offline), picks the nearest gauge (or one you search for), and runs the engine on-device. Browser-only APIs (geolocation) are isolated in one unit so a later Capacitor wrap needs no rework.

**Tech Stack:** Vanilla ES modules (no framework), `@neaps/tide-predictor` (inlined, MIT), `@neaps/tide-database` (dev-dependency, data source), `node:test` + `node:assert` for tests (zero runtime deps).

## Global Constraints

- **Zero runtime dependencies.** The deployed app is static files only; `@neaps/tide-database` is a **devDependency** used solely by the build script.
- **Offline is an invariant.** The app must fully function with no network. Station data is bundled as static assets and fetched only from same origin; never from a remote server.
- **No non-commercial data ships.** The build script MUST exclude any station whose `license` indicates non-commercial use (`license.commercial_use === false`, or a `type` matching `/-nc-|noncommercial/i`). A test enforces this.
- **Attribution required.** Every data source present in `data/` must be listed in root `DATA-SOURCES.md` (auto-generated) and surfaced in an in-app credits line.
- **Region scope (initial):** European stations only (`continent === "Europe"`), covering IE/UK/EU. Expandable by changing one constant in the build script.
- **File naming:** kebab-case for all files.
- **Timezone:** predict in UTC internally; display in each **station's own** `timezone` via `Intl`. Never hardcode `Europe/Dublin`/`+01:00`.
- **Test runner:** `node --test` (built-in). No test framework dependency.

## Shared Interfaces (defined once, referenced by tasks)

**Station object** (shape of each `data/stations/<id>.json`, subset in `data/stations.json`):
```
{ id, name, country, latitude, longitude, timezone,
  chart_datum, datums: {…}, harmonic_constituents: [{name, amplitude, phase}], license }
```
`data/stations.json` is an array of the lightweight subset: `{ id, name, country, latitude, longitude, timezone }`.

**Module interfaces:**
- `src/engine.js` → `useStation(station)` returns a predictor with
  `getExtremesPrediction({start: Date, end: Date}) → { extremes: [{ time, high: boolean, level: number }] }`.
- `src/location.js` → `haversineKm({lat,lon},{lat,lon}) → number`; `nearestStation(lat, lon, stations) → { station, distanceKm }`; `searchStations(query, stations) → Station[]`; `detectLocation() → Promise<{lat, lon}>`.
- `src/resolver.js` → `getTides(station, { start: Date, end: Date }) → Promise<[{ type: "high"|"low", time: Date, height: number }]>`.
- `src/correction.js` → `applyCorrection(tides, correction) → tides`, where `correction = { timeOffsetMin: { high: number, low: number } }` (null/undefined ⇒ passthrough).
- `src/format.js` → `fmtTime(date, timezone) → string`; `fmtDistance(km) → string`.

---

## Task 1: Project scaffolding + headless engine extraction

**Files:**
- Create: `package.json`
- Create: `src/engine.js` (the inlined engine, extracted verbatim from `index.html`)
- Create: `test/fixtures/ringaskiddy.json` (test-only station fixture; NOT shipped in `data/`)
- Test: `test/engine.test.js`

**Interfaces:**
- Produces: `useStation(station)` (see Shared Interfaces).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "roaring-water-bay-tides",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "build:data": "node scripts/build-data.mjs"
  },
  "devDependencies": {
    "@neaps/tide-database": "^1.0.0"
  }
}
```

- [ ] **Step 2: Extract the engine into `src/engine.js`**

Copy the entire block between `/* ---- Inlined @neaps/tide-predictor engine ---- */` and `/* ---- End inlined engine ---- */` from `index.html` (lines 159–6685) into `src/engine.js`. It already ends with `export { … useStation … }`, so it is a valid ES module unchanged. Do not modify the engine code.

- [ ] **Step 3: Create the test fixture** `test/fixtures/ringaskiddy.json`

Copy the `RINGASKIDDY_STATION` object literal (the value assigned at `index.html:6688`) into this file as raw JSON. This is a deterministic engine-correctness anchor only; Ringaskiddy is CC-BY-NC and is excluded from shipped data by the build script (Task 2).

- [ ] **Step 4: Write the failing test** `test/engine.test.js`

The values below are the raw extremes measured on 2026-07-14 (see spec footnote / regression fixture #1). External ground truth: Baltimore HW 05:29 & 17:58 IST — the ~12 min gap to these raw Ringaskiddy times is the documented proxy offset the redesign removes.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { useStation } from "../src/engine.js";

const station = JSON.parse(
  await readFile(new URL("./fixtures/ringaskiddy.json", import.meta.url))
);

test("engine reproduces known Ringaskiddy extremes for 2026-07-14", () => {
  const predictor = useStation(station);
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const { extremes } = predictor.getExtremesPrediction({ start, end });

  const highs = extremes
    .filter((e) => e.high)
    .map((e) => new Date(e.time))
    .filter((d) => d >= start && d <= end)
    .sort((a, b) => a - b);

  // Morning high ~05:46 IST, ~4.02 m; evening high ~18:13 IST, ~4.23 m
  const fmt = (d) =>
    d.toLocaleTimeString("en-IE", { timeZone: "Europe/Dublin", hour: "2-digit", minute: "2-digit", hour12: false });

  assert.equal(highs.length, 2, "expected two daytime highs");
  assert.equal(fmt(highs[0]), "05:46");
  assert.equal(fmt(highs[1]), "18:13");
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — `Cannot find module '../src/engine.js'` (until Step 2 file is in place). If Step 2 done, this passes immediately (the engine is proven); if times differ, the engine copy is corrupted.

- [ ] **Step 6: Verify pass**

Run: `node --test test/engine.test.js`
Expected: PASS (2 highs at 05:46 and 18:13).

- [ ] **Step 7: Commit**

```bash
git add package.json src/engine.js test/engine.test.js test/fixtures/ringaskiddy.json
git commit -m "feat: extract headless harmonic engine + regression anchor test"
```

---

## Task 2: Region + NC-filtered data build script

**Files:**
- Create: `scripts/build-data.mjs`
- Create (generated, committed): `data/stations.json`, `data/stations/<id>.json`, `DATA-SOURCES.md`
- Test: `test/build-data.test.js`

**Interfaces:**
- Produces: the `data/` dataset consumed by Tasks 3–6. Exports pure helpers `isCommercialSafe(license)` and `inRegion(station)` for testing.

- [ ] **Step 1: Write the failing test** `test/build-data.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialSafe, inRegion } from "../scripts/build-data.mjs";

test("isCommercialSafe rejects non-commercial licenses", () => {
  assert.equal(isCommercialSafe({ type: "cc-by-nc-4.0", commercial_use: false }), false);
  assert.equal(isCommercialSafe({ type: "cc-by-4.0", commercial_use: true }), true);
  assert.equal(isCommercialSafe("cc-by-nc-4.0"), false);
  assert.equal(isCommercialSafe("public-domain"), true);
  assert.equal(isCommercialSafe(undefined), true); // NOAA public-domain often omits license
});

test("inRegion keeps only European stations", () => {
  assert.equal(inRegion({ continent: "Europe" }), true);
  assert.equal(inRegion({ continent: "North America" }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/build-data.test.js`
Expected: FAIL — `Cannot find module '../scripts/build-data.mjs'`.

- [ ] **Step 3: Write `scripts/build-data.mjs`**

```js
import { stations as allStations } from "@neaps/tide-database";
import { mkdir, writeFile, rm } from "node:fs/promises";

const REGION_CONTINENT = "Europe"; // change to expand coverage

export function isCommercialSafe(license) {
  if (license == null) return true; // e.g. NOAA public domain
  const type = typeof license === "string" ? license : license.type ?? "";
  if (typeof license === "object" && license.commercial_use === false) return false;
  return !/-nc-|noncommercial/i.test(type);
}

export function inRegion(station) {
  return station.continent === REGION_CONTINENT;
}

function toIndexEntry(s) {
  return { id: s.id, name: s.name, country: s.country, latitude: s.latitude, longitude: s.longitude, timezone: s.timezone };
}

async function build() {
  const kept = allStations()
    .filter(inRegion)
    .filter((s) => isCommercialSafe(s.license))
    .filter((s) => Array.isArray(s.harmonic_constituents) && s.harmonic_constituents.length > 0);

  await rm("data", { recursive: true, force: true });
  await mkdir("data/stations", { recursive: true });

  await writeFile("data/stations.json", JSON.stringify(kept.map(toIndexEntry)));
  for (const s of kept) {
    await writeFile(`data/stations/${s.id.replace(/\//g, "_")}.json`, JSON.stringify(s));
  }

  const sources = new Set(kept.map((s) => (typeof s.license === "string" ? s.license : s.license?.type ?? "public-domain")));
  const attribution =
    `# Data Sources\n\n` +
    `Tide station harmonic constituents used in this app:\n\n` +
    `- **NOAA** (US, public domain)\n` +
    `- **TICON-4** (global tide gauges, CC-BY-4.0) — Lefèvre F., Carre H., Faucher C. (2025), SEANOE, https://doi.org/10.17882/109129\n\n` +
    `Stations bundled: ${kept.length} (European, commercial-use-safe only).\n` +
    `Licenses present: ${[...sources].join(", ")}.\n`;
  await writeFile("DATA-SOURCES.md", attribution);

  console.log(`Wrote ${kept.length} stations to data/`);
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `node --test test/build-data.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Install the data dependency and run the build**

```bash
npm install
npm run build:data
```
Expected: `Wrote <N> stations to data/` where N is a few hundred. Confirm `data/stations.json` exists, `data/stations/` is populated, and `DATA-SOURCES.md` was written. **Verify no station file has `commercial_use: false`:**
```bash
grep -rl '"commercial_use":false' data/ || echo "OK: no NC stations"
```
Expected: `OK: no NC stations`.

- [ ] **Step 6: Sanity-check the dataset size (offline-invariant guard)**

Run: `du -sh data/`
Expected: comfortably small (target < 5 MB). If larger, narrow `REGION_CONTINENT` handling to a country allow-list (e.g. `["Ireland","United Kingdom","France",…]`) — do NOT switch to network fetch.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-data.mjs test/build-data.test.js data/ DATA-SOURCES.md package-lock.json
git commit -m "feat: NC-filtered European tide-station data build"
```

---

## Task 3: Location — nearest gauge, search, geolocation

**Files:**
- Create: `src/location.js`
- Test: `test/location.test.js`

**Interfaces:**
- Consumes: `data/stations.json` (array of index entries).
- Produces: `haversineKm`, `nearestStation`, `searchStations`, `detectLocation` (see Shared Interfaces).

- [ ] **Step 1: Write the failing test** `test/location.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, nearestStation, searchStations } from "../src/location.js";

const stations = [
  { id: "a", name: "Cork", country: "Ireland", latitude: 51.9, longitude: -8.3, timezone: "Europe/Dublin" },
  { id: "b", name: "Dover", country: "United Kingdom", latitude: 51.1, longitude: 1.3, timezone: "Europe/London" },
];

test("haversineKm computes a known distance", () => {
  const d = haversineKm({ lat: 51.9, lon: -8.3 }, { lat: 51.1, lon: 1.3 });
  assert.ok(d > 600 && d < 720, `expected ~660 km, got ${d}`);
});

test("nearestStation picks the closest gauge", () => {
  const { station, distanceKm } = nearestStation(51.5, -8.5, stations);
  assert.equal(station.id, "a");
  assert.ok(distanceKm < 60);
});

test("searchStations matches by name, case-insensitive", () => {
  assert.deepEqual(searchStations("dov", stations).map((s) => s.id), ["b"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/location.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/location.js`**

```js
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestStation(lat, lon, stations) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineKm({ lat, lon }, { lat: s.latitude, lon: s.longitude });
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best ? { station: best, distanceKm: bestDist } : null;
}

export function searchStations(query, stations) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return stations.filter(
    (s) => s.name.toLowerCase().includes(q) || (s.country ?? "").toLowerCase().includes(q)
  );
}

// Browser-only. Isolated here so the Phase 2 Capacitor wrap swaps only this function.
export function detectLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/location.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/location.js test/location.test.js
git commit -m "feat: nearest-gauge lookup, search, and isolated geolocation"
```

---

## Task 4: Resolver — offline prediction + optional API refinement

**Files:**
- Create: `src/resolver.js`
- Test: `test/resolver.test.js`

**Interfaces:**
- Consumes: `useStation` (Task 1); a Station object (full, with `harmonic_constituents`).
- Produces: `getTides(station, { start, end }) → Promise<[{type, time, height}]>`.

- [ ] **Step 1: Write the failing test** `test/resolver.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/resolver.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/resolver.js`**

```js
import { useStation } from "./engine.js";

// Offline harmonic prediction. Heights are the engine's water levels (station's chart datum).
function offlineTides(station, { start, end }) {
  const predictor = useStation(station);
  const pad = 12 * 3600 * 1000;
  const { extremes } = predictor.getExtremesPrediction({
    start: new Date(start.getTime() - pad),
    end: new Date(end.getTime() + pad),
  });
  return extremes
    .map((e) => ({ type: e.high ? "high" : "low", time: new Date(e.time), height: e.level }))
    .filter((t) => t.time >= start && t.time <= end)
    .sort((a, b) => a.time - b.time);
}

/**
 * Optional online refinement. `apiConfig` (from settings) = { fetchExtremes } — an injected
 * function returning the same shape. Any error falls back silently to offline.
 */
export async function getTides(station, range, apiConfig = null) {
  if (apiConfig && typeof apiConfig.fetchExtremes === "function" && globalThis.navigator?.onLine) {
    try {
      const refined = await apiConfig.fetchExtremes(station, range);
      if (Array.isArray(refined) && refined.length) return refined;
    } catch (err) {
      console.warn("Tide API refinement failed; using offline prediction.", err);
    }
  }
  return offlineTides(station, range);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/resolver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolver.js test/resolver.test.js
git commit -m "feat: offline tide resolver with optional API refinement"
```

---

## Task 5: Optional secondary-port correction

**Files:**
- Create: `src/correction.js`
- Test: `test/correction.test.js`

**Interfaces:**
- Consumes: tides array from `getTides`.
- Produces: `applyCorrection(tides, correction) → tides`.

- [ ] **Step 1: Write the failing test** `test/correction.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCorrection } from "../src/correction.js";

const base = [
  { type: "high", time: new Date("2026-07-14T05:46:00Z"), height: 4.0 },
  { type: "low", time: new Date("2026-07-14T12:26:00Z"), height: 0.6 },
];

test("null correction is a passthrough", () => {
  assert.deepEqual(applyCorrection(base, null), base);
});

test("time offsets shift highs and lows independently", () => {
  const out = applyCorrection(base, { timeOffsetMin: { high: -17, low: -27 } });
  assert.equal(out[0].time.toISOString(), "2026-07-14T05:29:00.000Z"); // -17 min
  assert.equal(out[1].time.toISOString(), "2026-07-14T11:59:00.000Z"); // -27 min
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/correction.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/correction.js`**

```js
/**
 * Opt-in secondary-port correction for a saved "home spot" whose nearest bundled gauge is distant.
 * correction = { timeOffsetMin: { high, low } }. Undefined/null ⇒ passthrough.
 * This is the explicit, local, correct version of the origin app's global offset hack.
 */
export function applyCorrection(tides, correction) {
  if (!correction || !correction.timeOffsetMin) return tides;
  const { high, low } = correction.timeOffsetMin;
  return tides.map((t) => {
    const offsetMin = t.type === "high" ? high : low;
    return { ...t, time: new Date(t.time.getTime() + offsetMin * 60000) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/correction.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/correction.js test/correction.test.js
git commit -m "feat: opt-in secondary-port correction"
```

---

## Task 6: Formatting helpers + UI wiring

**Files:**
- Create: `src/format.js`
- Create: `src/ui.js`
- Modify: `index.html` (replace the inlined `<script type="module">` app code with module imports; keep `<style>` and markup)
- Test: `test/format.test.js`

**Interfaces:**
- Consumes: `getTides`, `nearestStation`/`searchStations`/`detectLocation`, `applyCorrection`.
- Produces: `fmtTime(date, timezone)`, `fmtDistance(km)`.

- [ ] **Step 1: Write the failing test** `test/format.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtTime, fmtDistance } from "../src/format.js";

test("fmtTime renders in the station's timezone, 24h", () => {
  const d = new Date("2026-07-14T04:29:00Z"); // 05:29 IST
  assert.equal(fmtTime(d, "Europe/Dublin"), "05:29");
  assert.equal(fmtTime(d, "Europe/London"), "05:29");
  assert.equal(fmtTime(d, "Europe/Paris"), "06:29"); // proves tz is honoured, not hardcoded
});

test("fmtDistance rounds sensibly", () => {
  assert.equal(fmtDistance(3.4), "3 km");
  assert.equal(fmtDistance(34.6), "35 km");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/format.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/format.js`**

```js
export function fmtTime(date, timezone) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDistance(km) {
  return `${Math.round(km)} km`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/format.test.js`
Expected: PASS.

- [ ] **Step 5: Write `src/ui.js`** (DOM orchestration; no test — verified live in Task 8)

```js
import { nearestStation, searchStations, detectLocation } from "./location.js";
import { getTides } from "./resolver.js";
import { applyCorrection } from "./correction.js";
import { fmtTime, fmtDistance } from "./format.js";

const INDEX_URL = "./data/stations.json";
const stationUrl = (id) => `./data/stations/${id.replace(/\//g, "_")}.json`;
const LS_KEY = "rwb.selectedStationId";

let index = [];

async function loadIndex() {
  index = await fetch(INDEX_URL).then((r) => r.json());
}

async function loadStation(id) {
  return fetch(stationUrl(id)).then((r) => r.json());
}

async function showStation(entry, distanceKm) {
  localStorage.setItem(LS_KEY, entry.id);
  const station = await loadStation(entry.id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  let tides = await getTides(station, { start, end });
  tides = applyCorrection(tides, null); // home-spot correction wired later if configured
  renderHeader(entry, distanceKm, station);
  renderTides(tides, station.timezone);
}

function renderHeader(entry, distanceKm, station) {
  const el = document.getElementById("station-header");
  const dist = distanceKm != null ? ` · nearest gauge ${fmtDistance(distanceKm)} away` : "";
  el.textContent = `${entry.name}, ${entry.country}${dist} · heights vs ${station.chart_datum ?? "chart datum"}`;
}

function renderTides(tides, timezone) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  const table = document.createElement("table");
  for (const t of tides) {
    const row = document.createElement("tr");
    const isHigh = t.type === "high";
    row.innerHTML =
      `<td>${isHigh ? "▲ High" : "▼ Low"}</td>` +
      `<td class="time">${fmtTime(t.time, timezone)}</td>` +
      `<td class="height">${t.height.toFixed(2)} m</td>`;
    table.appendChild(row);
  }
  container.appendChild(table);
}

function wireSearch() {
  const input = document.getElementById("station-search");
  const list = document.getElementById("search-results");
  input.addEventListener("input", () => {
    const matches = searchStations(input.value, index).slice(0, 10);
    list.innerHTML = "";
    for (const m of matches) {
      const li = document.createElement("li");
      li.textContent = `${m.name}, ${m.country}`;
      li.addEventListener("click", () => showStation(m, null));
      list.appendChild(li);
    }
  });
}

async function useMyLocation() {
  try {
    const { lat, lon } = await detectLocation();
    const { station, distanceKm } = nearestStation(lat, lon, index);
    await showStation(station, distanceKm);
  } catch {
    // Denied/unavailable → leave last-used/default in place
  }
}

export async function init() {
  await loadIndex();
  wireSearch();
  document.getElementById("use-location").addEventListener("click", useMyLocation);

  const savedId = localStorage.getItem(LS_KEY);
  const saved = index.find((s) => s.id === savedId);
  if (saved) {
    await showStation(saved, null);
  } else {
    useMyLocation(); // first run: try geolocation
  }
}
```

- [ ] **Step 6: Rewire `index.html`**

Replace the entire inlined `<script type="module"> … </script>` (the engine + app code) with:
```html
<script type="module">
  import { init } from "./src/ui.js";
  init();
</script>
```
Keep the existing `<style>` block and page markup. Ensure the markup contains elements with ids: `station-header`, `results`, `station-search`, `search-results` (`<ul>`), and a button `use-location`. Add any missing ones, matching existing CSS classes.

- [ ] **Step 7: Commit**

```bash
git add src/format.js src/ui.js index.html test/format.test.js
git commit -m "feat: formatting helpers and modular UI wiring"
```

---

## Task 7: PWA — manifest + offline service worker

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `src/cache-manifest.js` (the list of assets to precache — testable)
- Modify: `index.html` (link manifest, register SW)
- Test: `test/cache-manifest.test.js`

**Interfaces:**
- Produces: `CACHE_ASSETS` (string[]) consumed by `sw.js`.

- [ ] **Step 1: Write the failing test** `test/cache-manifest.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CACHE_ASSETS } from "../src/cache-manifest.js";

test("app shell and data index are precached for offline", () => {
  assert.ok(CACHE_ASSETS.includes("./index.html"));
  assert.ok(CACHE_ASSETS.includes("./data/stations.json"));
  assert.ok(CACHE_ASSETS.some((a) => a.startsWith("./src/")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cache-manifest.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/cache-manifest.js`**

```js
// App-shell assets precached on install. Per-station JSON is cached at runtime on first view.
export const CACHE_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./data/stations.json",
  "./src/ui.js",
  "./src/engine.js",
  "./src/resolver.js",
  "./src/location.js",
  "./src/correction.js",
  "./src/format.js",
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cache-manifest.test.js`
Expected: PASS.

- [ ] **Step 5: Write `manifest.webmanifest`**

```json
{
  "name": "Tide Predictor",
  "short_name": "Tides",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0b1e2d",
  "theme_color": "#0b1e2d",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
Create two placeholder PNG icons at `icons/icon-192.png` and `icons/icon-512.png` (any square PNGs for now).

- [ ] **Step 6: Write `sw.js`**

```js
import { CACHE_ASSETS } from "./src/cache-manifest.js";

const CACHE = "tides-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CACHE_ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

// Cache-first for same-origin GETs (app shell + station JSON); network fallback fills the cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
```
Note: register with `{ type: "module" }` since `sw.js` imports.

- [ ] **Step 7: Register the SW and link the manifest in `index.html`**

In `<head>`: `<link rel="manifest" href="./manifest.webmanifest" />`
Before `</body>`:
```html
<script>
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { type: "module" });
  }
</script>
```

- [ ] **Step 8: Commit**

```bash
git add manifest.webmanifest sw.js src/cache-manifest.js icons/ index.html test/cache-manifest.test.js
git commit -m "feat: installable PWA with offline app-shell caching"
```

---

## Task 8: Full-suite green + live verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `node --test`
Expected: all tests PASS across engine, build-data, location, resolver, correction, format, cache-manifest.

- [ ] **Step 2: Serve and verify live**

Run: `npx --yes http-server -p 8080 .` (or `python3 -m http.server 8080`)
Open `http://localhost:8080`. Verify:
- Page loads; on first visit it requests location (or shows a searchable default).
- Searching a European port (e.g. "Cork", "Dover") selects it and renders a day of highs/lows with times in that port's timezone and heights vs its datum.
- The header shows the gauge name, country, and (when geolocated) distance.
- DevTools → Application → Service Workers shows an active worker; Manifest shows installable; going offline (DevTools → Network → Offline) and reloading still renders the last station.

- [ ] **Step 3: Verify the offline invariant + NC exclusion once more**

Run: `grep -rl '"commercial_use":false' data/ || echo "OK: no NC stations"`
Expected: `OK: no NC stations`.

- [ ] **Step 4: Use the verification skill**

Invoke `verify` (or `superpowers:verification-before-completion`) to drive the app end-to-end and confirm the change works in the real browser, not just tests.

- [ ] **Step 5: Final commit / branch is ready**

The feature branch `feature/global-tide-predictor` now contains the full Phase 1 predictor. Do not push or open a PR without operator confirmation.

---

## Notes carried forward to Phase 2 (native)

- Geolocation is isolated in `src/location.js#detectLocation` — the only swap needed for the Capacitor Geolocation plugin.
- Data is same-origin static JSON; Capacitor serves it from the app bundle, so offline works unchanged.
- API key (if the optional refinement is ever enabled) stays user-entered in settings, never embedded.
