import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COASTAL_RADIUS_KM,
  COASTAL_FEATURE_KIND,
  parseGeonamesLine,
  kindForRow,
  countyForRow,
  altNamesForRow,
  rowToPlace,
  isNearAnySource,
  placeDedupKey,
  dedupPlaces,
  NAME_OVERRIDES,
} from "../scripts/build-places.mjs";

// --- parseGeonamesLine -------------------------------------------------------

test("parseGeonamesLine parses a tab-separated GeoNames row into the fields we use", () => {
  const line =
    "2961455\tSchull\tSchull\tAn Scoil,Schull,Scoil Mhuire,Skull\t51.52487\t-9.54798\tP\tPPL\tIE\t\tM\t04\t\t\t700\t\t28\tEurope/Dublin\t2022-01-27";
  const row = parseGeonamesLine(line);
  assert.equal(row.name, "Schull");
  assert.equal(row.asciiname, "Schull");
  assert.equal(row.alternatenames, "An Scoil,Schull,Scoil Mhuire,Skull");
  assert.equal(row.latitude, 51.52487);
  assert.equal(row.longitude, -9.54798);
  assert.equal(row.featureClass, "P");
  assert.equal(row.featureCode, "PPL");
  assert.equal(row.population, 700);
  assert.equal(row.countryCode, "IE");
});

// --- kindForRow ---------------------------------------------------------------

test("kindForRow labels real town/village populated-place codes as 'town'", () => {
  assert.equal(kindForRow({ featureClass: "P", featureCode: "PPL" }), "town");
  assert.equal(kindForRow({ featureClass: "P", featureCode: "PPLA2" }), "town");
  assert.equal(kindForRow({ featureClass: "P", featureCode: "PPLC" }), "town"); // capital (Dublin)
});

test("kindForRow demotes crossroads/townland populated-place codes to 'locality'", () => {
  // PPLL localities (e.g. "Mall Cross Roads"), PPLX sections, PPLF farms — searchable but not map-labelled.
  assert.equal(kindForRow({ featureClass: "P", featureCode: "PPLL" }), "locality");
  assert.equal(kindForRow({ featureClass: "P", featureCode: "PPLX" }), "locality");
});

test("rowToPlace carries population as `pop` when present, and omits it when zero", () => {
  const base = { name: "Schull", asciiname: "Schull", alternatenames: "", latitude: 51.52, longitude: -9.55, featureClass: "P", featureCode: "PPL" };
  assert.equal(rowToPlace({ ...base, population: 700 }).pop, 700);
  assert.equal("pop" in rowToPlace({ ...base, population: 0 }), false);
});

test("countyForRow maps admin1.admin2 to an Irish county, else null", () => {
  assert.equal(countyForRow({ admin1: "M", admin2: "04" }), "Cork");
  assert.equal(countyForRow({ admin1: "M", admin2: "11" }), "Kerry");
  assert.equal(countyForRow({ admin1: "U", admin2: "06" }), "Donegal");
  assert.equal(countyForRow({ admin1: "L", admin2: "35" }), "Dublin"); // Fingal collapses to Dublin
  assert.equal(countyForRow({ admin1: "X", admin2: "99" }), null); // unmapped/non-IE
});

test("rowToPlace carries `county` when the admin codes map to one", () => {
  const row = { name: "Schull", asciiname: "Schull", alternatenames: "", latitude: 51.52, longitude: -9.55, featureClass: "P", featureCode: "PPL", admin1: "M", admin2: "04" };
  assert.equal(rowToPlace(row).county, "Cork");
});

test("kindForRow maps curated H/T/L feature codes to their kind", () => {
  assert.equal(kindForRow({ featureClass: "H", featureCode: "BAY" }), "bay");
  assert.equal(kindForRow({ featureClass: "H", featureCode: "HBR" }), "harbour");
  assert.equal(kindForRow({ featureClass: "H", featureCode: "COVE" }), "cove");
  assert.equal(kindForRow({ featureClass: "T", featureCode: "ISL" }), "island");
  assert.equal(kindForRow({ featureClass: "T", featureCode: "CAPE" }), "cape");
  assert.equal(kindForRow({ featureClass: "L", featureCode: "PRT" }), "port");
});

