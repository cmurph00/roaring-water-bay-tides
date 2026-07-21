import {
  searchStations,
  searchBeaches,
  searchPlaces,
  detectLocation,
  assignCounties,
  distinctCounties,
  filterByCounty,
  haversineKm,
} from "./location.js";
import { getTides } from "./resolver.js";
import { resolveSpot } from "./resolve-spot.js";
import { applyCorrection } from "./correction.js";
import { chartDatumOffset } from "./datum.js";
import { fmtTime, fmtDistance, localDayISO, groupByLocalDay, fmtDayLabel } from "./format.js";
import { initThemeToggle } from "./theme.js";
import { renderMap } from "./map.js";

const INDEX_URL = "./data/stations.json";
const MI_INDEX_URL = "./data/mi-stations.json";
const EPA_INDEX_URL = "./data/epa-stations.json";
const NI_INDEX_URL = "./data/ni-stations.json";
const BEACHES_URL = "./data/beaches.json";
const NI_BEACHES_URL = "./data/ni-beaches.json";
const PLACES_URL = "./data/places.json";
const OUTLINE_URL = "./data/ireland-outline.json";
const LOWWATER_URL = "./data/low-water.json";
const OVERRIDES_URL = "./data/spot-overrides.json";
const MI_OVERLAP_KM = 3; // TICON/MI entries within this radius of a more-local entry are dropped
const stationUrl = (id) => `./data/stations/${id.replace(/\//g, "_")}.json`;
const miStationUrl = (id) => `./data/mi/${id}.json`;
const epaStationUrl = (id) => `./data/epa/${id}.json`;
const niStationUrl = (id) => `./data/ni/${id.replace(/\//g, "_")}.json`;
const LS_KEY = "rwb.selectedStationId";
const LS_DAYS_KEY = "rwb.days";
const LS_VIEW_KEY = "rwb.view";
const VALID_DAY_COUNTS = [1, 3, 5, 7, 10];
const VALID_VIEWS = ["list", "map"];
const DEFAULT_DAY_COUNT = 3;
const DEFAULT_VIEW = "list";
const MAX_RESULTS = 50;

// Preference order: EPA > MI > TICON. EPA model nodes (offline, CC-BY-4.0) are the most
// local prediction available where they exist — each node predicts its own water level
// directly (see scripts/build-epa.mjs), rather than borrowing a real gauge's tide table
// from tens of km away. Marine Institute (offline, CC-BY-4.0) predictions are in turn
// preferred over the general-purpose TICON/NOAA harmonic dataset for Irish stations: MI
// covers real published tide-table predictions rather than a computed approximation. Keep
// every EPA entry; every MI entry that isn't within MI_OVERLAP_KM of an EPA entry; and every
// TICON entry that isn't within MI_OVERLAP_KM of an EPA or (kept) MI entry — this avoids
// showing near-duplicate entries for the same physical location.
//
// Dedup rule chosen (Task 21): since scripts/build-epa.mjs's labelNodeFromRegister now drops
// every offshore EPA node at build time, EVERY entry `epa` contains here is, by construction,
// "at-beach" — sited within 2km of a named register beach. That makes the EPA-first tier
// order equivalent to "prefer the closest, at-beach-wins-ties" for every overlap actually
// present in this dataset: e.g. the Garryvoe EPA beach-model node (1.42km from Garryvoe
// beach) sits 2.36km from the MI "Ballycotton" gauge — the EPA entry is both the closer
// physical match AND the one plausibly nearer the shared bathing location, so keeping the
// simple tier rule (rather than a generic pairwise-distance dedup) already realizes the
// intended behaviour without extra complexity. If a future EPA node ever landed genuinely
// farther from an overlap than its MI/TICON counterpart, this rule would need revisiting —
// not observed in the current West Cork bbox.
export function mergeStationIndexes(ticon, mi, epa = [], ni = []) {
  const near = (a, b) => haversineKm({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude }) <= MI_OVERLAP_KM;

  const keptMi = mi.filter((m) => !epa.some((e) => near(m, e)));
  // NI harmonic gauges sit at the TICON tier but never overlap RoI sources (different coast),
  // so in practice all are kept; the dedup guard is kept for symmetry.
  const keptNi = ni.filter((n) => !epa.some((e) => near(n, e)) && !keptMi.some((m) => near(n, m)));
  const keptTicon = ticon.filter((t) => !epa.some((e) => near(t, e)) && !mi.some((m) => near(t, m)) && !keptNi.some((n) => near(t, n)));
  return [...epa, ...keptMi, ...keptNi, ...keptTicon];
}

