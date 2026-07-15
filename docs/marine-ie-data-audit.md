# Marine Institute (Ireland) ERDDAP catalog audit

**Date**: 2026-07-15
**Scope**: read-only survey of `https://erddap.marine.ie/erddap/` for datasets relevant to a
free, offline-first, CC-BY tide/coastal holiday app for Ireland (this app). No data downloaded
beyond small `.csv` metadata/distinct-value probes; no app code changed.

**Method**: fetched the full catalog (`/erddap/info/index.csv?itemsPerPage=1000` → 86 datasets
total), triaged by title to ~39 candidates in-scope (tides/sea level, waves, sea/water
temperature, coastal wind/weather, currents, bathing water), then fetched each candidate's
`/erddap/info/<id>/index.csv` for global attributes (license, bbox, time coverage) and, for
ambiguous bbox cases, ran small `distinct()` station-list probes against `tabledap` to check
actual station names against SW-Ireland / Roaring Water Bay / Cork coast (~51.5N, -9.4E).

There is **no dedicated bathing-water-quality dataset** on this ERDDAP — the `imifurnaceawqms*`
"AWQMS" datasets are freshwater lake water-quality monitoring (Burrishoole/Newport, Co. Mayo),
not coastal bathing water. This app's existing EPA beach names/locations come from the separate
EPA GeoServer WFS (already noted in `DATA-SOURCES.md`), not from ERDDAP.

---

## 1. Summary table — relevant datasets

Legend: **SW-IE** = bbox/station list reaches the SW Ireland / Cork coast area. **Status**:
ACTIVE = current, no replacement notice; LEGACY = title/summary says "to be replaced".

### Tides / sea level

| Dataset ID | Contents | License | SW-IE? | Status |
|---|---|---|---|---|
| `imiTidePrediction` | Tide predictions (Water_Level + Water_Level_ODM), 38 MI gauge + virtual-node + OPW stations, 2026–2029 rolling window. Stations include **Union_Hall, Castletownbere, Ballycotton, Kinsale_MODELLED, Crosshaven_MODELLED, Ringaskiddy** | CC-BY-4.0 | **Yes** | ACTIVE |
| `IMI-TidePrediction` | Same content/schema as above (dash-form ID) | CC-BY-4.0 | Yes | **LEGACY — "to be replaced"** |
| `IMI_TidePrediction_HighLow` | High/low-only summary of the above (`tide_time_category`, `Water_Level_ODMalin`) — this is the schema this app's `build-mi.mjs` already targets | CC-BY-4.0 | Yes | ACTIVE |
| `imiTidePredictionEpa` | Modelled tide predictions at ~180 EPA bathing-water-beach station codes (`IESWBWC*` = South-West region codes present) | CC-BY-4.0 | **Yes** (IESWBWC = South West) | ACTIVE |
| `IMI-TidePrediction_epa` | Same content (dash-form ID); summary explicitly says *"to be replaced by datasetid:imiTidePredictionEpa"* | CC-BY-4.0 | Yes | **LEGACY — confirmed rename** |
| `IrishNationalTideGaugeNetwork` | Real-time **observed** water level at 23 physical gauges, incl. **Castletownbere Port, Union Hall Harbor(2), Ballycotton Harbour** | CC-BY-4.0 | **Yes** | ACTIVE, real-time (2000–present) |
| `IrishNationalTideGaugeNetworkRiverGauges` | Real-time river/estuary gauges (Shannon-side, west/northwest) | CC-BY-4.0 | No | ACTIVE |
| `imiSurgeObservationINTGN` | Observed sea level decomposed into astronomical tide + storm surge, same gauge network | CC-BY-4.0 | Yes | ACTIVE, 2006–present |
| `imiSurgePrediction` | 3-day tide+surge **forecast** at named bays/harbours, incl. **Bantry_Bay, Union_Hall, Cork_Harbour_Entr, Dingle_Bay** | CC-BY-4.0 | **Yes (Bantry_Bay!)** | ACTIVE, rolling forecast |

### Waves

