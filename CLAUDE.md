<!-- AUTO-MANAGED: project-description -->
# Roaring Water Bay Tides

Offline-first tide predictor, evolved from a single-location (Baltimore, Co. Cork) GitHub Pages app
into a global tide predictor. Static site, no backend, installable as a PWA.

**Phase 1 (global predictor)**: complete and verified — engine extraction, NC-filtered European data
build, nearest-gauge location/search, offline resolver with optional API refinement, opt-in
secondary-port correction, formatting/UI wiring, an installable PWA manifest + offline service worker
(stale-while-revalidate app shell, cache-first station data), multi-day views (1/3/5/7/10 station-local
days), a browse-by-country dropdown with scoped search (later replaced by an Irish county filter,
Task 27 — see below), and country/county auto-default (from the last-saved station on reload, or via
an explicit "Use my location" tap — geolocation is gesture-only, never auto-run on load, since iOS
Safari blocks `getCurrentPosition` outside a user gesture) are all landed on `index.html` + `src/`,
with the full test suite passing and the app live-verified. Full task-by-task plan:
`docs/superpowers/plans/2026-07-14-global-tide-predictor.md` — fully executed, nothing outstanding.

**Marine Institute (Ireland) offline dataset**: landed — a second, precomputed data source (real
published tide-table predictions, CC-BY-4.0) merged alongside the harmonic TICON/NOAA dataset,
preferred for Irish stations. See Architecture below for the dual-source design. EPA-named-beach
search aliases (resolving to nearest real tide station) also landed.

**Phase 2 (Capacitor Android wrap)**: landed — `capacitor.config.json` + generated `android/` Gradle
project + a GitHub Actions workflow build the app into an installable debug APK (no local Android SDK
required; CI does the actual `gradlew assembleDebug`). `src/location.js`'s `detectLocation()` now
prefers the native Capacitor Geolocation plugin when running inside the wrapped app, falling through
unchanged to the browser `navigator.geolocation` path on the plain web app. iOS wrap not yet started.

