"""
failure_analysis.py  —  Analyse batch_runner results to surface systematic failures.

Reads the latest (or specified) intelligence run and outputs:
  - Top misclassified patterns ranked by frequency
  - Low-confidence clusters (patterns where confidence stays low even when correct)
  - Calibration failures (over-confident misses, under-confident hits)
  - Confusion matrix for pattern pairs
  - Specific improvement suggestions

Usage:
    python3 scripts/intelligence/failure_analysis.py
    python3 scripts/intelligence/failure_analysis.py --run data/intelligence_runs/20260324T120000_gold
    python3 scripts/intelligence/failure_analysis.py --format json > analysis.json
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
RUNS_DIR = REPO_ROOT / "data" / "intelligence_runs"


def load_run(run_path: Path | None = None) -> dict:
    """Load results.json from the specified run (or latest)."""
    if run_path is None:
        latest = RUNS_DIR / "latest"
        if latest.is_symlink():
            run_path = latest.resolve()
        else:
            # Fall back to most recent directory
            candidates = sorted(RUNS_DIR.iterdir(), reverse=True)
            candidates = [d for d in candidates if d.is_dir() and d.name != "latest"]
            if not candidates:
                raise FileNotFoundError(f"No runs found in {RUNS_DIR}")
            run_path = candidates[0]

    results_file = run_path / "results.json"
    summary_file = run_path / "summary.json"

    results = json.loads(results_file.read_text()) if results_file.exists() else []
    summary = json.loads(summary_file.read_text()) if summary_file.exists() else {}
    return {"results": results, "summary": summary, "run_path": run_path}


def analyse(data: dict) -> dict:
    """Full failure analysis. Returns structured report."""
    results = data["results"]
    summary = data.get("summary", {})

    ok = [r for r in results if r.get("ok") and r.get("evaluation")]
    if not ok:
        return {"error": "No evaluated results", "n_total": len(results)}

    evs = [r["evaluation"] for r in ok]

    # ── 1. Miss summary ──────────────────────────────────────────────────────
    misses = [e for e in evs if e["correctness"] == "miss"]
    exact = [e for e in evs if e["correctness"] == "exact"]
    acceptable = [e for e in evs if e["correctness"] == "acceptable"]

    # ── 2. Confusion matrix ──────────────────────────────────────────────────
    confusion: defaultdict[str, Counter] = defaultdict(Counter)
    for e in evs:
        confusion[e["expected_pattern"]][e["predicted_pattern"]] += 1

    # Top confused pairs (where prediction != expected)
    confused_pairs = []
    for expected, preds in confusion.items():
        for predicted, count in preds.items():
            if predicted != expected:
                confused_pairs.append({
                    "expected": expected,
                    "predicted": predicted,
                    "count": count,
                    "pct_of_expected": round(count / sum(preds.values()), 2),
                })
    confused_pairs.sort(key=lambda x: (-x["count"], -x["pct_of_expected"]))

    # ── 3. Per-pattern failure rate ──────────────────────────────────────────
    pattern_stats: dict[str, dict] = {}
    for e in evs:
        p = e["expected_pattern"]
        if p not in pattern_stats:
            pattern_stats[p] = {"total": 0, "exact": 0, "miss": 0, "confidences": [], "trust_weighted": []}
        pattern_stats[p]["total"] += 1
        if e["exact_match"]:
            pattern_stats[p]["exact"] += 1
        if e["correctness"] == "miss":
            pattern_stats[p]["miss"] += 1
        pattern_stats[p]["confidences"].append(e["confidence"])
        pattern_stats[p]["trust_weighted"].append((e["confidence"], e["trust_score"]))

    pattern_report = {}
    for p, s in pattern_stats.items():
        confs = s["confidences"]
        pattern_report[p] = {
            "total": s["total"],
            "exact_accuracy": round(s["exact"] / s["total"], 3),
            "miss_rate": round(s["miss"] / s["total"], 3),
            "mean_confidence": round(sum(confs) / len(confs), 3),
            "min_confidence": round(min(confs), 3),
            "max_confidence": round(max(confs), 3),
        }

    # ── 4. Low-confidence clusters ───────────────────────────────────────────
    LOW_CONF = 0.50
    low_conf_correct = [e for e in exact if e["confidence"] < LOW_CONF]
    low_conf_miss = [e for e in misses if e["confidence"] < LOW_CONF]

    # ── 5. Calibration failures ──────────────────────────────────────────────
    cal_failures = [e for e in evs if e.get("calibration_issue")]
    over_confident_misses = [e for e in cal_failures if e["calibration_issue"] == "over_confident_miss"]
    under_confident_hits = [e for e in cal_failures if e["calibration_issue"] == "under_confident_correct"]

    # ── 6. Difficulty breakdown ──────────────────────────────────────────────
    by_difficulty: defaultdict[str, list] = defaultdict(list)
    for e in evs:
        by_difficulty[e.get("difficulty", "standard")].append(e)

    diff_report = {}
    for diff, items in by_difficulty.items():
        n = len(items)
        ex = sum(1 for e in items if e["exact_match"])
        diff_report[diff] = {
            "n": n,
            "exact_accuracy": round(ex / n, 3) if n else 0,
        }

    # ── 7. Improvement suggestions ───────────────────────────────────────────
    suggestions = []

    # Patterns with >50% miss rate
    for p, stats in pattern_report.items():
        if stats["miss_rate"] > 0.50:
            top_preds = [cp["predicted"] for cp in confused_pairs if cp["expected"] == p][:2]
            suggestions.append({
                "priority": "high",
                "pattern": p,
                "issue": f"High miss rate {stats['miss_rate']:.0%}",
                "suggested_action": f"Review classifier for {p}; commonly confused with {', '.join(top_preds) if top_preds else 'unknown'}",
            })

    # Patterns with low confidence even when correct
    for p, stats in pattern_report.items():
        if stats["exact_accuracy"] > 0.5 and stats["mean_confidence"] < 0.55:
            suggestions.append({
                "priority": "medium",
                "pattern": p,
                "issue": f"Low confidence {stats['mean_confidence']:.2f} despite {stats['exact_accuracy']:.0%} accuracy",
                "suggested_action": f"Boost confidence signal for {p} — classifier is correct but uncertain. Review feature weights.",
            })

    # High-frequency confused pairs
    for cp in confused_pairs[:5]:
        if cp["count"] >= 2:
            suggestions.append({
                "priority": "medium",
                "pattern": cp["expected"],
                "issue": f"Confused with {cp['predicted']} {cp['pct_of_expected']:.0%} of the time",
                "suggested_action": f"Add discriminating signal for {cp['expected']} vs {cp['predicted']} boundary",
            })

    # Over-confident misses (urgent — high confidence wrong is worse)
    if over_confident_misses:
        for e in over_confident_misses:
            suggestions.append({
                "priority": "high",
                "pattern": e["expected_pattern"],
                "issue": f"Over-confident miss: predicted {e['predicted_pattern']} with {e['confidence']:.2f} confidence",
                "suggested_action": f"Add contradiction check between {e['expected_pattern']} and {e['predicted_pattern']}",
            })

    suggestions.sort(key=lambda x: {"high": 0, "medium": 1, "low": 2}[x["priority"]])

    return {
        "run_path": str(data.get("run_path", "")),
        "n_total": len(results),
        "n_evaluated": len(ok),
        "n_errors": len(results) - len(ok),
        "overall": {
            "exact_accuracy": round(len(exact) / len(ok), 3) if ok else 0,
            "acceptable_accuracy": round(len(acceptable) / len(ok), 3) if ok else 0,
            "miss_rate": round(len(misses) / len(ok), 3) if ok else 0,
        },
        "per_pattern": pattern_report,
        "top_confused_pairs": confused_pairs[:10],
        "low_confidence_correct": len(low_conf_correct),
        "low_confidence_miss": len(low_conf_miss),
        "calibration_failures": {
            "over_confident_misses": len(over_confident_misses),
            "under_confident_hits": len(under_confident_hits),
            "details": [
                {
                    "type": e["calibration_issue"],
                    "expected": e["expected_pattern"],
                    "predicted": e["predicted_pattern"],
                    "confidence": e["confidence"],
                }
                for e in cal_failures
            ],
        },
        "difficulty_breakdown": diff_report,
        "suggestions": suggestions,
        "confusion_matrix": {
            expected: dict(preds)
            for expected, preds in confusion.items()
        },
    }


def print_report(report: dict) -> None:
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  INTELLIGENCE FAILURE ANALYSIS                          ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"\nRun: {report.get('run_path', 'unknown')}")
    print(f"Evaluated: {report['n_evaluated']}/{report['n_total']} images")

    ov = report.get("overall", {})
    print(f"\nOverall:")
    print(f"  Exact accuracy:      {ov.get('exact_accuracy', 0):.1%}")
    print(f"  Acceptable accuracy: {ov.get('acceptable_accuracy', 0):.1%}")
    print(f"  Miss rate:           {ov.get('miss_rate', 0):.1%}")

    print("\nPer-pattern accuracy (sorted by miss rate):")
    pp = report.get("per_pattern", {})
    for p, s in sorted(pp.items(), key=lambda x: -x[1]["miss_rate"]):
        bar = "▓" * int(s["exact_accuracy"] * 20)
        miss_flag = "  ← NEEDS WORK" if s["miss_rate"] > 0.50 else ""
        print(f"  {p:<32}  acc={s['exact_accuracy']:.0%}  miss={s['miss_rate']:.0%}"
              f"  conf={s['mean_confidence']:.2f}  {bar}{miss_flag}")

    pairs = report.get("top_confused_pairs", [])
    if pairs:
        print("\nTop confused pairs:")
        for cp in pairs[:8]:
            print(f"  {cp['expected']:<22} → {cp['predicted']:<22}  {cp['count']}x ({cp['pct_of_expected']:.0%})")

    cal = report.get("calibration_failures", {})
    print(f"\nCalibration:")
    print(f"  Over-confident misses:  {cal.get('over_confident_misses', 0)}")
    print(f"  Under-confident hits:   {cal.get('under_confident_hits', 0)}")

    sug = report.get("suggestions", [])
    if sug:
        print(f"\nSuggestions ({len(sug)}):")
        for s in sug[:8]:
            pri = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(s["priority"], "?")
            print(f"  {pri} [{s['pattern']}] {s['issue']}")
            print(f"     → {s['suggested_action']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyse batch runner results for systematic failures.")
    parser.add_argument("--run", type=Path, help="Path to run directory (default: latest)")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args()

    data = load_run(args.run)
    report = analyse(data)

    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        print_report(report)

        # Save analysis alongside the run
        run_path = data.get("run_path")
        if run_path:
            out = Path(run_path) / "failure_analysis.json"
            out.write_text(json.dumps(report, indent=2))
            print(f"\nSaved analysis: {out}")


if __name__ == "__main__":
    main()
