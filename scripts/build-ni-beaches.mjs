// Builds data/ni-beaches.json from DAERA's Northern Ireland bathing-waters open dataset
// (Open Government Licence). Pure search *aliases* (name + coords), exactly like the EPA
// beaches in scripts/build-beaches.mjs — resolved at runtime to the nearest real NI station
// (Portrush / Bangor) via resolveSpot(). NOT a tide-data source.
import { writeFile, readFile, readdir } from "node:fs/promises";

// NI bathing waters are OGL. DAERA's live ArcGIS hub is UK-geo-restricted, so the primary
// source is per-council OGL GeoJSON exports dropped into data/ni-beaches-src/ (e.g. the
// Causeway Coast & Glens export). The DAERA_URL fetch below is a fallback used only when that
// dir is absent/empty. Records are pure search *aliases* (name + coords), like the EPA beaches
// in scripts/build-beaches.mjs — resolved at runtime to the nearest real NI station (Portrush /
// Bangor) via resolveSpot(). NOT a tide-data source.
const LOCAL_SRC_DIR = "data/ni-beaches-src";
const DAERA_URL = process.env.DAERA_BATHING_URL
  || "https://services-eu1.arcgis.com/.../BathingWaters/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";

export function featureToNiBeach(feature) {
  const props = feature?.properties ?? {};
  const geometry = feature?.geometry;
  const name = props.Name ?? props.NAME ?? props.BW_NAME;
  if (typeof name !== "string" || name.trim().length === 0) return null;

  let coords = null;
  if (geometry?.type === "MultiPoint" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) coords = geometry.coordinates[0];
  else if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name: name.trim(),
    latitude,
    longitude,
    classification: props.Classification ?? props.CLASS ?? props.Water_Qual ?? null,
    url: props.URL ?? null,
    country: "Northern Ireland",
    type: "beach",
  };
}

// Dedup near-identical rows (councils sometimes list the same beach twice, or split a strand) —
// name + coordinates rounded to ~100m, same shape as build-places.mjs's placeDedupKey.
export function dedupNiBeaches(beaches) {
  const seen = new Set();
  return beaches.filter((b) => {
    const key = `${b.name.toLowerCase()}|${b.latitude.toFixed(3)}|${b.longitude.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Local council GeoJSON exports (data/ni-beaches-src/*.geojson) are the primary source; fall
// back to the DAERA_URL fetch only when that dir is absent/empty.
async function loadFeatures() {
  let files = [];
  try {
    files = (await readdir(LOCAL_SRC_DIR)).filter((f) => f.toLowerCase().endsWith(".geojson"));
  } catch {
    files = [];
  }
  if (files.length > 0) {
    const all = [];
    for (const f of files.sort()) {
      const g = JSON.parse(await readFile(`${LOCAL_SRC_DIR}/${f}`, "utf8"));
      if (Array.isArray(g?.features)) all.push(...g.features);
    }
    console.log(`Read ${all.length} features from ${files.length} local file(s) in ${LOCAL_SRC_DIR}/`);
    return all;
  }
  const res = await fetch(DAERA_URL);
  if (!res.ok) throw new Error(`DAERA request failed: HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function build() {
  let features;
  try {
    features = await loadFeatures();
  } catch (err) {
    console.error(`Failed to load NI bathing waters — not writing data/ni-beaches.json. ${err.message}`);
    process.exit(1);
  }
  const beaches = dedupNiBeaches(features.map(featureToNiBeach).filter((b) => b !== null));
  if (beaches.length === 0) {
    console.error("Parsed 0 valid NI beaches — refusing to write an empty data/ni-beaches.json");
    process.exit(1);
  }
  await writeFile("data/ni-beaches.json", JSON.stringify(beaches));
  console.log(`Wrote ${beaches.length} NI beaches to data/ni-beaches.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
