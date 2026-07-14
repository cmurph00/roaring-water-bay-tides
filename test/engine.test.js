import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { useStation } from "../src/engine.js";

const station = JSON.parse(
  await readFile(new URL("./fixtures/ringaskiddy.json", import.meta.url))
);

test("engine reproduces known Ringaskiddy extremes for 2026-07-14", () => {
  const predictor = useStation(station);
  const start = new Date("2026-07-14T00:00:00+01:00");
  const end = new Date("2026-07-14T23:59:59+01:00");
  const { extremes } = predictor.getExtremesPrediction({ start, end });

  const highs = extremes
    .filter((e) => e.high)
    .map((e) => new Date(e.time))
    .filter((d) => d >= start && d <= end)
    .sort((a, b) => a - b);

  // Morning high ~05:46 IST, ~4.02 m; evening high ~18:13 IST, ~4.23 m
  const fmt = (d) =>
    d.toLocaleTimeString("en-IE", { timeZone: "Europe/Dublin", hour: "2-digit", minute: "2-digit", hour12: false });

  assert.equal(highs.length, 2, "expected two daytime highs");
  assert.equal(fmt(highs[0]), "05:46");
  assert.equal(fmt(highs[1]), "18:13");
});
