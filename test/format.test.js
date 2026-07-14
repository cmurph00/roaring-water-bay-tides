import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtTime, fmtDistance, localDayISO, groupByLocalDay, fmtDayLabel } from "../src/format.js";

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

test("localDayISO is timezone-aware crossing forward over UTC midnight", () => {
  // 23:30 UTC on 2026-07-13 is 00:30 the NEXT day in Dublin (UTC+1 in summer)
  assert.equal(localDayISO(new Date("2026-07-13T23:30:00Z"), "Europe/Dublin"), "2026-07-14");
});

test("localDayISO is timezone-aware crossing backward over UTC midnight", () => {
  // 02:00 UTC on 2026-07-14 is still 2026-07-13 evening in New York (UTC-4 in summer)
  assert.equal(localDayISO(new Date("2026-07-14T02:00:00Z"), "America/New_York"), "2026-07-13");
});

test("groupByLocalDay groups tides by station-local calendar day, ascending, without mutating input", () => {
  const tz = "Europe/Dublin";
  const tides = [
    { type: "high", time: new Date("2026-07-14T05:00:00Z"), height: 3.1 }, // 06:00 local, Jul 14
    { type: "low", time: new Date("2026-07-14T11:00:00Z"), height: 0.8 }, // 12:00 local, Jul 14
    { type: "high", time: new Date("2026-07-14T23:15:00Z"), height: 3.3 }, // 00:15 local Jul 15
  ];
  const before = JSON.stringify(tides);
  const groups = groupByLocalDay(tides, tz);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].day, "2026-07-14");
  assert.equal(groups[1].day, "2026-07-15");
  assert.equal(groups[0].tides.length, 2);
  assert.equal(groups[1].tides.length, 1);
  // time order preserved within group
  assert.equal(groups[0].tides[0].height, 3.1);
  assert.equal(groups[0].tides[1].height, 0.8);
  assert.equal(groups[1].tides[0].height, 3.3);
  // input untouched
  assert.equal(JSON.stringify(tides), before);
});

test("fmtDayLabel renders a short human label", () => {
  // 2026-07-14 is a Tuesday
  assert.equal(fmtDayLabel("2026-07-14", "Europe/Dublin"), "Tue 14 Jul");
});
