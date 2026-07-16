#!/usr/bin/env python3
"""One-off: derive Bangor (NI) tidal harmonic constituents from BODC's OGL processed
sea-level series, so the app can predict Bangor OFFLINE without any UKHO/Admiralty data.

BODC UK National Tide Gauge Network data is Open Government Licence (NERC), commercial-use
permitted. Manual download (free): https://www.bodc.ac.uk/data/hosted_data_systems/sea_level/
uk_tide_gauge_network/processed/ -> the Bangor processed file -> save as data/bodc-bangor-raw.txt.

The committed artifact is data/ni/bangor.json; this script reproduces it. Requires:  pip install utide numpy
Run:  python3 scripts/derive-bangor-constituents.py
"""
import json
import re
import sys
from pathlib import Path
import numpy as np
from utide import solve

RAW = Path("data/bodc-bangor-raw.txt")
OUT_STATION = Path("data/ni/bangor.json")
OUT_INDEX = Path("data/ni-stations.json")

LAT, LON = 54.665, -5.669  # Bangor tide gauge, Central Pier, Bangor Marina (NTSLF)

def parse_series(text):
    """Yield (matplotlib-datenum, level_metres) from the BODC ASCII series. Tolerant of the
    two common BODC layouts (ISO timestamp, or 'dd/mm/yyyy HH:MM'); skips header/flag lines."""
    from matplotlib.dates import date2num
    from datetime import datetime
    times, levels = [], []
    for line in text.splitlines():
        line = line.strip()
        if not line or not re.search(r"\d", line):
            continue
        # level = last standalone float on the line that isn't a flag; time = first date-like token
        m_iso = re.search(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", line)
        m_dmy = re.search(r"\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}", line)
        floats = re.findall(r"-?\d+\.\d+", line)
        if not floats or not (m_iso or m_dmy):
            continue
        try:
            dt = datetime.fromisoformat(m_iso.group().replace(" ", "T")) if m_iso \
                 else datetime.strptime(m_dmy.group(), "%d/%m/%Y %H:%M")
        except ValueError:
            continue
        level = float(floats[-1])
        if abs(level) > 20:  # metres sanity guard (drops obvious flag columns)
            continue
        times.append(date2num(dt))
        levels.append(level)
    return np.array(times), np.array(levels)

def main():
    if not RAW.exists():
        sys.exit(f"ERROR: {RAW} not found. Download the BODC Bangor processed series first (see docstring).")
    t, h = parse_series(RAW.read_text())
    if len(t) < 24 * 30:  # need at least ~a month of hourly data for a stable solve
        sys.exit(f"ERROR: only {len(t)} usable samples parsed — need a longer BODC series.")

    coef = solve(t, h, lat=LAT, method="ols", conf_int="none", trend=False, verbose=False)
    constituents = [
        {"name": str(name), "amplitude": float(A), "phase": float(g)}
        for name, A, g in zip(coef["name"], coef["A"], coef["g"])
    ]
    constituents.sort(key=lambda c: -c["amplitude"])

    station = {
        "id": "bangor",
        "name": "Bangor",
        "region": "Northern Ireland",
        "country": "United Kingdom",
        "continent": "Europe",
        "latitude": LAT,
        "longitude": LON,
        "timezone": "Europe/London",
        "source": "ni",
        "license": {"type": "OGL-UK-3.0", "commercial_use": True,
                     "url": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
                     "notes": "Constituents derived by our own utide analysis of BODC (NERC/OGL) sea-level data."},
        "datums": {"MSL": 0.0},
        "chart_datum": "MSL",
        "type": "harmonic",
        "harmonic_constituents": constituents,
    }
    OUT_STATION.parent.mkdir(parents=True, exist_ok=True)
    OUT_STATION.write_text(json.dumps(station))
    OUT_INDEX.write_text(json.dumps([{k: station[k] for k in
        ("id", "name", "country", "latitude", "longitude", "timezone", "source")}]))
    print(f"Wrote {len(constituents)} constituents -> {OUT_STATION} and {OUT_INDEX}")

if __name__ == "__main__":
    main()
