import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtTime, fmtDistance } from "../src/format.js";

test("fmtTime renders in the station's timezone, 24h", () => {
  const d = new Date("2026-07-14T04:29:00Z"); // 05:29 IST
  assert.equal(fmtTime(d, "Europe/Dublin"), "05:29");
  assert.equal(fmtTime(d, "Europe/London"), "05:29");
  assert.equal(fmtTime(d, "Europe/Paris"), "06:29"); // proves tz is honoured, not hardcoded
});

test("fmtDistance rounds sensibly", () => {
  assert.equal(fmtDistance(3.4), "3 km");
  assert.equal(fmtDistance(34.6), "35 km");
});
