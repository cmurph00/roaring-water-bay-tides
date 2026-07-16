# Northern Ireland Tide Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend "Ireland's Tides" to the Northern Ireland coast — offline tide predictions (Portrush + a derived Bangor gauge) plus searchable NI beach/place names — using only commercial-use-safe open data.

**Architecture:** NI plugs into the existing pipeline as (a) one more harmonic gauge source `"ni"` alongside `mi`/`epa`/TICON, whose per-station file is TICON-shaped so the existing engine predicts it unchanged; (b) one more search-only beach-alias file; (c) more GeoNames gazetteer rows (from the GB dump) carrying NI counties. Nothing in the resolver/merge/render shape changes.

**Tech Stack:** Vanilla ES-module static site (no bundler), `node --test`, Python 3 + `utide` (build-time only, one-off Bangor derivation), Capacitor Android wrap.

## Global Constraints

- **Offline-first**: no runtime network dependency; all data precomputed/bundled and precached by `sw.js`. Every new data file is an optional-enhancement fetch (missing/404 → `[]`/null, never breaks `init()`).
- **Monetization-safe**: ship only OGL / CC-BY / public-domain data. Never bypass `isCommercialSafe` in `scripts/build-data.mjs`. Never ship the NC-tagged neaps/TICON Bangor record.
- **Never UKHO/Admiralty** predictions or constituents in shipped artifacts. Pro-app / BBC HW times used for validation are Crown Copyright → gitignored, never quoted in-repo.
- Bangor constituents come from **BODC processed sea-level data** (Open Government Licence, NERC) via our own `utide` harmonic analysis — not from any published constituent set.
- File names kebab-case. User-facing strings i18n-ready (match existing app conventions).
- Tests use `node --test` (zero deps). Run the full suite with `node --test`.

---

## File Structure

**New files**
- `scripts/derive-bangor-constituents.py` — one-off: BODC Bangor sea-level series → `utide` → TICON-shaped `data/ni/bangor.json`.
- `data/ni-stations.json` — NI gauge index (committed): `[{id,name,country,latitude,longitude,timezone,source:"ni"}]`.
- `data/ni/bangor.json` — Bangor harmonic station (committed), TICON-shaped.
- `data/bodc-bangor-raw.txt` — raw BODC series (gitignored, manual download).
- `scripts/build-ni-beaches.mjs` — DAERA bathing waters → `data/ni-beaches.json`.
- `data/ni-beaches.json` — NI beach search aliases (committed).
- `test/build-ni-beaches.test.js`, `test/ni-source.test.js`, `test/ni-accuracy.test.js` — tests.

**Modified files**
- `src/ui.js` — `NI_INDEX_URL` + `niStationUrl`; `loadIndex` fetches `ni-stations.json` + `ni-beaches.json`; `mergeStationIndexes` gains a 4th `ni` arg; `loadStation` gains a `ni` branch; `mapMarkerSources` widened to an island-of-Ireland bbox.
- `scripts/build-places.mjs` — GB dump download + NI county codes.
- `src/cache-manifest.js` — precache `ni-stations.json`, `ni/bangor.json`, `ni-beaches.json`; bump `CACHE_VERSION`.
- `.gitignore` — `data/bodc-bangor-raw.*`.
- `DATA-SOURCES.md`, `CLAUDE.md` — provenance + architecture.

`scripts/build-www.mjs` needs **no** change: it copies the whole `data/` dir recursively, so `data/ni/` and the new JSON files are packaged automatically.

---

### Task 1: `ni` gauge source in the merge/load/map pipeline

Pure-JS plumbing so an NI harmonic station can be merged, loaded, and mapped. Uses fixtures — needs no real Bangor data yet. This unblocks Task 2's data to actually render.

**Files:**
- Modify: `src/ui.js` (constants near line 18–29; `mergeStationIndexes` line 60–66; `loadStation` line 174–178; `mapMarkerSources` line 266–269)
- Test: `test/ni-source.test.js` (create)

**Interfaces:**
- Consumes: existing `haversineKm` (from `src/location.js`), the merged-index entry shape `{id,name,country,latitude,longitude,timezone,source?}`.
- Produces: `mergeStationIndexes(ticon, mi, epa=[], ni=[])` (4th arg, NI merged at the TICON tier); `mapMarkerSources(index)` now returns NI gauges (Portrush + Bangor) in `.gauges`.

- [ ] **Step 1: Write the failing test**

