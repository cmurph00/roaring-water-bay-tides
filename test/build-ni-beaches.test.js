import { test } from "node:test";
import assert from "node:assert/strict";
import { featureToNiBeach, dedupNiBeaches, normalizeBeachName, extractLonLat } from "../scripts/build-ni-beaches.mjs";

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

test("normalizeBeachName title-cases ALL-CAPS official names, leaves mixed case", () => {
  assert.equal(normalizeBeachName("PORTRUSH WHITEROCKS"), "Portrush Whiterocks");
  assert.equal(normalizeBeachName("BROWN'S BAY"), "Brown's Bay");
  assert.equal(normalizeBeachName("Portstewart Strand"), "Portstewart Strand");
});

test("extractLonLat prefers centroidX/Y, falls back to polygon outer-ring vertex", () => {
  assert.deepEqual(extractLonLat({ centroidX: -6.54, centroidY: 55.22 }, { type: "Polygon", coordinates: [[[-1, -1], [0, 0]]] }), [-6.54, 55.22]);
  assert.deepEqual(extractLonLat({}, { type: "Polygon", coordinates: [[[-6.5, 55.2], [0, 0]]] }), [-6.5, 55.2]);
  assert.equal(extractLonLat({}, { type: "LineString", coordinates: [] }), null);
});

test("featureToNiBeach maps a DAERA directive Polygon feature (centroid + ALL-CAPS + HYPERLINK)", () => {
  const f = {
    properties: { Name: "HELEN'S BAY", Water_Qual: "Excellent", HYPERLINK: "https://daera-ni.gov.uk", centroidX: -5.735, centroidY: 54.674 },
    geometry: { type: "Polygon", coordinates: [[[-5.74, 54.67], [-5.73, 54.68], [-5.74, 54.67]]] },
  };
  const b = featureToNiBeach(f);
  assert.equal(b.name, "Helen's Bay");
  assert.equal(b.latitude, 54.674);
  assert.equal(b.longitude, -5.735);
  assert.equal(b.classification, "Excellent");
  assert.equal(b.url, "https://daera-ni.gov.uk");
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
