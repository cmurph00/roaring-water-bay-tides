import json

comp = json.load(open("docs/scratch/comparison.json"))

def fmt_time(iso):
    return iso[11:16] if iso else "—"

rows = []
all_deltas = []
flagged = []
for r in comp:
    app_str = ", ".join(f"{m['type'][0].upper()} {fmt_time(m['app'])}" for m in r["matches"])
    epa_str = ", ".join(f"{m['type'][0].upper()} {fmt_time(m['epa'])}" for m in r["matches"])
    deltas = [m["deltaMin"] for m in r["matches"] if m["deltaMin"] is not None]
    delta_str = ", ".join(f"{d:+.0f}" for d in deltas)
    max_abs = max(abs(d) for d in deltas)
    mean_abs = sum(abs(d) for d in deltas) / len(deltas)
    all_deltas.extend(abs(d) for d in deltas)
    flag = " ⚠" if max_abs > 15 else ""
    rows.append(
        f"| {r['beach']} | {r['station']} ({r['source']}, {r['distanceKm']:.1f} km) | {r['epaNode']} ({r['epaDistKm']:.2f} km) | {app_str} | {epa_str} | {delta_str} | {max_abs:.0f}{flag} |"
    )

all_deltas.sort()
n = len(all_deltas)
median = all_deltas[n // 2] if n % 2 else (all_deltas[n // 2 - 1] + all_deltas[n // 2]) / 2
mean = sum(all_deltas) / n
mx = max(all_deltas)

print("median", median, "mean", mean, "max", mx, "n", n)
print(f"count beaches: {len(comp)}")

with open("docs/scratch/table.md", "w") as f:
    f.write("\n".join(rows))

with open("docs/scratch/stats.json", "w") as f:
    json.dump({"median": median, "mean": mean, "max": mx, "n": n, "beaches": len(comp)}, f)
