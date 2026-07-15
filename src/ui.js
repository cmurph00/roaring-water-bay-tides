import {
  nearestStation,
  searchStations,
  searchBeaches,
  detectLocation,
  distinctCountries,
  filterByCountry,
  haversineKm,
} from "./location.js";
import { getTides } from "./resolver.js";
import { applyCorrection } from "./correction.js";
import { fmtTime, fmtDistance, localDayISO, groupByLocalDay, fmtDayLabel } from "./format.js";
import { initThemeToggle } from "./theme.js";

const INDEX_URL = "./data/stations.json";
const MI_INDEX_URL = "./data/mi-stations.json";
const EPA_INDEX_URL = "./data/epa-stations.json";
const BEACHES_URL = "./data/beaches.json";
const NAMED_SPOTS_URL = "./data/named-spots.json";
const MI_OVERLAP_KM = 3; // TICON/MI entries within this radius of a more-local entry are dropped
const stationUrl = (id) => `./data/stations/${id.replace(/\//g, "_")}.json`;
const miStationUrl = (id) => `./data/mi/${id}.json`;
const epaStationUrl = (id) => `./data/epa/${id}.json`;
const LS_KEY = "rwb.selectedStationId";
const LS_DAYS_KEY = "rwb.days";
const VALID_DAY_COUNTS = [1, 3, 5, 7, 10];
const DEFAULT_DAY_COUNT = 3;
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
export function mergeStationIndexes(ticon, mi, epa = []) {
  const near = (a, b) => haversineKm({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude }) <= MI_OVERLAP_KM;

  const keptMi = mi.filter((m) => !epa.some((e) => near(m, e)));
  const keptTicon = ticon.filter((t) => !epa.some((e) => near(t, e)) && !mi.some((m) => near(t, m)));
  return [...epa, ...keptMi, ...keptTicon];
}

let index = [];
// Named localities (e.g. EPA-registered beaches) — search-only aliases that resolve to
// their nearest real station in `index` at click-time. Never shown in the country
// dropdown or the geolocation "use my location" flow, only in free-text search results.
let beaches = [];
// Named town/village spots (Baltimore/Schull/Crookhaven/Cape Clear, data/named-spots.json)
// — same search-only-alias contract as `beaches` above (same {name, latitude, longitude}
// shape, reused via searchBeaches), but for places users search for that aren't themselves
// on the EPA bathing-water register. Resolve via nearestStation over the merged prediction
// `index`, same as beaches — see wireSearch/renderStationList below.
let namedSpots = [];
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

  index = mergeStationIndexes(ticon, mi, epa);

  // Beaches are an optional enhancement layer — a missing/404 data/beaches.json (e.g. an
  // older cached build, or the file simply not having been generated) must not break the
  // rest of the app, so default to [] rather than letting the rejection/parse error
  // propagate out of loadIndex/init.
  try {
    const res = await fetch(BEACHES_URL);
    beaches = res.ok ? await res.json() : [];
  } catch {
    beaches = [];
  }

  // Named town/village spots — same optional-enhancement contract as beaches above.
  try {
    const res = await fetch(NAMED_SPOTS_URL);
    namedSpots = res.ok ? await res.json() : [];
  } catch {
    namedSpots = [];
  }
}

async function loadStation(entry) {
  const url =
    entry.source === "epa" ? epaStationUrl(entry.id) : entry.source === "mi" ? miStationUrl(entry.id) : stationUrl(entry.id);
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

  renderHeader(entry, distanceKm, station, locality);
  const emptyMessage =
    station.source === "mi" || station.source === "epa"
      ? "Marine Institute predictions cover 2026–2028. Pick a date in range."
      : "No tide data for this range.";
  renderDays(groups, station.timezone, emptyMessage);
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
      return 'Location permission is off. Enable it for your browser in Settings, or search for a gauge / pick a country.';
    case 2: // POSITION_UNAVAILABLE
      return "Couldn't determine your location. Try again, or search for a gauge.";
    case 3: // TIMEOUT
      return "Location timed out. Try again, or search for a gauge.";
    default:
      return "Couldn't get your location — search for a gauge or pick a country.";
  }
}

// Source transparency (Task 21): the prediction's underlying data source is never hidden
// behind a generic "gauge" label — MI/TICON are real tide gauges (or a harmonic model of
// one); EPA stations are the beach's own hydrodynamic model node (scripts/build-epa.mjs),
// not a gauge at all. Exported for unit testing alongside mergeStationIndexes above.
export function stationSourceLabel(station) {
  return station.source === "epa" ? "beach model" : "tide gauge";
}

