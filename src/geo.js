// Pure geo/projection helpers for the offline SVG map picker (Task 19) — no DOM, no I/O, so
// these are directly unit-testable and shared between scripts/build-coastline.mjs's consumer
// (src/map.js) and the test suite.

// Equirectangular projection over an arbitrary lat/lon bounding box onto an SVG viewBox of a
// given pixel width/height. Linear in both axes (no cos(lat) correction) — deliberately simple
// and exactly invertible, matching the "pure project(lat, lon, viewBox) helper" spec. Any
// north-south aspect correction is baked into the width/height passed in (see
// computeViewBox below), not into this projection itself.
//
// y is flipped (north/high latitude -> small y) so the SVG's top-left-origin, y-down
// coordinate system still renders with north at the top of the map, matching every other
// map a user has ever looked at.
export function project(lat, lon, viewBox) {
  const { minLat, maxLat, minLon, maxLon, width, height } = viewBox;
  const x = ((lon - minLon) / (maxLon - minLon)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return { x, y };
}

// Picks a pixel width/height for a given lat/lon bbox so the rendered map isn't visibly
// stretched: real-world east-west distance per degree of longitude shrinks by cos(latitude)
// relative to north-south distance per degree of latitude, so the pixel aspect ratio should
// shrink to match (using the bbox's mid-latitude as a single representative correction,
// plenty accurate for a small country-sized bbox like Ireland's). Pure, unit-tested.
export function computeViewBox(bbox, targetWidth) {
  const { minLat, maxLat, minLon, maxLon } = bbox;
  const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonSpanKm = (maxLon - minLon) * Math.cos(midLatRad);
  const latSpan = maxLat - minLat;
  const height = latSpan > 0 ? targetWidth * (latSpan / lonSpanKm) : targetWidth;
  return { minLat, maxLat, minLon, maxLon, width: targetWidth, height };
}