let index = [];
// Named localities (e.g. EPA-registered beaches) — search-only aliases that resolve to
// their nearest real station in `index` at click-time. Never shown in the country
// dropdown or the geolocation "use my location" flow, only in free-text search results.
let beaches = [];
// GeoNames coastal-place gazetteer (data/places.json, scripts/build-places.mjs — towns,
// harbours, bays, coves, islands, ...) — same search-only-alias contract as `beaches` above
// (same {name, latitude, longitude, kind, alt?} shape, matched via searchPlaces so alternate
// names are also searchable), for places users search for that aren't themselves on the EPA
// bathing-water register. Resolve via nearestStation over the merged prediction `index`,
// same as beaches — see wireSearch/renderStationList below. Superseded the old
// hand-maintained data/named-spots.json (Task 24) — Baltimore/Schull/Crookhaven/Cape Clear
// are now just ordinary entries in this gazetteer, like any other coastal place.
let places = [];
// Ireland coastline outline for the Task 19 SVG map picker (data/ireland-outline.json,
// scripts/build-coastline.mjs — Natural Earth 1:50m coastline, public domain) — `{ bbox,
// polylines }` or null if the optional data file is missing/404 (same defaults-to-empty
// contract as beaches/places above; src/map.js renders markers on a blank sea without it).
let outline = null;
// OSi low-water/foreshore lines (data/low-water.json — { lines: [[[lat,lon],...],...] }, CC-BY
// Tailte Éireann) for the map's zoom-gated foreshore overlay; [] if the optional file is missing.
let lowWater = [];
// Validated per-spot source overrides (data/spot-overrides.json, Task 22) — [] if absent. Applied
// via resolveSpot() to both search-alias clicks and geolocation so a spot like Baltimore resolves to
// its validated best gauge rather than a poor nearest offshore node.
let overrides = [];
// The user's last-geolocated {lat, lon} (Task 19) — set by useMyLocation(), used to render
// the map's "you" dot and to compute a marker's distance when picked from the map. Distinct
// from `currentSelection` below, which is about the selected STATION, not the user.
let currentUserLocation = null;
// The currently-selected station (entry + distance + optional resolved-from locality
// name), kept so the day-count control can re-render without re-running
// search/geolocation/selection.
let currentSelection = null;

async function loadIndex() {
  const [ticon, mi] = await Promise.all([
    fetch(INDEX_URL).then((r) => r.json()),
    fetch(MI_INDEX_URL).then((r) => r.json()),
  ]);

  // EPA (West Cork model nodes) is an optional enhancement layer, same as beaches below —
  // an older cached build or a data/ tree that predates Task 18 simply has no
  // epa-stations.json, and the app must fall back to the MI/TICON-only merge rather than
  // breaking init().
  let epa = [];
  try {
    const res = await fetch(EPA_INDEX_URL);
    epa = res.ok ? await res.json() : [];
  } catch {
    epa = [];
  }

  let ni = [];
  try {
    const res = await fetch(NI_INDEX_URL);
    ni = res.ok ? await res.json() : [];
  } catch {
    ni = [];
  }

  index = mergeStationIndexes(ticon, mi, epa, ni);

  // Beaches are an optional enhancement layer — a missing/404 file must not break init().
  // The RoI (EPA) and NI (DAERA) beach registers merge into one search-alias layer.
  const beachFetch = async (url) => {
    try { const res = await fetch(url); return res.ok ? await res.json() : []; } catch { return []; }
  };
  const [roiBeaches, niBeaches] = await Promise.all([beachFetch(BEACHES_URL), beachFetch(NI_BEACHES_URL)]);
  beaches = [...roiBeaches, ...niBeaches];

  // GeoNames coastal-place gazetteer — same optional-enhancement contract as beaches above.
  try {
    const res = await fetch(PLACES_URL);
    places = res.ok ? await res.json() : [];
  } catch {
    places = [];
  }

  // Tag each Irish station with its county (inherited from the nearest county-bearing gazetteer
  // place) so the county filter can group/scope by it. No-op when places lack county data (an
  // older cached build) — stations simply stay county-less and the dropdown shows only "All".
  assignCounties(index, places);

  // Ireland coastline outline (Task 19 map picker) — same optional-enhancement contract:
  // a missing/404 data/ireland-outline.json must not break the rest of the app, just leave
  // the map view without a coastline (markers on a blank sea).
  try {
    const res = await fetch(OUTLINE_URL);
    outline = res.ok ? await res.json() : null;
  } catch {
    outline = null;
  }

  // OSi low-water/foreshore overlay — optional-enhancement contract as above ([] if absent).
  try {
    const res = await fetch(LOWWATER_URL);
    lowWater = res.ok ? (await res.json()).lines ?? [] : [];
  } catch {
    lowWater = [];
  }

  // Validated per-spot source overrides — same optional-enhancement contract ([] if absent).
  try {
    const res = await fetch(OVERRIDES_URL);
    overrides = res.ok ? await res.json() : [];
  } catch {
    overrides = [];
  }
}

