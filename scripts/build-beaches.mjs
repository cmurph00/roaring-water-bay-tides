// Builds data/beaches.json from the EPA (Ireland) national bathing-water quality register,
// via the public EPA GeoServer WFS endpoint.
//
// IMPORTANT: beaches are pure search *aliases*, not a data source in their own right. We do
// NOT fetch or model the EPA's continuous water-quality/tide time series here — only the
// named-locality index (name + coordinates + classification + info URL). At runtime
// (src/ui.js) a beach search result resolves to its nearest real tide-prediction station
// (the merged Marine Institute + TICON index) via nearestStation() — in a small bay the tide
// is ~uniform, so a beach's tide is a close (~1-2 min) approximation of its nearest station's.
import { writeFile } from "node:fs/promises";

const WFS_URL =
  "https://gis.epa.ie/geoserver/EPA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=EPA:BathingWaterQuality&outputFormat=application/json&srsName=EPSG:4326";

/**
 * Converts one EPA WFS GeoJSON feature into a compact beach record:
 * { name, latitude, longitude, classification, url, country: "Ireland", type: "beach" }.
 *
 * Handles both MultiPoint (coordinates: [[lon, lat], ...] — the shape the EPA service
 * actually returns) and Point (coordinates: [lon, lat]) geometries, using the first point
 * of a MultiPoint. Returns null when the feature has no usable name or coordinates, so
 * callers can filter dropped features instead of writing bad data.
 */
export function featureToBeach(feature) {
  const props = feature?.properties ?? {};
  const geometry = feature?.geometry;

  const name = props.Name;
  if (typeof name !== "string" || name.trim().length === 0) return null;

  let coords = null;
  if (geometry?.type === "MultiPoint" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    coords = geometry.coordinates[0];
  } else if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    coords = geometry.coordinates;
  }
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name,
    latitude,
    longitude,
    classification: props.CurrentClassification ?? null,
    url: props.URL ?? null,
    country: "Ireland",
    type: "beach",
  };
}

async function build() {
  let data;
  try {
    const res = await fetch(WFS_URL);
    if (!res.ok) {
      throw new Error(`EPA WFS request failed: HTTP ${res.status} ${res.statusText}`);
    }
    data = await res.json();
  } catch (err) {
    console.error(`Failed to fetch the EPA bathing-water register — not writing data/beaches.json. ${err.message}`);
    process.exit(1);
  }

  const features = Array.isArray(data?.features) ? data.features : [];
  const beaches = features.map(featureToBeach).filter((b) => b !== null);

  if (beaches.length === 0) {
    console.error("Parsed 0 valid beaches from the EPA response — refusing to write an empty data/beaches.json");
    process.exit(1);
  }

  await writeFile("data/beaches.json", JSON.stringify(beaches));
  console.log(`Wrote ${beaches.length} beaches to data/beaches.json`);
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
