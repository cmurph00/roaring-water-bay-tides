import {
  nearestStation,
  searchStations,
  detectLocation,
  distinctCountries,
  filterByCountry,
} from "./location.js";
import { getTides } from "./resolver.js";
import { applyCorrection } from "./correction.js";
import { fmtTime, fmtDistance } from "./format.js";

const INDEX_URL = "./data/stations.json";
const stationUrl = (id) => `./data/stations/${id.replace(/\//g, "_")}.json`;
const LS_KEY = "rwb.selectedStationId";
const MAX_RESULTS = 50;

let index = [];

async function loadIndex() {
  index = await fetch(INDEX_URL).then((r) => r.json());
}

async function loadStation(id) {
  return fetch(stationUrl(id)).then((r) => r.json());
}

async function showStation(entry, distanceKm) {
  localStorage.setItem(LS_KEY, entry.id);
  const station = await loadStation(entry.id);
  // "Today" is the browser-local calendar day; switch to the station's own
  // timezone here once date-picking/multi-timezone browsing is added, so a
  // user near a day boundary doesn't see the wrong local day for a distant station.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  let tides = await getTides(station, { start, end });
  tides = applyCorrection(tides, null); // home-spot correction wired later if configured
  renderHeader(entry, distanceKm, station);
  renderTides(tides, station.timezone);
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

function renderTides(tides, timezone) {
  const container = document.getElementById("results");
  container.innerHTML = "";
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
  container.appendChild(table);
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

async function useMyLocation() {
  try {
    const { lat, lon } = await detectLocation();
    const { station, distanceKm } = nearestStation(lat, lon, index);
    await showStation(station, distanceKm);
  } catch {
    // Denied/unavailable → leave last-used/default in place
  }
}

export async function init() {
  await loadIndex();
  wireSearch();
  wireCountryFilter();
  document.getElementById("use-location").addEventListener("click", useMyLocation);

  const savedId = localStorage.getItem(LS_KEY);
  const saved = index.find((s) => s.id === savedId);
  if (saved) {
    try {
      await showStation(saved, null);
    } catch {
      renderError("Couldn't load that station offline — pick one you've viewed before, or reconnect.");
    }
  } else {
    useMyLocation(); // first run: try geolocation
  }
}