| Dataset ID | Contents | License | SW-IE? | Status |
|---|---|---|---|---|
| `IWaveBNetwork` | Real-time wave buoys, stations incl. **Bantry Bay**, Brandon Bay, Clew Bay, Mace Head, AMETS, SmartBay | CC-BY-4.0 | **Yes (Bantry Bay)** | ACTIVE |
| `IWaveBNetwork30Min` | 30-min-averaged version — richest single dataset: sig. wave height, peak/energy period, direction, spread, **SeaTemperature**, **MeanCurSpeed/Dir** (currents), all with QC flags | CC-BY-4.0 | **Yes (Bantry Bay)** | ACTIVE |
| `IWaveBNetwork_spectral` | Spectral wave parameters (peak dir/spread, energy/mean periods) per buoy | CC-BY-4.0 | Yes (same buoy set) | ACTIVE, 2006–present |
| `IWaveBNetwork_zerocrossing` | Zero-crossing stats (Hmax, Havg, Tavg) per buoy | CC-BY-4.0 | Yes (same buoy set) | ACTIVE, 2006–present |
| `IWBNetwork` | Offshore weather-buoy network (M1–M6, Belmullet-AMETS, FS1) — met + some wave params | CC-BY-4.0 | Marginal (M5 is SW approaches, but far offshore) | ACTIVE, 2001–present |
| `imiWaveBuoyForecast` | Wave forecast at buoy locations incl. **Cork_SmartBuoy** | CC-BY-4.0 | Yes (Cork_SmartBuoy) | ACTIVE, rolling forecast |
| `IMI-WaveBuoyForecast` | Same content (dash-form ID) | CC-BY-4.0 | Yes | **LEGACY — "to be replaced"** |
| `IMI_IRISH_SHELF_SWAN_WAVE` | Whole-shelf SWAN wave model grid (sig. height, period, direction, spread), bbox 49–56N covers all of Ireland | CC-BY-4.0 | **Yes** | ACTIVE, short rolling forecast (~2 wks) |
| `IMI_CONNEMARA_SWAN_WAVE` | High-res SWAN wave model, Connemara/Galway only | CC-BY-4.0 | No | ACTIVE |
| `waveatlantos00` | "Undefined Atlantos project locations" — bbox is literally `0,0,0,0` | CC-BY-4.0 | Not usable | ACTIVE but data unusable (no real coordinates) |
| `mycoast_waveforecast` | MyCOAST EU-Atlantic project — stations are all Spain/Portugal/English-Channel (Vigo, Baiona, Cambados, Western Channel Observatory…); bbox max lat 50.25 doesn't reach Ireland | CC-BY-4.0 | **No — not Ireland at all** | ACTIVE, out of scope for this app |

### Sea / water temperature

| Dataset ID | Contents | License | SW-IE? | Status |
|---|---|---|---|---|
| `climate_ballycotton` | Ballycotton (E. Cork) SST time series, 2010–2025 | **CC-BY-4.0** | Yes (E. Cork, near SW) | ACTIVE, long single-point archive |
| `climate_malin` / `climate_malin_daily_average` | Malin Head (Donegal) SST, 1958–present — the longest-running SST record in the state | CC-BY-4.0 | No (north coast) | ACTIVE, long archive |
| `ICTempNetwork` | Coastal Temperature Network — many aquaculture bays, incl. **Bantry Bay (Gearhies ×2, Palmers Point, Roancarraig)**, Kenmare Bay, Clifden/Kilkieran/Killary/Clew/Mulroy/Donegal Bays | CC-BY-4.0 | **Yes (Bantry Bay stations)** | ACTIVE |
| `ICTempNetworkFreshwater` | Single freshwater site (near Galway) | CC-BY-4.0 | No (freshwater, not coastal) | ACTIVE, low relevance |

### Coastal wind & weather

| Dataset ID | Contents | License | SW-IE? | Status |
|---|---|---|---|---|
| `GFS-WeatherTimeSeries` | ECMWF weather forecast (wind/pressure/temp) at selected locations, 7-day rolling window | **"see background" — NOT a Marine Institute CC-BY grant; defers to ECMWF's own terms, unverified here** | Marginal (bbox reaches 51.4N) | ACTIVE, rolling forecast only (no archive) |
| `intgn_weatherancillary` | Weather-station data co-located with tide gauges — Galway Port + Buncrana only | CC-BY-4.0 | No | ACTIVE, 2024–present |
| `sentinel_lehanagh` / `compass_mace_head` / `sbe37_macehead` / `smartbay_metbuoy` | Sentinel-site / SmartBay met-ocean buoys — all Galway Bay / Connemara | CC-BY-4.0 | No | ACTIVE |