async function loadStation(entry) {
  const url =
    entry.source === "epa" ? epaStationUrl(entry.id)
    : entry.source === "mi" ? miStationUrl(entry.id)
    : entry.source === "ni" ? niStationUrl(entry.id)
    : stationUrl(entry.id);
  return fetch(url).then((r) => r.json());
}

async function showStation(entry, distanceKm, locality) {
  localStorage.setItem(LS_KEY, entry.id);
  const station = await loadStation(entry);
  currentSelection = { entry, distanceKm, locality };

  const days = getDayCount();
  const now = new Date();
  // Buffer a day either side so N full station-local days (including today)
  // are covered regardless of how far the station's timezone sits from UTC.
  const start = new Date(now.getTime() - 24 * 3600 * 1000);
  const end = new Date(now.getTime() + (days + 1) * 24 * 3600 * 1000);
  let tides = await getTides(station, { start, end });
  tides = applyCorrection(tides, null); // home-spot correction wired later if configured

  // Group in the STATION's own timezone, not the browser's, so a user near a
  // day boundary sees the correct local days for a distant station.
  const todayKey = localDayISO(now, station.timezone);
  const groups = groupByLocalDay(tides, station.timezone)
    .filter((g) => g.day >= todayKey)
    .slice(0, days);

  // Normalise displayed heights to chart datum (the tide-table convention) so low waters read
  // ~0 and highs show the real spring/neap range, matching what people expect (see src/datum.js).
  // First call covers TICON (observed LAT datum) and MI/EPA (their full precomputed series);
  // a harmonic gauge with no LAT datum (e.g. NI Bangor) approximates LAT from ~a year of prediction.
  let chartOffset = chartDatumOffset(station);
  if (!(station.datums && Number.isFinite(station.datums.LAT)) && !Array.isArray(station.tides)) {
    const yrTides = await getTides(station, { start: new Date(now.getTime() - 366 * 24 * 3600 * 1000), end: now });
    chartOffset = chartDatumOffset(station, yrTides);
  }

  renderHeader(entry, distanceKm, station, locality);
  const emptyMessage =
    station.source === "mi" || station.source === "epa"
      ? "Marine Institute predictions cover 2026–2028. Pick a date in range."
      : "No tide data for this range.";
  renderDays(groups, station.timezone, emptyMessage, chartOffset);

  // Collapse the picker so the tide table is the hero; the back bar re-opens List/Map.
  const backLabel = locality && locality !== entry.name ? `${locality} → ${entry.name}` : entry.name;
  collapsePicker(backLabel);
}

// Once a spot is chosen, hide the List/Map picker + shrink the page header (via `.station-view` on
// .wrap, see index.html CSS) so the tide table dominates. Show a compact "‹ <spot>" back bar.
function collapsePicker(label) {
  document.getElementById("picker-back-label").textContent = label;
  document.querySelector(".wrap").classList.add("station-view");
}

// Restore the full header + List/Map picker (back-bar tap), re-showing whichever view was active.
function expandPicker() {
  document.querySelector(".wrap").classList.remove("station-view");
  setView(getStoredView());
}

function renderError(message) {
  const container = document.getElementById("results");
  container.innerHTML = `<div class="err">${message}</div>`;
}

function renderStatus(message, className = "empty") {
  const container = document.getElementById("results");
  container.innerHTML = `<div class="${className}">${message}</div>`;
}

