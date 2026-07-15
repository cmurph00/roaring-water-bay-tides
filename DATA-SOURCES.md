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

## EPA/Marine Institute beach tide model (West Cork)

- **EPA / Marine Institute** (Ireland, CC-BY-4.0) — via the Marine Institute ERDDAP server
  at https://erddap.marine.ie/erddap/ (`imiTidePredictionEpa` dataset). Covers 15 named
  West Cork bathing-beach tide-prediction points, each derived from its own EPA
  bathing-water hydrodynamic model node's continuous `sea_surface_height` output —
  high/low extremes extracted directly from that node (not resolved to a distant real
  gauge) and refined by parabolic interpolation to sub-sample accuracy (the model is
  sampled every 10 minutes), for 2026-2028. Every node is named by proximity to a
  registered bathing-water beach (within 2km) — a node with no register beach that close
  is genuinely offshore and is dropped rather than mislabelled with a nearby town's name
  (32 candidate nodes fall in the West Cork bbox; 17 are dropped as offshore). Baltimore,
  Schull, Crookhaven and Cape Clear — none of which has a nearby real tide gauge or is
  itself on the bathing-water register — remain searchable via `data/named-spots.json`,
  resolving at search-time to whichever kept prediction point (EPA or real gauge) is
  actually closest. Regenerate via `node scripts/build-epa.mjs`.
