<!-- AUTO-MANAGED: project-description -->
# Roaring Water Bay Tides

Offline-first tide predictor, evolved from a single-location (Baltimore, Co. Cork) GitHub Pages app
into a global tide predictor. Static site, no backend, installable as a PWA.

**Current phase**: Phase 1 (global predictor) is complete and verified — engine extraction, NC-filtered
European data build, nearest-gauge location/search, offline resolver with optional API refinement,
opt-in secondary-port correction, formatting/UI wiring, an installable PWA manifest + offline service
worker (stale-while-revalidate app shell, cache-first station data), multi-day views (1/3/5/7/10
station-local days), a browse-by-country dropdown with scoped search, and country auto-default (from
the last-saved station on reload, or via an explicit "Use my location" tap — geolocation is
gesture-only, never auto-run on load, since iOS Safari blocks `getCurrentPosition` outside a user
gesture) are all landed on `index.html` + `src/`, with the full test suite passing and the app
live-verified. Full task-by-task plan:
`docs/superpowers/plans/2026-07-14-global-tide-predictor.md` — fully executed, nothing outstanding.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

- `index.html` — UI shell; loads `src/ui.js` via a single `<script type="module">import { init } from "./src/ui.js"; init();</script>` (previously contained the inlined engine + old single-station app; now generalized to any station)
- `src/engine.js` — inlined `@neaps/tide-predictor` harmonic math (MIT), unchanged. `useStation(station)` → `getExtremesPrediction({start, end})`
- `src/resolver.js` — `getTides(station, range, apiConfig)`: offline harmonic prediction by default; optional online API refinement (`apiConfig.fetchExtremes`) attempted only when `navigator.onLine`, with silent fallback to offline on any error
- `src/location.js` — `haversineKm`, `nearestStation`, `searchStations`, and `detectLocation` (isolates the browser geolocation API in one unit for the future Capacitor wrap)
- `src/correction.js` — `applyCorrection(tides, correction)`: opt-in secondary-port time-offset correction for a saved "home spot"; passthrough when `correction` is null/undefined
- `src/format.js` — `fmtTime(date, timezone)` and `fmtDistance(km)` (via `Intl`, never hardcode a timezone); `localDayISO(date, timezone)`, `groupByLocalDay(tides, timezone)`, and `fmtDayLabel(isoDay, timezone)` group/label tides by station-local calendar day (timezone-aware across UTC midnight)
- `src/ui.js` — DOM orchestration only: `init()`, `showStation`, `renderHeader`, `renderDays`, `wireSearch`, `wireCountryFilter`, `wireDayCount`, `useMyLocation`; persists last-selected station (`rwb.selectedStationId`) and day-count choice (`rwb.days`, one of 1/3/5/7/10) in `localStorage`; `#country-filter` scopes search to one country and auto-sets to the resolved/saved station's own country (offline "detected country", no reverse-geocoding). `useMyLocation` is gesture-only (bound to a click, never called from `init()` on load) and always renders visible feedback — a "Locating…" status via `renderStatus`, then either the resolved station or an actionable, error-code-specific message from `geolocationErrorMessage` (`PERMISSION_DENIED`/`POSITION_UNAVAILABLE`/`TIMEOUT`) via `renderError` — instead of failing silently.
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
