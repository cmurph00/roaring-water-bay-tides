import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCorrection } from "../src/correction.js";

const base = [
  { type: "high", time: new Date("2026-07-14T05:46:00Z"), height: 4.0 },
  { type: "low", time: new Date("2026-07-14T12:26:00Z"), height: 0.6 },
];

test("null correction is a passthrough", () => {
  assert.deepEqual(applyCorrection(base, null), base);
});

test("time offsets shift highs and lows independently", () => {
  const out = applyCorrection(base, { timeOffsetMin: { high: -17, low: -27 } });
  assert.equal(out[0].time.toISOString(), "2026-07-14T05:29:00.000Z"); // -17 min
  assert.equal(out[1].time.toISOString(), "2026-07-14T11:59:00.000Z"); // -27 min
});

test("partial timeOffsetMin (high only) shifts highs and leaves lows unchanged", () => {
  const out = applyCorrection(base, { timeOffsetMin: { high: -10 } });
  assert.equal(out[0].time.toISOString(), "2026-07-14T05:36:00.000Z"); // -10 min
  assert.equal(out[1].time.toISOString(), base[1].time.toISOString()); // low untouched, not Invalid Date
});
