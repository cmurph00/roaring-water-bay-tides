import { test } from "node:test";
import assert from "node:assert/strict";
import { featureToNiBeach } from "../scripts/build-ni-beaches.mjs";

test("featureToNiBeach maps a DAERA Point feature", () => {
  const f = { properties: { Name: "Ballyholme", Classification: "Excellent" },
              geometry: { type: "Point", coordinates: [-5.66, 54.66] } };
  assert.deepEqual(featureToNiBeach(f), {
    name: "Ballyholme", latitude: 54.66, longitude: -5.66,
    classification: "Excellent", url: null, country: "Northern Ireland", type: "beach" });
});

test("featureToNiBeach returns null for unusable features", () => {
  assert.equal(featureToNiBeach({ properties: {}, geometry: null }), null);
  assert.equal(featureToNiBeach({ properties: { Name: "" }, geometry: { type: "Point", coordinates: [1, 2] } }), null);
});
