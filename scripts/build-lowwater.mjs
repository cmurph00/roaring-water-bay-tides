// Builds data/low-water.json — a small COASTAL low-water-mark overlay for the offline SVG map
// (src/map.js). PLANNING aid only (shows roughly how far the sea retreats at low tide / where the
// foreshore is exposed) — NOT navigation: the app carries no soundings, hazards, or chart datum.
//
// Source: OSi / Tailte Éireann "Low Water Mark – National Water Marks – Ungeneralised 2026" open
// dataset (CC-BY-4.0, https://data-osi.opendata.arcgis.com/), a manual download saved at
// data/osi-lowwater-raw.geojson (gitignored — 272MB, 114,008 tiny LineStrings incl. inland lake
// shores). That's far too much to ship or render, so this build:
//   1. DISCARDS INLAND WATER — keeps only features near the actual sea coast (OSi Coast dataset,
//      data/osi-coast-raw.geojson), dropping lake/river low-water marks (operator instruction).
//   2. Drops tiny rocks/tide-pools (features below MIN_DIAG_DEG extent).
//   3. Simplifies each remaining line (Ramer-Douglas-Peucker) and rounds coordinates.
// The result is a few thousand short [lat,lon] polylines, rendered as a subtle zoom-gated line.
//
// Regenerate: node --max-old-space-size=6144 scripts/build-lowwater.mjs
import { readFile, writeFile } from "node:fs/promises";
import { simplifyPolyline } from "./build-coastline.mjs";

const COAST_PATH = "data/osi-coast-raw.geojson";
const LOWWATER_PATH = "data/osi-lowwater-raw.geojson";
const OUT_PATH = "data/low-water.json";

export const MIN_DIAG_DEG = 0.005; // ~550m — drop tiny isolated rocks/pools; keep substantial foreshore stretches
export const SIMPLIFY_TOLERANCE_DEG = 0.0015; // ~165m — a low-water line is context, not precision geometry
const GRID_CELL_DEG = 0.01; // ~1.1km spatial-index cell for the coast-proximity test
const COAST_PROX_DEG = 0.012; // ~1.3km — a low-water feature within this of the sea coast is "coastal", else inland

// bbox of a [lon,lat,(z)] coordinate list.
function lonLatBbox(coords) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of coords) {
    const lon = p[0], lat = p[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

const cellKey = (lat, lon) => `${Math.floor(lat / GRID_CELL_DEG)},${Math.floor(lon / GRID_CELL_DEG)}`;

// Builds a Set of occupied grid cells from every vertex of the coast LineStrings — the spatial index
// for "is this point near the sea coast". Exported for testing.
export function buildCoastGrid(coastGeojson) {
  const cells = new Set();
  for (const f of coastGeojson.features ?? []) {
    const g = f.geometry;
    const lines = g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) for (const [lon, lat] of line) cells.add(cellKey(lat, lon));
  }
  return cells;
}

// True if (lat,lon) has a coast vertex within ~COAST_PROX_DEG, tested via the grid: check the point's
// cell and its 8 neighbours (cell size ~= proximity radius). Exported for testing.
export function nearCoast(lat, lon, cells) {
  const ci = Math.floor(lat / GRID_CELL_DEG);
  const cj = Math.floor(lon / GRID_CELL_DEG);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (cells.has(`${ci + di},${cj + dj}`)) return true;
  return false;
}

async function build() {
  let coast, low;
  try {
    coast = JSON.parse(await readFile(COAST_PATH, "utf8"));
    low = JSON.parse(await readFile(LOWWATER_PATH, "utf8"));
  } catch (err) {
    console.error(
      `BLOCKED: could not read the OSi source files (${err.message}). Expected ${COAST_PATH} and ` +
        `${LOWWATER_PATH} — manual open-data downloads from data-osi.opendata.arcgis.com (see header).`
    );
    process.exit(1);
  }

  const cells = buildCoastGrid(coast);
  const lines = [];
  let total = 0, inlandDropped = 0, tinyDropped = 0;
  for (const f of low.features ?? []) {
    if (f.geometry?.type !== "LineString") continue;
    total++;
    const coords = f.geometry.coordinates;
    const bb = lonLatBbox(coords);
    if (Math.hypot(bb.maxLat - bb.minLat, bb.maxLon - bb.minLon) < MIN_DIAG_DEG) {
      tinyDropped++;
      continue;
    }
    // Coastal test: sample the two endpoints + midpoint; keep if ANY is near the sea coast.
    const samples = [coords[0], coords[coords.length - 1], coords[Math.floor(coords.length / 2)]];
    if (!samples.some((p) => nearCoast(p[1], p[0], cells))) {
      inlandDropped++;
      continue;
    }
    const simplified = simplifyPolyline(coords.map((p) => [p[1], p[0]]), SIMPLIFY_TOLERANCE_DEG);
    if (simplified.length >= 2) lines.push(simplified.map(([lat, lon]) => [+lat.toFixed(4), +lon.toFixed(4)]));
  }

  const json = JSON.stringify({ lines });
  await writeFile(OUT_PATH, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(
    `Low-water: ${total} source features -> dropped ${inlandDropped} inland + ${tinyDropped} tiny; ` +
      `kept ${lines.length} coastal lines. Wrote ${OUT_PATH} (${kb} KB).`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) build();
