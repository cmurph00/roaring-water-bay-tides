import { test } from "node:test";
import assert from "node:assert/strict";
import { chartDatumOffset } from "../src/datum.js";

test("chartDatumOffset uses observed MSL-LAT datums when present (TICON)", () => {
  // Portrush's real datums: MSL 1.293 above the reference, LAT 0.075 → offset 1.218.
  const station = { datums: { HAT: 2.594, MSL: 1.293, LAT: 0.075 } };
  assert.equal(Math.round(chartDatumOffset(station) * 1000) / 1000, 1.218);
});

test("chartDatumOffset approximates LAT from the lowest low (MI/EPA precomputed, tuple form)", () => {
  // Marine Institute style: [epochMs, height, type]; lowest low -2.04 → offset +2.04.
  const station = {
    chart_datum: "OD Malin",
    tides: [
      [1, 1.85, "high"], [2, -2.04, "low"], [3, 1.2, "high"], [4, -0.63, "low"],
    ],
  };
  assert.equal(chartDatumOffset(station), 2.04);
});

test("chartDatumOffset accepts object-form tides and a separate representative set", () => {
  const station = { name: "Bangor" }; // harmonic, no datums, no precomputed tides
  const yearOfTides = [
    { time: 1, height: 1.6, type: "high" },
    { time: 2, height: -1.9, type: "low" },
    { time: 3, height: -1.4, type: "low" },
  ];
  assert.equal(chartDatumOffset(station, yearOfTides), 1.9);
});

test("chartDatumOffset falls through when datums lack a finite LAT", () => {
  const station = { datums: { MSL: 0 }, tides: [[1, -1.7, "low"], [2, 1.5, "high"]] };
  assert.equal(chartDatumOffset(station), 1.7);
});

test("chartDatumOffset returns 0 when there is nothing to work from", () => {
  assert.equal(chartDatumOffset({}), 0);
  assert.equal(chartDatumOffset({ tides: [] }), 0);
});
