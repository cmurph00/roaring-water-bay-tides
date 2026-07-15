// Builds data/mi/<stationID>.json + data/mi-stations.json from the three raw
// Marine Institute / OPW hi-lo prediction CSVs in data/ (gitignored — see below).
//
// Re-download the raw CSVs from the Marine Institute ERDDAP server:
//   https://erddap.marine.ie/erddap/
// Datasets used (all CC-BY-4.0, Marine Institute / OPW):
//   - IHiLoTideForecast / MI gauge stations       -> data/MI_gauges_pred_hilo.csv
//   - IHiLoTideForecast / MI virtual node stations -> data/MI_virtual_nodes_pred_hilo.csv
//   - IHiLoTideForecast / OPW gauge stations       -> data/OPW_gauges_pred_hilo.csv
// Each CSV has columns: stationID,longitude,latitude,time,tide_time_category,Water_Level_ODMalin
// `time` is DD/MM/YYYY HH:MM in UTC; `tide_time_category` is HIGH/LOW;
// `Water_Level_ODMalin` is metres above OD Malin chart datum (can be negative).
import { mkdir, writeFile, readFile } from "node:fs/promises";

const SOURCE_CSVS = [
  "data/MI_gauges_pred_hilo.csv",
  "data/MI_virtual_nodes_pred_hilo.csv",
  "data/OPW_gauges_pred_hilo.csv",
];

/** Parses a Marine Institute "DD/MM/YYYY HH:MM" timestamp (already UTC) to an epoch ms. */
export function parseMiTimeUTC(value) {
  const [datePart, timePart] = value.trim().split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

/**
 * Converts one parsed CSV row (as an array of raw string fields, in column order
 * stationID,longitude,latitude,time,tide_time_category,Water_Level_ODMalin) into
 * a compact [epochMs, heightMetres, "high"|"low"] tide tuple.
 */
export function rowToTide(row) {
  const [, , , time, category, level] = row;
  const epochMs = parseMiTimeUTC(time);
  const type = category.trim().toUpperCase() === "HIGH" ? "high" : "low";
  return [epochMs, Number(level), type];
}

function parseCsv(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const rows = lines.slice(1).map((line) => line.split(","));
  return rows;
}

function stationName(stationID) {
  return stationID.replace(/_/g, " ");
}

async function build() {
  const stations = new Map(); // stationID -> { latitude, longitude, tides: [...] }

  for (const path of SOURCE_CSVS) {
    const text = await readFile(path, "utf8");
    for (const row of parseCsv(text)) {
      const [stationID, longitude, latitude] = row;
      if (!stations.has(stationID)) {
        stations.set(stationID, {
          latitude: Number(latitude),
          longitude: Number(longitude),
          tides: [],
        });
      }
      stations.get(stationID).tides.push(rowToTide(row));
    }
  }

  await mkdir("data/mi", { recursive: true });

  const index = [];
  let totalBytes = 0;
  for (const [id, s] of stations) {
    s.tides.sort((a, b) => a[0] - b[0]);
    const station = {
      id,
      name: stationName(id),
      country: "Ireland",
      latitude: s.latitude,
      longitude: s.longitude,
      timezone: "Europe/Dublin",
      chart_datum: "OD Malin",
      source: "mi",
      license: "cc-by-4.0",
      attribution: "Marine Institute",
      tides: s.tides,
    };
    const json = JSON.stringify(station);
    totalBytes += Buffer.byteLength(json);
    await writeFile(`data/mi/${id}.json`, json);

    index.push({
      id,
      name: station.name,
      country: "Ireland",
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: "Europe/Dublin",
      source: "mi",
    });
  }

  await writeFile("data/mi-stations.json", JSON.stringify(index));

  console.log(`Wrote ${stations.size} Marine Institute stations to data/mi/ (${(totalBytes / 1024).toFixed(1)} KB total)`);
}

// Only run the build when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) build();