Create `test/ni-source.test.js`:

```js
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
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --test test/ni-source.test.js`
Expected: FAIL — `mergeStationIndexes` ignores a 4th arg (Bangor absent), and `mapMarkerSources` filters `country === "Ireland"` so Portrush/Bangor are excluded / Portpatrick handling untested.

- [ ] **Step 3: Widen `mergeStationIndexes` to accept `ni`**

In `src/ui.js`, replace the signature/body (line 60–66):

```js
export function mergeStationIndexes(ticon, mi, epa = [], ni = []) {
  const near = (a, b) => haversineKm({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude }) <= MI_OVERLAP_KM;

  const keptMi = mi.filter((m) => !epa.some((e) => near(m, e)));
  // NI harmonic gauges sit at the TICON tier but never overlap RoI sources (different coast),
  // so in practice all are kept; the dedup guard is kept for symmetry.
  const keptNi = ni.filter((n) => !epa.some((e) => near(n, e)) && !keptMi.some((m) => near(n, m)));
  const keptTicon = ticon.filter((t) => !epa.some((e) => near(t, e)) && !mi.some((m) => near(t, m)) && !keptNi.some((n) => near(t, n)));
  return [...epa, ...keptMi, ...keptNi, ...keptTicon];
}
```

- [ ] **Step 4: Widen `mapMarkerSources` to an island-of-Ireland bbox**

In `src/ui.js`, replace `mapMarkerSources` (line 266–269) — the bbox's eastern edge (`lon ≤ -5.3`) includes NI (Bangor −5.67, Portrush −6.66) but excludes Scotland/IoM (Portpatrick −5.12, Port Erin −4.77):

```js
// Island-of-Ireland bbox: RoI + NI, excluding GB/IoM gauges just across the channel.
const IRELAND_ISLAND_BBOX = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.3 };
function inIrelandIsland(s) {
  return s.latitude >= IRELAND_ISLAND_BBOX.minLat && s.latitude <= IRELAND_ISLAND_BBOX.maxLat
    && s.longitude >= IRELAND_ISLAND_BBOX.minLon && s.longitude <= IRELAND_ISLAND_BBOX.maxLon;
}

export function mapMarkerSources(index) {
  const gauges = index.filter((s) => s.source !== "epa" && (s.country === "Ireland" || s.source === "ni" || inIrelandIsland(s)));
  const beachModel = index.filter((s) => s.source === "epa");
  return { gauges, beachModel };
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `node --test test/ni-source.test.js`
Expected: PASS (both tests).

- [ ] **Step 6: Wire the `ni` source into `loadIndex`/`loadStation`**

In `src/ui.js`, add the URL constant after line 20:

```js
const NI_INDEX_URL = "./data/ni-stations.json";
```

Add the per-station URL after line 29:

```js
const niStationUrl = (id) => `./data/ni/${id.replace(/\//g, "_")}.json`;
```

In `loadStation` (line 174–178), add the `ni` branch:

```js
async function loadStation(entry) {
  const url =
    entry.source === "epa" ? epaStationUrl(entry.id)
    : entry.source === "mi" ? miStationUrl(entry.id)
    : entry.source === "ni" ? niStationUrl(entry.id)
    : stationUrl(entry.id);
  return fetch(url).then((r) => r.json());
}
```

In `loadIndex`, after the `epa` optional fetch block (line 119) and before `index = mergeStationIndexes(...)` (line 121), add an optional `ni` fetch and pass it in:

```js
  let ni = [];
  try {
    const res = await fetch(NI_INDEX_URL);
    ni = res.ok ? await res.json() : [];
  } catch {
    ni = [];
  }

  index = mergeStationIndexes(ticon, mi, epa, ni);
