import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  nearestStation,
  searchStations,
  distinctCountries,
  filterByCountry,
  assignCounties,
  distinctCounties,
  filterByCounty,
  searchBeaches,
  searchPlaces,
} from "../src/location.js";

const stations = [
  { id: "a", name: "Cork", country: "Ireland", latitude: 51.9, longitude: -8.3, timezone: "Europe/Dublin" },
  { id: "b", name: "Dover", country: "United Kingdom", latitude: 51.1, longitude: 1.3, timezone: "Europe/London" },
];

test("haversineKm computes a known distance", () => {
  const d = haversineKm({ lat: 51.9, lon: -8.3 }, { lat: 51.1, lon: 1.3 });
  assert.ok(d > 600 && d < 720, `expected ~660 km, got ${d}`);
});

test("nearestStation picks the closest gauge", () => {
  const { station, distanceKm } = nearestStation(51.5, -8.5, stations);
  assert.equal(station.id, "a");
  assert.ok(distanceKm < 60);
});

test("searchStations matches by name, case-insensitive", () => {
  assert.deepEqual(searchStations("dov", stations).map((s) => s.id), ["b"]);
});

test("distinctCountries returns unique, sorted, truthy countries without mutating input", () => {
  const input = [
    { country: "Ireland" },
    { country: "France" },
    { country: "Ireland" },
    { country: "" },
  ];
  const copy = input.map((s) => ({ ...s }));
  assert.deepEqual(distinctCountries(input), ["France", "Ireland"]);
  assert.deepEqual(input, copy, "input array must not be mutated");
});

test("filterByCountry returns only stations matching the exact country", () => {
  assert.deepEqual(
    filterByCountry(stations, "Ireland").map((s) => s.id),
    ["a"]
  );
});

test("filterByCountry returns [] for a falsy country (All countries)", () => {
  assert.deepEqual(filterByCountry(stations, ""), []);
  assert.deepEqual(filterByCountry(stations, null), []);
  assert.deepEqual(filterByCountry(stations, undefined), []);
});

const countyPlaces = [
  { name: "Cork", latitude: 51.9, longitude: -8.47, county: "Cork" },
  { name: "Tralee", latitude: 52.27, longitude: -9.7, county: "Kerry" },
  { name: "NoCounty", latitude: 51.5, longitude: -9.0 }, // a place without a county is ignored
];

test("assignCounties tags an in-box station with its nearest county-place's county", () => {
  const s = [
    { id: "cork", latitude: 51.85, longitude: -8.5 }, // ~ Cork harbour
    { id: "kerry", latitude: 52.26, longitude: -9.71 }, // ~ Tralee bay
  ];
  assignCounties(s, countyPlaces);
  assert.equal(s[0].county, "Cork");
  assert.equal(s[1].county, "Kerry");
});

test("assignCounties leaves a non-Irish (out-of-box) station without a county", () => {
  const s = [{ id: "aberdeen", latitude: 57.144, longitude: -2.08 }];
  assignCounties(s, countyPlaces);
  assert.equal("county" in s[0], false);
});

test("assignCounties leaves an in-box station with no county-place within range county-less", () => {
  const s = [{ id: "midlands", latitude: 53.4, longitude: -7.9 }]; // >25km from Cork/Tralee
  assignCounties(s, countyPlaces);
  assert.equal("county" in s[0], false);
});

test("distinctCounties returns unique, sorted, truthy counties", () => {
  const input = [{ county: "Cork" }, { county: "Kerry" }, { county: "Cork" }, {}, { county: "" }];
  assert.deepEqual(distinctCounties(input), ["Cork", "Kerry"]);
});

test("filterByCounty returns only stations in the county, [] for a falsy county", () => {
  const s = [{ id: "a", county: "Cork" }, { id: "b", county: "Kerry" }];
  assert.deepEqual(filterByCounty(s, "Cork").map((x) => x.id), ["a"]);
  assert.deepEqual(filterByCounty(s, ""), []);
});

const beaches = [
  { name: "Tragumna", latitude: 51.52, longitude: -9.34, classification: "Excellent", url: "https://example.org/tragumna", country: "Ireland", type: "beach" },
  { name: "Sandycove", latitude: 53.2896, longitude: -6.1128, classification: "Good", url: "https://example.org/sandycove", country: "Ireland", type: "beach" },
];

test("searchBeaches matches by name, case-insensitive substring", () => {
  assert.deepEqual(searchBeaches("trag", beaches).map((b) => b.name), ["Tragumna"]);
  assert.deepEqual(searchBeaches("TRAG", beaches).map((b) => b.name), ["Tragumna"]);
  assert.deepEqual(searchBeaches("cove", beaches).map((b) => b.name), ["Sandycove"]);
});

test("searchBeaches returns [] for an empty or whitespace-only query", () => {
  assert.deepEqual(searchBeaches("", beaches), []);
  assert.deepEqual(searchBeaches("   ", beaches), []);
});

test("searchBeaches returns [] when no beach name matches", () => {
  assert.deepEqual(searchBeaches("nowhere", beaches), []);
});

// searchPlaces (Task 24): the GeoNames coastal-place gazetteer's search — same
// name-substring contract as searchBeaches, plus matching a place's alternate names.

const places = [
  { name: "Schull", latitude: 51.52487, longitude: -9.54798, kind: "town", alt: ["An Scoil", "Skull"] },
  { name: "Sherkin Island", latitude: 51.46727, longitude: -9.41906, kind: "island", alt: ["Inis Arcain", "Inis Arcáin"] },
  { name: "Cape Clear", latitude: 51.42556, longitude: -9.51889, kind: "cape" },
];

test("searchPlaces matches by name, case-insensitive substring", () => {
  assert.deepEqual(searchPlaces("schu", places).map((p) => p.name), ["Schull"]);
  assert.deepEqual(searchPlaces("SCHU", places).map((p) => p.name), ["Schull"]);
});

test("searchPlaces also matches by alternate name", () => {
  assert.deepEqual(searchPlaces("skull", places).map((p) => p.name), ["Schull"]);
  assert.deepEqual(searchPlaces("arcain", places).map((p) => p.name), ["Sherkin Island"]);
});

test("searchPlaces works for a place with no `alt` field at all", () => {
  assert.deepEqual(searchPlaces("cape clear", places).map((p) => p.name), ["Cape Clear"]);
});

test("searchPlaces returns [] for an empty or whitespace-only query", () => {
  assert.deepEqual(searchPlaces("", places), []);
  assert.deepEqual(searchPlaces("   ", places), []);
});

test("searchPlaces returns [] when nothing matches name or alt", () => {
  assert.deepEqual(searchPlaces("nowhere", places), []);
});
