// Builds data/ni-beaches.json from DAERA's Northern Ireland bathing-waters open dataset
// (Open Government Licence). Pure search *aliases* (name + coords), exactly like the EPA
// beaches in scripts/build-beaches.mjs — resolved at runtime to the nearest real NI station
// (Portrush / Bangor) via resolveSpot(). NOT a tide-data source.
import { writeFile } from "node:fs/promises";

// DAERA ArcGIS FeatureServer for NI bathing waters (GeoJSON). Pinned at implementation time
// from https://opendata-daerani.hub.arcgis.com/ (search "bathing water"); OGL-licensed.
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
    classification: props.Classification ?? props.CLASS ?? null,
    url: props.URL ?? null,
    country: "Northern Ireland",
    type: "beach",
  };
}

async function build() {
  let data;
  try {
    const res = await fetch(DAERA_URL);
    if (!res.ok) throw new Error(`DAERA request failed: HTTP ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    console.error(`Failed to fetch DAERA bathing waters — not writing data/ni-beaches.json. ${err.message}`);
    process.exit(1);
  }
  const features = Array.isArray(data?.features) ? data.features : [];
  const beaches = features.map(featureToNiBeach).filter((b) => b !== null);
  if (beaches.length === 0) {
    console.error("Parsed 0 valid NI beaches — refusing to write an empty data/ni-beaches.json");
    process.exit(1);
  }
  await writeFile("data/ni-beaches.json", JSON.stringify(beaches));
  console.log(`Wrote ${beaches.length} NI beaches to data/ni-beaches.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
