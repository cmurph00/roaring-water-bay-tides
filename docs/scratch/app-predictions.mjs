import fs from "node:fs";
import { haversineKm, nearestStation } from "../../src/location.js";
import { useStation } from "../../src/engine.js";

const DAY_START = new Date("2026-07-15T00:00:00Z");
const DAY_END = new Date("2026-07-16T00:00:00Z");
const PAD_MS = 14 * 3600 * 1000; // pad to bracket extremes properly

function mergeStationIndexes(ticon, mi) {
  const MI_OVERLAP_KM = 3;
  const kept = ticon.filter(
    (t) => !mi.some((m) => haversineKm({ lat: t.latitude, lon: t.longitude }, { lat: m.latitude, lon: m.longitude }) <= MI_OVERLAP_KM)
  );
  return [...mi, ...kept];
}

const ticon = JSON.parse(fs.readFileSync(new URL("../../data/stations.json", import.meta.url)));
const mi = JSON.parse(fs.readFileSync(new URL("../../data/mi-stations.json", import.meta.url)));
const beaches = JSON.parse(fs.readFileSync(new URL("../../data/beaches.json", import.meta.url)));

const index = mergeStationIndexes(ticon, mi);

const stationFileUrl = (id) => new URL(`../../data/stations/${id.replace(/\//g, "_")}.json`, import.meta.url);
const miFileUrl = (id) => new URL(`../../data/mi/${id}.json`, import.meta.url);

function appTidesFor(entry) {
  if (entry.source === "mi") {
    const station = JSON.parse(fs.readFileSync(miFileUrl(entry.id)));
    return station.tides
      .filter(([epoch]) => epoch >= DAY_START.getTime() && epoch < DAY_END.getTime())
      .map(([epoch, level, type]) => ({ type, time: new Date(epoch), height: level }))
      .sort((a, b) => a.time - b.time);
  }
  const station = JSON.parse(fs.readFileSync(stationFileUrl(entry.id)));
  const predictor = useStation(station);
  const { extremes } = predictor.getExtremesPrediction({
    start: new Date(DAY_START.getTime() - PAD_MS),
    end: new Date(DAY_END.getTime() + PAD_MS),
  });
  return extremes
    .map((e) => ({ type: e.high ? "high" : "low", time: new Date(e.time), height: e.level }))
    .filter((t) => t.time >= DAY_START && t.time < DAY_END)
    .sort((a, b) => a.time - b.time);
}

// West Cork sample (lat 51.4-51.8, lon -10..-8.5)
const westCork = beaches.filter(
  (b) => b.latitude >= 51.4 && b.latitude <= 51.8 && b.longitude >= -10 && b.longitude <= -8.5
);

// Spread sample around the rest of the Irish coast (north/east/west/south, outside West Cork box)
const spreadNames = [
  "Culdaff", "Rathmullan", "Downings", // north (Donegal / Inishowen)
  "Portmarnock, Velvet Strand Beach", "Brittas Bay South", "Rosslare Strand", // east
  "Lahinch", "Salthill Beach", "Keel Beach, Achill Island", "Rossnowlagh", // west
  "Tramore Beach", "Youghal Front Strand Beach", "Ballybunnion North", // south
];
const spread = spreadNames.map((name) => {
  const b = beaches.find((x) => x.name === name);
  if (!b) throw new Error(`Beach not found: ${name}`);
  return b;
});

const sample = [...westCork, ...spread];

const results = sample.map((b) => {
  const nearest = nearestStation(b.latitude, b.longitude, index);
  const tides = appTidesFor(nearest.station);
  return {
    beach: b.name,
    lat: b.latitude,
    lon: b.longitude,
    station: nearest.station.name,
    stationId: nearest.station.id,
    stationSource: nearest.station.source ?? "ticon",
    distanceKm: nearest.distanceKm,
    tides: tides.map((t) => ({ type: t.type, iso: t.time.toISOString() })),
  };
});

console.log(JSON.stringify(results, null, 2));
