<!-- AUTO-MANAGED: project-description -->
# Roaring Water Bay Tides

Offline-first tide predictor, evolved from a single-location (Baltimore, Co. Cork) GitHub Pages app
into a global tide predictor. Static site, no backend, installable as a PWA.

**Phase 1 (global predictor)**: complete and verified — engine extraction, NC-filtered European data
build, nearest-gauge location/search, offline resolver with optional API refinement, opt-in
secondary-port correction, formatting/UI wiring, an installable PWA manifest + offline service worker
(stale-while-revalidate app shell, cache-first station data), multi-day views (1/3/5/7/10 station-local
days), a browse-by-country dropdown with scoped search, and country auto-default (from the last-saved
station on reload, or via an explicit "Use my location" tap — geolocation is gesture-only, never
auto-run on load, since iOS Safari blocks `getCurrentPosition` outside a user gesture) are all landed
on `index.html` + `src/`, with the full test suite passing and the app live-verified. Full task-by-task
plan: `docs/superpowers/plans/2026-07-14-global-tide-predictor.md` — fully executed, nothing outstanding.

**Marine Institute (Ireland) offline dataset**: landed — a second, precomputed data source (real
published tide-table predictions, CC-BY-4.0) merged alongside the harmonic TICON/NOAA dataset,
preferred for Irish stations. See Architecture below for the dual-source design. EPA-named-beach
search aliases (resolving to nearest real tide station) also landed.

**Phase 2 (Capacitor Android wrap)**: landed — `capacitor.config.json` + generated `android/` Gradle
project + a GitHub Actions workflow build the app into an installable debug APK (no local Android SDK
required; CI does the actual `gradlew assembleDebug`). `src/location.js`'s `detectLocation()` now
prefers the native Capacitor Geolocation plugin when running inside the wrapped app, falling through
unchanged to the browser `navigator.geolocation` path on the plain web app. iOS wrap not yet started.

**EPA node predictions (West Cork)**: landed (Task 18) — a third offline prediction source,
`data/epa/<node>.json` + `data/epa-stations.json`, giving Baltimore/Schull/Crookhaven/Cape Clear
(and other West Cork spots with no nearby real gauge) their own EPA hydrodynamic-model-node tide
predictions instead of a distant gauge's table; index merge preference is now EPA > MI > TICON,
and named beaches re-point to their nearest EPA node where one exists. Followed on from the
validation/survey work in `docs/beach-validation.md` and `docs/marine-ie-data-audit.md`.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

