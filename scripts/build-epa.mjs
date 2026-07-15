// Builds data/epa/<sanitizedId>.json + data/epa-stations.json — named, offline West Cork
// tide-prediction points derived from the EPA/Marine Institute bathing-water hydrodynamic
// model's continuous `sea_surface_height` output (ERDDAP dataset `imiTidePredictionEpa`,
// CC-BY-4.0, https://erddap.marine.ie/erddap/).
//
// Why: Baltimore, Schull, Crookhaven and Cape Clear (West Cork) have EPA model nodes only
// ~1.5-4.2km away but no real tide gauge nearby. Resolving them to the nearest Marine
// Institute/TICON gauge (tens of km away, in a different bay) was validated to be ~13-28min
// off on real tide timings (docs/beach-validation.md / docs/scratch/). Each EPA node models
// its OWN water level continuously, so instead of borrowing a distant gauge's tide table, we
// extract each node's own high/low extremes (extractExtrema below) and ship those as a
// third offline-prediction data source, same [epochMs, heightMetres, "high"|"low"] tuple
// shape as data/mi/*.json (see scripts/build-mi.mjs) — src/resolver.js's existing
// `Array.isArray(station.tides)` branch serves these unchanged.
//
// Scope: West Cork bbox only for now (BBOX below) — the four un-gauged villages this task
// targets, plus every other EPA node that happens to fall in the same box. Deliberately NOT
// the full 219-node EPA catalogue, to keep the offline bundle small; widen BBOX/WINDOW_YEARS
// to cover more of the coast later (see docs/marine-ie-data-audit.md for candidates).
//
// Do NOT bundle the raw continuous series anywhere — only the extracted high/low extremes.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { haversineKm } from "../src/location.js";

const ERDDAP_BASE = "https://erddap.marine.ie/erddap/tabledap/imiTidePredictionEpa.csv";
const NODE_LIST_URL = `${ERDDAP_BASE}?stationID,longitude,latitude&distinct()`;

// West Cork only, for now — Baltimore/Schull/Crookhaven/Cape Clear and whatever other EPA
// nodes fall in the same box. Generalizable later: widen this + WINDOW_YEARS.
export const BBOX = { minLat: 51.3, maxLat: 51.95, minLon: -10.35, maxLon: -8.0 };

// Matches the Marine Institute dataset's fixed prediction window (scripts/build-mi.mjs) —
// fetched in yearly chunks to avoid one huge request per node.
export const WINDOW_YEARS = [2026, 2027, 2028];

const MIN_PROMINENCE = 0.15; // metres — rejects noise/flat-spot wobbles, see extractExtrema
const BEACH_NAME_RADIUS_KM = 5; // nearest-beach naming fallback radius
const REQUEST_DELAY_MS = 150; // politeness delay between sequential ERDDAP requests

// Explicit named entries for the four West Cork spots this task targets. None of them has
// a real tide gauge, so each is resolved to its nearest EPA model node by coordinates
// (empirically ~1.5-4.2km away at this bbox's node density). These are approximate village
// centre coordinates used ONLY to pick the nearest node — never shipped verbatim.
export const NAMED_SPOTS = [
  { name: "Baltimore", latitude: 51.4795, longitude: -9.3821 },
  { name: "Schull", latitude: 51.523, longitude: -9.547 },
  { name: "Crookhaven", latitude: 51.4738, longitude: -9.7051 },
  { name: "Cape Clear", latitude: 51.431, longitude: -9.497 },
];

export function inBbox(lat, lon, bbox = BBOX) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

/**
 * Parses the ERDDAP distinct-stationID CSV (2 header rows: column names, then units) into
 * [{ id, latitude, longitude }, ...]. Skips the blank/placeholder row ERDDAP sometimes
 * emits (empty stationID).
 */
export function parseNodeListCsv(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines
    .slice(2)
    .map((line) => line.split(","))
    .filter((cols) => cols[0])
    .map(([id, longitude, latitude]) => ({ id, latitude: Number(latitude), longitude: Number(longitude) }));
}

/**
 * Parses one ERDDAP `time,sea_surface_height` CSV chunk (2 header rows: column names, then
 * units) into [{ t: epochMs, h: metres }, ...]. Drops rows with a missing/NaN height rather
 * than letting them poison the extrema pass with a bogus turning point.
 */
export function parseSeriesCsv(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines
    .slice(2)
    .map((line) => line.split(","))
    .filter((cols) => cols.length >= 2 && cols[0] && cols[1] !== "" && cols[1].trim().toUpperCase() !== "NAN")
    .map(([time, height]) => ({ t: Date.parse(time), h: Number(height) }));
}

