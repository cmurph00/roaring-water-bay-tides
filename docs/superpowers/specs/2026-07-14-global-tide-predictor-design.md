# Global Tide Predictor — Design

**Date:** 2026-07-14
**Status:** Draft for review
**Repo:** `cmurph00/roaring-water-bay-tides` (evolving from a single-location app into a global predictor)
**Scope of this spec:** Phase 1 — the offline-first global web predictor (installable PWA). Native
packaging (Capacitor → Android APK, then iOS) is Phase 2 and gets its own spec; see Roadmap.

## Background

A global, offline-first tide predictor: pick (or auto-detect) a location and get tide times and heights
from the **nearest real tide-gauge station**, computed on-device by the inlined `@neaps/tide-predictor`
harmonic engine (MIT).

It evolves from an earlier single-location app whose proxy-station-plus-hand-tuned-offset approach
drifted ~11–13 min at the target location.[^origin] The global design **dissolves that class of bug** by
predicting directly from the nearest real gauge rather than a proxy station with manual offsets.

[^origin]: Origin / root-cause (verified 2026-07-14): the original app predicted from the **Ringaskiddy**
(Cork Harbour) gauge as a stand-in for the Cobh standard port, then applied Baltimore-relative-to-Cobh
Admiralty offsets (`high −4, low −15 min`). Because Ringaskiddy's HW lags Cobh's by ~12 min and that
correction was skipped, every tide ran ~11–13 min late (heights stayed close — a pure phase error).
Measured against a Baltimore reference of HW 05:29 & 17:58 IST, 3.3–3.4 m, which is retained as
regression-test fixture #1 (see Testing).

## Goals

1. Predict tides for locations beyond Baltimore — starting with Ireland/UK/Europe, expandable.
2. Stay **offline-first** and free (no mandatory API key; still hostable as static GitHub Pages).
3. **Installable as a PWA** (manifest + service worker) so it works on a phone with no signal — this is
   also the foundation the Phase 2 Capacitor wrap builds on.
4. Keep the door open to light monetization ("Buy Me a Coffee") — so **no non-commercial data**.
5. Preserve the existing visual design; generalize it to any station.
6. Build the web layer so it wraps cleanly into a native app later (keep browser-specific APIs behind
   isolated units, e.g. `location.js`) without designing native concerns into Phase 1.

## Non-goals (YAGNI)

- Global ocean models (FES2022 etc.) — huge, poor coastal accuracy, needs a backend.
- Currents, surge, weather.
- User accounts / server state.
- Full-global dataset on day one (regional first; the build script makes expansion trivial).

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data source | **Hybrid**: bundled offline dataset (default) + optional API refinement | Offline reliability with an accuracy boost when online + keyed |
| Coverage | **Regional first** (IE/UK/Europe), expandable via build script | Small, fast; personal tool first |
| Licensing | **Filter out non-commercial stations**; keep CC-BY + NOAA public-domain only | Keeps a coffee/tip jar unambiguous; NC is a legal grey area for donations |
| Data provenance | `@neaps/tide-database` (NOAA + TICON-4), same schema already inlined | Companion package to the engine; no re-modelling |
| Packaging (eventual) | **Capacitor**, phased: web/PWA first → Android APK, then iOS | Wraps the same web codebase; no rewrite; native geolocation |
| First native target | **Android APK** | Free to build + sideload; no store account needed to start |

### Licensing detail

