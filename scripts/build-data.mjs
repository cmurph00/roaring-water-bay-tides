import { allStations } from "@neaps/tide-database";
import { mkdir, writeFile, rm, readFile, access } from "node:fs/promises";

const REGION_CONTINENT = "Europe"; // change to expand coverage
const CACHE_MANIFEST_PATH = new URL("../src/cache-manifest.js", import.meta.url);

const CACHE_VERSION_RE = /export const CACHE_VERSION = ".*?";/;

// Pure string transform: rewrites the CACHE_VERSION declaration inside the given
// src/cache-manifest.js source to the given version, leaving everything else (notably
// CACHE_ASSETS) byte-for-byte untouched. Throws loudly if the declaration isn't found,
// rather than silently no-op'ing — a format drift here would otherwise mean the sw.js
// runtime data cache stops invalidating on rebuild with no visible signal.
export function applyCacheVersion(source, version) {
  if (!CACHE_VERSION_RE.test(source)) {
    throw new Error(
      "applyCacheVersion: no CACHE_VERSION declaration found in source — cache-manifest.js format may have changed"
    );
  }
  return source.replace(CACHE_VERSION_RE, `export const CACHE_VERSION = "${version}";`);
}

function buildVersion(stationCount, date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `v${stationCount}-${yyyy}${mm}${dd}`;
}

// Rewrites the CACHE_VERSION constant in src/cache-manifest.js to a fresh build stamp
// (station count + build date) so the sw.js runtime data cache auto-invalidates whenever
// the dataset is regenerated. File-writing wrapper around the pure applyCacheVersion().
export async function stampCacheVersion(stationCount, date = new Date()) {
  const version = buildVersion(stationCount, date);
  const source = await readFile(CACHE_MANIFEST_PATH, "utf8");
  const stamped = applyCacheVersion(source, version);
  await writeFile(CACHE_MANIFEST_PATH, stamped);
}

export function isCommercialSafe(license) {
  if (license == null) return true; // e.g. NOAA public domain
  const type = typeof license === "string" ? license : license.type ?? "";
  if (typeof license === "object" && license.commercial_use === false) return false;
  return !/-nc-|noncommercial/i.test(type);
}

export function inRegion(station) {
  return station.continent === REGION_CONTINENT;
}

function toIndexEntry(s) {
  return { id: s.id, name: s.name, country: s.country, latitude: s.latitude, longitude: s.longitude, timezone: s.timezone };
}

/**
 * Builds the full DATA-SOURCES.md content. This script (build-data.mjs) only regenerates
 * the TICON/NOAA harmonic dataset, but it used to also fully overwrite DATA-SOURCES.md from
 * a hardcoded template — silently wiping the hand-appended Marine Institute (Task 13) and
 * EPA beaches (Task 14) sections on every rerun. Fix: this is a pure function of whatever
 * datasets are actually present (miCount/beachCount are the record counts of
 * data/mi-stations.json / data/beaches.json, or null when that dataset doesn't exist), so a
 * `build:data` rerun reproduces those sections instead of dropping them.
 */
export function buildAttribution({ stationCount, licenses, miCount, beachCount }) {
  let attribution =
    `# Data Sources\n\n` +
    `Tide station harmonic constituents used in this app:\n\n` +
    `- **NOAA** (US, public domain)\n` +
    `- **TICON-4** (global tide gauges, CC-BY-4.0) — Lefèvre F., Carre H., Faucher C. (2025), SEANOE, https://doi.org/10.17882/109129\n\n` +
    `Stations bundled: ${stationCount} (European, commercial-use-safe only).\n` +
    `Licenses present: ${licenses.join(", ")}.\n`;

  if (miCount != null) {
    attribution +=
      `\n## Marine Institute (Ireland) offline predictions\n\n` +
      `- **Marine Institute** (Ireland, CC-BY-4.0) — https://www.marine.ie/ , via the ERDDAP server\n` +
      `  at https://erddap.marine.ie/erddap/ . Covers ${miCount} Irish tide-prediction stations (Marine\n` +
      `  Institute gauge stations, Marine Institute virtual nodes, and OPW gauge stations),\n` +
      `  precomputed offline hi-lo predictions for 2026-2028, heights relative to OD Malin chart\n` +
      `  datum. Regenerate via \`node scripts/build-mi.mjs\` (raw CSVs are gitignored source data,\n` +
      `  not committed).\n`;
  }

  if (beachCount != null) {
    attribution +=
      `\n## EPA (Ireland) named bathing-water beaches\n\n` +
      `- **EPA** (Environmental Protection Agency, Ireland, CC-BY-4.0) — via the EPA GeoServer WFS\n` +
      `  at https://gis.epa.ie/geoserver/ . Covers ${beachCount} named bathing-water beaches from the\n` +
      `  national bathing-water register, used for beach names/locations only — tide predictions\n` +
      `  come from the app's nearest real prediction station (see src/ui.js), not from EPA data.\n` +
      `  Regenerate via \`node scripts/build-beaches.mjs\`.\n`;
  }

  return attribution;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Reads an index JSON file's record count if it exists, else null (dataset absent).
async function indexCount(path) {
  if (!(await fileExists(path))) return null;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

async function build() {
  // NOTE: `@neaps/tide-database` exports both a quality-curated `stations` array and
  // a raw `allStations` array. The curated `stations` export applies an opaque quality
  // heuristic that drops ~253 valid, correctly-licensed European stations (580 vs 833
  // after the same Europe + commercial-safe + has-constituents filters below). Operator
  // decision (review finding, 2026-07-14): use full coverage via `allStations`, applying
  // our own filters instead of relying on the package's curation.
  const kept = allStations
    .filter(inRegion)
    .filter((s) => isCommercialSafe(s.license))
    .filter((s) => Array.isArray(s.harmonic_constituents) && s.harmonic_constituents.length > 0);

  // Capture whether the Marine Institute / EPA-beaches datasets are present BEFORE the
  // data/ wipe below — this build only regenerates the TICON/NOAA dataset, but the rm()
  // below clears the whole data/ directory (including data/mi-stations.json and
  // data/beaches.json). Snapshotting their record counts first lets DATA-SOURCES.md
  // faithfully reproduce their attribution sections instead of silently dropping them
  // (the durability bug flagged in Task 13's report).
  const miCount = await indexCount("data/mi-stations.json");
  const beachCount = await indexCount("data/beaches.json");

  await rm("data", { recursive: true, force: true });
  await mkdir("data/stations", { recursive: true });

  await writeFile("data/stations.json", JSON.stringify(kept.map(toIndexEntry)));
  for (const s of kept) {
    await writeFile(`data/stations/${s.id.replace(/\//g, "_")}.json`, JSON.stringify(s));
  }

  const sources = new Set(kept.map((s) => (typeof s.license === "string" ? s.license : s.license?.type ?? "public-domain")));
  const attribution = buildAttribution({ stationCount: kept.length, licenses: [...sources], miCount, beachCount });
  await writeFile("DATA-SOURCES.md", attribution);

  await stampCacheVersion(kept.length);

  console.log(`Wrote ${kept.length} stations to data/`);
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
