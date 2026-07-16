import { test } from "node:test";
import assert from "node:assert/strict";
import { featureToNiBeach, dedupNiBeaches } from "../scripts/build-ni-beaches.mjs";

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

test("featureToNiBeach maps a council export's Water_Qual to classification", () => {
  // Causeway Coast & Glens council GeoJSON uses `Water_Qual`, not `Classification`.
  const f = { properties: { Name: "Portstewart Strand", Water_Qual: "Excellent" },
              geometry: { type: "Point", coordinates: [-6.73, 55.171] } };
  const b = featureToNiBeach(f);
  assert.equal(b.name, "Portstewart Strand");
  assert.equal(b.classification, "Excellent");
  assert.equal(b.country, "Northern Ireland");
});

test("dedupNiBeaches drops same-name rows at the same ~100m location, keeps distinct ones", () => {
  const input = [
    { name: "East Strand", latitude: 55.205, longitude: -6.647, country: "Northern Ireland", type: "beach" },
    { name: "East Strand", latitude: 55.2051, longitude: -6.6472, country: "Northern Ireland", type: "beach" }, // dup (~100m)
    { name: "Whiterocks", latitude: 55.206, longitude: -6.612, country: "Northern Ireland", type: "beach" },
  ];
  const out = dedupNiBeaches(input);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((b) => b.name), ["East Strand", "Whiterocks"]);
});