- `@neaps/tide-predictor` + `@neaps/tide-database` code: **MIT** — share and commercialize freely.
- Station data default: **CC-BY-4.0** — share/commercial OK **with attribution**.
- Some stations (e.g. **Ringaskiddy**, via CMEMS/GESLA — the origin app's station): **CC-BY-NC-4.0** — sharing fine,
  **commercial use blocked**. "Buy Me a Coffee" donations are a CC-NC grey area with no definitive
  ruling, so we exclude NC stations entirely.
- Build script reads each station's `license` field and **drops any non-commercial station**;
  auto-generates `DATA-SOURCES.md` + an in-app credits line for the CC-BY/public-domain sources kept.

## Architecture

Static site (no backend), served by GitHub Pages:

```
roaring-water-bay-tides/
├── index.html              # UI shell + existing styling, generalized
├── src/
│   ├── engine.js           # inlined @neaps/tide-predictor (unchanged, MIT)
│   ├── resolver.js         # hybrid data source → tide extremes
│   ├── location.js         # search + geolocation nearest-gauge (Haversine)
│   ├── correction.js       # optional per-location secondary-port offset (opt-in)
│   └── ui.js               # render, date/day controls, station switcher
├── data/
│   ├── stations.json       # lightweight index: id, name, lat/lon, country, tz
│   └── stations/<id>.json  # per-station constituents + datums + license
├── scripts/build-data.mjs  # regenerates data/ from @neaps/tide-database (NC filtered)
├── test/                   # Node regression + unit tests
├── DATA-SOURCES.md         # auto-generated attribution
└── LICENSE                 # MIT (code)
```

Each unit has one job and a clear interface:

- **engine.js** — pure harmonic math. Input: station constituents + time span. Output: water levels /
  extremes. Already proven to run headless in Node.
- **resolver.js** — `getTides(station, {start, end}) → [{type, time, height}]`. Chooses source:
  1. **Offline (default):** `useStation(station)` → `getExtremesPrediction` over a padded window →
     filter to the requested day(s). Heights are real levels vs the station's chart datum.
  2. **API refinement (optional):** if a key is configured **and** online, fetch extremes for the
     station's lat/lon and prefer them; **silently fall back** to offline on any error/timeout/rate-limit.
- **location.js** — `nearestStation(lat, lon) → {station, distanceKm}` via Haversine over
  `stations.json`; text search filter; persists selection to localStorage.
- **correction.js** — optional, opt-in. A user-defined secondary-port correction (time offsets +
  height ratios) layered on the nearest gauge, for a saved "home spot" where the nearest non-NC gauge
  is far. Off by default; this is the *correct* version of the old Baltimore hack, made explicit and local.
- **ui.js** — DOM only; consumes resolver/location output. Shows datum, station name, **distance to
  gauge**, timezone, and an "outside observed range" note where relevant.

## Data flow

```
load → geolocation (permission) ──┐
       └─ denied → last-used / default station
                                   ▼
        location.nearestStation(lat,lon)
                                   ▼
        resolver.getTides(station, dayRange)
          ├─ offline: engine (always available)
          └─ online+key: API → prefer, else offline
                                   ▼
        [+ optional correction.js for saved home spot]
                                   ▼
        ui render (station tz, datum, distance, days)
```

## Sizing

A regional subset (IE/UK/Europe: a few hundred stations × ~50 constituents) is expected to be small
(~1–3 MB) and is **bundled directly in-package — no network fetch of data at runtime.** This is now a
firm decision, not just a size optimization: the Phase 2 native app must work fully offline, so its
data has to ship inside the app, not be fetched from a server. **Verify actual size when the build step
runs**; if a region's data is uncomfortably large, **trim the region cut** (fewer countries/stations)
rather than switching to network fetch — offline-in-package is the invariant. The
`data/stations/<id>.json` split is kept only as an internal organization aid, not a lazy-load mechanism.

## Error handling & edge cases

| Case | Behaviour |
|---|---|
| Geolocation denied/unavailable | Fall back to search + last-used/default station; no crash |
| No gauge within a sane radius | Clear message: "No tide gauge near here" |
| API error / timeout / rate-limit / no key | Silent fallback to offline; log once to console |
| Date outside station's observed epoch | Still predicted (harmonic extrapolation) + subtle "outside observed data range" note |
| Timezone / DST | Predict in UTC internally; display in the **station's** tz via `Intl` — not hardcoded `Europe/Dublin`/`+01:00` (a latent bug in the current code) |
| NC station in dataset | Cannot occur — build script excludes them; a test asserts this |

## Testing

Node-based (engine runs headless — proven 2026-07-14):

1. **Prediction regression** — fixtures of reference tide times/heights per station/date. **Fixture #1
   is today's Baltimore reference** (HW 05:29 & 17:58, 3.3–3.4 m). Assert predicted extremes within
   tolerance (HW ±15 min, height ±0.3 m). Guards against the class of phase/offset bug found today.
2. **License filter** — assert no station in `data/` carries a non-commercial license / `commercial_use:false`.
3. **Attribution** — assert `DATA-SOURCES.md` lists every source present in `data/`.
4. **Nearest-station** — Haversine returns the expected gauge for known coordinates.
5. Pure functions (resolver, location, correction) extracted from DOM so they unit-test headless.

## Open questions for implementation

- Which API vendor for the optional refinement (TidesAtlas free tier vs WorldTides vs Stormglass)?
  Pluggable; pick a default during implementation. **Not a blocker** — offline is the source of truth.
- Exact European region boundary for the first data cut (EU + IE + UK + Nordics?).
- Nearest non-NC gauge to Roaring Water Bay — determines whether the optional home-spot correction is
  worth pre-configuring for Baltimore out of the box.

## Roadmap — native packaging (Phase 2, separate spec)

Phase 1 (this spec) delivers an offline-first, installable PWA. Phase 2 wraps that same web codebase
into native apps. It will get its own spec + plan when Phase 1 is working. Recorded here so Phase 1
doesn't paint itself into a corner:

- **Tool:** Capacitor — points a native shell at the existing web build; no rewrite.
- **Order:** **Android APK first** (free to build and sideload; Google Play $25 one-time optional),
  then iOS (needs Apple Developer $99/yr + Xcode).
- **Native geolocation:** swap the browser geolocation call inside `location.js` for the Capacitor
  Geolocation plugin — an isolated, single-unit change Phase 1 already accommodates.
- **Optional API key stays user-supplied** (entered in settings), never embedded in the app package —
  keys shipped inside an APK/IPA are extractable.
- **iOS monetization caveat:** Apple's IAP rules restrict in-app "Buy Me a Coffee"-style donations for
  digital goods, and limit external donation links; Android is far more permissive. Shapes *where* the
  tip jar lives per platform; does not affect Phase 1.