```

(Replace the existing `index = mergeStationIndexes(ticon, mi, epa);` line.)

- [ ] **Step 7: Run the whole suite — verify no regressions**

Run: `node --test`
Expected: all tests pass (168 existing + 2 new). `loadIndex`/`loadStation` are DOM-runtime (no unit test), exercised live.

- [ ] **Step 8: Commit**

```bash
git add src/ui.js test/ni-source.test.js
git commit -m "feat(ni): add ni gauge source to merge/load/map pipeline"
```

---

### Task 2: Derive the Bangor gauge from BODC OGL data

Produce the committed `data/ni/bangor.json` (TICON-shaped harmonic station) + `data/ni-stations.json` index, via a one-off `utide` analysis of BODC's OGL Bangor sea-level series. The Python script is not unit-tested (one-off, like `slice-engine.mjs`); its shape is asserted by a JS test here, and its numerical accuracy is validated in Task 5.

**Files:**
- Create: `scripts/derive-bangor-constituents.py`, `data/ni/bangor.json`, `data/ni-stations.json`
- Modify: `.gitignore`, `src/cache-manifest.js`
- Test: `test/ni-source.test.js` (append a shape test)

**Interfaces:**
- Produces: `data/ni-stations.json` = `[{id:"bangor",name:"Bangor",country:"United Kingdom",latitude:54.665,longitude:-5.669,timezone:"Europe/London",source:"ni"}]`; `data/ni/bangor.json` = same fields plus `harmonic_constituents:[{name,amplitude,phase},...]`, `datums`, `chart_datum`, `license`, `type`. Consumed by `getTides` (harmonic branch, since it has no `tides` array) and `loadStation` (Task 1).

- [ ] **Step 1: Add the gitignore entry for the raw download**

Append to `.gitignore`:

```
# Northern Ireland: raw BODC Bangor sea-level series (OGL, re-downloadable; only the
# derived data/ni/bangor.json is committed)
data/bodc-bangor-raw.*
```

- [ ] **Step 2: Write the derivation script**

Create `scripts/derive-bangor-constituents.py`. It reads a BODC processed sea-level series (a `time,sea_level` table — the exact columns depend on the BODC export; the parser below is tolerant: it finds the numeric level column and an ISO/`dd/mm/yyyy HH:MM` time column), runs `utide.solve`, and writes the neaps-engine-shaped station JSON. utide returns amplitude `A` and Greenwich phase lag `g` per constituent (Darwin names like `M2`), which is exactly `{name, amplitude, phase}`.

```python
#!/usr/bin/env python3
"""One-off: derive Bangor (NI) tidal harmonic constituents from BODC's OGL processed
sea-level series, so the app can predict Bangor OFFLINE without any UKHO/Admiralty data.

BODC UK National Tide Gauge Network data is Open Government Licence (NERC), commercial-use
permitted. Manual download (free): https://www.bodc.ac.uk/data/hosted_data_systems/sea_level/
uk_tide_gauge_network/processed/ -> the Bangor processed file -> save as data/bodc-bangor-raw.txt.

The committed artifact is data/ni/bangor.json; this script reproduces it. Requires:  pip install utide numpy
Run:  python3 scripts/derive-bangor-constituents.py
"""
import json
import re
import sys
from pathlib import Path
import numpy as np
from utide import solve

RAW = Path("data/bodc-bangor-raw.txt")
OUT_STATION = Path("data/ni/bangor.json")
OUT_INDEX = Path("data/ni-stations.json")

LAT, LON = 54.665, -5.669  # Bangor tide gauge, Central Pier, Bangor Marina (NTSLF)

