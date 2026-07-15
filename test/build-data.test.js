import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialSafe, inRegion, applyCacheVersion, buildAttribution } from "../scripts/build-data.mjs";

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

const SAMPLE_MANIFEST = `// Comment header, untouched by stamping.
export const CACHE_VERSION = "v1-20260101";

export const CACHE_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./data/stations.json",
  "./src/ui.js",
];
`;

test("applyCacheVersion replaces only the CACHE_VERSION value", () => {
  const result = applyCacheVersion(SAMPLE_MANIFEST, "v833-20260714");
  assert.match(result, /export const CACHE_VERSION = "v833-20260714";/);
  assert.doesNotMatch(result, /v1-20260101/);
  // Everything else — comment header and CACHE_ASSETS — is untouched.
  const expected = SAMPLE_MANIFEST.replace(
    'export const CACHE_VERSION = "v1-20260101";',
    'export const CACHE_VERSION = "v833-20260714";'
  );
  assert.equal(result, expected);
});

test("applyCacheVersion is idempotent and preserves CACHE_ASSETS byte-for-byte", () => {
  const once = applyCacheVersion(SAMPLE_MANIFEST, "v833-20260714");
  const twice = applyCacheVersion(once, "v833-20260714");
  assert.equal(twice, once);

  const assetsBlock = (src) => src.slice(src.indexOf("export const CACHE_ASSETS"));
  assert.equal(assetsBlock(twice), assetsBlock(SAMPLE_MANIFEST));
});

test("applyCacheVersion throws when no CACHE_VERSION declaration is present", () => {
  const driftedSource = `export const CACHE_ASSETS = ["./index.html"];\n`;
  assert.throws(() => applyCacheVersion(driftedSource, "v833-20260714"));
});

// buildAttribution regenerates DATA-SOURCES.md content. This is the fix for the
// attribution-durability bug flagged in Task 13: build-data.mjs used to hardcode a
// template that silently wiped the hand-appended Marine Institute / EPA sections on
// every rerun. Now it includes those sections whenever the corresponding dataset is
// present (miCount/beachCount non-null), so a `build:data` rerun preserves them.

test("buildAttribution includes only the base TICON/NOAA section when MI and beaches are absent", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: null, beachCount: null });
  assert.match(text, /Stations bundled: 833/);
  assert.doesNotMatch(text, /Marine Institute/);
  assert.doesNotMatch(text, /EPA/);
});

test("buildAttribution appends the Marine Institute section when miCount is present", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: 38, beachCount: null });
  assert.match(text, /## Marine Institute \(Ireland\) offline predictions/);
  assert.match(text, /Covers 38 Irish tide-prediction stations/);
  assert.doesNotMatch(text, /EPA/);
});

test("buildAttribution appends the EPA beaches section when beachCount is present", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: null, beachCount: 150 });
  assert.match(text, /## EPA \(Ireland\) named bathing-water beaches/);
  assert.match(text, /Covers 150 named/);
  assert.doesNotMatch(text, /Marine Institute/);
});

test("buildAttribution includes both MI and EPA sections when both are present", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: 38, beachCount: 150 });
  assert.match(text, /Marine Institute/);
  assert.match(text, /EPA/);
  // MI section precedes EPA section, matching the order they were introduced (Task 13, Task 14).
  assert.ok(text.indexOf("Marine Institute (Ireland) offline predictions") < text.indexOf("EPA (Ireland) named bathing-water beaches"));
});

// epaCount (Task 18): the EPA/Marine Institute West Cork tide-model section, same
// durability pattern — omitted when epaCount is null/absent, appended when present, and
// doesn't interfere with the (differently-named) EPA-beaches section above.

test("buildAttribution omits the EPA tide-model section when epaCount is absent", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: null, beachCount: null });
  assert.doesNotMatch(text, /EPA\/Marine Institute beach tide model/);
});

test("buildAttribution appends the EPA tide-model section when epaCount is present", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: null, beachCount: null, epaCount: 32 });
  assert.match(text, /## EPA\/Marine Institute beach tide model \(West Cork\)/);
  assert.match(text, /Covers 32\s*\n?\s*named West Cork tide-prediction points/);
  assert.match(text, /Baltimore, Schull, Crookhaven and Cape Clear/);
});

test("buildAttribution includes MI, EPA-beaches, and EPA tide-model sections together, in that order", () => {
  const text = buildAttribution({ stationCount: 833, licenses: ["cc-by-4.0"], miCount: 38, beachCount: 150, epaCount: 32 });
  const miIdx = text.indexOf("Marine Institute (Ireland) offline predictions");
  const beachIdx = text.indexOf("EPA (Ireland) named bathing-water beaches");
  const epaIdx = text.indexOf("EPA/Marine Institute beach tide model");
  assert.ok(miIdx < beachIdx && beachIdx < epaIdx, "sections must appear in introduction order");
});
