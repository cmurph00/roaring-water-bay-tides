<!-- AUTO-MANAGED: project-description -->
# Roaring Water Bay Tides

Offline-first tide predictor, evolving from a single-location (Baltimore, Co. Cork) GitHub Pages app
into a global tide predictor. Static site, no backend, installable as a PWA.

**Current phase**: Phase 1 design drafted — see
`docs/superpowers/specs/2026-07-14-global-tide-predictor-design.md` for full architecture, data flow,
licensing rules, and testing plan. No implementation of the redesign has landed yet; the existing
`index.html` is still the original single-station (Ringaskiddy-proxy) app.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Planned architecture (Phase 1 spec, not yet implemented)

- `index.html` — UI shell, generalized to any station
- `src/engine.js` — inlined `@neaps/tide-predictor` harmonic math (MIT), unchanged
- `src/resolver.js` — hybrid data source: offline (default) + optional online API refinement, silent fallback
- `src/location.js` — nearest-gauge lookup (Haversine) + search, isolates browser geolocation API
- `src/correction.js` — optional opt-in secondary-port correction for a saved "home spot"
- `src/ui.js` — DOM rendering only
- `data/stations.json` + `data/stations/<id>.json` — station index + per-station constituents/datums/license
- `scripts/build-data.mjs` — regenerates `data/` from `@neaps/tide-database`, **excludes any
  CC-BY-NC-licensed station** (commercial-use safety for future monetization)
- `test/` — Node-based headless tests (engine runs outside the browser)

Key libs: `@neaps/tide-predictor` (MIT, harmonic engine) + `@neaps/tide-database` (NOAA + TICON-4 station data).

Phase 2 (separate future spec): Capacitor wrap → Android APK, then iOS. Keep browser-only APIs
(geolocation etc.) isolated in dedicated units like `location.js` so the wrap doesn't require rework.
<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Known bug motivating the redesign

Original app predicted from the Ringaskiddy gauge with a hand-tuned Baltimore offset
(`high: -4, low: -15`) that was actually Baltimore-relative-to-**Cobh**, not Ringaskiddy — missing the
Ringaskiddy→Cobh secondary-port correction (~12 min). Result: every predicted tide ran ~11–13 min late.
The global redesign fixes this by predicting directly from the nearest real gauge station instead of a
proxy-station-plus-hand-tuned-offset.
<!-- END AUTO-MANAGED -->
