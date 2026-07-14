import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialSafe, inRegion } from "../scripts/build-data.mjs";

test("isCommercialSafe rejects non-commercial licenses", () => {
  assert.equal(isCommercialSafe({ type: "cc-by-nc-4.0", commercial_use: false }), false);
  assert.equal(isCommercialSafe({ type: "cc-by-4.0", commercial_use: true }), true);
  assert.equal(isCommercialSafe("cc-by-nc-4.0"), false);
  assert.equal(isCommercialSafe("public-domain"), true);
  assert.equal(isCommercialSafe(undefined), true); // NOAA public-domain often omits license
});

test("inRegion keeps only European stations", () => {
  assert.equal(inRegion({ continent: "Europe" }), true);
  assert.equal(inRegion({ continent: "North America" }), false);
});