### Currents

| Dataset ID | Contents | License | SW-IE? | Status |
|---|---|---|---|---|
| `BANTRY_PARTICLES` | Aggregate particle-track (Lagrangian transport) model output for **Bantry Bay**; bbox 51.14–51.90N / -10.85 to -9.34E — dead-centre on the Roaring Water Bay / Mizen/Sheep's Head coastline | CC-BY-4.0 | **Yes — exact match** | ACTIVE, rolling 1-month window |
| `IMI_NEATL` | NE-Atlantic shelf hydrodynamic model: sea surface height, surface/bottom temp+salinity, surface/bottom current vectors, mixed-layer depth; bbox 48–58N covers the whole Irish coast | CC-BY-4.0 | **Yes** | ACTIVE, short rolling forecast |
| `IMI_CONN_2D` / `IMI_CONN_3D` | Connemara hydrodynamic model (sea level + currents; 3D adds temp/salinity) | CC-BY-4.0 | No (Galway only) | ACTIVE |
| `spiddal_obs_adcp` / `smartbay_obs_adcp` | ADCP current-profile observations, Galway Bay (Spiddal) | CC-BY-4.0 | No | ACTIVE (raw + "Processed" duplicate) |
| `intgn_ctdancillary` | CTD (temp/salinity/conductivity) at the Galway Port tide gauge | CC-BY-4.0 | No | ACTIVE, 2024–present |

**Totals**: **32 relevant datasets** surveyed in depth. **30 are CC-BY-4.0** (Marine Institute's
own open licence). One (`GFS-WeatherTimeSeries`) defers to ECMWF's own terms and is **not**
independently confirmed as CC-BY — treat as "check before use", not "known-open". One
(`waveatlantos00`) is CC-BY but has no usable coordinates.

(`emff_msp_layers` — "EMFF Marine Spatial Planning Layers" — was also triaged but turned out to
be a reference list of GIS layer names, not tide/wave/temp data; excluded from the tables above
as out of scope.)

---

## 2. TO BE REPLACED — capture candidates

Only **3 of the 86 catalog datasets** carry "to be replaced" language (confirmed by grepping the
full catalog, not just the tide/wave/temp subset) — all three are Marine Institute's own
migration away from hyphenated dataset IDs, and **all three already have a live, equivalent,
CC-BY-4.0 replacement dataset with identical schema and coverage**:

| Legacy (to be replaced) | Replacement (already live) | Verdict |
|---|---|---|
| `IMI-TidePrediction` — *"Marine Institute Tide Prediction - to be replaced"* | `imiTidePrediction` | Same bbox (51.56–55.37N), same 2026–2029 rolling window, same station list. **No unique data at risk** — it's an ID rename, not a retiring archive. |
| `IMI-TidePrediction_epa` — *"EPA Beaches Model Predicted Tide Level - to be replaced"* | `imiTidePredictionEpa` | Summary **explicitly confirms**: *"to be replaced by datasetid:imiTidePredictionEpa"*. Same ~180 `IESWBWC*`/`BPNBF*` station codes. **No unique data at risk.** |
| `IMI-WaveBuoyForecast` — *"MI Wave Forecast at buoy locations - to be replaced"* | `imiWaveBuoyForecast` | Same bbox (51.2–55.0N), same rolling forecast window. **No unique data at risk.** |

**Bottom line**: nothing here needs an urgent scrape-before-deletion. All three legacy datasets
are short-window rolling forecasts/predictions (not deep archives), and their successor IDs are
already serving the identical CC-BY-4.0 data. The one actionable item is **naming hygiene**, not
data preservation — see Recommendation 1 below.

**Project note**: this app's own `scripts/build-mi.mjs` header comment references a dataset
named **`IHiLoTideForecast`** (with sub-parts "MI gauge stations" / "MI virtual node stations" /
"OPW gauge stations") — that exact name **does not appear anywhere in the current 86-dataset
catalog**. Its documented column schema (`stationID,longitude,latitude,time,tide_time_category,
Water_Level_ODMalin`) is an exact match for `IMI_TidePrediction_HighLow`'s variable list today.
This strongly suggests `IHiLoTideForecast` was itself an earlier dataset ID that MI has already
renamed/retired once before — i.e. this is the **second** rename in this dataset's history, not
the first. See Recommendation 1.