// Strict local max/min detection over a time-sorted series, with flat-plateau resolution
// (a run of exactly-equal samples at the crest/trough is collapsed to its midpoint). Adjacent
// turning points from this pass necessarily alternate high/low — you can't have two local
// maxima in a row without a dip between them (the series would have to decrease then
// increase again, which is itself a local minimum). Mirrors
// docs/scratch/extract-extrema.py's find_extrema, generalized from CSV rows to {t,h} objects.
function rawTurningPoints(series) {
  const points = [];
  const n = series.length;
  let i = 1;
  while (i < n - 1) {
    const prev = series[i - 1];
    let j = i;
    while (j + 1 < n - 1 && series[j + 1].h === series[j].h) j++;
    const next = series[j + 1];
    const cur = series[i];
    if (cur.h > prev.h && cur.h > next.h) {
      const mid = series[i + Math.floor((j - i) / 2)];
      points.push({ t: mid.t, h: cur.h, type: "high" });
    } else if (cur.h < prev.h && cur.h < next.h) {
      const mid = series[i + Math.floor((j - i) / 2)];
      points.push({ t: mid.t, h: cur.h, type: "low" });
    }
    i = j + 1;
  }
  return points;
}

/**
 * Extracts HIGH/LOW extremes from a continuous water-level series, pruning low-prominence
 * noise/flat-spot wobbles.
 *
 * `series` = [{ t: epochMs, h: metres }, ...], sorted ascending by `t`.
 * Returns [[epochMs, heightMetres, "high"|"low"], ...], sorted ascending by time.
 *
 * Pass 1 (rawTurningPoints) finds every strict local turning point — these necessarily
 * alternate high/low (see above). Pass 2 repeatedly finds the turning point with the
 * smallest "prominence" (the height difference to its neighbour(s) in the turning-point
 * list — always the opposite type, by construction) and, while it's below
 * `minProminence`, discards it as noise: if it had two neighbours, they're now the same
 * type (both sides of the removed wobble), so only the more extreme of the two survives —
 * the other was really the same tidal high/low, just double-counted either side of a
 * measurement blip. Repeats until every remaining turning point clears the bar.
 */
