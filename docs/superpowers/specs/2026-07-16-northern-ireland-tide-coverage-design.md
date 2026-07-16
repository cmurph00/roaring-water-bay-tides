# Northern Ireland Tide Coverage — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm complete; ready for implementation plan)
**Task:** #29 — Source Northern Ireland tide gauge + beach data (open-licence)

## Goal

Extend "Ireland's Tides" to the Northern Ireland coast — tide predictions plus
searchable beach/place names — using only commercial-use-safe open data (OGL /
CC-BY / public domain). **Never** UKHO/Admiralty predictions or constituents
(Crown Copyright), and never any GESLA record tagged non-commercial.

## Constraints (global — every task inherits these)

- **Offline-first.** No runtime network dependency; all data precomputed/bundled
  and precached by the service worker.
- **Monetization-safe.** Ship only OGL / CC-BY / public-domain data. The
  `isCommercialSafe` filter in `scripts/build-data.mjs` must never be bypassed;
  the NC-tagged neaps/TICON Bangor record must never be shipped.
- **Never UKHO/Admiralty.** No Crown-Copyright predictions or constituents in
  shipped artifacts. Pro-app HW times used for validation are Crown Copyright and
  stay gitignored + never quoted in-repo (same rule as the existing RoI fixture).
- **Honesty over coverage.** Where a spot resolves to a distant gauge, the app's
  existing source + distance labels surface that; we do not hide or fake it.
- File naming kebab-case; user-facing text i18n-ready (existing app conventions).

## Licence basis (why this is legal)

