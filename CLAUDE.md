<!-- AUTO-MANAGED: project-description -->
# Roaring Water Bay Tides

Offline-first tide predictor, evolved from a single-location (Baltimore, Co. Cork) GitHub Pages app
into a global tide predictor. Static site, no backend, installable as a PWA.

**Current phase**: Phase 1 (global predictor) implemented — engine extraction, NC-filtered European
data build, nearest-gauge location/search, offline resolver with optional API refinement, opt-in
secondary-port correction, and formatting/UI wiring are all landed on `index.html` + `src/`. Full
task-by-task plan: `docs/superpowers/plans/2026-07-14-global-tide-predictor.md`. Remaining from that
plan: PWA manifest + offline service worker, and final full-suite/live verification.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

- `index.html` — UI shell; loads `src/ui.js` via a single `<script type="module">import { init } from "./src/ui.js"; init();</script>` (previously contained the inlined engine + old single-station app; now generalized to any station)
- `src/engine.js` — inlined `@neaps/tide-predictor` harmonic math (MIT), unchanged. `useStation(station)` → `getExtremesPrediction({start, end})`
- `src/resolver.js` — `getTides(station, range, apiConfig)`: offline harmonic prediction by default; optional online API refinement (`apiConfig.fetchExtremes`) attempted only when `navigator.onLine`, with silent fallback to offline on any error
- `src/location.js` — `haversineKm`, `nearestStation`, `searchStations`, and `detectLocation` (isolates the browser geolocation API in one unit for the future Capacitor wrap)
- `src/correction.js` — `applyCorrection(tides, correction)`: opt-in secondary-port time-offset correction for a saved "home spot"; passthrough when `correction` is null/undefined
- `src/format.js` — `fmtTime(date, timezone)` (via `Intl`, never hardcode a timezone) and `fmtDistance(km)`
- `src/ui.js` — DOM orchestration only: `init()`, `showStation`, `renderHeader`, `renderTides`, `wireSearch`, `useMyLocation`; persists last-selected station in `localStorage` (`rwb.selectedStationId`)
- `data/stations.json` + `data/stations/<id>.json` — station index + per-station constituents/datums/license
- `scripts/build-data.mjs` — regenerates `data/` from `@neaps/tide-database`; exports `isCommercialSafe(license)` and `inRegion(station)`; **excludes any CC-BY-NC-licensed station** (commercial-use safety for future monetization); region currently limited to `continent === "Europe"`
- `test/` — Node-based headless tests (`node --test`), one test file per `src/` module + `build-data`
- `.superpowers/sdd/` — gitignored scratch dir for task-by-task implementation reports and throwaway scripts (e.g. `slice-engine.mjs` used once to extract the engine from `index.html`); not shipped, not part of the app

Key libs: `@neaps/tide-predictor` (MIT, harmonic engine, inlined) + `@neaps/tide-database` (devDependency only — NOAA + TICON-4 station data, used solely by the build script).

Phase 2 (separate future spec): Capacitor wrap → Android APK, then iOS. Browser-only APIs
(geolocation etc.) are isolated in dedicated units like `location.js` so the wrap doesn't require rework.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Known bug motivating the redesign

Original app predicted from the Ringaskiddy gauge with a hand-tuned Baltimore offset
(`high: -4, low: -15`) that was actually Baltimore-relative-to-**Cobh**, not Ringaskiddy — missing the
Ringaskiddy→Cobh secondary-port correction (~12 min). Result: every predicted tide ran ~11–13 min late.
The global redesign fixes this by predicting directly from the nearest real gauge station instead of a
proxy-station-plus-hand-tuned-offset.
<!-- END AUTO-MANAGED -->