export function extractExtrema(series, minProminence = MIN_PROMINENCE) {
  if (!Array.isArray(series) || series.length < 3) return [];
  const points = rawTurningPoints(series);

  let removed = true;
  while (removed && points.length > 1) {
    removed = false;
    let minProm = Infinity;
    let minIdx = -1;
    for (let k = 0; k < points.length; k++) {
      const left = points[k - 1];
      const right = points[k + 1];
      let prom;
      if (left && right) prom = Math.min(Math.abs(points[k].h - left.h), Math.abs(points[k].h - right.h));
      else if (left) prom = Math.abs(points[k].h - left.h);
      else if (right) prom = Math.abs(points[k].h - right.h);
      else prom = Infinity;
      if (prom < minProm) {
        minProm = prom;
        minIdx = k;
      }
    }
    if (minProm < minProminence) {
      const left = points[minIdx - 1];
      const right = points[minIdx + 1];
      if (left && right) {
        // Both neighbours are the same type (opposite of the removed point) — keep
        // whichever is more extreme in that type's direction, drop the other.
        const keepLeft = left.type === "high" ? left.h >= right.h : left.h <= right.h;
        points.splice(keepLeft ? minIdx : minIdx - 1, 2);
      } else {
        points.splice(minIdx, 1);
      }
      removed = true;
    }
  }

  return points.map((p) => [p.t, p.h, p.type]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, attempt = 0) {
  const res = await fetch(url);
  if (!res.ok) {
    if (attempt < 1) {
      await sleep(500);
      return fetchText(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

function yearSeriesUrl(nodeId, year) {
  // ERDDAP's constraint syntax uses raw > / < — proven working via manual curl probe
  // (only the comparison operators need escaping here, not the "=" that follows them).
  const idParam = encodeURIComponent(`"${nodeId}"`);
  return (
    `${ERDDAP_BASE}?time,sea_surface_height&stationID=${idParam}` +
    `&time%3E=${year}-01-01T00:00:00Z&time%3C=${year}-12-31T23:59:59Z`
  );
}

async function fetchNodeSeries(nodeId) {
  const series = [];
  for (const year of WINDOW_YEARS) {
    const text = await fetchText(yearSeriesUrl(nodeId, year));
    series.push(...parseSeriesCsv(text));
    await sleep(REQUEST_DELAY_MS);
  }
  series.sort((a, b) => a.t - b.t);
  return series;
}

function sanitizeId(id) {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

// EPA node IDs look like "BPNBF050000140001_MODELLED" — strip the "_MODELLED" suffix for a
// slightly friendlier generic fallback label ("EPA node BPNBF050000140001").
function shortId(id) {
  return id.replace(/_MODELLED$/i, "");
}

/**
 * For each named spot, finds its nearest node (from `nodes`) and returns a Map of
 * nodeId -> spot name. If two spots would map to the same node (not expected at this
 * bbox's node density, but guarded anyway), the closer spot wins; the other falls through
 * to normal beach/generic naming for its own nearest (now-unclaimed) node — it simply won't
 * get an explicit name, which is preferable to two spots silently sharing one name.
 */
export function assignNamedSpots(nodes, namedSpots = NAMED_SPOTS) {
  const bestForNode = new Map(); // nodeId -> { name, distanceKm }
  for (const spot of namedSpots) {
    let best = null;
    let bestKm = Infinity;
    for (const node of nodes) {
      const d = haversineKm({ lat: spot.latitude, lon: spot.longitude }, { lat: node.latitude, lon: node.longitude });
      if (d < bestKm) {
        bestKm = d;
        best = node;
      }
    }
    if (!best) continue;
    const existing = bestForNode.get(best.id);
    if (!existing || bestKm < existing.distanceKm) {
      bestForNode.set(best.id, { name: spot.name, distanceKm: bestKm });
    }
  }
  const result = new Map();
  for (const [nodeId, { name }] of bestForNode) result.set(nodeId, name);
  return result;
}

/**
 * Resolves the display name for a kept EPA node:
 *   1. an explicit named-spot assignment (Baltimore/Schull/Crookhaven/Cape Clear) always wins;
 *   2. otherwise the nearest EPA-registered bathing beach within BEACH_NAME_RADIUS_KM,
 *      formatted "<Beach> (EPA model)";
 *   3. otherwise a generic "EPA node <short-id>" fallback.
 */
export function resolveNodeName(node, { namedSpotAssignments, beaches }) {
  const spotName = namedSpotAssignments.get(node.id);
  if (spotName) return spotName;

  let nearestBeach = null;
  let nearestKm = Infinity;
  for (const b of beaches) {
    const d = haversineKm({ lat: node.latitude, lon: node.longitude }, { lat: b.latitude, lon: b.longitude });
    if (d < nearestKm) {
      nearestKm = d;
      nearestBeach = b;
    }
  }
  if (nearestBeach && nearestKm <= BEACH_NAME_RADIUS_KM) return `${nearestBeach.name} (EPA model)`;

  return `EPA node ${shortId(node.id)}`;
}

async function loadBeaches() {
  try {
    return JSON.parse(await readFile("data/beaches.json", "utf8"));
  } catch {
    return []; // beaches.json is an optional naming enhancement, not a hard dependency
  }
}

async function build() {
  console.log("Fetching EPA node list...");
  const allNodes = parseNodeListCsv(await fetchText(NODE_LIST_URL));
  const nodes = allNodes.filter((n) => inBbox(n.latitude, n.longitude));
  console.log(`${allNodes.length} EPA nodes total; ${nodes.length} within the West Cork bbox.`);

  if (nodes.length === 0) {
    console.error("No EPA nodes found in the configured bbox — refusing to write an empty dataset.");
    process.exit(1);
  }

  const beaches = await loadBeaches();
  const namedSpotAssignments = assignNamedSpots(nodes);
  for (const spot of NAMED_SPOTS) {
    const match = [...namedSpotAssignments.entries()].find(([, name]) => name === spot.name);
    if (match) {
      const node = nodes.find((n) => n.id === match[0]);
      const d = haversineKm({ lat: spot.latitude, lon: spot.longitude }, { lat: node.latitude, lon: node.longitude });
      console.log(`  ${spot.name} -> node ${node.id} (${d.toFixed(2)} km)`);
    } else {
      console.warn(`  ${spot.name}: no node assigned (unexpected)`);
    }
  }

  await mkdir("data/epa", { recursive: true });

  const index = [];
  let totalTides = 0;
  let totalBytes = 0;
  let skipped = 0;

  for (const node of nodes) {
    let series;
    try {
      series = await fetchNodeSeries(node.id);
    } catch (err) {
      console.warn(`Skipping ${node.id}: ${err.message}`);
      skipped++;
      continue;
    }
    if (series.length < 10) {
      console.warn(`Skipping ${node.id}: only ${series.length} samples returned.`);
      skipped++;
      continue;
    }

    const tides = extractExtrema(series);
    const name = resolveNodeName(node, { namedSpotAssignments, beaches });
    const sanitized = sanitizeId(node.id);

    const station = {
      id: sanitized,
      name,
      latitude: node.latitude,
      longitude: node.longitude,
      timezone: "Europe/Dublin",
      chart_datum: "Model MSL",
      source: "epa",
      license: "cc-by-4.0",
      attribution: "Marine Institute / EPA",
      tides,
    };
    const json = JSON.stringify(station);
    totalBytes += Buffer.byteLength(json);
    await writeFile(`data/epa/${sanitized}.json`, json);

    index.push({
      id: sanitized,
      name,
      country: "Ireland",
      latitude: node.latitude,
      longitude: node.longitude,
      timezone: "Europe/Dublin",
      source: "epa",
    });
    totalTides += tides.length;
  }

  await writeFile("data/epa-stations.json", JSON.stringify(index));

  console.log(
    `Wrote ${index.length} EPA nodes (${skipped} skipped) to data/epa/ — ${totalTides} tide events, ` +
      `${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`
  );
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
