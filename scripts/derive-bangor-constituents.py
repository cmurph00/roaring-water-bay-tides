#!/usr/bin/env python3
"""Derive tidal harmonic constituents for Northern Ireland gauges from BODC UK Tide Gauge
Network *processed sea-level observations* (Open Government Licence, NERC), so the app can
predict them OFFLINE with no UKHO/Admiralty (Crown Copyright) data.

Constituents are derived by OUR OWN harmonic analysis (utide) of open raw observations — the
same method TICON-4 uses — and are time-invariant, so a historical input series (e.g. 2020-2024)
predicts any future date. Input: BODC processed annual files in data/bodc-src/ (gitignored raw,
free OGL download from bodc.ac.uk). Output (committed): data/ni/<id>.json + data/ni-stations.json.

Requires: pip install utide numpy matplotlib
Run:      python3 scripts/derive-bangor-constituents.py [BAN|PRU]   (default BAN = Bangor)
"""
import datetime as dt
import json
import re
import sys
from glob import glob
from pathlib import Path

import numpy as np
from matplotlib.dates import date2num
from utide import solve

# Station code -> shipped identity. Bangor is the shippable NI gauge; Portrush is derived only
# to cross-validate the pipeline against the already-bundled TICON Portrush (not shipped here).
STATIONS = {
    "BAN": {"id": "bangor", "name": "Bangor", "region": "Northern Ireland"},
    "PRU": {"id": "portrush-bodc", "name": "Portrush", "region": "Northern Ireland"},
}

SRC_DIR = Path("data/bodc-src")
OUT_DIR = Path("data/ni")
INDEX_PATH = Path("data/ni-stations.json")
# Engine-known constituent names: the set the bundled TICON stations use, which the inlined
# @neaps/tide-predictor engine is proven to handle. utide can return names outside this set
# (exotic shallow-water overtides); we drop those so the engine never sees an unknown name.
TICON_REF = Path("data/stations/ticon_portrush-pru-gbr-bodc.json")

# Data row: "     1) 2023/01/01 00:00:00     1.366M     0.527M"
ROW_RE = re.compile(
    r"^\s*\d+\)\s+(\d{4})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(-?\d+\.\d+)([A-Za-z]?)"
)
HDR_LAT = re.compile(r"^Latitude:\s*(-?\d+\.\d+)")
HDR_LON = re.compile(r"^Longitude:\s*(-?\d+\.\d+)")


def allowed_constituent_names():
    ref = json.loads(TICON_REF.read_text())
    return {c["name"] for c in ref["harmonic_constituents"]}


def parse_file(path):
    """Return (datenums, heights|nan, lat, lon) for one BODC processed annual file."""
    lat = lon = None
    times, heights = [], []
    for line in Path(path).read_text().splitlines():
        if lat is None:
            m = HDR_LAT.match(line)
            if m:
                lat = float(m.group(1))
                continue
        if lon is None:
            m = HDR_LON.match(line)
            if m:
                lon = float(m.group(1))
                continue
        m = ROW_RE.match(line)
        if not m:
            continue
        y, mo, d, hh, mi, ss = (int(m.group(i)) for i in range(1, 7))
        val, flag = float(m.group(7)), m.group(8)
        # BODC flags: 'N' = null; also guard implausible sentinels. NaNs are fine — utide ignores them.
        h = np.nan if (flag == "N" or abs(val) > 50) else val
        times.append(date2num(dt.datetime(y, mo, d, hh, mi, ss)))
        heights.append(h)
    return times, heights, lat, lon


def derive(code):
    cfg = STATIONS[code]
    files = sorted(glob(str(SRC_DIR / f"20[0-9][0-9]{code}.txt")))
    if not files:
        sys.exit(f"ERROR: no annual files data/bodc-src/YYYY{code}.txt found — download them from BODC first.")

    all_t, all_h, lat, lon = [], [], None, None
    for f in files:
        t, h, la, lo = parse_file(f)
        all_t += t
        all_h += h
        lat, lon = la or lat, lo or lon
    # Sort by time and drop duplicate timestamps (annual files can overlap at year boundaries).
    order = np.argsort(all_t)
    t = np.array(all_t)[order]
    h = np.array(all_h)[order]
    keep = np.concatenate(([True], np.diff(t) > 0))
    t, h = t[keep], h[keep]
    valid = int(np.count_nonzero(~np.isnan(h)))
    print(f"[{code}] {len(files)} files, {len(t)} samples ({valid} valid), lat={lat} lon={lon}")
    if valid < 24 * 4 * 30:  # ~a month of 15-min data minimum
        sys.exit(f"ERROR: only {valid} valid samples for {code} — need a longer series.")

    # date2num (modern matplotlib) counts days since 1970-01-01; tell utide so, else its default
    # epoch='python' (days since 0001) mis-selects and returns zero constituents.
    coef = solve(t, h, lat=lat, epoch=dt.date(1970, 1, 1), method="ols", conf_int="none", trend=False, verbose=False)

    allowed = allowed_constituent_names()
    cons, dropped = [], []
    for name, A, g in zip(coef["name"], coef["A"], coef["g"]):
        (cons if name in allowed else dropped).append(
            {"name": str(name), "amplitude": float(A), "phase": float(g)} if name in allowed else str(name)
        )
    cons.sort(key=lambda c: -c["amplitude"])
    print(f"[{code}] kept {len(cons)} engine-known constituents; dropped {len(dropped)} unknown "
          f"({','.join(dropped[:8])}{'...' if len(dropped) > 8 else ''})")

    return {
        "id": cfg["id"],
        "name": cfg["name"],
        "region": cfg["region"],
        "country": "United Kingdom",
        "continent": "Europe",
        "latitude": lat,
        "longitude": lon,
        "timezone": "Europe/London",
        "source": "ni",
        "license": {
            "type": "OGL-UK-3.0",
            "commercial_use": True,
            "url": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
            "notes": "Harmonic constituents derived by our own utide analysis of BODC (NERC / OGL) "
            "processed sea-level observations. No UKHO/Admiralty data used.",
        },
        "datums": {"MSL": 0.0},
        "chart_datum": "MSL",
        "type": "harmonic",
        "harmonic_constituents": cons,
    }


def write_station(station):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{station['id']}.json").write_text(json.dumps(station))
    # Merge into the ni index (replace any existing entry with the same id).
    index = json.loads(INDEX_PATH.read_text()) if INDEX_PATH.exists() else []
    index = [e for e in index if e.get("id") != station["id"]]
    index.append({k: station[k] for k in ("id", "name", "country", "latitude", "longitude", "timezone", "source")})
    INDEX_PATH.write_text(json.dumps(index))
    print(f"[{station['id']}] wrote {OUT_DIR / (station['id'] + '.json')} and updated {INDEX_PATH}")


def main():
    code = (sys.argv[1] if len(sys.argv) > 1 else "BAN").upper()
    if code not in STATIONS:
        sys.exit(f"Unknown station code {code}; expected one of {list(STATIONS)}")
    write_station(derive(code))


if __name__ == "__main__":
    main()