// Maps a GeolocationPositionError (or any other rejection) to a visible,
// actionable message — never fail silently.
function geolocationErrorMessage(err) {
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return 'Location permission is off. Enable it for your browser in Settings, or search for a gauge / pick a county.';
    case 2: // POSITION_UNAVAILABLE
      return "Couldn't determine your location. Try again, or search for a gauge.";
    case 3: // TIMEOUT
      return "Location timed out. Try again, or search for a gauge.";
    default:
      return "Couldn't get your location — search for a gauge or pick a county.";
  }
}

// Source transparency (Task 21): the prediction's underlying data source is never hidden
// behind a generic "gauge" label — MI/TICON are real tide gauges (or a harmonic model of
// one); EPA stations are the beach's own hydrodynamic model node (scripts/build-epa.mjs),
// not a gauge at all. Exported for unit testing alongside mergeStationIndexes above.
export function stationSourceLabel(station) {
  return station.source === "epa" ? "beach model" : "tide gauge";
}

// Task 19 (offline SVG map picker): partitions the already-merged/deduped EPA>MI>TICON
// `index` into the two marker types shown on the map — gauges (Marine Institute stations
// plus Irish TICON entries, i.e. every non-EPA Irish source) and beach-model nodes (EPA).
// Non-Irish TICON entries (the bulk of `index` — European gauges outside Ireland) are
// excluded entirely; the map only covers Ireland's bbox (data/ireland-outline.json), and the
// 2400-entry gazetteer (beaches/places) is deliberately never plotted — text-search only, per
// spec, since it would be far too dense. Pure, unit-tested.
// Island-of-Ireland bbox: RoI + NI, excluding GB/IoM gauges just across the channel.
const IRELAND_ISLAND_BBOX = { minLat: 51.2, maxLat: 55.5, minLon: -10.7, maxLon: -5.3 };
function inIrelandIsland(s) {
  return s.latitude >= IRELAND_ISLAND_BBOX.minLat && s.latitude <= IRELAND_ISLAND_BBOX.maxLat
    && s.longitude >= IRELAND_ISLAND_BBOX.minLon && s.longitude <= IRELAND_ISLAND_BBOX.maxLon;
}

export function mapMarkerSources(index) {
  const gauges = index.filter((s) => s.source !== "epa" && (s.country === "Ireland" || s.source === "ni" || inIrelandIsland(s)));
  const beachModel = index.filter((s) => s.source === "epa");
  return { gauges, beachModel };
}

// `locality` is set only when the current selection was reached via a beach/named-spot
// search alias (see renderStationList's click handlers) — it names the searched-for
// place, distinct from `entry`, the real station its tides actually come from. Shows the
// resolved station's source + type + distance so it's always clear which data underlies
// the numbers, e.g. "Baltimore → Tragumna (beach model, 8 km) · heights vs Model MSL" or
// "Baltimore → Union Hall (tide gauge, 19 km) · heights vs OD Malin".
function renderHeader(entry, distanceKm, station, locality) {
  const el = document.getElementById("station-header");
  // Heights are normalised to chart datum for display (see src/datum.js) — exact for TICON
  // (observed LAT datum), approximate for MI/EPA/NI, so label it "approx." to stay honest.
  const datum = "heights ≈ chart datum";
  const type = stationSourceLabel(station);
  const dist = distanceKm != null ? `, ${fmtDistance(distanceKm)}` : "";
  if (locality && locality !== entry.name) {
    el.textContent = `${locality} → ${entry.name} (${type}${dist}) · ${datum}`;
    return;
  }
  el.textContent = `${entry.name}, ${entry.county || entry.country} (${type}${dist}) · ${datum}`;
}

function renderTideTable(tides, timezone, chartOffset = 0) {
  const table = document.createElement("table");
  for (const t of tides) {
    const row = document.createElement("tr");
    const isHigh = t.type === "high";
    row.innerHTML =
      `<td>${isHigh ? "▲ High" : "▼ Low"}</td>` +
      `<td class="time">${fmtTime(t.time, timezone)}</td>` +
      `<td class="height">${(t.height + chartOffset).toFixed(2)} m</td>`;
    table.appendChild(row);
  }
  return table;
}

