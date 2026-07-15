# Data Sources

Tide station harmonic constituents used in this app:

- **NOAA** (US, public domain)
- **TICON-4** (global tide gauges, CC-BY-4.0) — Lefèvre F., Carre H., Faucher C. (2025), SEANOE, https://doi.org/10.17882/109129

Stations bundled: 833 (European, commercial-use-safe only).
Licenses present: cc-by-4.0.

## Marine Institute (Ireland) offline predictions

- **Marine Institute** (Ireland, CC-BY-4.0) — https://www.marine.ie/ , via the ERDDAP server
  at https://erddap.marine.ie/erddap/ . Covers 38 Irish tide-prediction stations (Marine
  Institute gauge stations, Marine Institute virtual nodes, and OPW gauge stations),
  precomputed offline hi-lo predictions for 2026-2028, heights relative to OD Malin chart
  datum. Regenerate via `node scripts/build-mi.mjs` (raw CSVs are gitignored source data,
  not committed).

## EPA (Ireland) named bathing-water beaches

- **EPA** (Environmental Protection Agency, Ireland, CC-BY-4.0) — via the EPA GeoServer WFS
  at https://gis.epa.ie/geoserver/ . Covers 150 named bathing-water beaches from the
  national bathing-water register, used for beach names/locations only — tide predictions
  come from the app's nearest real prediction station (see src/ui.js), not from EPA data.
  Regenerate via `node scripts/build-beaches.mjs`.

## EPA/Marine Institute beach tide model (all-Ireland)

- **EPA / Marine Institute** (Ireland, CC-BY-4.0) — via the Marine Institute ERDDAP server
  at https://erddap.marine.ie/erddap/ (`imiTidePredictionEpa` dataset). Covers 183
  named tide-prediction points around the Irish coast, each derived from its own EPA
  bathing-water hydrodynamic model node's continuous `sea_surface_height` output —
  high/low extremes extracted directly from that node (not resolved to a distant real
  gauge), for 2026-2027. A node is kept and named whenever it's within 2km of a
  registered bathing beach or a GeoNames coastal place (town/harbour/bay/...); only
  genuinely offshore nodes are dropped. Regenerate via `node scripts/build-epa.mjs`.

## GeoNames coastal-place gazetteer

- **GeoNames** (CC-BY-4.0) — https://www.geonames.org/ , via the Ireland country dump
  (https://download.geonames.org/export/dump/IE.zip). This product uses data from
  GeoNames. Covers 2430 named coastal places (towns, harbours, bays, coves,
  islands, ...) within ~8km of a real tide-prediction source, used for search only —
  a place resolves to the nearest real prediction station (see src/ui.js), not to
  GeoNames data. Regenerate via `node scripts/build-places.mjs`.

## Natural Earth coastline outline (offline SVG map picker)

- **Natural Earth** (public domain, no attribution required — see
  https://www.naturalearthdata.com/about/terms-of-use/) — 1:50m Coastline dataset, via the
  nvkelso/natural-earth-vector GitHub mirror. Covers a 290-vertex
  simplified outline of Ireland, used only as the SVG map picker's background shape (Task
  19) — never a tide-prediction source. Regenerate via `node scripts/build-coastline.mjs`.