- **Bangor gauge:** TICON-4's Bangor record is `cc-by-NC` because the neaps
  packager blanket-tagged GESLA sources. We do **not** use it. Instead we derive
  our own constituents from **BODC's processed UK Tide Gauge Network sea-level
  series**, which is **Open Government Licence** via NERC ("exploit the
  Information commercially… including it in your own product or application";
  processed data 1915–present free, charges only for data <3 months old).
  Deriving constituents from open sea-level data is exactly what TICON-4 itself
  does — it is our own analysis of open data, Crown Copyright untouched.
  Sources: BODC NERC OGL doc 599476; GESLA licence table (BODC = "Research and
  consultancy" permitted, not one of the NC-restricted providers).
- **Portrush gauge:** already bundled via TICON-4 under CC-BY-4.0
  (`commercial_use: true`). No new data.
- **NI beaches:** DAERA (Dept. of Agriculture, Environment and Rural Affairs)
  publishes 33 NI bathing waters under **OGL** via its ArcGIS Open Data hub.
- **NI places/counties:** GeoNames **GB** dump, CC-BY-4.0 (the IE dump carries no
  NI rows; NI is under GB).

## Architecture

Four independent additions on top of the existing dual/triple-source design
(EPA > MI > TICON merge, resolver branching on precomputed-`tides` vs harmonic
constituents, search-only alias layers resolved via `resolveSpot`). Nothing in
the existing resolution/merge/render pipeline changes shape — NI plugs in as one
more gauge source plus one more beach-alias file plus more gazetteer rows.

### Component 1 — Portrush discoverability

Portrush is already in `data/stations.json` (country "United Kingdom", 50
constituents). Two gaps:

1. Not in any gazetteer → search can't find "Portrush" or nearby beach names.
2. The map plots only RoI gauges (`mapMarkerSources` partitions MI + Irish TICON
   + EPA; non-Irish TICON is excluded).

Fix: NI gazetteer entries arrive via Component 4 (search resolves to it through
`resolveSpot` → `nearestStation`); `mapMarkerSources` is widened to include the
NI gauges (Portrush + Bangor) as circle markers. No new prediction data.

### Component 2 — Bangor gauge (derive constituents; Approach A)

- **`scripts/derive-bangor-constituents.py`** — one-time derivation. Input: the
  BODC processed Bangor sea-level series, a manual gitignored download at
  `data/bodc-bangor-raw.*` (same "raw dumps are gitignored" pattern as the OSi
  and GeoNames sources). Runs `utide` (standard UTide harmonic analysis) to fit
  the tidal constituents, and writes them in the **same JSON shape as a TICON
  station** (`id`, `name`, `country`, `latitude`, `longitude`, `timezone`,
  `harmonic_constituents`, `datums`). Constituents are physically stable, so this
  runs once; the committed output is the artifact, the script is not part of the
  regular build (like the one-off `slice-engine.mjs`).
- **New source `"ni"`.** Committed `data/ni-stations.json` (index) +
  `data/ni/bangor.json` (per-station), mirroring how MI (`data/mi/`) and EPA
  (`data/epa/`) are separate sources. This is deliberate: `build-data.mjs` does
  `rm -rf data/` and rebuilds `data/stations/` from `@neaps` only, so a
  hand-derived file under `data/stations/` would be wiped on the next
  `build:data`. A separate `ni` source survives, exactly like `mi`/`epa`.
- **Resolver + engine unchanged.** `data/ni/bangor.json` carries
  `harmonic_constituents` and no `tides` array, so `resolver.js` routes it
  through the harmonic engine (open-ended predictions; multi-day views work
  unchanged). Heights are MSL-relative (utide output) → displayed "vs MSL", like
  the EPA "Model MSL" case. `stationSourceLabel` returns "tide gauge".
- **Index merge.** `mergeStationIndexes` gains the `ni` source at the same
  preference tier as TICON gauges (EPA > MI > TICON/NI); overlap dedup via the
  existing `MI_OVERLAP_KM` rule. `loadStation` gains one `entry.source === "ni"`
  branch (→ `data/ni/<id>.json`). `loadIndex` fetches `data/ni-stations.json`
  under the same optional-enhancement contract (missing/404 → `[]`).

### Component 3 — DAERA beaches (OGL search aliases)

- **`scripts/build-ni-beaches.mjs`** — near-clone of `build-beaches.mjs`, pointed
  at the DAERA ArcGIS/WFS bathing-waters endpoint (exact endpoint pinned at
  implementation time from the DAERA Open Data hub; host is UK-geo-restricted so
  it resolves from a UK context / operator machine if the CI fetch cannot).
  Emits `data/ni-beaches.json`, the same compact record shape as
  `data/beaches.json` (`{name, latitude, longitude, classification?, url?,
  country: "Northern Ireland", type: "beach"}`).
- **All 33 beaches shipped** (operator decision). South-Down beaches that resolve
  to Bangor/Portrush at distance are surfaced honestly by the existing source +
  distance label; none are hidden or faked.
- **Loaded as a second optional beach-alias file** alongside `data/beaches.json`,
  same search + `wireLocalityClick` → `resolveSpot` path. Missing/404 → `[]`.

### Component 4 — NI places / counties (GeoNames GB dump)

- **`scripts/build-places.mjs` extended** to also download the GeoNames `GB.zip`
  dump, filter to Northern Ireland coastal places near an NI prediction source
  (Portrush / Bangor / a DAERA beach) within the existing `COASTAL_RADIUS_KM`,
  and merge them into `data/places.json` (same record shape, same coastal
  proximity filter).
- **`COUNTY_BY_CODE` / `countyForRow` extended** for the three coastal NI
  counties — **Antrim, Down, Londonderry/Derry** — from the GB admin1/admin2
  codes. `assignCounties` then tags Portrush/Bangor with their county, and they
  appear in the existing `#county-filter` dropdown alongside RoI counties. No
  reframing: "Ireland's Tides" already denotes the whole island.

### Component 5 — Validation

- Extend the gitignored `test/fixtures/reference-tides.json` with a few NI spots
  (Bangor, Portrush, + 1–2 DAERA beaches) read from a pro tide app (Crown
  Copyright → validation-only, never shipped, never quoted in-repo).
- Add a **parallel** `test/ni-accuracy.test.js` (kept separate from the RoI
  `accuracy.test.js` because NI error thresholds will differ — a freshly derived
  Bangor and distant south-Down resolutions warrant their own bounds) that
  resolves each NI reference point through `resolveSpot` → `getTides` and asserts
  evening-HW median/worst error thresholds, with the same skip-if-fixture-absent
  contract.
- Add `data/spot-overrides.json` entries for NI spots only if a validated
  nearest-geometric result is beaten by another source (as done for RoI).

## Data flow (unchanged pipeline, NI plugged in)

```
loadIndex():
  fetch stations.json (TICON incl. Portrush) + mi-stations.json + epa-stations.json
       + ni-stations.json (NEW)                 → mergeStationIndexes(EPA>MI>TICON/NI)
  fetch beaches.json + ni-beaches.json (NEW)     → beach search-alias layer
  fetch places.json (now incl. NI + NI counties) → place search-alias layer
  assignCounties(index, places)                  → tags Portrush/Bangor counties

search/click or geolocation → resolveSpot(lat, lon, index, overrides)
  → override-by-proximity OR nearestStation      → getTides(station, range)
     ni/TICON station (constituents) → harmonic engine (open-ended)
     mi/epa station (tides array)    → precomputed slice
```

## Error handling

- Every new data file is an **optional enhancement**: missing/404 → `[]` (or
  null for a single-file), never breaks the app (same contract as beaches/places
  /low-water/overrides today).
- `build-ni-beaches.mjs` returns `null` for unusable features so the caller
  filters rather than writing bad records (same as `featureToBeach`).
- If the DAERA endpoint is unreachable from CI (UK geo-restriction), the beach
  layer simply ships as last-built; the gauge/place work is independent of it.

## Files

**New**
- `scripts/derive-bangor-constituents.py` — one-time utide derivation
- `scripts/build-ni-beaches.mjs` — DAERA bathing-waters → `data/ni-beaches.json`
- `data/ni-stations.json` + `data/ni/bangor.json` — NI gauge source (committed)
- `data/ni-beaches.json` — NI beach search aliases (committed)
- `data/bodc-bangor-raw.*` — raw BODC series (gitignored, manual download)

**Modified**
- `scripts/build-places.mjs` — GB dump + NI county mapping
- `src/ui.js` — load/merge `ni` gauge source + `ni-beaches`, `loadStation` `ni`
  branch, NI gauges in map markers
- `src/map.js` — plot NI gauges
- `src/cache-manifest.js` — precache `ni-stations.json`, `ni/bangor.json`,
  `ni-beaches.json` (bump `CACHE_VERSION`)
- `test/fixtures/reference-tides.json` (gitignored) — NI reference points added
- `test/ni-accuracy.test.js` (new) — NI accuracy regression
- `DATA-SOURCES.md` — BODC (OGL), DAERA (OGL), GeoNames GB (CC-BY)
- `CLAUDE.md` — architecture entries for the `ni` source + NI beach/place layers
- `.gitignore` — `data/bodc-bangor-raw.*`

## Testing

- **Unit:** `build-ni-beaches` feature-mapping (clone of `build-beaches` tests);
  `build-places` NI-county code mapping; `mergeStationIndexes` with an `ni`
  source; `loadStation` `ni` dispatch.
- **End-to-end:** NI accuracy regression vs the gitignored fixture
  (skip-if-absent).
- **Not unit-tested:** the Python derivation script (one-time; its committed
  output is validated by the accuracy test).

## Out of scope

- South Co Down (Newcastle/Kilkeel/Strangford) high-accuracy predictions — no
  open gauge exists there in any network; this is a physical gap, not solvable
  with more licence work. Those spots resolve to Bangor/Portrush at distance.
- iOS wrap; any change to the RoI data sources.

## Decomposition note

Four largely independent components; natural implementation order is 2 → 1 → 3 →
4 → 5 (Bangor gauge first, since Portrush discoverability, beaches, and places
all want a working NI gauge to resolve to; validation last). Suitable for a
single implementation plan.
