import json
from datetime import datetime, timezone

def parse(iso):
    return datetime.strptime(iso.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S.%f%z") if "." in iso else \
           datetime.strptime(iso.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z")

app = json.load(open("docs/scratch/with-epa-node.json"))
epa = json.load(open("docs/scratch/epa-extrema.json"))

rows = []
for b in app:
    node = b["epaNode"]
    # Match against the FULL extracted extrema series (spans a 36h window bracketing
    # the target day), not just the day-filtered subset -- otherwise a genuine
    # ground-truth extremum that falls just before/after the UTC day boundary (but
    # is still the correct match for an app tide near midnight) gets excluded and
    # the greedy matcher latches onto a wildly wrong (~12h-away) same-type extremum.
    truth = epa[node]["all_extrema"]
    truth_times = [(t["type"], parse(t["iso"])) for t in truth]
    app_times = [(t["type"], parse(t["iso"])) for t in b["tides"]]

    # Greedy match: for each app extreme, find nearest ground-truth extreme of the SAME type
    # not yet used.
    used = set()
    matches = []
    for typ, t in app_times:
        candidates = [(i, tt) for i, (ty, tt) in enumerate(truth_times) if ty == typ and i not in used]
        if not candidates:
            matches.append((typ, t, None, None))
            continue
        i, tt = min(candidates, key=lambda c: abs((c[1] - t).total_seconds()))
        used.add(i)
        delta_min = (t - tt).total_seconds() / 60
        matches.append((typ, t, tt, delta_min))

    rows.append({
        "beach": b["beach"],
        "station": b["station"],
        "source": b["stationSource"],
        "distanceKm": b["distanceKm"],
        "epaNode": node,
        "epaDistKm": b["epaDistKm"],
        "matches": matches,
    })

json.dump(
    [
        {
            **{k: v for k, v in r.items() if k != "matches"},
            "matches": [
                {
                    "type": m[0],
                    "app": m[1].isoformat(),
                    "epa": m[2].isoformat() if m[2] else None,
                    "deltaMin": m[3],
                }
                for m in r["matches"]
            ],
        }
        for r in rows
    ],
    open("docs/scratch/comparison.json", "w"),
    indent=2,
)

all_deltas = []
worst = []
for r in rows:
    for m in r["matches"]:
        if m[3] is not None:
            all_deltas.append(abs(m[3]))
            if abs(m[3]) > 15:
                worst.append((r["beach"], m[0], m[3]))

all_deltas.sort()
n = len(all_deltas)
median = all_deltas[n // 2] if n % 2 else (all_deltas[n // 2 - 1] + all_deltas[n // 2]) / 2
print("n matched extremes:", n)
print("median abs delta (min):", round(median, 1))
print("max abs delta (min):", round(max(all_deltas), 1))
print("mean abs delta (min):", round(sum(all_deltas) / n, 1))
print(">15min:", worst)