function renderDays(groups, timezone, emptyMessage = "No tide data for this range.", chartOffset = 0) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  if (!groups.length) {
    container.innerHTML = `<div class="empty">${emptyMessage}</div>`;
    return;
  }
  for (const g of groups) {
    const dayEl = document.createElement("div");
    dayEl.className = "day";

    const head = document.createElement("div");
    head.className = "day-head";
    head.innerHTML = `<span>${fmtDayLabel(g.day, timezone)}</span><span class="range">${g.day}</span>`;
    dayEl.appendChild(head);

    dayEl.appendChild(renderTideTable(g.tides, timezone, chartOffset));
    container.appendChild(dayEl);
  }
}

// Closes the search dropdown and clears the query input — shared by both the
// station and beach result click handlers below.
function closeSearchDropdown() {
  const list = document.getElementById("search-results");
  list.innerHTML = "";
  const input = document.getElementById("station-search");
  if (input) input.value = "";
}

// Shared click behaviour for any "search-only alias" result (a beach or a named
// town/village spot): resolve to the nearest real prediction station in the merged
// `index`, then show that station with the alias's own name threaded through as
// `locality` (see renderHeader) — never a station in its own right.
function wireLocalityClick(li, item, notFoundMessage) {
  li.addEventListener("click", () => {
    closeSearchDropdown();
    const nearest = resolveSpot(item.latitude, item.longitude, index, overrides);
    if (!nearest) {
      renderError(notFoundMessage);
      return;
    }
    showStation(nearest.station, nearest.distanceKm, item.name).catch(() => {
      renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
    });
  });
}

function renderStationList(stations, beachResults = [], placeResults = []) {
  const list = document.getElementById("search-results");
  list.innerHTML = "";
  for (const m of stations.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `${m.name}, ${m.county || m.country}`;
    li.addEventListener("click", () => {
      closeSearchDropdown();
      showStation(m, null).catch(() => {
        renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
      });
    });
    list.appendChild(li);
  }
  for (const b of beachResults.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `🏖 ${b.name}, ${b.country}`;
    wireLocalityClick(li, b, "Couldn't find a nearby tide gauge for this beach.");
    list.appendChild(li);
  }
  for (const p of placeResults.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `📍 ${p.name}`;
    wireLocalityClick(li, p, "Couldn't find a nearby tide gauge for this place.");
    list.appendChild(li);
  }
}

function selectedCounty() {
  return document.getElementById("county-filter").value;
}

// Sets #county-filter's value to `county` iff it's one of the select's existing options
// (populated from distinctCounties(index) in wireCountyFilter); otherwise leaves the current
// selection unchanged. Setting .value programmatically does NOT fire a "change" event, so this
// never triggers the change listener's renderStationList/clear side effect — callers that also
// want the list rendered must do so explicitly. This is how we offline-derive a "detected
// county" from the resolved station's own `county` field (assigned in loadIndex via
// assignCounties), with no reverse-geocoding service.
function setCountyFilter(county) {
  if (!county) return;
  const select = document.getElementById("county-filter");
  const hasOption = Array.from(select.options).some((o) => o.value === county);
  if (hasOption) {
    select.value = county;
  }
}

function searchScope() {
  const county = selectedCounty();
  return county ? filterByCounty(index, county) : index;
}

function wireSearch() {
  const input = document.getElementById("station-search");
  input.addEventListener("input", () => {
    const stationResults = searchStations(input.value, searchScope());
    // Beaches and the GeoNames place gazetteer are both global search-only alias
    // layers — not scoped by #county-filter (they carry no county axis). Places
    // also match on alternate names (searchPlaces),
    // unlike the plain name-only searchBeaches.
    const beachResults = searchBeaches(input.value, beaches);
    const placeResults = searchPlaces(input.value, places);
    renderStationList(stationResults, beachResults, placeResults);
  });
}

function wireCountyFilter() {
  const select = document.getElementById("county-filter");
  for (const county of distinctCounties(index)) {
    const option = document.createElement("option");
    option.value = county;
    option.textContent = county;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    if (select.value) {
      renderStationList(filterByCounty(index, select.value));
    } else {
      document.getElementById("search-results").innerHTML = "";
    }
  });
}

function getDayCount() {
  const select = document.getElementById("day-count");
  const n = parseInt(select?.value, 10);
  return VALID_DAY_COUNTS.includes(n) ? n : DEFAULT_DAY_COUNT;
}

function wireDayCount() {
  const select = document.getElementById("day-count");
  const saved = parseInt(localStorage.getItem(LS_DAYS_KEY), 10);
  select.value = String(VALID_DAY_COUNTS.includes(saved) ? saved : DEFAULT_DAY_COUNT);

  select.addEventListener("change", () => {
    localStorage.setItem(LS_DAYS_KEY, select.value);
    if (currentSelection) {
      showStation(currentSelection.entry, currentSelection.distanceKm, currentSelection.locality).catch(() => {
        renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
      });
    }
  });
}