// `locality` is set only when the current selection was reached via a beach/named-spot
// search alias (see renderStationList's click handlers) — it names the searched-for
// place, distinct from `entry`, the real station its tides actually come from. Shows the
// resolved station's source + type + distance so it's always clear which data underlies
// the numbers, e.g. "Baltimore → Tragumna (beach model, 8 km) · heights vs Model MSL" or
// "Baltimore → Union Hall (tide gauge, 19 km) · heights vs OD Malin".
function renderHeader(entry, distanceKm, station, locality) {
  const el = document.getElementById("station-header");
  const datum = `heights vs ${station.chart_datum ?? "chart datum"}`;
  const type = stationSourceLabel(station);
  const dist = distanceKm != null ? `, ${fmtDistance(distanceKm)}` : "";
  if (locality && locality !== entry.name) {
    el.textContent = `${locality} → ${entry.name} (${type}${dist}) · ${datum}`;
    return;
  }
  el.textContent = `${entry.name}, ${entry.country} (${type}${dist}) · ${datum}`;
}

function renderTideTable(tides, timezone) {
  const table = document.createElement("table");
  for (const t of tides) {
    const row = document.createElement("tr");
    const isHigh = t.type === "high";
    row.innerHTML =
      `<td>${isHigh ? "▲ High" : "▼ Low"}</td>` +
      `<td class="time">${fmtTime(t.time, timezone)}</td>` +
      `<td class="height">${t.height.toFixed(2)} m</td>`;
    table.appendChild(row);
  }
  return table;
}

function renderDays(groups, timezone, emptyMessage = "No tide data for this range.") {
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

    dayEl.appendChild(renderTideTable(g.tides, timezone));
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
    const nearest = nearestStation(item.latitude, item.longitude, index);
    if (!nearest) {
      renderError(notFoundMessage);
      return;
    }
    showStation(nearest.station, nearest.distanceKm, item.name).catch(() => {
      renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
    });
  });
}

function renderStationList(stations, beachResults = [], namedSpotResults = []) {
  const list = document.getElementById("search-results");
  list.innerHTML = "";
  for (const m of stations.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `${m.name}, ${m.country}`;
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
  for (const s of namedSpotResults.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `📍 ${s.name}`;
    wireLocalityClick(li, s, "Couldn't find a nearby tide gauge for this spot.");
    list.appendChild(li);
  }
}

function selectedCountry() {
  return document.getElementById("country-filter").value;
}

// Sets #country-filter's value to `country` iff it's one of the select's
// existing options (populated from distinctCountries(index) in
// wireCountryFilter); otherwise leaves the current selection unchanged.
// Setting .value programmatically does NOT fire a "change" event, so this
// never triggers the change listener's renderStationList/clear side effect —
// callers that also want the list rendered must do so explicitly.
//
// This is how we offline-derive a "detected country" (from the resolved
// station's own `country` field) without any reverse-geocoding service. For
// the Phase 2 native app, the device locale/region (app-store based) could
// seed this instead of geolocation.
function setCountryFilter(country) {
  if (!country) return;
  const select = document.getElementById("country-filter");
  const hasOption = Array.from(select.options).some((o) => o.value === country);
  if (hasOption) {
    select.value = country;
  }
}

function searchScope() {
  const country = selectedCountry();
  return country ? filterByCountry(index, country) : index;
}

function wireSearch() {
  const input = document.getElementById("station-search");
  input.addEventListener("input", () => {
    const stationResults = searchStations(input.value, searchScope());
    // Beaches and named spots are both global search-only alias layers — not scoped
    // by #country-filter (spec: don't add them to the country dropdown or its
    // scoping). Named spots share the exact same {name, latitude, longitude} search
    // contract as beaches, so searchBeaches (name-substring match) is reused as-is.
    const beachResults = searchBeaches(input.value, beaches);
    const namedSpotResults = searchBeaches(input.value, namedSpots);
    renderStationList(stationResults, beachResults, namedSpotResults);
  });
}

function wireCountryFilter() {
  const select = document.getElementById("country-filter");
  for (const country of distinctCountries(index)) {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    if (select.value) {
      renderStationList(filterByCountry(index, select.value));
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
    const result = nearestStation(lat, lon, index);
    if (!result) {
      renderError("Couldn't get your location — search for a gauge or pick a country.");
      return;
    }
    const { station, distanceKm } = result;
    // Reflect the detected station's country in the dropdown before
    // rendering; searchScope() reads the select value, so this also scopes
    // subsequent searches to the user's country.
    setCountryFilter(station.country);
    await showStation(station, distanceKm);
  } catch (err) {
    // Denied/unavailable/timeout → always leave a visible, actionable
    // message instead of failing silently (was the iOS "does nothing" bug).
    renderError(geolocationErrorMessage(err));
  }
}

export async function init() {
  initThemeToggle();
  await loadIndex();
  wireSearch();
  wireCountryFilter();
  wireDayCount();
  document.getElementById("use-location").addEventListener("click", useMyLocation);

  const savedId = localStorage.getItem(LS_KEY);
  const saved = index.find((s) => s.id === savedId);
  if (saved) {
    setCountryFilter(saved.country);
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
    renderStatus('Tap "Use my location", pick a country, or search for a gauge.');
  }
}
