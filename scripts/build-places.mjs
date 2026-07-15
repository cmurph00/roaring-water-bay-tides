// Builds data/places.json — a coastal-place gazetteer (towns, harbours, bays, coves,
// islands, ...) sourced from the GeoNames Ireland country dump (CC-BY-4.0,
// https://download.geonames.org/export/dump/IE.zip, no account/API key required).
//
// Why: Task 21 shipped `data/named-spots.json`, a hand-maintained, eyeballed-coordinate
// list of exactly 4 West Cork towns (Baltimore/Schull/Crookhaven/Cape Clear) so users could
// search for them even though they're not on the EPA bathing-water register. That doesn't
// scale and isn't sourced from anywhere authoritative. This script replaces it with a proper
// gazetteer pulled from GeoNames, filtered down to what's actually useful for a coastal tide
// app:
//   1. Populated places (feature_class "P" — PPL/PPLA/PPLL/... towns and villages), PLUS
//   2. A curated set of marine/coastal feature codes under classes H (hydrographic: bays,
//      harbours, coves, inlets, ...), T (terrain: islands, points, capes, beaches, ...) and
//      L (areas: ports, localities) — see COASTAL_FEATURE_KIND below. Everything else
//      (lakes, hills, mountains, farms, ...) is dropped — irrelevant to "where's the tide
//      near me".
//   3. A coastal proximity filter: keep a place only if it's within COASTAL_RADIUS_KM of
//      *some* tide-prediction source (the merged EPA + Marine Institute + TICON-Ireland
//      station set) — this drops inland towns (a tide search there is meaningless) and
//      guarantees every kept place resolves to a sensible nearest station.
//
// Raw download (data/IE.zip, data/IE.txt) is gitignored source data, same pattern as the
// Marine Institute CSVs in scripts/build-mi.mjs — re-run this script to refresh it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { haversineKm } from "../src/location.js";
import { fetchBboxNodes } from "./build-epa.mjs";

const execFileAsync = promisify(execFile);

const GEONAMES_URL = "https://download.geonames.org/export/dump/IE.zip";
const ZIP_PATH = "data/IE.zip";
const TXT_PATH = "data/IE.txt";

// A place survives the gazetteer only if it sits within this of at least one real
// prediction source (EPA node, MI station, or TICON Ireland station) — see
// loadPredictionSources()/isNearAnySource() below. The task spec that motivated this script
// suggested "~5km"; empirically widened to 8km (Task 24 validation) — West Cork's EPA node
// grid is sparse enough that some of the exact towns this gazetteer exists to surface
// (Ballydehob, 7.38km from its nearest EPA candidate node) sit just past 5km from the
// nearest real prediction point. 8km still excludes genuinely inland towns (tens of km out)
// while covering every West Cork coastal village checked during validation.
export const COASTAL_RADIUS_KM = 8;

// GeoNames feature_code -> our own short "kind" label. Deliberately curated to
// marine/coastal features only (readme.txt / geonames.org/export/codes.html has the full
// list) — inland water (lakes/ponds/reservoirs/streams/canals/bogs/marshes) and inland
// terrain (hills/mountains/valleys/passes/ridges) are excluded even though some rows exist
// in the IE dump under classes H/T, since they're not relevant to a tide app. feature_class
// "P" (any populated-place code) is handled separately in kindForRow, not listed here.
export const COASTAL_FEATURE_KIND = {
  // class H — hydrographic
  BAY: "bay",
  HBR: "harbour",
  COVE: "cove",
  INLT: "inlet",
  FJD: "fjord",
  LGN: "lagoon",
  SD: "sound",
  STRT: "strait",
  ANCH: "anchorage",
  CHN: "channel",
  // class T — terrain
  ISL: "island",
  ISLS: "islands",
  ISLT: "island",
  ISLX: "island",
  PT: "point",
  CAPE: "cape",
  BCH: "beach",
  HDLD: "headland",
  BAR: "sandbar",
  PROM: "promontory",
  SPIT: "spit",
  SHOR: "shore",
  SAND: "sands",
  // class L — areas
  PRT: "port",
  LCTY: "locality",
};

/**
 * Parses one tab-separated GeoNames `geoname` row (see the dump's readme.txt for the full
 * 19-column layout) into the handful of fields we care about. Pure/no I/O.
 */
export function parseGeonamesLine(line) {
  const c = line.split("\t");
  return {
    geonameid: c[0],
    name: c[1],
    asciiname: c[2],
    alternatenames: c[3] ?? "",
    latitude: Number(c[4]),
    longitude: Number(c[5]),
    featureClass: c[6],
    featureCode: c[7],
    countryCode: c[8],
  };
}

/**
 * Resolves a parsed GeoNames row to our own "kind" label, or null if it's not a feature type
 * we ship (see COASTAL_FEATURE_KIND above). Any populated-place code (feature_class "P" —
 * PPL, PPLA, PPLL, PPLX, ...) is kept as "town"; class H/T/L rows are kept only for the
 * curated feature codes above; everything else is dropped.
 */
export function kindForRow(row) {
  if (row.featureClass === "P") return "town";
  return COASTAL_FEATURE_KIND[row.featureCode] ?? null;
}

/**
 * Extracts a short list of alternate names worth keeping for search (e.g. the Irish-language
 * name), from GeoNames' comma-separated `alternatenames` column. Drops anything identical
 * (case-insensitively) to the primary name/asciiname, drops duplicates, and skips entries
 * that carry a parenthesised annotation (GeoNames sometimes embeds language/period notes
 * inline, e.g. "Foo (historical)") since those aren't names a user would type. Capped at
 * `max` to keep data/places.json compact — alternatenames can run to hundreds of transliterated
 * variants for well-known places.
 */
