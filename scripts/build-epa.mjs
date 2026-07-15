// Builds data/epa/<sanitizedId>.json + data/epa-stations.json — named, offline West Cork
// "beach model" tide-prediction points derived from the EPA/Marine Institute bathing-water
// hydrodynamic model's continuous `sea_surface_height` output (ERDDAP dataset
// `imiTidePredictionEpa`, CC-BY-4.0, https://erddap.marine.ie/erddap/).
//
// Why: some West Cork bathing beaches have an EPA model node close by but no real tide
// gauge nearby. Resolving them to the nearest Marine Institute/TICON gauge (tens of km
// away, in a different bay) was validated to be ~13-28min off on real tide timings
// (docs/beach-validation.md / docs/scratch/). Each EPA node models its OWN water level
// continuously, so instead of borrowing a distant gauge's tide table, we extract each
// node's own high/low extremes (extractExtrema below) and ship those as a third
// offline-prediction data source, same [epochMs, heightMetres, "high"|"low"] tuple shape as
// data/mi/*.json (see scripts/build-mi.mjs) — src/resolver.js's existing
// `Array.isArray(station.tides)` branch serves these unchanged.
//
// Task 21 fix: naming is now driven purely by proximity to a REGISTERED bathing-water beach
// (data/beaches.json, labelNodeFromRegister below, 2km radius) — not by hand-picked
// "village centre" coordinates. A node with no register beach within 2km is genuinely
// OFFSHORE relative to the bathing-water register (verified case: the old "Baltimore" node
// was ~4km out / ~12km from any beach) and is dropped entirely rather than mislabelled with
// a nearby town's name. Baltimore/Schull/Crookhaven/Cape Clear remain reachable as
// *searchable named aliases* — see data/named-spots.json + src/ui.js — resolving at
// click-time to the best non-offshore prediction point (kept EPA beach-model node or
// MI/TICON gauge), never to a dropped offshore node.
//
// Scope: West Cork bbox only for now (BBOX below). Deliberately NOT the full 219-node EPA
// catalogue, to keep the offline bundle small; widen BBOX/WINDOW_YEARS to cover more of the
// coast later (see docs/marine-ie-data-audit.md for candidates).
//
// Do NOT bundle the raw continuous series anywhere — only the extracted high/low extremes.
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { haversineKm } from "../src/location.js";

const ERDDAP_BASE = "https://erddap.marine.ie/erddap/tabledap/imiTidePredictionEpa.csv";
const NODE_LIST_URL = `${ERDDAP_BASE}?stationID,longitude,latitude&distinct()`;

// West Cork only, for now — whatever EPA nodes fall in the same box. Generalizable later:
// widen this + WINDOW_YEARS.
export const BBOX = { minLat: 51.3, maxLat: 51.95, minLon: -10.35, maxLon: -8.0 };

// Matches the Marine Institute dataset's fixed prediction window (scripts/build-mi.mjs) —
// fetched in yearly chunks to avoid one huge request per node.
export const WINDOW_YEARS = [2026, 2027, 2028];

const MIN_PROMINENCE = 0.15; // metres — rejects noise/flat-spot wobbles, see extractExtrema
export const BEACH_NAME_RADIUS_KM = 2; // register-beach naming radius — beyond this, a node is OFFSHORE
const REQUEST_DELAY_MS = 150; // politeness delay between sequential ERDDAP requests

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

// Refines a strict single-sample turning point (no tie with either neighbour) by fitting a
// parabola through the three points (prev, cur, next) and solving for its vertex. The EPA
// model is sampled every 10 minutes, so the true continuous peak/trough almost never lands
// exactly on a sample — this recovers a sub-sample-accurate time and height instead of
// reporting whichever 10-minute tick happened to be highest/lowest.
//
// Standard 3-point parabolic-peak formula: for samples (t-1,y-1),(t0,y0),(t+1,y+1) spaced
// uniformly by dt, the vertex sits `offset` (in units of dt) from t0, where
//   offset = 0.5 * (y-1 - y+1) / (y-1 - 2*y0 + y+1)
// refined time = t0 + offset*dt, refined level = y0 - 0.25*(y-1 - y+1)*offset.
//
// Requires uniform spacing either side of cur (dt is undefined otherwise); falls back to the
// raw sample, unrefined, if spacing is uneven (e.g. a dropped/NaN sample near the extremum —
// see parseSeriesCsv) or the three points are exactly collinear (denom === 0, no vertex to
// solve for — cannot actually happen at a strict local extremum, since cur is strictly more
// extreme than both neighbours, but guarded anyway for safety).
export function parabolicPeak(prev, cur, next) {
  const dtLeft = cur.t - prev.t;
  const dtRight = next.t - cur.t;
  if (dtLeft <= 0 || dtRight <= 0 || dtLeft !== dtRight) return { t: cur.t, h: cur.h };

  const denom = prev.h - 2 * cur.h + next.h;
  if (denom === 0) return { t: cur.t, h: cur.h };

  const offset = (0.5 * (prev.h - next.h)) / denom;
  return {
    t: cur.t + offset * dtLeft,
    h: cur.h - 0.25 * (prev.h - next.h) * offset,
  };
}

