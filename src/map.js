// Offline SVG map picker (Task 19) — pure inline SVG built from data/ireland-outline.json
// (Natural Earth coastline, see scripts/build-coastline.mjs) plus the same station index
// src/ui.js already merges/dedups for search. No map tiles, no canvas, no external library:
// every element here is a plain SVG DOM node, styled entirely through the existing theme CSS
// custom properties (index.html's :root tokens) so it repaints correctly on a light/dark
// toggle with zero extra rules.
//
// Pan/zoom (drag, wheel, two-finger pinch, +/-/reset buttons, double-tap) is done by moving
// the SVG's own viewBox — no transform matrices to invert, and the coastline scales for free.
// Markers and their place-name labels are counter-scaled through a single CSS custom property
// (--map-marker-scale) so they stay a roughly constant on-screen size at any zoom, and place
// labels are revealed only once zoomed in far enough to not be a dense unreadable pile.
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

const MAX_ZOOM = 120; // deepest zoom-in — lets a single small island (Sherkin ~3km) fill the view; the
// coastline is simplified at ~100m (build-coastline.mjs), so beyond this the vector edges start to
// show as straight segments — a sensible ceiling matched to the data's own resolution.
const USER_ZOOM = 7; // initial zoom when "Use my location" set a position — a regional view around the user
// Population-tiered place labels: each tier appears only past its zoom level (k = fullWidth/viewWidth),
// so the country view shows only big towns and smaller places reveal as you zoom in. See townTier().
const TIER_ZOOM = { t1: 3, t2: 5, t3: 8 };
const WHEEL_STEP = 1.0015; // per wheel-delta unit; >1 so scrolling up zooms in
const DBLTAP_MS = 300;

// Only label places at or above this GeoNames population. GeoNames has no population for the
// countless tiny townlands/crossroads (Farranacoush, Clomacow, ...), so labelling every pop-0 (or
// sub-threshold) entry piled them into an unreadable mess at deep zoom. This floor keeps real
// settlements (Baltimore 347, Schull 700, Skibbereen 2778, ...) and drops the noise. Tunable.
const MIN_LABEL_POP = 150;