export function altNamesForRow(row, { max = 6 } = {}) {
  if (!row.alternatenames) return [];
  const primary = new Set([row.name, row.asciiname].filter(Boolean).map((n) => n.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const raw of row.alternatenames.split(",")) {
    const alt = raw.trim();
    if (!alt || /[()]/.test(alt)) continue;
    const key = alt.toLowerCase();
    if (primary.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(alt);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Converts one parsed GeoNames row into a compact place record — { name, latitude,
 * longitude, kind, alt? } — or null if the row isn't a kind we ship, or lacks a usable
 * name/coordinate pair. `alt` is present only when there's at least one alternate name worth
 * keeping (see altNamesForRow). Pure/no I/O, directly unit-testable.
 */
export function rowToPlace(row) {
  const kind = kindForRow(row);
  if (!kind) return null;
  if (typeof row.name !== "string" || row.name.trim().length === 0) return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;

  const place = { name: row.name, latitude: row.latitude, longitude: row.longitude, kind };
  const alt = altNamesForRow(row);
  if (alt.length > 0) place.alt = alt;
  return place;
}

/**
 * True if `place` sits within `maxKm` of at least one entry in `sources` (each a
 * {latitude, longitude} — station index entries all have this shape). This is the "is it
 * actually coastal / near a prediction source" filter: an inland town with no nearby tide
 * source is dropped even if it's a valid populated place. Pure, directly unit-testable.
 */
export function isNearAnySource(place, sources, maxKm = COASTAL_RADIUS_KM) {
  return sources.some(
    (s) => haversineKm({ lat: place.latitude, lon: place.longitude }, { lat: s.latitude, lon: s.longitude }) <= maxKm
  );
}

/**
 * Dedup key for near-identical GeoNames rows describing the same physical place (common for
 * e.g. a townland and its harbour sharing a name/location under different admin codes) —
 * name + kind + coordinates rounded to ~100m. Exported so the dedup pass itself is
 * unit-testable without needing a full build() run.
 */
export function placeDedupKey(place) {
  return `${place.name.toLowerCase()}|${place.kind}|${place.latitude.toFixed(3)}|${place.longitude.toFixed(3)}`;
}

export function dedupPlaces(places) {
  const seen = new Set();
  const out = [];
  for (const p of places) {
    const key = placeDedupKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function readJsonOrEmpty(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

/**
 * The merged set of real tide-prediction sources used for the coastal filter: every raw EPA
 * West Cork bbox candidate node (fetchBboxNodes, see the comment on that export in
 * build-epa.mjs) + every already-published EPA node (data/epa-stations.json, kept for
 * robustness if that file ever contains entries outside the live bbox fetch) + every Marine
 * Institute station + every TICON station in Ireland (TICON covers all of Europe, but only
 * its Irish entries are a meaningful "nearby source" test for a GeoNames IE-only gazetteer).
 * Each optional/missing JSON file defaults to [] rather than failing the build — same
 * defensive contract as src/ui.js's loadIndex().
 */
async function loadPredictionSources() {
  const [epaBboxNodes, epaIndex, mi, ticon] = await Promise.all([
    fetchBboxNodes(),
    readJsonOrEmpty("data/epa-stations.json"),
    readJsonOrEmpty("data/mi-stations.json"),
    readJsonOrEmpty("data/stations.json"),
  ]);
  const ticonIreland = ticon.filter((s) => s.country === "Ireland");
  return [...epaBboxNodes, ...epaIndex, ...mi, ...ticonIreland];
}

async function downloadAndExtract() {
  await mkdir("data", { recursive: true });
  console.log("Downloading GeoNames Ireland dump...");
  const res = await fetch(GEONAMES_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${GEONAMES_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(ZIP_PATH, buf);
  await execFileAsync("unzip", ["-o", ZIP_PATH, "IE.txt", "-d", "data"]);
  return readFile(TXT_PATH, "utf8");
}

async function build() {
  let text;
  try {
    text = await downloadAndExtract();
  } catch (err) {
    console.error(`BLOCKED: failed to download/extract the GeoNames Ireland dump: ${err.message}`);
    process.exit(1);
  }

  const sources = await loadPredictionSources();
  if (sources.length === 0) {
    console.error(
      "BLOCKED: no prediction-source stations found (data/epa-stations.json, data/mi-stations.json, " +
        "data/stations.json all empty/missing) — refusing to build a coastal filter against nothing."
    );
    process.exit(1);
  }

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const candidates = lines.map(parseGeonamesLine).map(rowToPlace).filter((p) => p !== null);
  const coastal = candidates.filter((p) => isNearAnySource(p, sources));
  const places = dedupPlaces(coastal);

  if (places.length === 0) {
    console.error("BLOCKED: 0 coastal places survived the filter — refusing to write an empty data/places.json.");
    process.exit(1);
  }

  await writeFile("data/places.json", JSON.stringify(places));
  console.log(
    `Parsed ${lines.length} GeoNames IE rows; ${candidates.length} relevant (town/harbour/bay/...); ` +
      `${coastal.length} within ${COASTAL_RADIUS_KM}km of a prediction source; ${places.length} after dedup. ` +
      `Wrote data/places.json.`
  );
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
