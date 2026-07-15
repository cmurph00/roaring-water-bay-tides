// Builds data/ireland-outline.json — a small, simplified coastline outline of Ireland for
// the offline SVG map picker (Task 19). No map tiles, no external library: this is the one
// and only source of the land shape drawn on <canvas>-free, pure-inline-SVG map in src/map.js.
//
// Source: Natural Earth 1:10m "Coastline" (mainland + major islands, LineStrings) plus 1:10m
// "Minor Islands" (small offshore islands, Polygons) — both public domain (Natural Earth places no
// restrictions on use, see https://www.naturalearthdata.com/about/terms-of-use/ — "No permission
// is needed to use Natural Earth", no attribution required), fetched from the
// nvkelso/natural-earth-vector GitHub mirror, straight GeoJSON exports of the official Natural
// Earth shapefile releases with no additional license terms of their own.
//
// Why the *coastline* dataset rather than admin_0_countries/admin_0_map_subunits: Ireland is
// split across two Natural Earth "subunits" (the Republic, and Northern Ireland as part of
// the United Kingdom) — rendering those as two separate filled polygons draws their shared
// *political* land border (Fermanagh/Donegal/Louth/etc.) as a visible seam down the middle of
// the island, which is wrong for a coastline map. The coastline dataset has no political
// content at all — every feature is a closed ring around one landmass, so the Ireland ring is
// already the correct single outline with no seam.
//
// The coastline dataset has ~1,400 features worldwide and carries no per-feature country/name
// attribute (just scalerank/featurecla) — so "which rings are Ireland" is answered
// geometrically: keep every ring whose own bounding box sits fully inside IRELAND_FILTER_BBOX
// (a generous box around Ireland's known extent, wide enough to catch offshore islands, tight
// enough to exclude Great Britain — whose coastline ring's bbox spans lat 50–58.6°, lon
// -6.1–1.7°, i.e. far wider than Ireland's — and the Scottish Kintyre/Islay coastline sliver
// that otherwise just grazes the top-right corner of Ireland's own bbox).
//
// Simplification: Ramer-Douglas-Peucker per ring, tolerance in degrees (~0.11km per 0.001° of
// latitude at this latitude). Kept deliberately gentle — West Cork's peninsulas and inlets
// (where nearly all of this app's EPA/MI markers cluster) are the one part of the coastline
// where shape actually matters to the map's usefulness, and an aggressive tolerance flattens
// exactly that detail.
//
// If the download fails or no Ireland-shaped ring is found, this BLOCKS (exit 1) rather than
// falling back to a hand-drawn placeholder shape — an offline map is only honest if the
// coastline it shows is real.
import { writeFile, mkdir, readFile } from "node:fs/promises";

// Natural Earth 1:10m coastline supplies the Ireland MAINLAND ring (its largest Ireland-bbox ring).
export const COASTLINE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson";
const RAW_PATH = "data/ne-coastline-raw.geojson";
// ISLANDS come from OSi / Tailte Éireann "Islands — National 250k Map of Ireland" (CC-BY 4.0), a
// manual open-data download from https://data-osi.opendata.arcgis.com/ (search "Islands National
// 250k"). 312 named island Polygons — including the small West Cork ones (Hare, Long, Sherkin,
// Clear, Whiddy, ...) that Natural Earth, even at 10m, is too coarse to carry. Gitignored raw
// input; if absent, build() falls back to Natural Earth's own (major-only) island rings.
const OSI_ISLANDS_PATH = "data/osi-islands-raw.geojson";
const OUT_PATH = "data/ireland-outline.json";

// Generous box for "is this coastline ring part of Ireland" — see header comment. Ireland's
// own true extent (from the kept rings) is ~51.47–55.37°N, -10.39 to -5.47°E.
export const IRELAND_FILTER_BBOX = { minLat: 51.0, maxLat: 55.6, minLon: -10.8, maxLon: -5.2 };

// How far the final viewBox bbox (stored alongside the polylines, consumed by
// src/geo.js's computeViewBox) pads beyond Ireland's own true extent — enough that every
// EPA/MI/TICON-Ireland marker (checked empirically: 51.45–55.37°N, -10.28 to -6.01°E) projects
// comfortably inside the map, not right at its edge.
export const BBOX_PAD_DEG = 0.3;

// Ramer-Douglas-Peucker tolerance, in degrees (~0.11km per 0.001°). Fine (0.001° ≈ 100m) rather
// than coarse: the OSi islands and the mainland peninsulas are meant to be viewed zoomed-in on the
// map, and a coarser value left them visibly blocky/"clunky". Costs bundle size (~175KB outline vs
// ~66KB at 0.005°), acceptable next to the ~491KB places.json already precached.
export const SIMPLIFY_TOLERANCE_DEG = 0.001;

/**
 * True if bounding box `a` sits fully inside bounding box `b`. Pure, unit-tested — this is the
 * "is this ring part of Ireland" test applied to each coastline feature's own bbox.
 */
export function bboxContained(a, b) {
  return a.minLat >= b.minLat && a.maxLat <= b.maxLat && a.minLon >= b.minLon && a.maxLon <= b.maxLon;
}

/**
 * Bounding box of a list of [lat, lon] points. Pure, unit-tested.
 */