- `index.html` — UI shell; loads `src/ui.js` via a single `<script type="module">import { init } from "./src/ui.js"; init();</script>` (previously contained the inlined engine + old single-station app; now generalized to any station)
- `src/engine.js` — inlined `@neaps/tide-predictor` harmonic math (MIT), unchanged. `useStation(station)` → `getExtremesPrediction({start, end})`
- `src/resolver.js` — `getTides(station, range, apiConfig)` branches on data source: if `station.tides` is an array (Marine Institute OR EPA precomputed stations — same tuple shape, resolver doesn't distinguish them), slices it directly to the range via `precomputedTides` — this check runs BEFORE any online-refinement attempt, so MI/EPA stations never call `apiConfig.fetchExtremes` even when online; otherwise runs the offline harmonic engine, with optional online API refinement (`apiConfig.fetchExtremes`) attempted only when `navigator.onLine`, silent fallback to offline on any error
- `src/location.js` — `haversineKm`, `nearestStation`, `searchStations`, `searchBeaches` (EPA-named-beach search, same substring-match shape but name-only, no country axis), and `detectLocation` (isolates the browser geolocation API in one unit; on a native Capacitor shell — `globalThis.Capacitor?.isNativePlatform?.()` true with the Geolocation plugin registered — uses `Capacitor.Plugins.Geolocation.getCurrentPosition()` via the global object, never a static `import "@capacitor/..."`, since this file is also loaded unbundled by the plain web app; falls through unchanged to `navigator.geolocation` when the Capacitor global is absent)
- `src/correction.js` — `applyCorrection(tides, correction)`: opt-in secondary-port time-offset correction for a saved "home spot"; passthrough when `correction` is null/undefined
- `src/format.js` — `fmtTime(date, timezone)` and `fmtDistance(km)` (via `Intl`, never hardcode a timezone); `localDayISO(date, timezone)`, `groupByLocalDay(tides, timezone)`, and `fmtDayLabel(isoDay, timezone)` group/label tides by station-local calendar day (timezone-aware across UTC midnight)
- `src/cache-manifest.js` — `CACHE_VERSION` + `CACHE_ASSETS` (app-shell precache list) consumed by `sw.js`; `CACHE_VERSION` is rewritten by `scripts/build-data.mjs` on every successful data build, so regenerating the dataset auto-invalidates the runtime data cache; `CACHE_ASSETS` precaches all station indexes (`data/stations.json` TICON + `data/mi-stations.json` MI + `data/epa-stations.json` EPA)
- `src/ui.js` — DOM orchestration: `init()`, `showStation`, `renderHeader`, `renderDays`, `wireSearch`, `wireCountryFilter`, `wireDayCount`, `useMyLocation`; persists last-selected station (`rwb.selectedStationId`) and day-count choice (`rwb.days`, one of 1/3/5/7/10) in `localStorage`; `#country-filter` scopes search to one country and auto-sets to the resolved/saved station's own country (offline "detected country", no reverse-geocoding). `useMyLocation` is gesture-only (bound to a click, never called from `init()` on load) and always renders visible feedback — a "Locating…" status via `renderStatus`, then either the resolved station or an actionable, error-code-specific message from `geolocationErrorMessage` (`PERMISSION_DENIED`/`POSITION_UNAVAILABLE`/`TIMEOUT`) via `renderError` — instead of failing silently. `loadIndex()` fetches the TICON index (`data/stations.json`), the Marine Institute index (`data/mi-stations.json`), and the EPA West Cork index (`data/epa-stations.json`, optional — missing/404 defaults to `[]`) and merges them via `mergeStationIndexes(ticon, mi, epa)`, preference order **EPA > MI > TICON**: an entry is dropped if a higher-preference entry exists within `MI_OVERLAP_KM` (3km) by `haversineKm`. `loadStation(entry)` takes the merged index entry (not a bare id) and dispatches to `data/epa/<id>.json` / `data/mi/<id>.json` / `data/stations/<id>.json` by `entry.source`. `renderDays` takes a source-aware empty-state message (MI/EPA stations: "Marine Institute predictions cover 2026–2028. Pick a date in range." — both cover a fixed calendar window, not an open-ended prediction).
- `data/stations.json` + `data/stations/<id>.json` — TICON/NOAA station index + per-station harmonic constituents/datums/license
- `data/mi-stations.json` + `data/mi/<id>.json` — Marine Institute (+ OPW) station index + per-station precomputed hi-lo predictions (`tides: [[epochMs, heightMetres, "high"|"low"], ...]`, fixed 2026–2028 window); built by `scripts/build-mi.mjs`, all CC-BY-4.0
- `data/beaches.json` — flat array of EPA (Ireland) named bathing-water beaches (`{name, latitude, longitude, classification, url, country: "Ireland", type: "beach"}`), search-only aliases with no tide data of their own; built by `scripts/build-beaches.mjs`, CC-BY-4.0. Loaded by `src/ui.js`'s `loadIndex()` as an optional enhancement (missing/404 `data/beaches.json` defaults to `[]`, never breaks the rest of the app); a beach search result resolves via `nearestStation()` to its nearest station in the merged EPA/MI/TICON `index` — for West Cork beaches this now lands on an EPA model node (see below) rather than a distant real gauge — then renders that station's tides with the beach name threaded through as `locality` (`renderHeader`'s "`<beach> → nearest gauge: <station>`" form)
- `data/epa-stations.json` + `data/epa/<node>.json` — third offline prediction source: named West Cork EPA/Marine Institute hydrodynamic-model nodes (`source: "epa"`, `chart_datum: "Model MSL"`), each with its own precomputed `tides` extrema tuples (same `[epochMs, heightMetres, "high"|"low"]` shape as MI, fixed 2026–2028 window), CC-BY-4.0; built by `scripts/build-epa.mjs` from the ERDDAP `imiTidePredictionEpa` dataset's continuous `sea_surface_height` output (extracted via `extractExtrema`, not borrowed from a distant real gauge) — covers Baltimore/Schull/Crookhaven/Cape Clear (`NAMED_SPOTS`) plus every other node in the West Cork `BBOX`
- `scripts/build-data.mjs` — regenerates `data/stations*` from `@neaps/tide-database`; exports `isCommercialSafe(license)` and `inRegion(station)`; **excludes any CC-BY-NC-licensed station** (commercial-use safety for future monetization); region currently limited to `continent === "Europe"`
- `scripts/build-mi.mjs` — regenerates `data/mi/` + `data/mi-stations.json` from three raw Marine Institute/OPW hi-lo CSVs in `data/` (gitignored — re-download instructions from erddap.marine.ie are in the file header); exports `parseMiTimeUTC(value)` (parses the source "DD/MM/YYYY HH:MM" UTC timestamp) and `rowToTide(row)` (CSV row → compact tide tuple); same "only run when executed directly" guard as `build-data.mjs`
- `scripts/build-beaches.mjs` — regenerates `data/beaches.json` from the EPA (Ireland) GeoServer WFS endpoint (`EPA:BathingWaterQuality`, 150 named beaches); exports `featureToBeach(feature)` (WFS GeoJSON feature → compact beach record; handles both `MultiPoint` and `Point` geometries, returns `null` for unusable features so callers filter rather than write bad data)
- `scripts/build-epa.mjs` — regenerates `data/epa/` + `data/epa-stations.json` (see above); exports `inBbox`, `parseNodeListCsv`, `extractExtrema` (prominence-filtered high/low extraction off the raw continuous series, `MIN_PROMINENCE` 0.15m), `NAMED_SPOTS`, `BBOX`, `WINDOW_YEARS`; same "only run when executed directly" guard as the other build scripts
- `DATA-SOURCES.md` — per-data-source license/provenance log (TICON/NOAA, Marine Institute, EPA beaches, EPA West Cork tide model); update alongside any new `scripts/build-*.mjs` data source
- `test/` — Node-based headless tests (`node --test`), one test file per `src/` module + one per build script (`build-data`, `build-mi`, `build-beaches`, `build-epa`)
- `scripts/build-www.mjs` — packaging-only (not a data build): assembles the offline web app into `www/` (Capacitor's `webDir`) by copying `index.html`, `src/`, `data/`, `manifest.webmanifest`, `sw.js`, `icons/` from repo root, clean each run; GitHub Pages still serves the repo root directly and is untouched by this — `www/` is gitignored and native-build-only. Same "only run when executed directly" guard as `build-data.mjs`/`build-mi.mjs`
- `capacitor.config.json` — `{ appId: "com.cmurph00.rwbtides", appName: "RWB Tides", webDir: "www" }`
- `android/` — generated Capacitor Gradle project (via `npx cap add android` + `npx cap sync android`); the core project (`gradlew`, `build.gradle`, `AndroidManifest.xml`) is committed, generated-per-build artifacts (`app/build/`, `.gradle/`, `local.properties`, synced web-asset copy, cordova-plugins dir) are gitignored. `AndroidManifest.xml` has `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` added (alongside `INTERNET`) for `@capacitor/geolocation`
- `.github/workflows/android.yml` — CI workflow (manual `workflow_dispatch` + on `v*` tag push) that runs `npm run build:www` → `npx cap sync android` → `./gradlew assembleDebug` and uploads the unsigned debug APK as an artifact; no local Android SDK is required or used on dev machines, CI is the only place the actual Gradle build runs; pinned to Node 22 (Capacitor CLI requires ≥22) and JDK 21 (Capacitor 7 / AGP 8.13 target) — bump either only alongside the corresponding Capacitor/AGP upgrade
- `docs/BUILD-APK.md` — operator instructions for triggering the Android workflow and downloading/sideloading the resulting debug APK
- `docs/beach-validation.md` / `docs/marine-ie-data-audit.md` — dated validation/survey docs (not living architecture docs): the former cross-checks app-resolved beach tide timings against independent Marine Institute EPA ground truth; the latter surveys the wider ERDDAP catalog for future data-source candidates
- `docs/scratch/` — tracked (not gitignored, unlike `.superpowers/sdd/`) one-off Python analysis scripts backing the validation docs above (extrema extraction, comparison/matching, report formatting)
- `.superpowers/sdd/` — gitignored scratch dir for task-by-task implementation reports and throwaway scripts (e.g. `slice-engine.mjs` used once to extract the engine from `index.html`); not shipped, not part of the app

Key libs: `@neaps/tide-predictor` (MIT, harmonic engine, inlined) + `@neaps/tide-database` (devDependency only — NOAA + TICON-4 station data, used solely by `build-data.mjs`). Marine Institute/OPW data has no npm dependency — it's built from raw CSVs downloaded manually from the ERDDAP server (see `scripts/build-mi.mjs` header). Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/geolocation`, `@capacitor/cli`) wraps the same static web app for the Android build — no bundler, no code duplication.

Phase 2 (Android via Capacitor): landed — see `android/`, `capacitor.config.json`, `.github/workflows/android.yml` above. iOS wrap not yet started; browser-only APIs remain isolated in dedicated units like `location.js` so an iOS wrap shouldn't require rework.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Known bug motivating the redesign

Original app predicted from the Ringaskiddy gauge with a hand-tuned Baltimore offset
(`high: -4, low: -15`) that was actually Baltimore-relative-to-**Cobh**, not Ringaskiddy — missing the
Ringaskiddy→Cobh secondary-port correction (~12 min). Result: every predicted tide ran ~11–13 min late.
The global redesign fixes this by predicting directly from the nearest real gauge station instead of a
proxy-station-plus-hand-tuned-offset.
<!-- END AUTO-MANAGED -->
