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
  (https://download.geonames.org/export/dump/IE.zip) and, for Northern Ireland, the Great
  Britain country dump (https://download.geonames.org/export/dump/GB.zip, filtered to its
  "NIR" admin1 rows — the IE dump carries no Northern Ireland rows at all). This product uses
  data from GeoNames. Covers 4554 named coastal places (towns, harbours, bays, coves,
  islands, ...) within ~8km of a real tide-prediction source, used for search only —
  a place resolves to the nearest real prediction station (see src/ui.js), not to
  GeoNames data. NI places currently anchor off the single NI-coast TICON station
  (Portrush) since `data/ni-stations.json` is still empty pending its own data source —
  expect wider NI coverage (e.g. Bangor-area places) once that lands. NI counties (Antrim,
  Down, Londonderry) are derived from each row's modern (2015 local-government-district
  reform) admin2 GSS code, not a legacy county abbreviation — see `COUNTY_BY_CODE` in
  `scripts/build-places.mjs` for the verified code map and its one known coarse-grained
  limitation (the "Causeway Coast and Glens" district spans historic Antrim and Londonderry
  under a single code). Regenerate via `node scripts/build-places.mjs`.

## Coastline + islands outline (offline SVG map picker)

- **Natural Earth** (public domain, no attribution required — see
  https://www.naturalearthdata.com/about/terms-of-use/) — 1:10m Coastline dataset, via the
  nvkelso/natural-earth-vector GitHub mirror — supplies the Ireland MAINLAND ring.
- **Tailte Éireann / Ordnance Survey Ireland** (CC-BY-4.0) — "Islands, National 250k Map of
  Ireland" open dataset (https://data-osi.opendata.arcgis.com/) supplies the offshore ISLAND
  polygons (312, incl. small West Cork islands Natural Earth omits). Together a
  5675-vertex simplified outline, used only as the SVG map picker's
  background shape (Task 19) — never a tide-prediction source. Regenerate via
  `node scripts/build-coastline.mjs`.
