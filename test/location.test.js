import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  nearestStation,
  searchStations,
  distinctCountries,
  filterByCountry,
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