// Strict local max/min detection over a time-sorted series, refining each turning point's
// time (and level):
//   - a genuine single-sample peak/trough (no tie with its neighbour) is refined via
//     parabolicPeak, sub-sample accurate;
//   - a flat plateau (a run of exactly-equal samples at the crest/trough — e.g. two
//     consecutive identical 10-minute readings either side of the true continuous peak) is
//     collapsed to the TIME MIDPOINT of the plateau's span (average of its first and last
//     sample times, not the middle *sample index* — for an even-length plateau, index-based
//     rounding silently snaps to one end instead of the true midpoint between them).
// Adjacent turning points from this pass necessarily alternate high/low — you can't have two
// local maxima in a row without a dip between them (the series would have to decrease then
// increase again, which is itself a local minimum). Mirrors docs/scratch/extract-extrema.py's
// find_extrema, generalized from CSV rows to {t,h} objects.
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
      const refined = j > i ? { t: (series[i].t + series[j].t) / 2, h: cur.h } : parabolicPeak(prev, cur, next);
      points.push({ ...refined, type: "high" });
    } else if (cur.h < prev.h && cur.h < next.h) {
      const refined = j > i ? { t: (series[i].t + series[j].t) / 2, h: cur.h } : parabolicPeak(prev, cur, next);
      points.push({ ...refined, type: "low" });
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

/**
 * Resolves the display name for an EPA node purely by proximity to the EPA bathing-water
 * register (data/beaches.json): the nearest register beach within `maxKm`, or `null` if none
 * is that close. `null` means the node is OFFSHORE relative to the register and must be
 * dropped from the shipped prediction/search set (see build() below) — never given a town
 * or beach name it doesn't earn. Pure/no I/O so it's directly unit-testable.
 */
export function labelNodeFromRegister(node, beaches, maxKm = BEACH_NAME_RADIUS_KM) {
  let nearestBeach = null;
  let nearestKm = Infinity;
  for (const b of beaches) {
    const d = haversineKm({ lat: node.latitude, lon: node.longitude }, { lat: b.latitude, lon: b.longitude });
    if (d < nearestKm) {
      nearestKm = d;
      nearestBeach = b;
    }
  }
  return nearestBeach && nearestKm <= maxKm ? nearestBeach.name : null;
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
  const bboxNodes = allNodes.filter((n) => inBbox(n.latitude, n.longitude));
  console.log(`${allNodes.length} EPA nodes total; ${bboxNodes.length} within the West Cork bbox.`);

  if (bboxNodes.length === 0) {
    console.error("No EPA nodes found in the configured bbox — refusing to write an empty dataset.");
    process.exit(1);
  }

  const beaches = await loadBeaches();
  if (beaches.length === 0) {
    console.warn("data/beaches.json is empty/missing — every node will be labelled OFFSHORE and dropped.");
  }

  // Label every bbox node against the register FIRST (cheap, no network) — a node with no
  // register beach within BEACH_NAME_RADIUS_KM is offshore and is skipped entirely, so we
  // never spend an ERDDAP fetch on data we're going to throw away.
  const labelled = bboxNodes.map((node) => ({ node, name: labelNodeFromRegister(node, beaches) }));
  const nodes = labelled.filter((n) => n.name !== null);
  const offshoreDropped = labelled.length - nodes.length;
  console.log(
    `${nodes.length} node(s) within ${BEACH_NAME_RADIUS_KM}km of a register beach (kept); ` +
      `${offshoreDropped} offshore node(s) dropped (no register beach that close).`
  );

  // Clean the directory first — otherwise a node dropped as OFFSHORE on this run (or
  // renamed/re-sanitized) leaves its stale per-node JSON on disk forever: it's no longer
  // referenced by data/epa-stations.json so the app would never fetch it, but it'd sit
  // there as dead weight/confusion in the committed tree.
  await rm("data/epa", { recursive: true, force: true });
  await mkdir("data/epa", { recursive: true });

  const index = [];
  let totalTides = 0;
  let totalBytes = 0;
  let skipped = 0;

  for (const { node, name } of nodes) {
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
    const sanitized = sanitizeId(node.id);

    const station = {
      id: sanitized,
      name,
      latitude: node.latitude,
      longitude: node.longitude,
      timezone: "Europe/Dublin",
      chart_datum: "Model MSL",
      source: "epa",
      type: "beach-model",
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
      type: "beach-model",
    });
    totalTides += tides.length;
  }

  await writeFile("data/epa-stations.json", JSON.stringify(index));

  console.log(
    `Wrote ${index.length} EPA nodes (${offshoreDropped} offshore dropped, ${skipped} fetch-skipped) to data/epa/ — ` +
      `${totalTides} tide events, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`
  );
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