test("kindForRow returns null for irrelevant feature codes (inland terrain/water)", () => {
  assert.equal(kindForRow({ featureClass: "T", featureCode: "MT" }), null); // mountain
  assert.equal(kindForRow({ featureClass: "H", featureCode: "LK" }), null); // lake
  assert.equal(kindForRow({ featureClass: "H", featureCode: "STM" }), null); // stream
  assert.equal(kindForRow({ featureClass: "L", featureCode: "PRK" }), null); // park
});

test("COASTAL_FEATURE_KIND has no feature_class P entries (handled separately)", () => {
  // Sanity check that the curated map isn't accidentally duplicating the "town" branch.
  assert.equal(COASTAL_FEATURE_KIND.PPL, undefined);
});

// --- altNamesForRow -------------------------------------------------------------

test("altNamesForRow extracts alternate names, dropping ones equal to name/asciiname", () => {
  const row = { name: "Schull", asciiname: "Schull", alternatenames: "An Scoil,Schull,Scoil Mhuire,Skull" };
  assert.deepEqual(altNamesForRow(row), ["An Scoil", "Scoil Mhuire", "Skull"]);
});

test("altNamesForRow is case-insensitive when matching the primary name and dedupes", () => {
  const row = { name: "Baltimore", asciiname: "Baltimore", alternatenames: "BALTIMORE,baltimore,Dun na Sead,Dun na Sead" };
  assert.deepEqual(altNamesForRow(row), ["Dun na Sead"]);
});

test("altNamesForRow skips entries with parenthesised annotations", () => {
  const row = { name: "Foo", asciiname: "Foo", alternatenames: "Foo Historical (historical),Bar" };
  assert.deepEqual(altNamesForRow(row), ["Bar"]);
});

test("altNamesForRow returns [] when alternatenames is empty/absent", () => {
  assert.deepEqual(altNamesForRow({ name: "X", asciiname: "X", alternatenames: "" }), []);
  assert.deepEqual(altNamesForRow({ name: "X", asciiname: "X" }), []);
});

test("altNamesForRow respects the max cap", () => {
  const row = { name: "X", asciiname: "X", alternatenames: "a,b,c,d,e,f,g,h" };
  assert.deepEqual(altNamesForRow(row, { max: 3 }), ["a", "b", "c"]);
});

// --- rowToPlace ------------------------------------------------------------------

test("rowToPlace converts a populated-place row into a town place record", () => {
  const row = {
    name: "Schull",
    asciiname: "Schull",
    alternatenames: "Skull",
    latitude: 51.52487,
    longitude: -9.54798,
    featureClass: "P",
    featureCode: "PPL",
  };
  assert.deepEqual(rowToPlace(row), {
    name: "Schull",
    latitude: 51.52487,
    longitude: -9.54798,
    kind: "town",
    alt: ["Skull"],
  });
});

test("rowToPlace omits `alt` entirely when there are no alternate names to keep", () => {
  const row = {
    name: "Cape Clear",
    asciiname: "Cape Clear",
    alternatenames: "Cape Clear",
    latitude: 51.42556,
    longitude: -9.51889,
    featureClass: "T",
    featureCode: "CAPE",
  };
  assert.deepEqual(rowToPlace(row), { name: "Cape Clear", latitude: 51.42556, longitude: -9.51889, kind: "cape" });
});

test("rowToPlace applies a curated NAME_OVERRIDE and keeps the original name searchable as alt", () => {
  // Roaring Water Bay island: GeoNames "Hare Island" in Cork -> displayed "Hare / Heir Island",
  // disambiguating from Galway Bay's Hare Island (which the county label handles).
  assert.equal(NAME_OVERRIDES["Hare Island|Cork"], "Hare / Heir Island");
  const row = {
    name: "Hare Island", asciiname: "Hare Island", alternatenames: "Heir Island,Inishdriscol",
    latitude: 51.49583, longitude: -9.43333, featureClass: "T", featureCode: "ISL", admin1: "M", admin2: "04",
  };
  const place = rowToPlace(row);
  assert.equal(place.name, "Hare / Heir Island");
  assert.equal(place.county, "Cork");
  assert.ok(place.alt.includes("Hare Island"), "original GeoNames name kept as a searchable alt");
});

test("rowToPlace leaves a same-named place in a different county unchanged (no override)", () => {
  // Galway Bay's Hare Island has no override — only the county label distinguishes it.
  const row = { name: "Hare Island", asciiname: "Hare Island", alternatenames: "", latitude: 53.25806, longitude: -9.02111, featureClass: "T", featureCode: "ISL", admin1: "C", admin2: "10" };
  const place = rowToPlace(row);
  assert.equal(place.name, "Hare Island");
  assert.equal(place.county, "Galway");
});

