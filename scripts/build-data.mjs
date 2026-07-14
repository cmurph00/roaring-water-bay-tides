import { stations as allStations } from "@neaps/tide-database";
import { mkdir, writeFile, rm } from "node:fs/promises";

const REGION_CONTINENT = "Europe"; // change to expand coverage

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

async function build() {
  // NOTE: `@neaps/tide-database`'s `stations` export is an already-quality-filtered
  // ARRAY, not a callable factory function as originally assumed (see task-2-report.md
  // "Deviations from brief" for details). `allStations` (the raw, unfiltered export) also
  // exists in the package but is intentionally not used here.
  const kept = allStations
    .filter(inRegion)
    .filter((s) => isCommercialSafe(s.license))
    .filter((s) => Array.isArray(s.harmonic_constituents) && s.harmonic_constituents.length > 0);

  await rm("data", { recursive: true, force: true });
  await mkdir("data/stations", { recursive: true });

  await writeFile("data/stations.json", JSON.stringify(kept.map(toIndexEntry)));
  for (const s of kept) {
    await writeFile(`data/stations/${s.id.replace(/\//g, "_")}.json`, JSON.stringify(s));
  }

  const sources = new Set(kept.map((s) => (typeof s.license === "string" ? s.license : s.license?.type ?? "public-domain")));
  const attribution =
    `# Data Sources\n\n` +
    `Tide station harmonic constituents used in this app:\n\n` +
    `- **NOAA** (US, public domain)\n` +
    `- **TICON-4** (global tide gauges, CC-BY-4.0) — Lefèvre F., Carre H., Faucher C. (2025), SEANOE, https://doi.org/10.17882/109129\n\n` +
    `Stations bundled: ${kept.length} (European, commercial-use-safe only).\n` +
    `Licenses present: ${[...sources].join(", ")}.\n`;
  await writeFile("DATA-SOURCES.md", attribution);

  console.log(`Wrote ${kept.length} stations to data/`);
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