---

## 3. Recommendations

1. **Re-point `build-mi.mjs`'s source-dataset comment at the live catalog IDs, not `IHiLoTideForecast`.**
   The header documents a dataset name (`IHiLoTideForecast`) that is no longer in the live
   catalog — it has apparently already been renamed once (to `IMI_TidePrediction_HighLow`, by
   schema match) before this audit even started. Since MI has now announced a *second* round of
   renames (`IMI-TidePrediction*` → `imiTidePrediction*`), update the comment/download
   instructions in `scripts/build-mi.mjs` to reference the current non-legacy IDs
   (`imiTidePrediction`, `imiTidePredictionEpa`, `IMI_TidePrediction_HighLow`) so the next
   regeneration doesn't hit a 404 against a name that's already been retired twice. License
   unaffected either way — still CC-BY-4.0 Marine Institute/OPW.

2. **Add a wave layer, sourced from `IWaveBNetwork` / `IWaveBNetwork30Min` (CC-BY-4.0).**
   The 30-min dataset is unusually rich for a single feed: significant wave height, peak/energy
   period, direction, spread, **sea temperature**, and **current speed/direction**, all
   QC-flagged, at the **Bantry Bay** buoy — immediately adjacent to Roaring Water Bay. This is
   the single best candidate to extend the app beyond tides into general "sea conditions" for
   the same coastline it already covers, without adding a new licence class.

3. **Add a sea-temperature layer from `ICTempNetwork` (CC-BY-4.0), and optionally `climate_ballycotton`.**
   `ICTempNetwork` has three Bantry Bay stations (Gearhies ×2, Palmers Point, Roancarraig) with
   an aquaculture-grade sea-temperature record, directly on the target coastline.
   `climate_ballycotton` (E. Cork, CC-BY-4.0, 2010–2025) is a good secondary/cross-check point
   with a longer, cleaner single-site archive if a simpler "one number" temperature feature is
   wanted instead of a multi-station network.

4. **Consider a short-range storm-surge / "extra height above prediction" feature from `imiSurgePrediction` (CC-BY-4.0).**
   It has a **`Bantry_Bay`** station specifically and a **`Union_Hall`** station (both on the
   target coastline), giving a 3-day forecast of predicted-tide vs. surge-adjusted height — a
   natural complement to the existing offline hi-lo predictions, useful for storm-warning framing
   on a "coastal holiday" app. Being a rolling forecast (not an archive), it would need an
   online-refinement path similar to the existing `apiConfig.fetchExtremes` pattern in
   `src/resolver.js`, not a one-time offline bundle.

5. **Treat `GFS-WeatherTimeSeries` as licence-unverified — do not fold it into the CC-BY dataset without checking ECMWF's terms.**
   Its `license` global attribute is literally `"see background"` (deferring to ECMWF, not
   Marine Institute's own CC-BY-4.0 grant used everywhere else on this ERDDAP). If a
   wind/pressure layer is wanted, this is the only ERDDAP candidate with the right variables, but
   it needs its own licence check before being lumped in with the rest of this app's
   CC-BY-4.0-only data policy (`data/*` licence list in `DATA-SOURCES.md`).

6. **Do not bother with `IMI_CONN_2D/3D`, `IMI_CONNEMARA_SWAN_WAVE`, Galway/Connemara buoys, or `mycoast_waveforecast`** for this app — none reach the SW Ireland / Cork coast (Connemara sites are Galway Bay; MyCOAST stations are entirely Spain/Portugal/English Channel despite being hosted on the Irish ERDDAP).

---

## Appendix — raw catalog scan

Full 86-dataset catalog fetched from
`https://erddap.marine.ie/erddap/info/index.csv?page=1&itemsPerPage=1000` (the bare URL 302s
to the paginated form — use `-L` with curl). 39 candidates were deep-dived via
`/erddap/info/<id>/index.csv`; station-list checks used `tabledap/<id>.csv0?<var>&distinct()`
probes. No bulk data was downloaded.