// GeoNames population -> label tier (t1 = biggest towns .. t3 = smallest labelled village). Only
// called for towns already past MIN_LABEL_POP, so it never needs a sub-threshold tier.
function townTier(pop) {
  if (pop >= 3000) return "t1";
  if (pop >= 800) return "t2";
  return "t3";
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// A simple equilateral-ish upward triangle centred on (x, y), for beach-model markers
// (visually distinguished from gauges' circles, per spec).
function trianglePoints(x, y, r) {
  const pts = [
    [x, y - r], // top
    [x + r * 0.87, y + r * 0.6], // bottom-right
    [x - r * 0.87, y + r * 0.6], // bottom-left
  ];
  return pts.map(([px, py]) => `${fmt(px)},${fmt(py)}`).join(" ");
}

/**
 * Builds the full map <svg> element and wires pan/zoom onto it. `outline` is
 * data/ireland-outline.json's parsed shape ({ bbox, polylines } — see
 * scripts/build-coastline.mjs), or null/undefined if that data file didn't load (offline-first
 * optional-enhancement contract, same as beaches.json/places.json elsewhere in this app) — the
 * map still renders markers on a blank sea in that case, just without a coastline.
 * `gauges`/`beachModel` are arrays of merged-index station entries (see mapMarkerSources in
 * src/ui.js). `userLocation` is `{lat, lon}` or null — when set, the map opens zoomed to it so
 * the "you" dot (which may be on a small offshore island) is actually on screen. `onSelect(entry)`
 * fires on marker click/Enter/Space. `onHover(entry, kind)` fires on pointer/focus enter, for the
 * small "source name" caption src/ui.js keeps beside the map.
 *
 * Returns `{ svg, controller }`; controller has `{ zoomIn, zoomOut, reset }` for the on-map buttons.
 */
export function buildMapSvg({ outline, gauges = [], beachModel = [], places = [], userLocation = null, onSelect, onHover } = {}) {
  const bbox = outline?.bbox ?? { minLat: 51.2, maxLat: 55.6, minLon: -10.7, maxLon: -5.2 };
  const viewBox = computeViewBox(bbox, MAP_WIDTH);
  const W = viewBox.width;
  const H = viewBox.height;

  const svg = svgEl("svg", {
    class: "map-svg",
    role: "img",
    "aria-label": "Map of Ireland. Drag to pan, pinch or scroll to zoom, tap a marker to pick a tide prediction source.",
  });

  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: fmt(W), height: fmt(H), class: "map-sea" }));

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

  // GeoNames town/city labels (data/places.json, CC-BY) — geographic orientation + a way to read
  // which town a nearby marker belongs to. Density is controlled by POPULATION: each town is put
  // in a tier by its GeoNames population, and each tier is revealed only past a matching zoom
  // (see the tier toggles in attachPanZoom) so the full-country view shows only big towns and
  // smaller places appear as you zoom in — instead of every crossroads at once. Localities
  // (PPLL crossroads/townlands) are `kind:"locality"` from build-places.mjs and never labelled.
  for (const town of places) {
    if (town?.kind !== "town" || town.latitude == null || town.longitude == null) continue;
    if (!(town.pop >= MIN_LABEL_POP)) continue; // drop pop-0 townlands / sub-threshold noise (see MIN_LABEL_POP)
    const { x, y } = project(town.latitude, town.longitude, viewBox);
    const g = svgEl("g", { class: `map-town map-town-${townTier(town.pop)}` });
    g.appendChild(svgEl("circle", { cx: fmt(x), cy: fmt(y), r: 1.3, class: "map-town-dot" }));
    const text = svgEl("text", { x: fmt(x), y: fmt(y - 2.4), class: "map-town-label" });
    text.textContent = town.name;
    g.appendChild(text);
    svg.appendChild(g);
  }

  // OSi named-island labels (from data/ireland-outline.json `islands`, CC-BY Tailte Éireann). The
  // island shape itself is the marker, so these are just names — italic, tiered by island area
  // (islandTier in build-coastline.mjs) and revealed with the same .tier-N zoom gates as towns.
  for (const isle of outline?.islands ?? []) {
    if (isle?.lat == null || isle.lon == null) continue;
    const { x, y } = project(isle.lat, isle.lon, viewBox);
    const g = svgEl("g", { class: `map-island map-island-${isle.tier || "t3"}` });
    const text = svgEl("text", { x: fmt(x), y: fmt(y), class: "map-island-label" });
    text.textContent = isle.name;
    g.appendChild(text);
    svg.appendChild(g);
  }

  if (userLocation) {
    const { x, y } = project(userLocation.lat, userLocation.lon, viewBox);
    const you = svgEl("g", { class: "map-you", "aria-label": "Your location" });
    you.appendChild(svgEl("circle", { cx: fmt(x), cy: fmt(y), r: YOU_R, class: "map-you-shape" }));
    const title = svgEl("title");
    title.textContent = "You";
    you.appendChild(title);
    svg.appendChild(you);
  }

  const controller = attachPanZoom(svg, { W, H, viewBox, userLocation });
  return { svg, controller };
}

/**
 * Wires viewBox-based pan/zoom onto `svg`. Keeps a `view = {x, y, w, h}` in the SVG's own user
 * coordinate space and rewrites the `viewBox` attribute as it changes; sets `--map-marker-scale`
 * (view.w / W, i.e. 1/zoom) so CSS can counter-scale markers/labels back to a constant on-screen
 * size, and toggles `.show-labels` past LABEL_ZOOM. Pointer events unify mouse + touch: one
 * pointer drags to pan, two pointers pinch to zoom about their midpoint; wheel zooms about the
 * cursor; double-tap/double-click zooms in. Returns `{ zoomIn, zoomOut, reset }`.
 */