def parse_series(text):
    """Yield (matplotlib-datenum, level_metres) from the BODC ASCII series. Tolerant of the
    two common BODC layouts (ISO timestamp, or 'dd/mm/yyyy HH:MM'); skips header/flag lines."""
    from matplotlib.dates import date2num
    from datetime import datetime
    times, levels = [], []
    for line in text.splitlines():
        line = line.strip()
        if not line or not re.search(r"\d", line):
            continue
        # level = last standalone float on the line that isn't a flag; time = first date-like token
        m_iso = re.search(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", line)
        m_dmy = re.search(r"\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}", line)
        floats = re.findall(r"-?\d+\.\d+", line)
        if not floats or not (m_iso or m_dmy):
            continue
        try:
            dt = datetime.fromisoformat(m_iso.group().replace(" ", "T")) if m_iso \
                 else datetime.strptime(m_dmy.group(), "%d/%m/%Y %H:%M")
        except ValueError:
            continue
        level = float(floats[-1])
        if abs(level) > 20:  # metres sanity guard (drops obvious flag columns)
            continue
        times.append(date2num(dt))
        levels.append(level)
    return np.array(times), np.array(levels)

def main():
    if not RAW.exists():
        sys.exit(f"ERROR: {RAW} not found. Download the BODC Bangor processed series first (see docstring).")
    t, h = parse_series(RAW.read_text())
    if len(t) < 24 * 30:  # need at least ~a month of hourly data for a stable solve
        sys.exit(f"ERROR: only {len(t)} usable samples parsed — need a longer BODC series.")

    coef = solve(t, h, lat=LAT, method="ols", conf_int="none", trend=False, verbose=False)
    constituents = [
        {"name": str(name), "amplitude": float(A), "phase": float(g)}
        for name, A, g in zip(coef["name"], coef["A"], coef["g"])
    ]
    constituents.sort(key=lambda c: -c["amplitude"])

    station = {
        "id": "bangor",
        "name": "Bangor",
        "region": "Northern Ireland",
        "country": "United Kingdom",
        "continent": "Europe",
        "latitude": LAT,
        "longitude": LON,
        "timezone": "Europe/London",
        "source": "ni",
        "license": {"type": "OGL-UK-3.0", "commercial_use": True,
                     "url": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
                     "notes": "Constituents derived by our own utide analysis of BODC (NERC/OGL) sea-level data."},
        "datums": {"MSL": 0.0},
        "chart_datum": "MSL",
        "type": "harmonic",
        "harmonic_constituents": constituents,
    }
    OUT_STATION.parent.mkdir(parents=True, exist_ok=True)
    OUT_STATION.write_text(json.dumps(station))
    OUT_INDEX.write_text(json.dumps([{k: station[k] for k in
        ("id", "name", "country", "latitude", "longitude", "timezone", "source")}]))
    print(f"Wrote {len(constituents)} constituents -> {OUT_STATION} and {OUT_INDEX}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Install deps and run the derivation**

Run:
```bash
pip install utide numpy matplotlib
# (operator: place the downloaded BODC Bangor series at data/bodc-bangor-raw.txt first)
python3 scripts/derive-bangor-constituents.py
```
Expected: `Wrote NN constituents -> data/ni/bangor.json and data/ni-stations.json` (NN ≥ ~30). If the BODC file is not available in this environment, the operator runs this step and commits the two output files; the rest of the plan proceeds using them.

- [ ] **Step 4: Write the shape test**

Append to `test/ni-source.test.js`:

```js
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
```

- [ ] **Step 5: Run the test — verify it passes (or skips cleanly if not yet derived)**

Run: `node --test test/ni-source.test.js`
Expected: PASS, or the shape test SKIPS with "bangor.json not derived yet" if the operator hasn't run Step 3 in this environment.

- [ ] **Step 6: Precache the NI gauge files + bump cache version**

In `src/cache-manifest.js`, add to `CACHE_ASSETS` after the `epa-stations.json` line:

```js
  "./data/ni-stations.json",
  "./data/ni/bangor.json",
```

Bump `CACHE_VERSION` (append/increment the date-suffix letter, matching the existing convention, e.g. `"v854-20260716h"`).

- [ ] **Step 7: Commit**

```bash
git add scripts/derive-bangor-constituents.py .gitignore src/cache-manifest.js test/ni-source.test.js data/ni-stations.json data/ni/bangor.json
git commit -m "feat(ni): derive Bangor harmonic gauge from BODC OGL data (utide)"
```

---

### Task 3: DAERA NI beach search aliases

Add `scripts/build-ni-beaches.mjs` (a near-clone of `scripts/build-beaches.mjs`) producing `data/ni-beaches.json`, and load it as a second optional beach-alias layer in `loadIndex`.

**Files:**
- Create: `scripts/build-ni-beaches.mjs`, `data/ni-beaches.json`
- Modify: `src/ui.js` (`BEACHES_URL` block in `loadIndex`, ~line 127–132), `src/cache-manifest.js`
- Test: `test/build-ni-beaches.test.js` (create)

**Interfaces:**
- Consumes: DAERA bathing-waters GeoJSON features.
- Produces: `featureToNiBeach(feature)` → `{name, latitude, longitude, classification, url, country:"Northern Ireland", type:"beach"}` or `null`; `data/ni-beaches.json` (flat array). Loaded into the same `beaches` search layer as `data/beaches.json`.

- [ ] **Step 1: Write the failing test**

Create `test/build-ni-beaches.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { featureToNiBeach } from "../scripts/build-ni-beaches.mjs";

test("featureToNiBeach maps a DAERA Point feature", () => {
  const f = { properties: { Name: "Ballyholme", Classification: "Excellent" },
              geometry: { type: "Point", coordinates: [-5.66, 54.66] } };
  assert.deepEqual(featureToNiBeach(f), {
    name: "Ballyholme", latitude: 54.66, longitude: -5.66,
    classification: "Excellent", url: null, country: "Northern Ireland", type: "beach" });
});

test("featureToNiBeach returns null for unusable features", () => {
  assert.equal(featureToNiBeach({ properties: {}, geometry: null }), null);
  assert.equal(featureToNiBeach({ properties: { Name: "" }, geometry: { type: "Point", coordinates: [1, 2] } }), null);
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --test test/build-ni-beaches.test.js`
Expected: FAIL — `build-ni-beaches.mjs` does not exist.

- [ ] **Step 3: Write `scripts/build-ni-beaches.mjs`**

The DAERA endpoint URL is resolved at build time from the DAERA ArcGIS Open Data hub (its GIS host is UK-geo-restricted; if the CI fetch cannot reach it, the operator runs this from a UK context and commits the output). The parser tolerates ArcGIS field-name variants (`Name`/`NAME`/`BW_NAME`).

```js
// Builds data/ni-beaches.json from DAERA's Northern Ireland bathing-waters open dataset
// (Open Government Licence). Pure search *aliases* (name + coords), exactly like the EPA
// beaches in scripts/build-beaches.mjs — resolved at runtime to the nearest real NI station
// (Portrush / Bangor) via resolveSpot(). NOT a tide-data source.
import { writeFile } from "node:fs/promises";

// DAERA ArcGIS FeatureServer for NI bathing waters (GeoJSON). Pinned at implementation time
// from https://opendata-daerani.hub.arcgis.com/ (search "bathing water"); OGL-licensed.
const DAERA_URL = process.env.DAERA_BATHING_URL
  || "https://services-eu1.arcgis.com/.../BathingWaters/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";

export function featureToNiBeach(feature) {
  const props = feature?.properties ?? {};
  const geometry = feature?.geometry;
  const name = props.Name ?? props.NAME ?? props.BW_NAME;
  if (typeof name !== "string" || name.trim().length === 0) return null;

  let coords = null;
  if (geometry?.type === "MultiPoint" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) coords = geometry.coordinates[0];
  else if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name: name.trim(),
    latitude,
    longitude,
    classification: props.Classification ?? props.CLASS ?? null,
    url: props.URL ?? null,
    country: "Northern Ireland",
    type: "beach",
  };
}

async function build() {
  let data;
  try {
    const res = await fetch(DAERA_URL);
    if (!res.ok) throw new Error(`DAERA request failed: HTTP ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    console.error(`Failed to fetch DAERA bathing waters — not writing data/ni-beaches.json. ${err.message}`);
    process.exit(1);
  }
  const features = Array.isArray(data?.features) ? data.features : [];
  const beaches = features.map(featureToNiBeach).filter((b) => b !== null);
  if (beaches.length === 0) {
    console.error("Parsed 0 valid NI beaches — refusing to write an empty data/ni-beaches.json");
    process.exit(1);
  }
  await writeFile("data/ni-beaches.json", JSON.stringify(beaches));
  console.log(`Wrote ${beaches.length} NI beaches to data/ni-beaches.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test test/build-ni-beaches.test.js`
Expected: PASS.

- [ ] **Step 5: Produce the data file**

Run: `node scripts/build-ni-beaches.mjs`
Expected: `Wrote NN NI beaches to data/ni-beaches.json` (NN ≈ 33). If the DAERA host is unreachable from this environment, the operator runs it from a UK context and commits `data/ni-beaches.json`.

- [ ] **Step 6: Load `ni-beaches.json` into the beach search layer**

In `src/ui.js` add the URL constant after `BEACHES_URL` (line 21):

```js
const NI_BEACHES_URL = "./data/ni-beaches.json";
```

Replace the `beaches` fetch block in `loadIndex` (line 127–132) so both beach files merge into one layer:

```js
  // Beaches are an optional enhancement layer — a missing/404 file must not break init().
  // The RoI (EPA) and NI (DAERA) beach registers merge into one search-alias layer.
  const beachFetch = async (url) => {
    try { const res = await fetch(url); return res.ok ? await res.json() : []; } catch { return []; }
  };
  const [roiBeaches, niBeaches] = await Promise.all([beachFetch(BEACHES_URL), beachFetch(NI_BEACHES_URL)]);
  beaches = [...roiBeaches, ...niBeaches];
```

- [ ] **Step 7: Precache + bump cache version**

In `src/cache-manifest.js` add `"./data/ni-beaches.json",` after the `beaches.json` line and bump `CACHE_VERSION`.

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-ni-beaches.mjs test/build-ni-beaches.test.js src/ui.js src/cache-manifest.js data/ni-beaches.json
git commit -m "feat(ni): add DAERA (OGL) NI beach search aliases"
```

---

### Task 4: GeoNames GB dump — NI places + counties

Extend `scripts/build-places.mjs` to also pull the GeoNames **GB** dump, filter to NI coastal places near an NI source, and map the three coastal NI counties. This is what makes "Portrush"/"Portstewart"/"Bangor" searchable and puts NI counties in `#county-filter`.

**Files:**
- Modify: `scripts/build-places.mjs`, `data/places.json` (regenerated)
- Test: `test/build-places.test.js` (append NI-county cases; create if absent)

**Interfaces:**
- Consumes: existing `parseGeonamesLine`, `rowToPlace`, `isNearAnySource`, `dedupPlaces`, `loadPredictionSources`.
- Produces: `COUNTY_BY_CODE` gains NI entries; `countyForRow` resolves NI rows; `data/places.json` gains NI rows with `county` ∈ {Antrim, Down, Londonderry}.

- [ ] **Step 1: Write the failing test**

Append to `test/build-places.test.js` (create with the imports if it doesn't exist):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { countyForRow, parseGeonamesLine } from "../scripts/build-places.mjs";

test("countyForRow maps NI (GB dump) counties", () => {
  // GB dump admin1 code for Northern Ireland is "NIR"; admin2 carries the county.
  assert.equal(countyForRow({ admin1: "NIR", admin2: "ANT" }), "Antrim");
  assert.equal(countyForRow({ admin1: "NIR", admin2: "DOW" }), "Down");
  assert.equal(countyForRow({ admin1: "NIR", admin2: "LDY" }), "Londonderry");
  assert.equal(countyForRow({ admin1: "NIR", admin2: "FER" }), null, "inland NI county not shipped");
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --test test/build-places.test.js`
Expected: FAIL — the NIR codes aren't in `COUNTY_BY_CODE`.

> NOTE for the implementer: the exact GB-dump admin1/admin2 codes for NI counties must be confirmed against the real `GB.txt` (GeoNames uses ISO-ish codes; NI's admin1 is commonly `NIR`, and county admin2 codes vary). Before Step 3, grep the downloaded `data/GB.txt` for the coastal NI county rows and replace the placeholder codes below with the real ones. This is a data-verification step, not a guess to ship.

- [ ] **Step 3: Add NI counties to `COUNTY_BY_CODE`**

In `scripts/build-places.mjs`, extend the map (after the RoI entries, line ~116). Confirm the codes against `data/GB.txt` first (see note):

```js
  "U.02": "Cavan", "U.06": "Donegal", "U.22": "Monaghan",
  // Northern Ireland (GeoNames GB dump). Coastal counties only — inland Fermanagh/Tyrone/Armagh
  // are intentionally omitted (no coast, no tide). Codes verified against data/GB.txt.
  "NIR.ANT": "Antrim", "NIR.DOW": "Down", "NIR.LDY": "Londonderry",
```

- [ ] **Step 4: Add the GB-dump download + merge into `build()`**

In `scripts/build-places.mjs`, add GB constants near the IE ones (line 32–34):

```js
const GEONAMES_GB_URL = "https://download.geonames.org/export/dump/GB.zip";
const GB_ZIP_PATH = "data/GB.zip";
const GB_TXT_PATH = "data/GB.txt";
```

Add a downloader (mirrors `downloadAndExtract`, extracting only NI rows to keep it small):

```js
async function downloadAndExtractGB() {
  console.log("Downloading GeoNames GB dump (for Northern Ireland)...");
  const res = await fetch(GEONAMES_GB_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${GEONAMES_GB_URL}`);
  await writeFile(GB_ZIP_PATH, Buffer.from(await res.arrayBuffer()));
  await execFileAsync("unzip", ["-o", GB_ZIP_PATH, "GB.txt", "-d", "data"]);
  const text = await readFile(GB_TXT_PATH, "utf8");
  // Keep only Northern Ireland rows (admin1 = NIR) to avoid loading all of Great Britain.
  return text.split("\n").filter((l) => l.split("\t")[10] === "NIR");
}
```

In `build()`, after computing IE `lines` (line 284), fold in the NI GB rows before the `candidates` map:

```js
  let niLines = [];
  try {
    niLines = await downloadAndExtractGB();
  } catch (err) {
    console.error(`WARNING: GB dump download failed (${err.message}) — building RoI places only, no NI.`);
  }
  const allLines = [...lines, ...niLines];
  const candidates = allLines.map(parseGeonamesLine).map(rowToPlace).filter((p) => p !== null);
```

(Replace the existing `const candidates = lines.map(...)` line with the `allLines` version.) `.gitignore` already covers `data/*.zip`/`data/*.txt` patterns if present; if not, add `data/GB.zip` and `data/GB.txt`.

- [ ] **Step 5: Ensure NI sources are in the coastal filter**

`isNearAnySource` filters places to within `COASTAL_RADIUS_KM` of a prediction source. `loadPredictionSources` must include the NI gauges or every NI place is dropped. In `loadPredictionSources` (line 244–253), add `data/ni-stations.json` and stop filtering TICON to Ireland-only (so Portrush counts):

```js
async function loadPredictionSources() {
  const [epaBboxNodes, epaIndex, mi, ticon, ni] = await Promise.all([
    fetchBboxNodes(),
    readJsonOrEmpty("data/epa-stations.json"),
    readJsonOrEmpty("data/mi-stations.json"),
    readJsonOrEmpty("data/stations.json"),
    readJsonOrEmpty("data/ni-stations.json"),
  ]);
  // TICON: keep Irish entries (RoI gazetteer) AND the NI-coast entry Portrush so NI places
  // near it survive the coastal filter. Island-of-Ireland bbox, matching src/ui.js.
  const irelandIsland = (s) => s.latitude >= 51.2 && s.latitude <= 55.5 && s.longitude >= -10.7 && s.longitude <= -5.3;
  const ticonRelevant = ticon.filter((s) => s.country === "Ireland" || irelandIsland(s));
  return [...epaBboxNodes, ...epaIndex, ...mi, ...ticonRelevant, ...ni];
}
```

- [ ] **Step 6: Run the test — verify it passes**

Run: `node --test test/build-places.test.js`
Expected: PASS.

- [ ] **Step 7: Regenerate `data/places.json` and spot-check NI coverage**

Run:
```bash
node scripts/build-places.mjs
node -e "const p=require('./data/places.json'); const ni=p.filter(x=>['Antrim','Down','Londonderry'].includes(x.county)); console.log('NI places:', ni.length); console.log(ni.slice(0,8).map(x=>x.name+' ('+x.county+')'));"
```
Expected: a non-zero NI count including Portrush/Portstewart/Bangor-area names. (Requires Task 2's `data/ni-stations.json` to exist so NI places survive the coastal filter.)

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-places.mjs test/build-places.test.js data/places.json .gitignore
git commit -m "feat(ni): add GeoNames GB dump for NI places + coastal counties"
```

---

### Task 5: NI accuracy validation + DATA-SOURCES/CLAUDE docs

Validate the end-to-end NI predictions against a gitignored reference fixture (same contract as the RoI accuracy test) and record provenance.

**Files:**
- Create: `test/ni-accuracy.test.js`
- Modify: `test/fixtures/reference-tides.json` (gitignored — add NI points), `DATA-SOURCES.md`, `CLAUDE.md`
- Optionally modify: `data/spot-overrides.json` (only if a validated nearest-geometric result is beaten)

**Interfaces:**
- Consumes: `mergeStationIndexes` (4-arg), `resolveSpot`, `getTides`, the reference fixture.

- [ ] **Step 1: Extend the reference fixture (gitignored, local only)**

Add NI points to `test/fixtures/reference-tides.json`'s `points` array — Bangor, Portrush, and 1–2 DAERA beaches — with real HW times read from a pro app or the BBC NI tide tables (`lat`/`lon`/`hw` fields, same shape as existing points). These values are Crown Copyright: keep them only in this gitignored file, never commit, never quote in-repo. Example shape (fill with real observed times):

```json
{ "spot": "Bangor",   "lat": 54.665, "lon": -5.669, "hw": ["HH:MM"] },
{ "spot": "Portrush", "lat": 55.207, "lon": -6.657, "hw": ["HH:MM"] }
```

- [ ] **Step 2: Write the NI accuracy test**

Create `test/ni-accuracy.test.js` — a clone of `test/accuracy.test.js` scoped to the NI points, with its own (looser) thresholds since a freshly derived Bangor and distant south-Down resolutions warrant their own bounds:

```js
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
const NI_SPOTS = new Set(["Bangor", "Portrush", "Portstewart", "Ballyholme", "Benone", "Newcastle"]);

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
  const start = new Date(`${ref.date}T00:00:00Z`);
  const end = new Date(start.getTime() + 30 * 3600 * 1000);
  const errors = [];
  const rows = [];

  for (const p of niPoints) {
    const resolved = resolveSpot(p.lat, p.lon, index, overrides);
    assert.ok(resolved, `no station resolved for ${p.spot}`);
    const extremes = await getTides(loadFull(resolved.station), { start, end });
    const eveningHigh = extremes.find((t) => t.type === "high" && tzDay(t.time) === ref.date && tzHour(t.time) >= 12);
    assert.ok(eveningHigh, `no evening HW predicted for ${p.spot} (via ${resolved.station.name})`);
    const err = toMin(hhmm(eveningHigh.time)) - toMin(p.hw[p.hw.length - 1]);
    errors.push(Math.abs(err));
    rows.push(`${p.spot.padEnd(14)} truth ${p.hw[p.hw.length - 1]} pred ${hhmm(eveningHigh.time)} Δ${err >= 0 ? "+" : ""}${err}  via ${resolved.station.name}`);
  }
  const sorted = errors.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const worst = Math.max(...errors);
  console.log(`\nNI HW accuracy (${errors.length} spots): median ${median} min, worst ${worst} min\n` + rows.join("\n"));
  assert.ok(median <= MEDIAN_MAX_MIN, `NI median HW error ${median} exceeds ${MEDIAN_MAX_MIN} min`);
  assert.ok(worst <= WORST_MAX_MIN, `NI worst HW error ${worst} exceeds ${WORST_MAX_MIN} min`);
});
```

- [ ] **Step 3: Run the NI accuracy test**

Run: `node --test test/ni-accuracy.test.js`
Expected: PASS with the fixture present, or SKIP if absent. **If Bangor's error is hours off**, the `utide` phase convention in `scripts/derive-bangor-constituents.py` (Greenwich `g` vs local) is wrong — that is the thing to fix, then re-derive (Task 2) and re-run. A few-minutes error is fine; hours means a convention bug.

- [ ] **Step 4: Update `DATA-SOURCES.md`**

Add sections crediting: BODC UK Tide Gauge Network (OGL, NERC) for the Bangor sea-level series the constituents were derived from; DAERA (OGL) for NI bathing waters; GeoNames GB dump (CC-BY) for NI places. Note explicitly that no UKHO/Admiralty data is used.

- [ ] **Step 5: Update `CLAUDE.md`**

Add architecture notes for the `ni` source (`data/ni-stations.json` + `data/ni/bangor.json`, harmonic, derived via `scripts/derive-bangor-constituents.py`), `data/ni-beaches.json`, the GB-dump extension of `build-places.mjs`, and the island-of-Ireland `mapMarkerSources` bbox. (Or let the auto-memory hook handle it on commit.)

- [ ] **Step 6: Run the whole suite**

Run: `node --test`
Expected: all pass (NI accuracy skips cleanly in CI where the fixture is absent).

- [ ] **Step 7: Commit**

```bash
git add test/ni-accuracy.test.js DATA-SOURCES.md CLAUDE.md
# (reference-tides.json is gitignored and intentionally NOT added)
git commit -m "test(ni): NI HW accuracy regression + data-source provenance"
```

---

## Notes for the executor

- **Task order** is 1 → 2 → 3 → 4 → 5. Task 1 is pure JS (no external data) and unblocks everything. Task 4 depends on Task 2's `data/ni-stations.json` existing (else NI places are filtered out). Task 5 depends on all prior tasks.
- **Environment caveat:** Tasks 2, 3, 4 fetch external data (BODC manual download; DAERA UK-geo-restricted host; GeoNames GB dump). If a fetch is unreachable in the execution environment, produce the code + tests, and flag that the operator must run that build step from a UK-reachable context and commit the resulting `data/*.json`. The code and unit tests do not depend on the fetch succeeding; only the committed data artifacts do.
- **South Co Down** (Newcastle/Kilkeel/Strangford) has no open gauge anywhere — those spots resolve to Bangor/Portrush at distance and are surfaced honestly by the existing source+distance label. That is expected, not a bug (spec §"Out of scope").
