import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getTides } from "../src/resolver.js";

const station = JSON.parse(
  await readFile(new URL("./fixtures/ringaskiddy.json", import.meta.url))
);

test("getTides returns well-formed high/low extremes for a day", async () => {
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const tides = await getTides(station, { start, end });

  assert.ok(tides.length >= 3, "expected multiple extremes in a day");
  for (const t of tides) {
    assert.ok(t.type === "high" || t.type === "low");
    assert.ok(t.time instanceof Date);
    assert.equal(typeof t.height, "number");
  }
  // Ordered by time
  for (let i = 1; i < tides.length; i++) assert.ok(tides[i].time >= tides[i - 1].time);
});
