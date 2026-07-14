import {
  nearestStation,
  searchStations,
  detectLocation,
  distinctCountries,
  filterByCountry,
} from "./location.js";
import { getTides } from "./resolver.js";
import { applyCorrection } from "./correction.js";
import { fmtTime, fmtDistance, localDayISO, groupByLocalDay, fmtDayLabel } from "./format.js";

const INDEX_URL = "./data/stations.json";
const stationUrl = (id) => `./data/stations/${id.replace(/\//g, "_")}.json`;
const LS_KEY = "rwb.selectedStationId";
const LS_DAYS_KEY = "rwb.days";
const VALID_DAY_COUNTS = [1, 3, 5, 7, 10];
const DEFAULT_DAY_COUNT = 3;
const MAX_RESULTS = 50;

let index = [];
// The currently-selected station (entry + distance), kept so the day-count
// control can re-render without re-running search/geolocation/selection.
let currentSelection = null;

async function loadIndex() {
  index = await fetch(INDEX_URL).then((r) => r.json());
}

async function loadStation(id) {
  return fetch(stationUrl(id)).then((r) => r.json());
}

async function showStation(entry, distanceKm) {
  localStorage.setItem(LS_KEY, entry.id);
  const station = await loadStation(entry.id);
  currentSelection = { entry, distanceKm };

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

  renderHeader(entry, distanceKm, station);
  renderDays(groups, station.timezone);
}

function renderError(message) {
  const container = document.getElementById("results");
  container.innerHTML = `<div class="err">${message}</div>`;
}

function renderHeader(entry, distanceKm, station) {
  const el = document.getElementById("station-header");
  const dist = distanceKm != null ? ` · nearest gauge ${fmtDistance(distanceKm)} away` : "";
  el.textContent = `${entry.name}, ${entry.country}${dist} · heights vs ${station.chart_datum ?? "chart datum"}`;
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

function renderDays(groups, timezone) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  if (!groups.length) {
    container.innerHTML = '<div class="empty">No tide data for this range.</div>';
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

function renderStationList(stations) {
  const list = document.getElementById("search-results");
  list.innerHTML = "";
  for (const m of stations.slice(0, MAX_RESULTS)) {
    const li = document.createElement("li");
    li.textContent = `${m.name}, ${m.country}`;
    li.addEventListener("click", () => {
      // Close the dropdown and clear the query as soon as a station is chosen.
      list.innerHTML = "";
      const input = document.getElementById("station-search");
      if (input) input.value = "";
      showStation(m, null).catch(() => {
        renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
      });
    });
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
    renderStationList(searchStations(input.value, searchScope()));
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
      showStation(currentSelection.entry, currentSelection.distanceKm).catch(() => {
        renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
      });
    }
  });
}

async function useMyLocation() {
  try {
    const { lat, lon } = await detectLocation();
    const { station, distanceKm } = nearestStation(lat, lon, index);
    // Reflect the detected station's country in the dropdown before
    // rendering; searchScope() reads the select value, so this also scopes
    // subsequent searches to the user's country.
    setCountryFilter(station.country);
    await showStation(station, distanceKm);
  } catch {
    // Denied/unavailable → leave last-used/default in place
  }
}

export async function init() {
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
    useMyLocation(); // first run: try geolocation
  }
}
