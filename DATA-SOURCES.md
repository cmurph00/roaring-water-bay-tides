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