export function computeBbox(points) {
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  for (const [lat, lon] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Perpendicular distance from `point` to the line through `lineStart`/`lineEnd` — the core
 * primitive of Ramer-Douglas-Peucker. All three are [x, y] pairs (here, [lat, lon], but the
 * function is coordinate-system agnostic). Pure, unit-tested.
 */
export function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const px = x1 + clamped * dx;
  const py = y1 + clamped * dy;
  return Math.hypot(x - px, y - py);
}

/**
 * Ramer-Douglas-Peucker simplification of a polyline (array of [lat, lon] points). Always
 * keeps the first and last point, so a closed ring (first === last) stays closed. Pure,
 * unit-tested.
 */
export function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const right = simplifyPolyline(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/**
 * Converts one GeoJSON coastline ring (LineString `coordinates`, [lon, lat] pairs) into our
 * own [lat, lon]-pair polyline. Pure, unit-tested.
 */
export function ringToLatLon(coordinates) {
  return coordinates.map(([lon, lat]) => [lat, lon]);
}

/**
 * Selects the coastline features that belong to Ireland out of the full worldwide Natural
 * Earth coastline FeatureCollection — see header comment for why this is a geometric bbox
 * test rather than a name/property lookup. Pure (given the parsed GeoJSON), unit-tested.
 */
export function selectIrelandRings(geojson, filterBbox = IRELAND_FILTER_BBOX) {
  const rings = [];
  for (const feature of geojson.features ?? []) {
    if (feature.geometry?.type !== "LineString") continue;
    const ring = ringToLatLon(feature.geometry.coordinates);
    if (bboxContained(computeBbox(ring), filterBbox)) rings.push(ring);
  }
  return rings;
}

/**
 * Selects the small offshore islands that belong to Ireland out of the Natural Earth
 * ne_10m_minor_islands FeatureCollection. Unlike the coastline dataset (open LineStrings), these
 * are filled Polygon/MultiPolygon features; we take each polygon's outer ring (coordinates[0]),
 * apply the same Ireland-bbox containment test, and return them as [lat, lon] rings — same shape
 * selectIrelandRings returns, so build() can simplify and render them identically. Pure, unit-tested.
 */
export function selectIslandPolygons(geojson, filterBbox = IRELAND_FILTER_BBOX) {
  const rings = [];
  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const polygon of polygons) {
      const outer = polygon?.[0];
      if (!Array.isArray(outer)) continue;
      const ring = ringToLatLon(outer);
      if (bboxContained(computeBbox(ring), filterBbox)) rings.push(ring);
    }
  }
  return rings;
}

async function downloadJson(url, path, label) {
  await mkdir("data", { recursive: true });
  console.log(`Downloading Natural Earth ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  const text = await res.text();
  await writeFile(path, text);
  return JSON.parse(text);
}

async function build() {
  let coastline;
  try {
    coastline = await downloadJson(COASTLINE_URL, RAW_PATH, "1:10m coastline");
  } catch (err) {
    console.error(`BLOCKED: failed to download the Natural Earth coastline dataset: ${err.message}`);
    process.exit(1);
  }

  const neRings = selectIrelandRings(coastline);
  if (neRings.length === 0) {
    console.error(
      "BLOCKED: no coastline ring matched IRELAND_FILTER_BBOX in the downloaded dataset — " +
        "refusing to write a hand-drawn placeholder outline."
    );
    process.exit(1);
  }
  // Largest Ireland-bbox ring is the mainland; the rest are Natural Earth's own (major) islands.
  neRings.sort((a, b) => b.length - a.length);
  const mainland = neRings[0];

  // Islands: prefer the OSi/Tailte Éireann dataset (comprehensive + includes the tiny West Cork
  // islands). If the raw file isn't present, fall back to Natural Earth's own major island rings
  // so the build still succeeds (just without the small islands).
  let islandRings;
  try {
    const osi = JSON.parse(await readFile(OSI_ISLANDS_PATH, "utf8"));
    islandRings = selectIslandPolygons(osi);
    console.log(`Islands: OSi/Tailte Éireann dataset (${islandRings.length} island polygons).`);
  } catch {
    islandRings = neRings.slice(1);
    console.warn(
      `WARN: OSi islands file (${OSI_ISLANDS_PATH}) not found — falling back to ${islandRings.length} ` +
        `Natural Earth islands (major only, no small West Cork islands).`
    );
  }

  const rawRings = [mainland, ...islandRings];

  const rawVertexCount = rawRings.reduce((sum, r) => sum + r.length, 0);
  // Drop rings that simplify below a drawable polygon (< 3 points) — micro-islets/rocks that
  // Ramer-Douglas-Peucker collapses to a 1-2 point sliver would render as nothing but still add bytes.
  const polylines = rawRings.map((ring) => simplifyPolyline(ring, SIMPLIFY_TOLERANCE_DEG)).filter((r) => r.length >= 3);
  const vertexCount = polylines.reduce((sum, r) => sum + r.length, 0);

  const rawBbox = computeBbox(rawRings.flat());
  const bbox = {
    minLat: rawBbox.minLat - BBOX_PAD_DEG,
    maxLat: rawBbox.maxLat + BBOX_PAD_DEG,
    minLon: rawBbox.minLon - BBOX_PAD_DEG,
    maxLon: rawBbox.maxLon + BBOX_PAD_DEG,
  };

  const outline = { bbox, polylines };
  const json = JSON.stringify(outline);
  await writeFile(OUT_PATH, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(
    `${rawRings.length} ring(s) matched Ireland; ${rawVertexCount} raw vertices -> ${vertexCount} ` +
      `after Ramer-Douglas-Peucker simplify (tolerance ${SIMPLIFY_TOLERANCE_DEG}°). Wrote ${OUT_PATH} (${kb} KB).`
  );
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
