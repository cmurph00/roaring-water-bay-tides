import { test } from "node:test";
import assert from "node:assert/strict";
import { CACHE_ASSETS, CACHE_VERSION } from "../src/cache-manifest.js";

test("app shell and data index are precached for offline", () => {
  assert.ok(CACHE_ASSETS.includes("./index.html"));
  assert.ok(CACHE_ASSETS.includes("./data/stations.json"));
  assert.ok(CACHE_ASSETS.some((a) => a.startsWith("./src/")));
});

test("CACHE_VERSION is a non-empty string", () => {
  assert.equal(typeof CACHE_VERSION, "string");
  assert.ok(CACHE_VERSION.length > 0);
});