function attachPanZoom(svg, { W, H, viewBox, userLocation }) {
  const aspect = H / W;
  const minW = W / MAX_ZOOM;
  const fullView = () => ({ x: 0, y: 0, w: W, h: H });

  let view;
  if (userLocation) {
    const p = project(userLocation.lat, userLocation.lon, viewBox);
    const w = W / USER_ZOOM;
    view = { x: p.x - w / 2, y: p.y - (w * aspect) / 2, w, h: w * aspect };
  } else {
    view = fullView();
  }

  function clampView(v) {
    v.w = clamp(v.w, minW, W);
    v.h = v.w * aspect;
    // Clamp the view CENTRE (not the whole box) inside the map, so an edge/offshore location can
    // still be centred even though its box would then hang past the coastline bbox.
    const cx = clamp(v.x + v.w / 2, 0, W);
    const cy = clamp(v.y + v.h / 2, 0, H);
    v.x = cx - v.w / 2;
    v.y = cy - v.h / 2;
  }

  function apply() {
    clampView(view);
    svg.setAttribute("viewBox", `${fmt(view.x)} ${fmt(view.y)} ${fmt(view.w)} ${fmt(view.h)}`);
    const scale = view.w / W; // = 1 / zoom
    svg.style.setProperty("--map-marker-scale", String(fmt(scale)));
    const k = W / view.w; // current zoom factor
    svg.classList.toggle("tier-1", k >= TIER_ZOOM.t1);
    svg.classList.toggle("tier-2", k >= TIER_ZOOM.t2);
    svg.classList.toggle("tier-3", k >= TIER_ZOOM.t3);
  }

  // client px -> SVG user coords, using the element's rendered size and the current view.
  function clientToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const fx = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    const fy = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    return { wx: view.x + fx * view.w, wy: view.y + fy * view.h };
  }

  // Zoom by `factor` (>1 = zoom in) keeping the world point under (clientX, clientY) fixed.
  function zoomAt(factor, clientX, clientY) {
    const { wx, wy } = clientToWorld(clientX, clientY);
    const fx = view.w ? (wx - view.x) / view.w : 0.5;
    const fy = view.h ? (wy - view.y) / view.h : 0.5;
    view.w = clamp(view.w / factor, minW, W);
    view.h = view.w * aspect;
    view.x = wx - fx * view.w;
    view.y = wy - fy * view.h;
    apply();
  }

  // Zoom about the element centre (used by the +/- buttons).
  function zoomCentre(factor) {
    const rect = svg.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  const pointers = new Map(); // pointerId -> {x, y} in client px
  let lastPinchDist = null;
  let lastTapAt = 0;
  let moved = false;

  function pinchDist() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pinchMid() {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  svg.addEventListener("pointerdown", (e) => {
    // Don't start a pan when grabbing a marker/button — let its own click/activate run.
    if (e.target.closest(".map-marker")) return;
    svg.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) lastPinchDist = pinchDist();

    const now = Date.now();
    if (pointers.size === 1 && now - lastTapAt < DBLTAP_MS) {
      zoomAt(1.8, e.clientX, e.clientY); // double-tap / double-click to zoom in
      lastTapAt = 0;
    } else if (pointers.size === 1) {
      lastTapAt = now;
    }
  });

  svg.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);

    if (pointers.size >= 2) {
      const dist = pinchDist();
      if (lastPinchDist) {
        const mid = pinchMid();
        zoomAt(dist / lastPinchDist, mid.x, mid.y);
      }
      lastPinchDist = dist;
      moved = true;
      return;
    }

    // Single-pointer pan: translate the view by the pointer delta (world units).
    const rect = svg.getBoundingClientRect();
    const dxWorld = ((cur.x - prev.x) / rect.width) * view.w;
    const dyWorld = ((cur.y - prev.y) / rect.height) * view.h;
    if (Math.abs(cur.x - prev.x) > 1 || Math.abs(cur.y - prev.y) > 1) moved = true;
    view.x -= dxWorld;
    view.y -= dyWorld;
    apply();
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = null;
    if (moved) lastTapAt = 0; // a drag isn't the first half of a double-tap
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("pointerleave", endPointer);

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(Math.pow(WHEEL_STEP, -e.deltaY), e.clientX, e.clientY);
    },
    { passive: false }
  );

  apply();

  return {
    zoomIn: () => zoomCentre(1.6),
    zoomOut: () => zoomCentre(1 / 1.6),
    reset: () => {
      view = fullView();
      apply();
    },
  };
}

/**
 * Clears `container` and appends a freshly-built, pan/zoomable map SVG plus its on-map zoom
 * controls (＋ / − / reset). See buildMapSvg above.
 */
export function renderMap(container, options) {
  container.innerHTML = "";
  const { svg, controller } = buildMapSvg(options);
  container.appendChild(svg);

  const controls = document.createElement("div");
  controls.className = "map-zoom-controls";
  const btn = (label, aria, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "map-zoom-btn";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  };
  controls.appendChild(btn("+", "Zoom in", controller.zoomIn));
  controls.appendChild(btn("−", "Zoom out", controller.zoomOut));
  controls.appendChild(btn("⟲", "Reset zoom to all of Ireland", controller.reset));
  container.appendChild(controls);
}
