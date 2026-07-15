// Offline SVG map picker (Task 19) — pure inline SVG built from data/ireland-outline.json
// (Natural Earth coastline, see scripts/build-coastline.mjs) plus the same station index
// src/ui.js already merges/dedups for search. No map tiles, no canvas, no external library:
// every element here is a plain SVG DOM node, styled entirely through the existing theme CSS
// custom properties (index.html's :root tokens) so it repaints correctly on a light/dark
// toggle with zero extra rules.
//
// This module only builds/wires DOM — like the rest of src/ui.js's render* functions, it's
// exercised by the live app / verify step, not node --test (no DOM in the Node test runner).
// The projection math it calls (project/computeViewBox) lives in src/geo.js, which IS
// unit-tested, and the marker source partitioning (mapMarkerSources) lives in src/ui.js,
// also unit-tested — this file is deliberately thin glue on top of both.
import { project, computeViewBox } from "./geo.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAP_WIDTH = 320;
const MARKER_R = 4.2; // visible marker radius/half-size, px
const TAP_R = 11; // invisible hit-target radius, px — generous tap target per spec (West Cork is dense)
const YOU_R = 5.5;

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

// A 6-pointed... no — a simple equilateral-ish upward triangle centred on (x, y), for
// beach-model markers (visually distinguished from gauges' circles, per spec).
function trianglePoints(x, y, r) {
  const pts = [
    [x, y - r], // top
    [x + r * 0.87, y + r * 0.6], // bottom-right
    [x - r * 0.87, y + r * 0.6], // bottom-left
  ];
  return pts.map(([px, py]) => `${fmt(px)},${fmt(py)}`).join(" ");
}

/**
 * Builds the full map <svg> element. `outline` is data/ireland-outline.json's parsed shape
 * ({ bbox, polylines } — see scripts/build-coastline.mjs), or null/undefined if that data
 * file didn't load (offline-first optional-enhancement contract, same as beaches.json/
 * places.json elsewhere in this app) — the map still renders markers on a blank sea in that
 * case, just without a coastline. `gauges`/`beachModel` are arrays of merged-index station
 * entries (see mapMarkerSources in src/ui.js). `userLocation` is `{lat, lon}` or null.
 * `onSelect(entry)` fires on marker click/Enter/Space. `onHover(entry, kind)` fires on
 * pointer/focus enter, for the small "source name" caption src/ui.js keeps beside the map.
 */
export function buildMapSvg({ outline, gauges = [], beachModel = [], userLocation = null, onSelect, onHover } = {}) {
  const bbox = outline?.bbox ?? { minLat: 51.2, maxLat: 55.6, minLon: -10.7, maxLon: -5.2 };
  const viewBox = computeViewBox(bbox, MAP_WIDTH);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${fmt(viewBox.width)} ${fmt(viewBox.height)}`,
    class: "map-svg",
    role: "img",
    "aria-label": "Map of Ireland. Tap a marker to pick a tide prediction source.",
  });

  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: fmt(viewBox.width), height: fmt(viewBox.height), class: "map-sea" }));

  for (const line of outline?.polylines ?? []) {
    const points = line.map(([lat, lon]) => project(lat, lon, viewBox)).map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");
    svg.appendChild(svgEl("polygon", { points, class: "map-land" }));
  }

  function addMarker(entry, kind, label) {
    const { x, y } = project(entry.latitude, entry.longitude, viewBox);
    const g = svgEl("g", {
      class: `map-marker map-marker-${kind}`,
      tabindex: "0",
      role: "button",
      "aria-label": `${entry.name} (${label})`,
    });

    // Invisible generous hit target, added first so the visible shape paints on top of it.
    g.appendChild(svgEl("circle", { cx: fmt(x), cy: fmt(y), r: TAP_R, class: "map-marker-hit" }));

    if (kind === "beach-model") {
      g.appendChild(svgEl("polygon", { points: trianglePoints(x, y, MARKER_R), class: "map-marker-shape" }));
    } else {
      g.appendChild(svgEl("circle", { cx: fmt(x), cy: fmt(y), r: MARKER_R, class: "map-marker-shape" }));
    }

    const title = svgEl("title");
    title.textContent = `${entry.name} (${label})`;
    g.appendChild(title);

    const activate = () => onSelect?.(entry);
    g.addEventListener("click", activate);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    const hover = () => onHover?.(entry, label);
    g.addEventListener("mouseenter", hover);
    g.addEventListener("focus", hover);

    svg.appendChild(g);
  }

  for (const entry of gauges) addMarker(entry, "gauge", "🌊 tide gauge");
  for (const entry of beachModel) addMarker(entry, "beach-model", "📈 beach model");

  if (userLocation) {
    const { x, y } = project(userLocation.lat, userLocation.lon, viewBox);
    const you = svgEl("g", { class: "map-you", "aria-label": "Your location" });
    you.appendChild(svgEl("circle", { cx: fmt(x), cy: fmt(y), r: YOU_R, class: "map-you-shape" }));
    const title = svgEl("title");
    title.textContent = "You";
    you.appendChild(title);
    svg.appendChild(you);
  }

  return svg;
}

/** Clears `container` and appends a freshly-built map SVG — see buildMapSvg above. */
export function renderMap(container, options) {
  container.innerHTML = "";
  container.appendChild(buildMapSvg(options));
}