async function useMyLocation() {
  renderStatus("Locating your nearest gauge…", "loading");
  try {
    const { lat, lon } = await detectLocation();
    currentUserLocation = { lat, lon };
    if (isMapViewActive()) renderMapView(); // refresh the "you" dot if the map is on screen
    const result = resolveSpot(lat, lon, index, overrides);
    if (!result) {
      renderError("Couldn't get your location — search for a gauge or pick a county.");
      return;
    }
    const { station, distanceKm } = result;
    // Reflect the detected station's county in the dropdown before
    // rendering; searchScope() reads the select value, so this also scopes
    // subsequent searches to the user's county.
    setCountyFilter(station.county);
    await showStation(station, distanceKm);
  } catch (err) {
    // Denied/unavailable/timeout → always leave a visible, actionable
    // message instead of failing silently (was the iOS "does nothing" bug).
    renderError(geolocationErrorMessage(err));
  }
}

// --- Task 19: offline SVG map picker --------------------------------------------------

function isMapViewActive() {
  const panel = document.getElementById("map-panel");
  return panel ? !panel.hidden : false;
}

// (Re)builds the map SVG from the current index/outline/user-location — called whenever any
// of those change while the map view is on screen (view switch, geolocation, or a fresh
// loadIndex() on init).
function renderMapView() {
  const container = document.getElementById("map-svg-container");
  if (!container) return;
  const { gauges, beachModel } = mapMarkerSources(index);
  renderMap(container, {
    outline,
    gauges,
    beachModel,
    places,
    lowWater,
    userLocation: currentUserLocation,
    onSelect: (entry) => {
      const distanceKm = currentUserLocation
        ? haversineKm(currentUserLocation, { lat: entry.latitude, lon: entry.longitude })
        : null;
      showStation(entry, distanceKm).catch(() => {
        renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
      });
    },
    onHover: (entry, label) => {
      const hint = document.getElementById("map-hint");
      if (hint) hint.textContent = `${entry.name} (${label})`;
    },
  });
}

function getStoredView() {
  const v = localStorage.getItem(LS_VIEW_KEY);
  return VALID_VIEWS.includes(v) ? v : DEFAULT_VIEW;
}

// Switches between the original search/country "list" panel and the map panel, persisting
// the choice (Task 19 spec: "Persist last view in localStorage. Default to list."). Renders
// the map lazily — only when the view actually switches to "map" — rather than on every
// index/geolocation change, since building the SVG from scratch is cheap but pointless work
// while the panel is hidden.
function setView(view) {
  localStorage.setItem(LS_VIEW_KEY, view);
  const listPanel = document.getElementById("list-panel");
  const mapPanel = document.getElementById("map-panel");
  if (listPanel) listPanel.hidden = view !== "list";
  if (mapPanel) mapPanel.hidden = view !== "map";
  for (const button of document.querySelectorAll("#view-toggle .view-toggle-btn")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (view === "map") renderMapView();
}

function wireViewToggle() {
  const toggle = document.getElementById("view-toggle");
  if (!toggle) return;
  for (const button of toggle.querySelectorAll(".view-toggle-btn")) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }
  setView(getStoredView());
}

export async function init() {
  initThemeToggle();
  await loadIndex();
  wireSearch();
  wireCountyFilter();
  wireDayCount();
  wireViewToggle();
  document.getElementById("use-location").addEventListener("click", useMyLocation);
  document.getElementById("picker-back").addEventListener("click", expandPicker);

  const savedId = localStorage.getItem(LS_KEY);
  const saved = index.find((s) => s.id === savedId);
  if (saved) {
    setCountyFilter(saved.county);
    try {
      await showStation(saved, null);
    } catch {
      renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
    }
  } else {
    // Do NOT auto-geolocate on load: iOS Safari blocks getCurrentPosition
    // outside a user gesture, and a resulting denial can leave iOS unable to
    // re-prompt on the later button tap too. Wait for an explicit tap on
    // "Use my location" instead.
    document.getElementById("station-header").textContent = "";
    renderStatus('Tap "Use my location", pick a county, or search for a gauge.');
  }
}
