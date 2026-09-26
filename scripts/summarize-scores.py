#!/usr/bin/env python3
"""Step 3 summary: joins the scored flags (evaluation/scores/<date>.jsonl) with the
runs (evaluation/runs/<date>/) and prints per-config totals.

    python3 scripts/summarize-scores.py 2026-09-26 > evaluation/scores/2026-09-26-summary.md
"""
import json, sys, glob, os, re
from collections import defaultdict

date = sys.argv[1] if len(sys.argv) > 1 else "2026-09-26"
FACTUAL = {"WRONG", "MISATTRIBUTED"}
FIDELITY = {"ADDED", "OVERSTATED", "COMPUTED"}

runs = {}
for f in glob.glob(f"evaluation/runs/{date}/*/*.json"):
    d = json.load(open(f))
    if d.get("error"): continue
    if d["task"].startswith("audio"):
        words = d["finalWords"]
    else:
        words = d["narrationWords"]
    runs[(d["config"], d["task"], d["run"])] = {"words": words, "min": d["estMinutes"], "sec": d["seconds"]}

scores = [json.loads(l) for l in open(f"evaluation/scores/{date}.jsonl")]
seen = set()
agg = defaultdict(lambda: defaultdict(lambda: {"n": 0, "fact": 0, "fid": 0, "words": 0, "min": [], "sec": [], "codes": defaultdict(int)}))
for s in scores:
    key = (s["config"], s["task"], s["run"])
    assert key in runs, key
    assert key not in seen, key
    seen.add(key)
    medium = "audio" if s["task"].startswith("audio") else "video"
    for bucket in (medium, "all"):
        a = agg[s["config"]][bucket]
        a["n"] += 1
        a["words"] += runs[key]["words"]
        a["min"].append(runs[key]["min"]); a["sec"].append(runs[key]["sec"])
        for fl in s["flags"]:
            a["codes"][fl["code"]] += 1
            if fl["code"] in FACTUAL: a["fact"] += 1
            elif fl["code"] in FIDELITY: a["fid"] += 1
missing = set(runs) - seen
if missing: print("UNSCORED:", sorted(missing), file=sys.stderr)

order = ["current", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-mini@t0.2", "gpt-5.4-mini@t0.7",
         "gemini-3.8-flash", "gemini-3.8-flash@t0.2", "gemini-3.8-flash@t0.7", "gemini-3.1-pro"]
print(f"# Step 3 scores ({date})\n")
print("Factual errors = WRONG + MISATTRIBUTED; fidelity lapses = ADDED + OVERSTATED + COMPUTED. Per run, and per 1,000 words.\n")
for bucket in ("audio", "video", "all"):
    print(f"## {bucket}\n")
    print("| config | runs | factual / run | fidelity / run | factual / 1k words | fidelity / 1k words | runs with any flag | mean est. min | mean seconds | codes |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for c in order:
        a = agg[c].get(bucket)
        if not a or not a["n"]: continue
        flagged = sum(1 for s in scores if s["config"] == c and s["flags"] and (bucket == "all" or s["task"].startswith(bucket)))
        codes = ", ".join(f"{k} {v}" for k, v in sorted(a["codes"].items()))
        print(f"| {c} | {a['n']} | {a['fact']/a['n']:.2f} | {a['fid']/a['n']:.2f} | {1000*a['fact']/a['words']:.2f} | {1000*a['fid']/a['words']:.2f} | {flagged}/{a['n']} | {sum(a['min'])/len(a['min']):.2f} | {sum(a['sec'])/len(a['sec']):.0f} | {codes or '-'} |")
    print()