**Play Store release prep (Task 25)**: landed — the app id (`applicationId` in
`android/app/build.gradle`, `appId` in `capacitor.config.json`) is now `com.rwbapps.rwbtides`, the
permanent Play package name (the code `namespace` stays `com.cmurph00.rwbtides` — harmless, Play only
reads `applicationId`; `MainActivity.java` stays under `com/cmurph00/rwbtides`). `android/app/build.gradle`
gained a guarded release `signingConfig` (keystore path/passwords from `ANDROID_KEYSTORE_PATH`/
`_PASSWORD`/`ANDROID_KEY_ALIAS`/`_PASSWORD` env vars, only attached when `ANDROID_KEYSTORE_PATH` is set,
so unsigned/debug builds are unaffected), and `AndroidManifest.xml` dropped `ACCESS_FINE_LOCATION` — the
app only ever needed an approximate position, so it now requests `ACCESS_COARSE_LOCATION` alone (plus
`INTERNET`). A new `.github/workflows/android-release.yml` ("Android release AAB", manual
`workflow_dispatch` + `v*` tag) builds a **signed** `.aab` for Play upload — distinct from the existing
`.github/workflows/android.yml` unsigned debug-APK workflow — decoding a base64 keystore secret to a temp
file and running `./gradlew bundleRelease`; it requires four repo secrets (`ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) that only the operator can
provide — the keystore itself is never committed. A new `privacy-policy.html` at the repo root, served
by GitHub Pages, states no data is collected or transmitted (coarse location stays on-device) and is
linked from `index.html`'s footer; `docs/PLAY-RELEASE.md` is the operator runbook (keystore generation,
the four secrets, triggering the release workflow, Play Console steps, pre-written Data Safety answers,
and a store-listing asset checklist — the 512×512 icon exists, the 1024×500 feature graphic is still
TODO).

**EPA node predictions (all-Ireland)**: landed (Task 18), fixed (Task 21), broadened (Task 24),
extended nationwide (Task 26) — a third offline prediction source, `data/epa/<node>.json` +
`data/epa-stations.json`, giving bathing beaches with no nearby real gauge their own EPA
hydrodynamic-model-node tide predictions instead of a distant gauge's table; index merge
preference is EPA > MI > TICON. Task 21 fixed two bugs found in validation: (1) peak/trough
times were quantized to the model's 10-minute sampling grid — extremes are now refined by
parabolic interpolation (plateau ties resolved to their time midpoint), landing within ~2min
of independently verified real tide times; (2) nodes were named after the nearest
hand-picked "village centre" coordinate, which mislabelled a genuinely offshore node as
"Baltimore" (~4km out, ~12km from any beach) — naming became purely
nearest-registered-bathing-beach within 2km, with no-match nodes dropped as OFFSHORE. Task 24
found that beach-only rule itself too aggressive against 14 real pro-app high-water times: it
dropped the Schull node (2.2km from Schull *town*, ~18km from any beach) even though it
predicts well (18:35 vs a verified real 18:37) — "far from a swimming beach" isn't "offshore".
The keep/naming rule (`labelNodeFromCoastalPlaces`) now checks proximity to ANY coastal
place — a register beach OR a GeoNames coastal-place gazetteer entry (`data/places.json`,
`scripts/build-places.mjs` — towns, harbours, bays, coves, islands, ...) — preferring a beach
name when one's in range. Task 26 widened `BBOX` from West Cork-only to all-Ireland
(`{minLat:51.2,maxLat:55.5,minLon:-10.7,maxLon:-5.9}`) and narrowed `WINDOW_YEARS` from three
years (2026–2028) to two (2026–2027) to cap bundle size now that the bbox covers the whole
country, and made `fetchText` retry once on a thrown network error (not just a non-ok HTTP
status) — a wider bbox means more per-node ERDDAP fetches, so a single flaky chunk is more
likely to hit at least once per run. 183 named nodes now survive nationwide (up from 32 West
Cork-only), with coverage verified around Dublin, Galway, and Donegal (each within ~4km of a
node) as well as the original West Cork set (Schull still predicts 18:35 vs a verified real
18:37). The hand-maintained `data/named-spots.json` (Baltimore/Schull/Crookhaven/Cape Clear) is
deleted — those are now ordinary GeoNames gazetteer entries, searchable (with alt-name
matching) like any other coastal place via `searchPlaces`. The UI still always shows the
resolved station's real source + type (`stationSourceLabel`: "beach model" vs "tide gauge")
alongside its distance, never a generic label. Followed on from the validation/survey work
in `docs/beach-validation.md` and `docs/marine-ie-data-audit.md`. UKHO/Admiralty-derived
reference values used to verify the nationwide rollout (`test/fixtures/reference-tides.json`,
`docs/PROJECT-STATUS.md`) are Crown Copyright and kept local-only (gitignored), never
published to this public repo.

**Offline SVG map picker (Task 19, substantially extended since)**: landed — a List/Map view
toggle (`#view-toggle`, persisted to `localStorage` under `rwb.view`, default `list`) lets a
user pick a station by tapping a marker on an inline SVG map of Ireland instead of only
searching/filtering-by-county. No map tiles, no canvas, no external map library: every
marker/land/label shape is a plain SVG DOM node styled entirely through the app's existing
theme CSS custom properties, so the map repaints correctly on the light/dark toggle with zero
extra rules. The map is now pannable/zoomable (`src/map.js`'s `attachPanZoom`) by rewriting the
SVG's own `viewBox` — drag or one-finger touch to pan, wheel or two-finger pinch to zoom about
the cursor/midpoint, double-tap/double-click to zoom in, on-map +/−/reset buttons, `MAX_ZOOM`
120 (matched to the coastline's own simplification resolution); markers and place labels are
counter-scaled via a single `--map-marker-scale` CSS custom property so they stay a roughly
constant on-screen size at any zoom; "Use my location" now also auto-zooms the map to a
regional view around the user (`USER_ZOOM`) rather than opening on the full-country view.
Markers cover only Ireland's own gauges (Marine Institute + Irish TICON entries, rendered as
circles) and EPA beach-model nodes (rendered as triangles) — `mapMarkerSources(index)`
partitions the already-merged EPA>MI>TICON index for this; non-Irish TICON entries and the
beaches/places text-search gazetteer are deliberately never plotted as markers (too dense, per
spec — search remains the only way to reach them), though GeoNames towns and named islands
*are* plotted as population/area-tiered labels (see below). The projection math (`project`,
`computeViewBox`) lives in the pure, unit-tested `src/geo.js`; the DOM-building/interaction
(`buildMapSvg`, `attachPanZoom`, `renderMap`) lives in `src/map.js`, which — like the rest of
`src/ui.js`'s render functions — has no `node --test` coverage of its own (DOM-only, exercised
by the live app/verify step). A dedicated low-water/foreshore overlay and population-tiered
town/island labels were added on top of this base map — see their own paragraphs below.

**Page reframe (Task 23)**: landed — the page heading is now "Ireland's Tides" (`<title>` +
`index.html`'s visible heading), the footer reads "Made in Roaring Water Bay", and the
installed-app name (`manifest.webmanifest`'s `name`/`short_name`, `capacitor.config.json`'s
`appName`) stays "RWB Tides" — the two names deliberately diverge (in-page framing vs.
installed-app identity).

**County filter (Task 27)**: landed — `#county-filter` replaced the old country dropdown for
scoping search: `scripts/build-places.mjs`'s `COUNTY_BY_CODE` + `countyForRow` derive each
GeoNames place's Irish county from its admin1/admin2 codes and stamp it onto `data/places.json`
entries; `src/ui.js`'s `assignCounties(index, places)` (from `src/location.js`) then tags each
in-bbox Irish station with the county of its nearest county-bearing gazetteer place, within
`COUNTY_MAX_KM` (25km) — a station with no county-bearing place that close, or a `places.json`
with no `county` field at all (an older cached build predating this), is left without a
`county` and simply doesn't appear in the dropdown, rather than erroring; `src/location.js`
exports `distinctCounties`/`filterByCounty` alongside `assignCounties`. Non-Irish TICON stations
fall outside `assignCounties`' bbox pre-filter and so never get a county.

**Population-tiered place labels + named islands**: landed — the map now draws GeoNames town
labels and OSi/Tailte Éireann named-island labels, both zoom-gated by tier so the full-country
view only shows a handful of big names and smaller ones reveal as you zoom in.
`scripts/build-places.mjs` now parses each GeoNames row's population (`rowToPlace` sets `pop`
when `> 0`) and splits populated-place codes into `kind: "town"` (real settlements) vs.
`kind: "locality"` (PPLL crossroads/townlands/PPLX sections/PPLF farms — still searchable, but
never map-labelled); `src/map.js` applies a `MIN_LABEL_POP` (150) floor to drop the huge tail of
pop-0/sub-threshold GeoNames noise, then buckets survivors into tiers (`townTier`) revealed at
increasing zoom (`TIER_ZOOM`). `data/ireland-outline.json`'s new `islands` array (see below)
gets the same tiered-label treatment via `islandTier`, drawn as italic text keyed off the
island's own area rather than population.

**Coastline data upgraded to include named islands (`data/ireland-outline.json` reshaped)**:
the file is now `{ bbox, polylines, islands }`. `polylines` (mainland + major-landmass rings) is
built from the Natural Earth **1:10m Coastline** dataset's largest Ireland-bbox ring — the
Minor Islands dataset used previously was dropped in favour of a richer, Ireland-specific
source: `islands` is built from the OSi/Tailte Éireann **"Islands, National 250k Map of
Ireland"** dataset (CC-BY-4.0, manual download at `data/osi-islands-raw.geojson`, gitignored),
giving 312 named island polygons — including small West Cork ones the old minor-islands source
never carried — each reduced to a labelled point (`{name, lat, lon, tier}`, tier from
`islandTier` by polygon area) via `scripts/build-coastline.mjs`'s `selectIslandPolygons` +
`extractNamedIslands`. Coastline simplification tolerance tightened to 0.001° for a crisper
render, and the coastline stroke now uses `vector-effect: non-scaling-stroke` (fixed a "clunky
blobs" render bug at high zoom); the map's sea/land/coastline colors are dedicated
`--map-sea`/`--map-land`/`--map-coast` theme custom properties, tuned separately for dark-mode
contrast. `DATA-SOURCES.md` credits Tailte Éireann/OSi for the islands layer.

**Low-water/foreshore overlay**: landed — a new, deliberately subtle **planning-only** map
layer ("not for navigation": the app carries no soundings, hazards, or chart datum). Built by
`scripts/build-lowwater.mjs` into `data/low-water.json` from the OSi/Tailte Éireann "Low Water
Mark" dataset (CC-BY-4.0, manual download at `data/osi-lowwater-raw.geojson`, gitignored,
272MB) — inland lake/river low-water marks are discarded via a coast-proximity grid test
against the OSi Coast dataset, tiny isolated rocks/pools are dropped, and the ~114k source
LineStrings are simplified down to ~4,635 coastal lines. Rendered by `src/map.js` as a
zoom-gated line (`.map-lowwater`/`.show-lowwater`, revealed only past `LOWWATER_ZOOM`, since at
country scale it just retraces the coast). `DATA-SOURCES.md` credits Tailte Éireann/OSi for
this layer too.

**Accuracy validation + per-spot source overrides (Task 22)**: landed — a new resolution
module, `src/resolve-spot.js`, exports `resolveSpot(lat, lon, index, overrides)` +
`OVERRIDE_RADIUS_KM` (2km): the single station-resolution path now used by both search-alias
clicks (`wireLocalityClick`) and geolocation (`useMyLocation`) in `src/ui.js`, replacing their
previous direct `nearestStation()` calls. It pins a query point to a validated override station
when within `OVERRIDE_RADIUS_KM` of a listed spot, else falls through to the geometric
`nearestStation()`, returning `{station, distanceKm, overridden?}`. The overrides themselves
live in `data/spot-overrides.json` — a flat `[{name, lat, lon, station}]` array, precached like
the other search-alias data files (optional enhancement, `[]` if absent) — currently pinning
Baltimore and Castletownshend to the Marine Institute `Union_Hall` gauge (their geometrically
nearest EPA/TICON source reads 16–25min early) and Crookhaven/Roberts Cove to their own
better-fitting EPA/MI stations. This is a routing decision (spot → station id), **not** shipped
tide data. Validated against a new end-to-end regression test, `test/accuracy.test.js`: resolves
each of 14 operator-supplied real pro-app reference points (`test/fixtures/reference-tides.json`
— UKHO/Admiralty Crown Copyright, gitignored, values never quoted in this repo; the test SKIPS
cleanly when the fixture is absent) through `resolveSpot` → `getTides` and asserts the predicted
evening high-water median error is ≤6min and worst-case ≤10min. `test/resolve-spot.test.js`
unit-tests `resolveSpot` in isolation.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

- `index.html` — UI shell; loads `src/ui.js` via a single `<script type="module">import { init } from "./src/ui.js"; init();</script>` (previously contained the inlined engine + old single-station app; now generalized to any station). Visible heading is "Ireland's Tides" (Task 23; the installed-app name stays "RWB Tides" — see `manifest.webmanifest`/`capacitor.config.json`), footer reads "Made in Roaring Water Bay". Task 19 added a `#view-toggle` (List/Map pill buttons) above `.controls`, wrapped the search fields (now scoped by `#county-filter`, Task 27 — see below) in a new `#list-panel` sub-flex-container (so the toggle can hide/show them as one unit without disturbing `.controls`' own layout), and added a `#map-panel` (hidden by default) holding `#map-svg-container`, a `#map-hint` caption, `.map-zoom-controls` (+/−/reset, added with the pan/zoom map), and a `.map-legend`; all new map CSS reuses existing theme custom properties plus a few dedicated ones added since (`--map-sea`/`--map-land`/`--map-coast`, tuned per light/dark theme), no ad hoc one-off colors
- `src/engine.js` — inlined `@neaps/tide-predictor` harmonic math (MIT), unchanged. `useStation(station)` → `getExtremesPrediction({start, end})`
- `src/resolver.js` — `getTides(station, range, apiConfig)` branches on data source: if `station.tides` is an array (Marine Institute OR EPA precomputed stations — same tuple shape, resolver doesn't distinguish them), slices it directly to the range via `precomputedTides` — this check runs BEFORE any online-refinement attempt, so MI/EPA stations never call `apiConfig.fetchExtremes` even when online; otherwise runs the offline harmonic engine, with optional online API refinement (`apiConfig.fetchExtremes`) attempted only when `navigator.onLine`, silent fallback to offline on any error
- `src/location.js` — `haversineKm`, `nearestStation`, `searchStations`, `searchBeaches` (EPA-named-beach search, same substring-match shape but name-only, no country axis), `searchPlaces` (Task 24 — GeoNames coastal-place gazetteer search, same shape as `searchBeaches` but also matches a place's alternate names, e.g. an Irish-language name), `detectLocation` (isolates the browser geolocation API in one unit; on a native Capacitor shell — `globalThis.Capacitor?.isNativePlatform?.()` true with the Geolocation plugin registered — uses `Capacitor.Plugins.Geolocation.getCurrentPosition()` via the global object, never a static `import "@capacitor/..."`, since this file is also loaded unbundled by the plain web app; falls through unchanged to `navigator.geolocation` when the Capacitor global is absent), and (Task 27) `assignCounties(stations, places)`/`distinctCounties`/`filterByCounty` — `assignCounties` tags each Irish station with the county of its nearest county-bearing `data/places.json` entry (pre-filtered to a cheap all-Ireland bbox so non-Irish stations are skipped), backing the `#county-filter` dropdown that replaced the old country dropdown
- `src/correction.js` — `applyCorrection(tides, correction)`: opt-in secondary-port time-offset correction for a saved "home spot"; passthrough when `correction` is null/undefined
- `src/format.js` — `fmtTime(date, timezone)` and `fmtDistance(km)` (via `Intl`, never hardcode a timezone); `localDayISO(date, timezone)`, `groupByLocalDay(tides, timezone)`, and `fmtDayLabel(isoDay, timezone)` group/label tides by station-local calendar day (timezone-aware across UTC midnight)
- `src/geo.js` — Task 19. Pure geo/projection helpers for the offline SVG map picker, no DOM/no I/O, unit-tested (`test/geo.test.js`): `project(lat, lon, viewBox)` (equirectangular projection, no cos(lat) correction — deliberately simple/invertible; y is flipped so north renders at the top of the map) and `computeViewBox(bbox, targetWidth)` (derives a pixel height from the target width using a cos(mid-latitude) aspect correction so the rendered map isn't visibly stretched). Shared between `scripts/build-coastline.mjs`'s consumer (`src/map.js`) and the test suite.
- `src/map.js` — Task 19, substantially extended since. Offline SVG map picker: `buildMapSvg({outline, gauges, beachModel, places, lowWater, userLocation, onSelect, onHover})` returns `{svg, controller}`, and `renderMap(container, options)` mounts it plus its `.map-zoom-controls` (+/−/reset buttons). No map tiles, no canvas, no external map library — every element is a plain SVG DOM node styled entirely via the app's existing theme CSS custom properties (repaints correctly on light/dark toggle for free). Gauges render as circles, EPA beach-model nodes as upward triangles (visually distinguished per spec); markers carry a generous invisible tap-target circle layered under the small visible shape for mobile hit-testing (West Cork's marker density), and are keyboard-accessible (`tabindex`, `role="button"`, Enter/Space activates). `attachPanZoom(svg, {W, H, viewBox, userLocation})` wires viewBox-based pan/zoom (drag/one-finger touch to pan; wheel and two-finger pinch to zoom about the cursor/pinch-midpoint; double-tap/double-click to zoom in; `MAX_ZOOM` 120, matched to the coastline's own simplification resolution) and sets a `--map-marker-scale` CSS custom property each frame so markers/town-labels/island-labels counter-scale to a roughly constant on-screen size; it also toggles `.tier-1`/`.tier-2`/`.tier-3` (population/area-tiered place labels, see `townTier`/`MIN_LABEL_POP`) and `.show-lowwater` (the low-water overlay, see `LOWWATER_ZOOM`) as the current zoom crosses their thresholds. Opening the map with a known `userLocation` (from "Use my location") auto-zooms to a regional view (`USER_ZOOM`) instead of the full-country view. Imports `project`/`computeViewBox` from `src/geo.js`. DOM-only — like the rest of `src/ui.js`'s render functions, this file has no `node --test` coverage of its own; it's exercised by the live app/verify step instead.
- `src/resolve-spot.js` — Task 22. `resolveSpot(lat, lon, index, overrides)` + `OVERRIDE_RADIUS_KM` (2km): the single station-resolution path used by both search-alias clicks (`wireLocalityClick`) and geolocation (`useMyLocation`) in `src/ui.js`. Pins to a validated override station (`data/spot-overrides.json`, below) when the query point is within `OVERRIDE_RADIUS_KM` of a listed spot, else falls through to `nearestStation()`; returns `{station, distanceKm, overridden?}`. Pure, unit-tested (`test/resolve-spot.test.js`).
- `src/cache-manifest.js` — `CACHE_VERSION` + `CACHE_ASSETS` (app-shell precache list) consumed by `sw.js`; `CACHE_VERSION` is rewritten by `scripts/build-data.mjs` on every successful data build, so regenerating the dataset auto-invalidates the runtime data cache; `CACHE_ASSETS` precaches all station indexes (`data/stations.json` TICON + `data/mi-stations.json` MI + `data/epa-stations.json` EPA) plus the search-alias data files (`data/beaches.json`, `data/places.json`) plus, since Task 19, the map picker's coastline outline (`data/ireland-outline.json`) and its two source modules (`src/geo.js`, `src/map.js`), plus (added since) `data/low-water.json` (foreshore overlay) and `data/spot-overrides.json` (Task 22 per-spot source overrides)
- `src/ui.js` — DOM orchestration: `init()`, `showStation`, `renderHeader`, `renderDays`, `wireSearch`, `wireCountyFilter`, `wireDayCount`, `useMyLocation`; persists last-selected station (`rwb.selectedStationId`) and day-count choice (`rwb.days`, one of 1/3/5/7/10) in `localStorage`; `#county-filter` (Task 27, replaced the old `#country-filter`) scopes search to one Irish county via `filterByCounty`/`selectedCounty`/`setCountyFilter`, and auto-sets to the resolved/saved station's own `county` field (assigned in `loadIndex` via `assignCounties`, offline, no reverse-geocoding). `useMyLocation` is gesture-only (bound to a click, never called from `init()` on load) and always renders visible feedback — a "Locating…" status via `renderStatus`, then either the resolved station or an actionable, error-code-specific message from `geolocationErrorMessage` (`PERMISSION_DENIED`/`POSITION_UNAVAILABLE`/`TIMEOUT`) via `renderError` — instead of failing silently. `loadIndex()` fetches the TICON index (`data/stations.json`), the Marine Institute index (`data/mi-stations.json`), and the EPA index (`data/epa-stations.json`, optional — missing/404 defaults to `[]`) and merges them via `mergeStationIndexes(ticon, mi, epa)`, preference order **EPA > MI > TICON**: an entry is dropped if a higher-preference entry exists within `MI_OVERLAP_KM` (3km) by `haversineKm`. `loadStation(entry)` takes the merged index entry (not a bare id) and dispatches to `data/epa/<id>.json` / `data/mi/<id>.json` / `data/stations/<id>.json` by `entry.source`. `renderDays` takes a source-aware empty-state message (MI/EPA stations: "Marine Institute predictions cover 2026–2028. Pick a date in range." — both cover a fixed calendar window, not an open-ended prediction). `loadIndex()` also loads `data/beaches.json` and `data/places.json` (Task 24, superseded `data/named-spots.json`) as two independent optional search-alias layers (each missing/404 defaults to `[]`), and — since Task 27 — calls `assignCounties(index, places)` to stamp each Irish station with a `county` for the filter above. Exported `stationSourceLabel(station)` returns `"beach model"` for `source: "epa"` stations, else `"tide gauge"` — used so `renderHeader` always shows the real underlying source type (never a generic "gauge" label for an EPA model node), e.g. `"Baltimore → Tragumna (beach model, 8 km) · heights vs Model MSL"`. The shared click-handler `wireLocalityClick(li, item, notFoundMessage)` resolves any search-only-alias item (`{name, latitude, longitude}`, beach or gazetteer place) to its station via `resolveSpot()` (Task 22 — see `src/resolve-spot.js`; supersedes a plain `nearestStation()` call so validated per-spot overrides apply here too), then shows that station with the alias's name threaded through as `locality`; `renderStationList(stations, beachResults, placeResults)` renders beach results with a "🏖" prefix and gazetteer-place results with a "📍" prefix, both via `wireLocalityClick`, both explicitly excluded from `#county-filter` scoping (global alias layers, no county axis). Task 19 (offline SVG map picker) added, and later work extended: module state `outline` (parsed `data/ireland-outline.json`, or null on missing/404 — same optional-enhancement contract as beaches/places), `lowWater` (parsed `data/low-water.json`'s `lines`, `[]` if absent), `overrides` (parsed `data/spot-overrides.json`, `[]` if absent — Task 22, passed into every `resolveSpot()` call), and `currentUserLocation` (`{lat, lon}` or null, set by `useMyLocation`, distinct from `currentSelection` which tracks the selected station not the user); `loadIndex()` fetches all of these under the same optional-enhancement contract; exported pure `mapMarkerSources(index)` partitions the merged index into `{gauges, beachModel}` for the map (see Architecture note on `src/map.js`); `LS_VIEW_KEY` (`rwb.view`, one of `VALID_VIEWS` `["list","map"]`, default `"list"`) persists the chosen view; `isMapViewActive`/`renderMapView`/`getStoredView`/`setView`/`wireViewToggle` drive the `#view-toggle` — `setView` toggles `#list-panel`/`#map-panel` `hidden` and lazily renders the map SVG only on switching to it; `renderMapView` passes `places` and `lowWater` into `buildMapSvg` alongside `outline`/gauges/beachModel so the map can draw town/island labels and the foreshore overlay; `useMyLocation` now also updates `currentUserLocation` and refreshes the map if it's on screen.
- `data/stations.json` + `data/stations/<id>.json` — TICON/NOAA station index + per-station harmonic constituents/datums/license
- `data/mi-stations.json` + `data/mi/<id>.json` — Marine Institute (+ OPW) station index + per-station precomputed hi-lo predictions (`tides: [[epochMs, heightMetres, "high"|"low"], ...]`, fixed 2026–2028 window); built by `scripts/build-mi.mjs`, all CC-BY-4.0
- `data/beaches.json` — flat array of EPA (Ireland) named bathing-water beaches (`{name, latitude, longitude, classification, url, country: "Ireland", type: "beach"}`), search-only aliases with no tide data of their own; built by `scripts/build-beaches.mjs`, CC-BY-4.0. Loaded by `src/ui.js`'s `loadIndex()` as an optional enhancement (missing/404 `data/beaches.json` defaults to `[]`, never breaks the rest of the app); a beach search result resolves via `resolveSpot()` (Task 22, supersedes a plain `nearestStation()` call so a validated per-spot override applies here too) to its station in the merged EPA/MI/TICON `index` — for a beach near an EPA node (nationwide since Task 26, previously West Cork-only) this now lands on an EPA model node (see below) rather than a distant real gauge — then renders that station's tides with the beach name threaded through as `locality` (`renderHeader`, via `stationSourceLabel`, shows the resolved station's real source type alongside the name)
- `data/places.json` — flat array, GeoNames Ireland coastal-place gazetteer (`{name, latitude, longitude, kind, alt?, pop?, county?}`), built by `scripts/build-places.mjs`, CC-BY-4.0. Superseded the Task 21 hand-maintained `data/named-spots.json` (4 towns, eyeballed coordinates) — Task 24. Same search-only-alias contract as `data/beaches.json`, matched via `searchPlaces()` in `src/ui.js` (name + alternate-name substring match, "📍"-prefixed / `wireLocalityClick` handling): resolves at click-time via `resolveSpot()` (Task 22) over the merged EPA/MI/TICON `index` to whichever real prediction point is actually closest, subject to any validated per-spot override. `kind` is one of `town` (real GeoNames settlements), `locality` (GeoNames crossroads/townlands/sections/farms — PPLL/PPLX/PPLF — searchable but never map-labelled), or a curated marine feature (`bay`/`harbour`/`cove`/`island`/`point`/`cape`/`beach`/`port`/... — see `COASTAL_FEATURE_KIND` in the build script); `alt` (optional) holds a short list of alternate names (e.g. an Irish-language name) worth matching on; `pop` (optional, `> 0` only) is the row's GeoNames population, used by `src/map.js` to tier which town labels show at which zoom; `county` (optional, Task 27) is the row's Irish county derived from its GeoNames admin1/admin2 codes (`COUNTY_BY_CODE`/`countyForRow`), feeding `assignCounties()`'s station tagging in `src/ui.js`. Filtered to places within `COASTAL_RADIUS_KM` (8km) of a real prediction source (EPA all-Ireland bbox candidate nodes + `data/mi-stations.json` + Irish `data/stations.json` entries) — inland GeoNames entries are dropped since a tide search there is meaningless.
- `data/epa-stations.json` + `data/epa/<node>.json` — third offline prediction source: named all-Ireland EPA/Marine Institute hydrodynamic-model nodes (`source: "epa"`, `chart_datum: "Model MSL"`), each with its own precomputed `tides` extrema tuples (same `[epochMs, heightMetres, "high"|"low"]` shape as MI, fixed 2026–2027 window since Task 26), CC-BY-4.0; built by `scripts/build-epa.mjs` from the ERDDAP `imiTidePredictionEpa` dataset's continuous `sea_surface_height` output (extracted via `extractExtrema`, not borrowed from a distant real gauge). Every shipped node is named by proximity to a registered bathing-water beach OR a GeoNames coastal place (`labelNodeFromCoastalPlaces`, below, Task 24 — broadened from the Task 21 beach-only rule) — a node with no beach or place within `COASTAL_NAME_RADIUS_KM` (2km) is OFFSHORE and dropped entirely at build time rather than mislabelled. 183 nodes currently survive nationwide (up from 32 West Cork-only pre-Task 26, up from 15 under the old beach-only rule before that).
- `data/ireland-outline.json` — Task 19, reshaped since. `{ bbox, polylines, islands }` consumed by `src/geo.js`'s `computeViewBox`/`src/map.js`'s land + island-label rendering; built by `scripts/build-coastline.mjs`. `polylines` (mainland + major landmasses) comes from the Natural Earth 1:10m Coastline dataset (public domain, no attribution required); `islands` (`[{name, lat, lon, tier}]`, 312 entries) comes from the OSi/Tailte Éireann "Islands, National 250k Map of Ireland" dataset (CC-BY-4.0, manual download, gitignored) — replaced the Natural Earth Minor Islands source, giving denser, named coverage of small West Cork islands.
- `data/low-water.json` — `{ lines: [[[lat,lon], ...], ...] }`, ~4,635 simplified coastal low-water-mark polylines, rendered by `src/map.js` as a zoom-gated **planning-only** overlay ("not for navigation"); built by `scripts/build-lowwater.mjs` from the OSi/Tailte Éireann "Low Water Mark" dataset (CC-BY-4.0, manual download, gitignored, 272MB raw), with inland lake/river marks discarded via a coast-proximity grid test.
- `data/spot-overrides.json` — Task 22. Flat array of validated per-spot source overrides (`[{name, lat, lon, station}]`) consumed by `src/resolve-spot.js`'s `resolveSpot()`; a routing decision (spot → station id) derived from real reference-tide validation, not shipped tide data itself.
- `scripts/build-data.mjs` — regenerates `data/stations*` from `@neaps/tide-database`; exports `isCommercialSafe(license)` and `inRegion(station)`; **excludes any CC-BY-NC-licensed station** (commercial-use safety for future monetization); region currently limited to `continent === "Europe"`. `buildAttribution()` also regenerates `DATA-SOURCES.md` from whichever of `data/mi-stations.json`/`data/beaches.json`/`data/epa-stations.json`/`data/places.json` are present (counts snapshotted before the `data/` wipe) — this is a destructive rebuild of `data/`, so any of those datasets must be re-generated by their own build script afterwards
- `scripts/build-mi.mjs` — regenerates `data/mi/` + `data/mi-stations.json` from three raw Marine Institute/OPW hi-lo CSVs in `data/` (gitignored — re-download instructions from erddap.marine.ie are in the file header); exports `parseMiTimeUTC(value)` (parses the source "DD/MM/YYYY HH:MM" UTC timestamp) and `rowToTide(row)` (CSV row → compact tide tuple); same "only run when executed directly" guard as `build-data.mjs`
- `scripts/build-beaches.mjs` — regenerates `data/beaches.json` from the EPA (Ireland) GeoServer WFS endpoint (`EPA:BathingWaterQuality`, 150 named beaches); exports `featureToBeach(feature)` (WFS GeoJSON feature → compact beach record; handles both `MultiPoint` and `Point` geometries, returns `null` for unusable features so callers filter rather than write bad data)
- `scripts/build-places.mjs` — regenerates `data/places.json` (Task 24, see above) from the GeoNames Ireland country dump (`https://download.geonames.org/export/dump/IE.zip`, downloaded + unzipped via `child_process` `unzip` to gitignored `data/IE.zip`/`data/IE.txt` — build-time only, no npm dependency); exports `parseGeonamesLine`, `kindForRow`/`COASTAL_FEATURE_KIND` (curated GeoNames feature-code → kind map — real populated-place codes are `"town"`, PPLL/PPLX/PPLF crossroads/townlands/farms are `"locality"` — searchable, never map-labelled, see `MIN_LABEL_POP` in `src/map.js`; H/T/L classes keep only marine-relevant codes like `BAY`/`HBR`/`COVE`/`ISL`/`PT`/`CAPE`/`PRT`, dropping inland terrain/water), `altNamesForRow` (extracts a capped, deduped alt-name list from GeoNames' `alternatenames` column), `rowToPlace` (also stamps `pop` from the row's population, only when `> 0`, and `county` via `countyForRow` below), `COUNTY_BY_CODE`/`countyForRow` (Task 27 — maps a GeoNames admin1.admin2 code pair to its Irish county; Republic-of-Ireland only, the IE dump carries no Northern Ireland rows), `isNearAnySource`/`COASTAL_RADIUS_KM` (the coastal proximity filter — pure, unit-tested), `placeDedupKey`/`dedupPlaces`. Its `loadPredictionSources()` combines `fetchBboxNodes()` (imported from `build-epa.mjs` — the *raw* ERDDAP all-Ireland bbox candidate list, not the already-filtered `data/epa-stations.json`) with `data/epa-stations.json`/`data/mi-stations.json`/Irish `data/stations.json` entries; using the raw candidate list (not just already-kept/named EPA nodes) is what breaks an otherwise-circular dependency with `build-epa.mjs`'s keep-rule below (a town needs to already be in `data/places.json` to keep a nearby EPA node, but a node's true position is often closer to a town than any *already-published* prediction source is)
- `scripts/build-epa.mjs` — regenerates `data/epa/` + `data/epa-stations.json` (see above); exports `NODE_LIST_URL`, `fetchBboxNodes()` (network fetch of the bbox candidate node list, reused by `build-places.mjs`, see above), `inBbox`, `parseNodeListCsv`, `extractExtrema` (prominence-filtered high/low extraction off the raw continuous series, `MIN_PROMINENCE` 0.15m), `labelNodeFromCoastalPlaces(node, beaches, places, maxKm = COASTAL_NAME_RADIUS_KM)` (pure, no I/O — names a node after the nearest `data/beaches.json` entry within `maxKm`, preferring a beach over a `data/places.json` entry when both are in range; returns `null` meaning OFFSHORE/drop only when neither is), `COASTAL_NAME_RADIUS_KM` (2km, Task 24 — renamed/broadened from Task 21's beach-only `BEACH_NAME_RADIUS_KM`), `BBOX` (Task 26 — widened from a West Cork-only box to all-Ireland, `{minLat:51.2,maxLat:55.5,minLon:-10.7,maxLon:-5.9}`), `WINDOW_YEARS` (Task 26 — narrowed from 3 years `[2026,2027,2028]` to 2 `[2026,2027]` to cap bundle size now that `BBOX` covers the whole country); `build()` labels every bbox node via `labelNodeFromCoastalPlaces` before fetching any series data, so an ERDDAP fetch is never spent on a node that's going to be dropped as offshore. `fetchText` (internal) retries once on a thrown network error, not just a non-ok HTTP status, since the wider all-Ireland bbox means more per-node fetches per run. Same "only run when executed directly" guard as the other build scripts
- `scripts/build-coastline.mjs` — Task 19, islands source swapped since. Regenerates `data/ireland-outline.json`'s `{ bbox, polylines, islands }`. `polylines` comes from the Natural Earth **1:10m Coastline** dataset (`COASTLINE_URL`, public domain, fetched from the `nvkelso/natural-earth-vector` GitHub mirror, mainland + major landmasses, LineStrings). Deliberately uses the *coastline* dataset rather than `admin_0_countries`/`admin_0_map_subunits`: Ireland is split across two Natural Earth political subunits (the Republic, and Northern Ireland as part of the UK), and rendering those as separate filled polygons would draw a visible political-border seam down the middle of the island — the coastline dataset has no political content, just closed rings per landmass. `islands` now comes from the OSi/Tailte Éireann "Islands, National 250k Map of Ireland" dataset (CC-BY-4.0, manual download at gitignored `data/osi-islands-raw.geojson`) rather than Natural Earth's 1:10m Minor Islands — a richer, Ireland-specific source giving 312 named island polygons (including small West Cork ones people actually stand on — Sherkin, Cape Clear, Bere, ... — that Minor Islands never carried) each reduced to a single labelled point. "Which rings/polygons are Ireland" is answered geometrically (`bboxContained`) against `IRELAND_FILTER_BBOX`: `selectIrelandRings` for the coastline LineStrings, `selectIslandPolygons` for the OSi Polygon/MultiPolygon features (outer ring only, same bbox test, returned in the same `[lat,lon]` shape as the coastline rings), `extractNamedIslands` (pulls each OSi feature's name + centroid + area) and `islandTier(area)` (area → label tier, consumed by `src/map.js`'s zoom-gated island labels). Shared download helper `downloadJson(url, path, label)` writes each raw response to its own gitignored cache file. Rings are simplified via Ramer-Douglas-Peucker (`SIMPLIFY_TOLERANCE_DEG`, tightened to 0.001° for a crisper render — West Cork's peninsula/inlet detail matters most to this app). **Two-tier fail behavior**: the core coastline dataset still **blocks (exit 1)** if its download fails or no Ireland-shaped ring is found — no hand-drawn placeholder fallback, since an offline map is only honest if the coastline it shows is real; the OSi islands dataset is a **best-effort enhancement layer** — if that file is missing, `build()` only warns and ships mainland-only (no named islands) rather than blocking the whole build.
- `scripts/build-lowwater.mjs` — regenerates `data/low-water.json` (see above) from two OSi/Tailte Éireann datasets (both CC-BY-4.0, manual downloads, gitignored): the Low Water Mark dataset (`data/osi-lowwater-raw.geojson`, 272MB, ~114k LineStrings) and the Coast dataset (`data/osi-coast-raw.geojson`), the latter only used to build a coast-proximity spatial index (`buildCoastGrid`/`nearCoast`, ~1.1km grid cells) so inland lake/river low-water marks can be told apart from real coastal ones and discarded — an operator instruction, since the raw dataset is mostly inland water. Also drops tiny isolated rocks/tide-pools below `MIN_DIAG_DEG` extent, then simplifies each surviving line via `simplifyPolyline` (imported from `build-coastline.mjs`, `SIMPLIFY_TOLERANCE_DEG` 0.0015° — context, not precision geometry). Needs a larger heap than the other build scripts to hold the raw 272MB source: `node --max-old-space-size=6144 scripts/build-lowwater.mjs`.
- `DATA-SOURCES.md` — per-data-source license/provenance log (TICON/NOAA, Marine Institute, EPA beaches, EPA all-Ireland tide model, GeoNames coastal places, and — added since — Tailte Éireann/OSi for the named-islands and low-water layers); update alongside any new `scripts/build-*.mjs` data source
- `test/` — Node-based headless tests (`node --test`), one test file per `src/` module + one per build script (`build-data`, `build-mi`, `build-beaches`, `build-epa`, `build-places`, `geo`, `build-coastline`, `build-lowwater`, and, since Task 22, `resolve-spot` + `accuracy` — the latter an end-to-end regression that SKIPS when its gitignored Crown Copyright fixture is absent, see the Task 22 paragraph above); `src/map.js` has no dedicated test file (DOM-only, see its Architecture entry above)
- `scripts/build-www.mjs` — packaging-only (not a data build): assembles the offline web app into `www/` (Capacitor's `webDir`) by copying `index.html`, `src/`, `data/`, `manifest.webmanifest`, `sw.js`, `icons/` from repo root, clean each run; GitHub Pages still serves the repo root directly and is untouched by this — `www/` is gitignored and native-build-only. Same "only run when executed directly" guard as `build-data.mjs`/`build-mi.mjs`
- `capacitor.config.json` — `{ appId: "com.rwbapps.rwbtides", appName: "RWB Tides", webDir: "www" }` (Task 25 — `appId` changed from the placeholder `com.cmurph00.rwbtides` to the permanent Play Store package name)
- `android/` — generated Capacitor Gradle project (via `npx cap add android` + `npx cap sync android`); the core project (`gradlew`, `build.gradle`, `AndroidManifest.xml`) is committed, generated-per-build artifacts (`app/build/`, `.gradle/`, `local.properties`, synced web-asset copy, cordova-plugins dir) are gitignored. `AndroidManifest.xml` requests `ACCESS_COARSE_LOCATION` (alongside `INTERNET`) for `@capacitor/geolocation` — `ACCESS_FINE_LOCATION` was dropped (Task 25): the app only ever needs an approximate position, and coarse-only keeps the Play Data Safety footprint minimal. `app/build.gradle`'s `applicationId` is `com.rwbapps.rwbtides` (Task 25, the permanent Play package name — the `namespace` stays `com.cmurph00.rwbtides`, harmless since Play only reads `applicationId`), and it gained a guarded release `signingConfig` (reads the keystore from `ANDROID_KEYSTORE_PATH`/`_PASSWORD`/`ANDROID_KEY_ALIAS`/`_PASSWORD` env vars, only attached to the `release` build type when `ANDROID_KEYSTORE_PATH` is set — unsigned/debug builds are unaffected) consumed by the release workflow below
- `.github/workflows/android.yml` — CI workflow (manual `workflow_dispatch` + on `v*` tag push) that runs `npm run build:www` → `npx cap sync android` → `./gradlew assembleDebug` and uploads the unsigned debug APK as an artifact; no local Android SDK is required or used on dev machines, CI is the only place the actual Gradle build runs; pinned to Node 22 (Capacitor CLI requires ≥22) and JDK 21 (Capacitor 7 / AGP 8.13 target) — bump either only alongside the corresponding Capacitor/AGP upgrade
- `.github/workflows/android-release.yml` — Task 25. Signed-AAB release workflow (manual `workflow_dispatch` + `v*` tag push), distinct from `android.yml`'s unsigned debug APK: Node 22 + JDK 21, decodes a base64 keystore secret to a `$RUNNER_TEMP` file, runs `./gradlew bundleRelease`, uploads `app-release.aab`. Requires four repo secrets — `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — that only the operator can supply; the keystore itself is never committed
- `docs/BUILD-APK.md` — operator instructions for triggering the Android workflow and downloading/sideloading the resulting debug APK
- `docs/PLAY-RELEASE.md` — Task 25. Operator runbook for the Play Store release: generating the upload keystore (`keytool`), setting the four GitHub secrets above, triggering the release workflow, Play Console setup steps, pre-written Data Safety answers ("No data collected"), and a store-listing asset checklist (512×512 icon exists; the 1024×500 feature graphic is still TODO)
- `privacy-policy.html` — Task 25. Repo-root static page served by GitHub Pages (`https://cmurph00.github.io/roaring-water-bay-tides/privacy-policy.html`), stating no data is collected or transmitted (coarse location is used on-device only); linked from `index.html`'s footer (`.origin` "Privacy" link). Required for the Play Console store listing
- `docs/beach-validation.md` / `docs/marine-ie-data-audit.md` — dated validation/survey docs (not living architecture docs): the former cross-checks app-resolved beach tide timings against independent Marine Institute EPA ground truth; the latter surveys the wider ERDDAP catalog for future data-source candidates
- `docs/scratch/` — tracked (not gitignored, unlike `.superpowers/sdd/`) one-off Python analysis scripts backing the validation docs above (extrema extraction, comparison/matching, report formatting)
- `.superpowers/sdd/` — gitignored scratch dir for task-by-task implementation reports and throwaway scripts (e.g. `slice-engine.mjs` used once to extract the engine from `index.html`); not shipped, not part of the app

Key libs: `@neaps/tide-predictor` (MIT, harmonic engine, inlined) + `@neaps/tide-database` (devDependency only — NOAA + TICON-4 station data, used solely by `build-data.mjs`). Marine Institute/OPW data has no npm dependency — it's built from raw CSVs downloaded manually from the ERDDAP server (see `scripts/build-mi.mjs` header). The GeoNames gazetteer likewise has no npm dependency — `scripts/build-places.mjs` downloads the raw `IE.zip` directly and unzips it via the system `unzip` binary through `node:child_process` (build-time only, never a web runtime dep). Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/geolocation`, `@capacitor/cli`) wraps the same static web app for the Android build — no bundler, no code duplication.

Phase 2 (Android via Capacitor): landed — see `android/`, `capacitor.config.json`, `.github/workflows/android.yml` above. iOS wrap not yet started; browser-only APIs remain isolated in dedicated units like `location.js` so an iOS wrap shouldn't require rework. Play Store release prep (Task 25) landed on top of this — see `.github/workflows/android-release.yml`, `docs/PLAY-RELEASE.md`, `privacy-policy.html` above; remaining gaps are operator-only: the four signing secrets and a 1024×500 feature-graphic PNG.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Known bug motivating the redesign

Original app predicted from the Ringaskiddy gauge with a hand-tuned Baltimore offset
(`high: -4, low: -15`) that was actually Baltimore-relative-to-**Cobh**, not Ringaskiddy — missing the
Ringaskiddy→Cobh secondary-port correction (~12 min). Result: every predicted tide ran ~11–13 min late.
The global redesign fixes this by predicting directly from the nearest real gauge station instead of a
proxy-station-plus-hand-tuned-offset.
<!-- END AUTO-MANAGED -->
