import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMiTimeUTC, rowToTide } from "../scripts/build-mi.mjs";

test("parseMiTimeUTC parses DD/MM/YYYY HH:MM as a UTC epoch", () => {
  assert.equal(parseMiTimeUTC("14/07/2026 04:30"), Date.UTC(2026, 6, 14, 4, 30));
});

test("parseMiTimeUTC handles single-digit day/month/hour without a leading zero", () => {
  assert.equal(parseMiTimeUTC("1/1/2026 3:40"), Date.UTC(2026, 0, 1, 3, 40));
});

test("rowToTide converts a HIGH row to [epochMs, height, \"high\"]", () => {
  const row = ["Union_Hall", "-9.1335", "51.559", "14/07/2026 04:30", "HIGH", "1.305"];
  assert.deepEqual(rowToTide(row), [Date.UTC(2026, 6, 14, 4, 30), 1.305, "high"]);
});

test("rowToTide converts a LOW row to \"low\" with a numeric (possibly negative) height", () => {
  const row = ["Union_Hall", "-9.1335", "51.559", "14/07/2026 09:05", "LOW", "-1.388"];
  const [epoch, height, type] = rowToTide(row);
  assert.equal(epoch, Date.UTC(2026, 6, 14, 9, 5));
  assert.equal(height, -1.388);
  assert.equal(type, "low");
});