test("rowToPlace returns null for an irrelevant feature code", () => {
  const row = { name: "Some Hill", asciiname: "Some Hill", latitude: 51.5, longitude: -9.5, featureClass: "T", featureCode: "HLL" };
  assert.equal(rowToPlace(row), null);
});

test("rowToPlace returns null for a missing name or non-finite coordinates", () => {
  assert.equal(rowToPlace({ name: "", featureClass: "P", featureCode: "PPL", latitude: 51.5, longitude: -9.5 }), null);
  assert.equal(rowToPlace({ name: "X", featureClass: "P", featureCode: "PPL", latitude: NaN, longitude: -9.5 }), null);
});

// --- isNearAnySource (Part A coastal filter) --------------------------------------

test("isNearAnySource keeps a place within the radius of a prediction source", () => {
  const place = { name: "Schull", latitude: 51.52487, longitude: -9.54798 };
  const sources = [{ latitude: 51.526, longitude: -9.548 }]; // ~0.15km away
  assert.equal(isNearAnySource(place, sources), true);
});

test("isNearAnySource drops a place far from every prediction source (inland town)", () => {
  const place = { name: "Inland Town", latitude: 53.3498, longitude: -6.2603 }; // Dublin city centre
  const sources = [{ latitude: 51.526, longitude: -9.548 }]; // Schull, West Cork — very far
  assert.equal(isNearAnySource(place, sources), false);
});

test("isNearAnySource respects a custom maxKm radius", () => {
  const place = { latitude: 51.5, longitude: -9.5 };
  const sources = [{ latitude: 51.51, longitude: -9.5 }]; // ~1.11km away
  assert.equal(isNearAnySource(place, sources, 1), false);
  assert.equal(isNearAnySource(place, sources, 2), true);
});

test("COASTAL_RADIUS_KM default is 8km", () => {
  assert.equal(COASTAL_RADIUS_KM, 8);
});

// --- placeDedupKey / dedupPlaces --------------------------------------------------

test("placeDedupKey groups the same name+kind at ~the same coordinates", () => {
  const a = { name: "Schull", kind: "town", latitude: 51.52487, longitude: -9.54798 };
  const b = { name: "SCHULL", kind: "town", latitude: 51.5249, longitude: -9.54799 };
  assert.equal(placeDedupKey(a), placeDedupKey(b));
});

test("dedupPlaces keeps only the first of duplicate entries, preserving order otherwise", () => {
  const places = [
    { name: "Schull", kind: "town", latitude: 51.52487, longitude: -9.54798 },
    { name: "Baltimore", kind: "town", latitude: 51.48446, longitude: -9.36782 },
    { name: "Schull", kind: "town", latitude: 51.52487, longitude: -9.54798 }, // exact dupe
  ];
  const deduped = dedupPlaces(places);
  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map((p) => p.name), ["Schull", "Baltimore"]);
});

test("dedupPlaces keeps two entries with the same name but different kind/location", () => {
  const places = [
    { name: "Baltimore", kind: "town", latitude: 51.48446, longitude: -9.36782 },
    { name: "Baltimore", kind: "harbour", latitude: 51.481, longitude: -9.374 },
  ];
  assert.equal(dedupPlaces(places).length, 2);
});

// --- countyForRow (Northern Ireland, GeoNames GB dump) ------------------------------

test("countyForRow maps NI (GB dump) counties", () => {
  // GB dump admin1 code for Northern Ireland is "NIR". admin2 is the MODERN (2015
  // local-government-district reform) GSS code, e.g. "N09000008" — verified directly against
  // data/GB.txt: no NI populated-place row uses a legacy 3-letter county code (those only
  // appear as alternatenames on old pre-2015 ADM2H boundary rows, never as a place's own
  // admin2 value).
  assert.equal(countyForRow({ admin1: "NIR", admin2: "N09000008" }), "Antrim"); // Mid and East Antrim (Larne, Carrickfergus)
  assert.equal(countyForRow({ admin1: "NIR", admin2: "N09000011" }), "Down"); // Ards and North Down (Bangor, Donaghadee)
  assert.equal(countyForRow({ admin1: "NIR", admin2: "N09000005" }), "Londonderry"); // Derry City and Strabane
  assert.equal(countyForRow({ admin1: "NIR", admin2: "N09000006" }), null, "inland district (Fermanagh and Omagh) not shipped");
});
