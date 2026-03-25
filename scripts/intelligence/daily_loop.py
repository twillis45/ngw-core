"""
daily_loop.py  —  Orchestrate the full intelligence improvement loop.

Pipeline:
  1. Run batch analysis over gold set (no VLM for speed)
  2. Run failure analysis → surface top misclassifications
  3. Check against confusion set edge cases
  4. Generate candidate threshold/rule adjustments
  5. Run benchmark V2 regression check
  6. Print summary report + actionable items

Usage:
    python3 scripts/intelligence/daily_loop.py
    python3 scripts/intelligence/daily_loop.py --quick    # skip benchmark regression
    python3 scripts/intelligence/daily_loop.py --vlm      # include VLM pass
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / ".env")


def step(label: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"▶  {label}")
    print('─' * 60)


def run_batch(run_vlm: bool = False) -> dict:
    step("STEP 1: Batch analysis over gold set")
    from scripts.intelligence.batch_runner import run_gold_set, save_run
    data = run_gold_set(run_vlm=run_vlm, verbose=False)
    run_dir = save_run(data, label="daily")
    return {"data": data, "run_dir": run_dir}


def run_failure_analysis(run_dir: Path) -> dict:
    step("STEP 2: Failure analysis")
    from scripts.intelligence.failure_analysis import load_run, analyse, print_report
    raw = load_run(run_dir)
    report = analyse(raw)
    print_report(report)

    # Save
    out = run_dir / "failure_analysis.json"
    out.write_text(json.dumps(report, indent=2))
    return report


def check_confusion_set(report: dict) -> None:
    step("STEP 3: Confusion set edge case check")
    conf_manifest = REPO_ROOT / "data" / "confusion_set" / "manifest.json"
    if not conf_manifest.exists():
        print("  No confusion set manifest found.")
        return

    conf = json.loads(conf_manifest.read_text())
    confusion_matrix = report.get("confusion_matrix", {})
    pairs = conf.get("pairs", [])

    print(f"  Checking {len(pairs)} confusion pairs...")
    issues = []
    for pair in pairs:
        a, b = pair["pattern_a"], pair["pattern_b"]
        expected_conf_rate = pair.get("expected_confusion_rate", 0.3)
        threshold = pair.get("confidence_threshold", 0.65)

        # Check if our actual confusion matches or exceeds expected
        a_confused_with_b = confusion_matrix.get(a, {}).get(b, 0)
        b_confused_with_a = confusion_matrix.get(b, {}).get(a, 0)
        a_total = sum(confusion_matrix.get(a, {}).values()) or 1
        b_total = sum(confusion_matrix.get(b, {}).values()) or 1

        actual_a_to_b = a_confused_with_b / a_total
        actual_b_to_a = b_confused_with_a / b_total

        if actual_a_to_b > expected_conf_rate or actual_b_to_a > expected_conf_rate:
            issues.append({
                "pair": pair["id"],
                "a_to_b": round(actual_a_to_b, 2),
                "b_to_a": round(actual_b_to_a, 2),
                "expected_max": expected_conf_rate,
                "boundary": pair["boundary"],
            })

    if issues:
        print(f"  ⚠  {len(issues)} confusion pairs exceeded expected rates:")
        for iss in issues:
            print(f"    {iss['pair']}: {iss['a_to_b']:.0%} / {iss['b_to_a']:.0%}  (limit {iss['expected_max']:.0%})")
            print(f"      Boundary: {iss['boundary']}")
    else:
        print(f"  ✓  All {len(pairs)} confusion pairs within expected rates")


def generate_candidates(report: dict) -> list[dict]:
    step("STEP 4: Generate improvement candidates")

    candidates = []
    sug = report.get("suggestions", [])
    high_priority = [s for s in sug if s["priority"] == "high"]
    medium_priority = [s for s in sug if s["priority"] == "medium"]

    print(f"  {len(high_priority)} high-priority, {len(medium_priority)} medium-priority suggestions")

    # Build concrete candidates from suggestions
    pp = report.get("per_pattern", {})
    for pattern, stats in pp.items():
        if stats["miss_rate"] > 0.40:
            candidates.append({
                "type": "confidence_threshold_review",
                "pattern": pattern,
                "rationale": f"Miss rate {stats['miss_rate']:.0%} — classifier may need threshold adjustment",
                "current_metrics": stats,
                "proposed_action": f"Lower detection threshold for {pattern} by 0.05–0.10; review signal weights",
                "priority": "high" if stats["miss_rate"] > 0.60 else "medium",
            })

    # Confused pairs → add discriminating signal candidate
    confused_pairs = report.get("top_confused_pairs", [])
    for cp in confused_pairs[:5]:
        if cp["pct_of_expected"] > 0.25:
            candidates.append({
                "type": "discriminating_signal",
                "pattern": cp["expected"],
                "confused_with": cp["predicted"],
                "rationale": f"Confused {cp['pct_of_expected']:.0%} of the time",
                "proposed_action": f"Add signal to distinguish {cp['expected']} from {cp['predicted']}",
                "priority": "medium",
            })

    # Calibration issues
    cal = report.get("calibration_failures", {})
    if cal.get("over_confident_misses", 0) > 0:
        for detail in cal.get("details", []):
            if detail["type"] == "over_confident_miss":
                candidates.append({
                    "type": "contradiction_rule",
                    "pattern": detail["expected"],
                    "confused_with": detail["predicted"],
                    "rationale": f"Over-confident miss: {detail['confidence']:.2f} confidence predicting wrong pattern",
                    "proposed_action": f"Add mutual exclusion/contradiction rule between {detail['expected']} and {detail['predicted']}",
                    "priority": "high",
                })

    candidates.sort(key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x["priority"], 1))

    print(f"\n  Candidates:")
    for c in candidates:
        pri = "🔴" if c["priority"] == "high" else "🟡"
        print(f"  {pri} [{c['pattern']}] {c['type']}: {c['rationale'][:70]}")

    return candidates


def run_benchmark_regression() -> dict | None:
    step("STEP 5: Benchmark V2 regression check")
    try:
        from engine.benchmark_v2.runner import run_benchmark
        result = run_benchmark(run_vlm=False)
        status = "PASS" if result.get("passed") else "FAIL"
        print(f"  Benchmark: {status}")
        score = result.get("final_score", 0)
        print(f"  Final score: {score:.3f}")
        regressions = result.get("regressions", [])
        if regressions:
            print(f"  ⚠  {len(regressions)} regressions:")
            for r in regressions[:3]:
                print(f"    {r}")
        return result
    except Exception as exc:
        print(f"  Benchmark skipped: {exc}")
        return None


def save_loop_report(
    run_dir: Path,
    failure_report: dict,
    candidates: list[dict],
    benchmark: dict | None,
) -> Path:
    step("STEP 6: Saving loop report")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_dir": str(run_dir),
        "overall": failure_report.get("overall", {}),
        "top_improvements_needed": candidates[:10],
        "benchmark_passed": benchmark.get("passed") if benchmark else None,
        "benchmark_score": benchmark.get("final_score") if benchmark else None,
        "patterns_needing_work": [
            p for p, s in failure_report.get("per_pattern", {}).items()
            if s["miss_rate"] > 0.40
        ],
        "next_actions": _build_next_actions(failure_report, candidates),
    }

    out = run_dir / "loop_report.json"
    out.write_text(json.dumps(report, indent=2))

    # Also write to a persistent latest loop report
    latest_out = REPO_ROOT / "data" / "intelligence_runs" / "latest_loop_report.json"
    latest_out.write_text(json.dumps(report, indent=2))

    print(f"  Saved: {out}")
    print(f"  Also: {latest_out}")
    return out


def _build_next_actions(report: dict, candidates: list[dict]) -> list[str]:
    actions = []

    pp = report.get("per_pattern", {})
    worst = sorted(pp.items(), key=lambda x: -x[1]["miss_rate"])[:3]
    for p, stats in worst:
        if stats["miss_rate"] > 0.0:
            actions.append(
                f"Investigate {p} misclassifications (miss rate {stats['miss_rate']:.0%}) — "
                f"run: python3 scripts/intelligence/batch_runner.py --patterns {p} --verbose"
            )

    for c in candidates[:3]:
        if c["type"] == "discriminating_signal":
            actions.append(
                f"Review signal for {c['pattern']} vs {c['confused_with']} — "
                f"check orchestrator.py pattern_rules and contradiction scoring"
            )
        elif c["type"] == "contradiction_rule":
            actions.append(
                f"Add contradiction rule: {c['pattern']} should demote {c['confused_with']} — "
                f"add to engine/orchestrator.py _CONTRADICTION_RULES"
            )
        elif c["type"] == "confidence_threshold_review":
            actions.append(
                f"Tune threshold for {c['pattern']} — "
                f"check PATTERN_THRESHOLDS in engine/classifiers/"
            )

    return actions


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the daily intelligence improvement loop.")
    parser.add_argument("--vlm", action="store_true", help="Include VLM pass (slower)")
    parser.add_argument("--quick", action="store_true", help="Skip benchmark regression")
    args = parser.parse_args()

    t0 = time.time()
    print(f"\n{'═' * 60}")
    print(f"  NGW INTELLIGENCE DAILY LOOP")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'═' * 60}")

    # Step 1: Batch run
    batch_result = run_batch(run_vlm=args.vlm)
    run_dir = batch_result["run_dir"]

    # Step 2: Failure analysis
    failure_report = run_failure_analysis(run_dir)

    # Step 3: Confusion set check
    check_confusion_set(failure_report)

    # Step 4: Candidates
    candidates = generate_candidates(failure_report)

    # Step 5: Benchmark regression (optional)
    benchmark = None
    if not args.quick:
        benchmark = run_benchmark_regression()

    # Step 6: Save
    loop_report_path = save_loop_report(run_dir, failure_report, candidates, benchmark)

    elapsed = time.time() - t0
    print(f"\n{'═' * 60}")
    print(f"  Loop complete in {elapsed:.0f}s")
    print(f"  Report: {loop_report_path}")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    main()
