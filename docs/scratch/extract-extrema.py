import csv, glob, json, os
from datetime import datetime, timezone

DAY_START = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
DAY_END = datetime(2026, 7, 16, 0, 0, tzinfo=timezone.utc)

def parse_time(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

def load_series(path):
    rows = []
    with open(path) as f:
        r = csv.reader(f)
        lines = list(r)
    for row in lines[2:]:
        if len(row) < 2 or not row[0]:
            continue
        rows.append((parse_time(row[0]), float(row[1])))
    return rows

def find_extrema(series):
    """Simple local max/min detector on a monotonically-sampled series.
    A point is an extremum if it is a strict local max/min vs both neighbors
    (flat runs at the very crest are resolved by taking the midpoint of the
    plateau). Returns list of (time, level, 'high'|'low')."""
    extrema = []
    n = len(series)
    i = 1
    while i < n - 1:
        t0, v0 = series[i - 1]
        t1, v1 = series[i]
        # skip flat plateaus: extend j while equal
        j = i
        while j + 1 < n - 1 and series[j + 1][1] == v1:
            j += 1
        tnext, vnext = series[j + 1]
        if v1 > v0 and v1 > vnext:
            mid = i + (j - i) // 2
            extrema.append((series[mid][0], v1, "high"))
        elif v1 < v0 and v1 < vnext:
            mid = i + (j - i) // 2
            extrema.append((series[mid][0], v1, "low"))
        i = j + 1
    return extrema

results = {}
for path in sorted(glob.glob("docs/scratch/epa-data/*.csv")):
    node = os.path.basename(path).replace(".csv", "")
    series = load_series(path)
    if len(series) < 10:
        results[node] = {"error": "insufficient data", "n": len(series)}
        continue
    extrema = find_extrema(series)
    day_extrema = [(t, v, typ) for (t, v, typ) in extrema if DAY_START <= t < DAY_END]
    results[node] = {
        "n": len(series),
        "all_extrema": [{"iso": t.isoformat().replace("+00:00", "Z"), "level": v, "type": typ} for t, v, typ in extrema],
        "day_extrema": [{"iso": t.isoformat().replace("+00:00", "Z"), "level": v, "type": typ} for t, v, typ in day_extrema],
    }

json.dump(results, open("docs/scratch/epa-extrema.json", "w"), indent=2)
for node, r in results.items():
    if "error" in r:
        print(node, "ERROR", r)
        continue
    print(node, [(e["type"][0].upper(), e["iso"][11:16]) for e in r["day_extrema"]])
