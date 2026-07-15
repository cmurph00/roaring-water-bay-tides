import { test } from "node:test";
import assert from "node:assert/strict";
import { featureToBeach } from "../scripts/build-beaches.mjs";

// EPA WFS GeoJSON features are MultiPoint in practice; Point is also handled defensively
// in case the server ever returns a single-point geometry for a feature.

test("featureToBeach maps a MultiPoint feature to a beach record", () => {
  const feature = {
    properties: {
      Name: "Tragumna",
      CurrentClassification: "Excellent",
      URL: "https://waterqualitycheck.epa.ie/CurrentStatus/Details/Tragumna",
    },
    geometry: { type: "MultiPoint", coordinates: [[-9.34, 51.52]] },
  };
  assert.deepEqual(featureToBeach(feature), {
    name: "Tragumna",
    latitude: 51.52,
    longitude: -9.34,
    classification: "Excellent",
    url: "https://waterqualitycheck.epa.ie/CurrentStatus/Details/Tragumna",
    country: "Ireland",
    type: "beach",
  });
});

test("featureToBeach maps a Point feature to a beach record", () => {
  const feature = {
    properties: {
      Name: "Sandycove",
      CurrentClassification: "Good",
      URL: "https://waterqualitycheck.epa.ie/CurrentStatus/Details/Sandycove",
    },
    geometry: { type: "Point", coordinates: [-6.1128, 53.2896] },
  };
  assert.deepEqual(featureToBeach(feature), {
    name: "Sandycove",
    latitude: 53.2896,
    longitude: -6.1128,
    classification: "Good",
    url: "https://waterqualitycheck.epa.ie/CurrentStatus/Details/Sandycove",
    country: "Ireland",
    type: "beach",
  });
});

test("featureToBeach returns null for an empty MultiPoint coordinates array", () => {
  const feature = {
    properties: { Name: "No Coords" },
    geometry: { type: "MultiPoint", coordinates: [] },
  };
  assert.equal(featureToBeach(feature), null);
});

test("featureToBeach returns null for missing/null geometry", () => {
  assert.equal(featureToBeach({ properties: { Name: "X" }, geometry: null }), null);
  assert.equal(featureToBeach({ properties: { Name: "X" } }), null);
});

test("featureToBeach returns null for non-finite coordinates", () => {
  const feature = {
    properties: { Name: "Bad" },
    geometry: { type: "MultiPoint", coordinates: [["oops", "nope"]] },
  };
  assert.equal(featureToBeach(feature), null);
});

test("featureToBeach returns null when the feature has no usable Name", () => {
  const feature = {
    properties: { CurrentClassification: "Excellent" },
    geometry: { type: "MultiPoint", coordinates: [[-9.34, 51.52]] },
  };
  assert.equal(featureToBeach(feature), null);
});
