#!/usr/bin/env python3
"""Benchmark runner for lighting pattern analysis.

Loads benchmark definitions from benchmarks/*.json, runs analyze_image()
on each, compares results against ground truth, and prints a summary.

Usage:
    python scripts/run_benchmarks.py                  # run all benchmarks
    python scripts/run_benchmarks.py --dry-run        # validate schemas only
    python scripts/run_benchmarks.py --filter edge    # run only matching IDs/categories
    python scripts/run_benchmarks.py --verbose        # detailed per-benchmark output
"""
import argparse
import json
import os
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Suppress noisy TF/mediapipe logs before any engine imports
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
warnings.filterwarnings("ignore")

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

BENCHMARKS_DIR = PROJECT_ROOT / "benchmarks"
RESULTS_DIR = BENCHMARKS_DIR / "results"

# ---------------------------------------------------------------------------
# Verdict enum
# ---------------------------------------------------------------------------
PASS = "PASS"           # All fields match expected
SOFT_PASS = "SOFT_PASS" # Pattern in acceptable list but not primary expected
FAIL = "FAIL"           # One or more fields outside acceptable range
SKIP = "SKIP"           # Image file missing, benchmark skipped
ERROR = "ERROR"         # Exception during analysis


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------
REQUIRED_KEYS = {"benchmark_id", "description", "image_path", "ground_truth", "metadata"}
REQUIRED_GT_KEYS = {
    "expected_pattern", "expected_light_count", "expected_key_direction",
    "acceptable_patterns", "acceptable_light_count_range",
}
REQUIRED_META_KEYS = {"category", "difficulty"}


def validate_benchmark(data: Dict[str, Any]) -> List[str]:
    """Return list of validation errors (empty = valid)."""
    errors: List[str] = []
    for k in REQUIRED_KEYS:
        if k not in data:
            errors.append(f"Missing top-level key: {k}")
    gt = data.get("ground_truth", {})
    for k in REQUIRED_GT_KEYS:
        if k not in gt:
            errors.append(f"Missing ground_truth key: {k}")
    meta = data.get("metadata", {})
    for k in REQUIRED_META_KEYS:
        if k not in meta:
            errors.append(f"Missing metadata key: {k}")
    # Type checks
    alr = gt.get("acceptable_light_count_range", [])
    if not isinstance(alr, list) or len(alr) != 2:
        errors.append("acceptable_light_count_range must be a 2-element list")
    ap = gt.get("acceptable_patterns", [])
    if not isinstance(ap, list) or len(ap) == 0:
        errors.append("acceptable_patterns must be a non-empty list")
    return errors


# ---------------------------------------------------------------------------
# Key-direction mapping
# ---------------------------------------------------------------------------
# Engine outputs key_side ("left", "right", "center", "unknown") and
# key_position_text (free-form like "45 off-axis", "triangle", "clamshell").
# Ground truth uses descriptive directions like "upper_left", "left",
# "top_center", "unknown".  We map engine outputs to a normalized form
# and define acceptable equivalences.

DIRECTION_ALIASES = {
    "upper_left": {"left", "upper_left"},
    "upper_right": {"right", "upper_right"},
    "left": {"left", "upper_left"},
    "right": {"right", "upper_right"},
    "top_center": {"center", "top_center"},
    "center": {"center", "top_center"},
    "lower_left": {"lower_left"},
    "lower_right": {"lower_right"},
    "unknown": {"unknown", ""},
}


def normalize_key_direction(key_side: str, key_position_text: str) -> str:
    """Map engine outputs to a normalized direction string.

    Engine outputs come as key_side ("left", "right", "center", "upper_left",
    "upper_right", "unknown") and key_position_text (free-form like "clamshell",
    "triangle", "45 off-axis").  Normalize to a canonical direction string
    that matches ground truth values.
    """
    side = (key_side or "unknown").lower().strip()
    pos = (key_position_text or "").lower().strip()
    # Direct matches — key_side already carries direction info
    if side in ("upper_left", "upper_right", "left", "right", "center",
                "top_center", "lower_left", "lower_right"):
        return side
    # Fall back to position text hints when key_side is unknown
    if "triangle" in pos or "clamshell" in pos:
        return "top_center"
    return "unknown"


def direction_matches(detected: str, expected: str) -> bool:
    """Check if detected direction is acceptable for expected direction."""
    if expected == "unknown":
        return True  # Any direction is fine when ground truth is unknown
    acceptable = DIRECTION_ALIASES.get(expected, {expected})
    return detected in acceptable


# ---------------------------------------------------------------------------
# Run single benchmark
# ---------------------------------------------------------------------------
def run_single_benchmark(
    bench: Dict[str, Any],
    *,
    verbose: bool = False,
) -> Dict[str, Any]:
    """Run analysis on one benchmark image and compare to ground truth.

    Returns a result dict with keys: benchmark_id, verdict, details, timing_s.
    """
    bid = bench["benchmark_id"]
    gt = bench["ground_truth"]
    image_path = PROJECT_ROOT / bench["image_path"]

    # Check image exists
    if not image_path.exists():
        return {
            "benchmark_id": bid,
            "verdict": SKIP,
            "details": {"reason": f"Image not found: {image_path}"},
            "timing_s": 0.0,
        }

    # Run analysis
    t0 = time.monotonic()
    try:
        from engine.orchestrator import analyze_image

        ar = analyze_image(str(image_path), run_extended=True, run_solver=True, debug=False)
    except Exception as exc:
        return {
            "benchmark_id": bid,
            "verdict": ERROR,
            "details": {"error": str(exc), "type": type(exc).__name__},
            "timing_s": time.monotonic() - t0,
        }
    elapsed = time.monotonic() - t0

    # Extract engine results — pull best available signal from all sources
    detected_pattern = getattr(ar, "authoritative_pattern", "unknown") or "unknown"
    detected_source = getattr(ar, "authoritative_pattern_source", "none") or "none"

    intel = ar.lighting_intel
    detected_light_count = getattr(intel, "light_count", 0) if intel else 0
    detected_key_side = getattr(intel, "key_side", "unknown") if intel else "unknown"
    detected_key_pos = getattr(intel, "key_position_text", "") if intel else ""

    # Enrich from cue_inference geometry when lighting_intel is incomplete
    cue_inf = getattr(ar, "cue_inference_result", None)
    geo = None
    if isinstance(cue_inf, dict):
        geo = cue_inf.get("geometry")
    if geo is not None:
        # Light count: cue_inference uses deduped reflection_architecture
        # (floor reflections removed, nearby positions grouped) which is more
        # reliable than raw catchlight count from lighting_intel.
        # Prefer cue_inference when:
        #   - lighting_intel reports 0 (no catchlights found at all)
        #   - lighting_intel count is wildly high (>10 = false positives from
        #     reflective surfaces, mixed environments, etc.)
        geo_lc = getattr(geo, "light_count_estimate", 0)
        if detected_light_count == 0 and geo_lc > 0:
            detected_light_count = geo_lc
        elif detected_light_count > 10 and geo_lc > 0:
            detected_light_count = geo_lc
        # Key direction: use cue_inference geometry when catchlights gave no side
        if detected_key_side == "unknown":
            geo_dir = getattr(geo, "key_light_direction", "unknown")
            if geo_dir and geo_dir != "unknown":
                detected_key_side = geo_dir

    detected_direction = normalize_key_direction(detected_key_side, detected_key_pos)

    pattern_confidence = 0.0
    pc = getattr(ar, "pattern_candidates", None)
    if pc and pc.primary:
        pattern_confidence = pc.primary.confidence

    # Verbose diagnostics: show what each classifier returned
    if verbose:
        print(f"\n    --- Diagnostics for {bid} ---")
        print(f"    lighting_intel.pattern={getattr(intel, 'pattern', '?')}, "
              f"conf={getattr(intel, 'pattern_confidence', '?')}, "
              f"light_count={getattr(intel, 'light_count', '?')}, "
              f"key_side={getattr(intel, 'key_side', '?')}, "
              f"key_pos={getattr(intel, 'key_position_text', '?')}")
        if geo is not None:
            print(f"    cue_inference.geometry: shadow_pattern={getattr(geo, 'shadow_pattern', '?')}, "
                  f"key_dir={getattr(geo, 'key_light_direction', '?')}, "
                  f"key_height={getattr(geo, 'key_light_height', '?')}, "
                  f"light_count={getattr(geo, 'light_count_estimate', '?')}, "
                  f"conf={getattr(geo, 'confidence', '?')}")
        ref_a = ar.reference_analysis
        if ref_a is not None:
            lr = getattr(ref_a, "lighting_read", None)
            if lr:
                print(f"    reference_read: shadow_pattern={getattr(lr, 'shadow_pattern', '?')}, "
                      f"source_direction={getattr(lr, 'source_direction', '?')}")
        if pc:
            print(f"    pattern_candidates: primary={pc.primary.pattern}({pc.primary.source},{pc.primary.confidence:.2f})")
            for alt in (pc.alternates or []):
                print(f"      alternate: {alt.pattern}({alt.source},{alt.confidence:.2f})")
            if pc.contradictions:
                print(f"      contradictions: {pc.contradictions}")

    # Compare against ground truth
    checks: Dict[str, Any] = {}

    # Pattern check
    if detected_pattern == gt["expected_pattern"]:
        checks["pattern"] = {"status": PASS, "detected": detected_pattern, "expected": gt["expected_pattern"]}
    elif detected_pattern in gt["acceptable_patterns"]:
        checks["pattern"] = {"status": SOFT_PASS, "detected": detected_pattern, "expected": gt["expected_pattern"], "acceptable": gt["acceptable_patterns"]}
    else:
        checks["pattern"] = {"status": FAIL, "detected": detected_pattern, "expected": gt["expected_pattern"], "acceptable": gt["acceptable_patterns"]}

    # Light count check
    lc_range = gt["acceptable_light_count_range"]
    if detected_light_count == gt["expected_light_count"]:
        checks["light_count"] = {"status": PASS, "detected": detected_light_count, "expected": gt["expected_light_count"]}
    elif lc_range[0] <= detected_light_count <= lc_range[1]:
        checks["light_count"] = {"status": SOFT_PASS, "detected": detected_light_count, "expected": gt["expected_light_count"], "range": lc_range}
    else:
        checks["light_count"] = {"status": FAIL, "detected": detected_light_count, "expected": gt["expected_light_count"], "range": lc_range}

    # Key direction check
    if direction_matches(detected_direction, gt["expected_key_direction"]):
        checks["key_direction"] = {"status": PASS, "detected": detected_direction, "expected": gt["expected_key_direction"]}
    else:
        checks["key_direction"] = {"status": FAIL, "detected": detected_direction, "expected": gt["expected_key_direction"]}

    # Overall verdict
    statuses = [c["status"] for c in checks.values()]
    if all(s == PASS for s in statuses):
        verdict = PASS
    elif FAIL in statuses:
        verdict = FAIL
    else:
        verdict = SOFT_PASS

    # ── Perception diagnostics ────────────────────────────────────
    diagnostics = {}
    fv = getattr(ar, "face_validation", None)
    if fv is not None:
        diagnostics["face_quality"] = fv.face_quality
        diagnostics["face_detected"] = fv.face_detected
    srl = getattr(ar, "signal_reliability", None)
    if srl is not None:
        diagnostics["signals_available"] = srl.signals_available
        diagnostics["signals_total"] = srl.signals_total
        diagnostics["signal_strength"] = srl.overall_signal_strength
        diagnostics["weak_signals"] = srl.weak_signals
        diagnostics["missing_signals"] = srl.missing_signals
    pex = getattr(ar, "perception_explanation", None)
    if pex is not None:
        diagnostics["ambiguity_flags"] = pex.ambiguity_flags
        diagnostics["pattern_reasoning"] = pex.pattern_reasoning
    ecf = getattr(ar, "edge_case_flags", None)
    if ecf is not None:
        diagnostics["edge_cases"] = [
            k for k in [
                "no_face", "bw_processing", "blown_highlights",
                "mixed_color_temperature", "outdoor_foliage_shadows",
                "window_light_gradient", "extreme_low_key",
            ] if getattr(ecf, k, False)
        ]

    return {
        "benchmark_id": bid,
        "verdict": verdict,
        "checks": checks,
        "detected": {
            "pattern": detected_pattern,
            "pattern_source": detected_source,
            "pattern_confidence": round(pattern_confidence, 3),
            "light_count": detected_light_count,
            "key_direction": detected_direction,
        },
        "diagnostics": diagnostics,
        "timing_s": round(elapsed, 2),
    }


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------
def load_benchmarks(filter_str: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load all benchmark JSON files, optionally filtered."""
    benchmarks = []
    for p in sorted(BENCHMARKS_DIR.glob("*.json")):
        with open(p) as f:
            data = json.load(f)
        if filter_str:
            bid = data.get("benchmark_id", "")
            cat = data.get("metadata", {}).get("category", "")
            if filter_str.lower() not in bid.lower() and filter_str.lower() not in cat.lower():
                continue
        benchmarks.append(data)
    return benchmarks


def print_summary(results: List[Dict[str, Any]]) -> None:
    """Print a formatted summary table."""
    print("\n" + "=" * 72)
    print("BENCHMARK RESULTS SUMMARY")
    print("=" * 72)

    # Column widths
    id_w = max(len(r["benchmark_id"]) for r in results) + 2

    counts = {PASS: 0, SOFT_PASS: 0, FAIL: 0, SKIP: 0, ERROR: 0}

    for r in results:
        verdict = r["verdict"]
        counts[verdict] = counts.get(verdict, 0) + 1
        bid = r["benchmark_id"].ljust(id_w)
        timing = f"{r['timing_s']:.1f}s" if r["timing_s"] > 0 else "—"

        # Verdict symbol
        sym = {"PASS": "✓", "SOFT_PASS": "~", "FAIL": "✗", "SKIP": "⊘", "ERROR": "!"}
        symbol = sym.get(verdict, "?")

        detail = ""
        if verdict == FAIL:
            failed_checks = [k for k, v in r.get("checks", {}).items() if v["status"] == FAIL]
            detail = f"  failed: {', '.join(failed_checks)}"
        elif verdict == SKIP:
            detail = f"  {r.get('details', {}).get('reason', '')}"
        elif verdict == ERROR:
            detail = f"  {r.get('details', {}).get('type', '')}: {r.get('details', {}).get('error', '')[:60]}"

        print(f"  {symbol} {bid} {verdict:<10} {timing:>6}{detail}")

    print("-" * 72)
    total = len(results)
    passing = counts[PASS] + counts[SOFT_PASS]
    pct = (passing / total * 100) if total > 0 else 0
    print(f"  Total: {total}  |  Pass: {counts[PASS]}  Soft: {counts[SOFT_PASS]}  "
          f"Fail: {counts[FAIL]}  Skip: {counts[SKIP]}  Error: {counts[ERROR]}  "
          f"|  Rate: {pct:.0f}%")
    print("=" * 72)

    # ── Signal coverage summary ──────────────────────────────────
    active = [r for r in results if r["verdict"] not in (SKIP, ERROR)]
    if active and active[0].get("diagnostics"):
        faces = sum(1 for r in active if r.get("diagnostics", {}).get("face_detected", False))
        sig_counts = [r.get("diagnostics", {}).get("signals_available", 0) for r in active]
        avg_sig = sum(sig_counts) / len(sig_counts) if sig_counts else 0
        strengths = [r.get("diagnostics", {}).get("signal_strength", 0) for r in active]
        avg_str = sum(strengths) / len(strengths) if strengths else 0

        # Edge-case flag frequency
        ecf_counts: Dict[str, int] = {}
        amb_counts: Dict[str, int] = {}
        for r in active:
            diag = r.get("diagnostics", {})
            for ec in diag.get("edge_cases", []):
                ecf_counts[ec] = ecf_counts.get(ec, 0) + 1
            for af in diag.get("ambiguity_flags", []):
                amb_counts[af] = amb_counts.get(af, 0) + 1

        print(f"\n  Signal Coverage:")
        print(f"    Face detected: {faces}/{len(active)}  |  "
              f"Avg signals: {avg_sig:.1f}/24  |  Avg strength: {avg_str:.3f}")
        if ecf_counts:
            top_ec = sorted(ecf_counts.items(), key=lambda x: -x[1])[:5]
            print(f"    Edge cases: {', '.join(f'{k}({v})' for k, v in top_ec)}")
        if amb_counts:
            top_amb = sorted(amb_counts.items(), key=lambda x: -x[1])[:5]
            print(f"    Ambiguity flags: {', '.join(f'{k}({v})' for k, v in top_amb)}")
        print()


def save_results(results: List[Dict[str, Any]]) -> Path:
    """Save results JSON to benchmarks/results/run_<timestamp>.json."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = RESULTS_DIR / f"run_{ts}.json"

    payload = {
        "run_timestamp": datetime.now(timezone.utc).isoformat(),
        "benchmark_count": len(results),
        "summary": {
            v: sum(1 for r in results if r["verdict"] == v)
            for v in [PASS, SOFT_PASS, FAIL, SKIP, ERROR]
        },
        "results": results,
    }

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Run NGW lighting benchmark suite")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate benchmark schemas without running analysis")
    parser.add_argument("--filter", type=str, default=None,
                        help="Filter benchmarks by ID or category substring")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Print detailed per-benchmark output")
    parser.add_argument("--no-save", action="store_true",
                        help="Skip saving results JSON")
    parser.add_argument("--ingest", action="store_true",
                        help="After run, ingest SOFT_PASS results as pattern_boundary "
                             "failure clusters (requires DB; uses last 5 runs)")
    parser.add_argument("--ingest-min-runs", type=int, default=2, metavar="N",
                        help="Min runs for a confusion to become a cluster when using --ingest (default: 2)")
    args = parser.parse_args()

    benchmarks = load_benchmarks(args.filter)
    if not benchmarks:
        print("No benchmarks found.")
        sys.exit(1)

    print(f"Loaded {len(benchmarks)} benchmark(s)")

    # Validate schemas
    all_valid = True
    for b in benchmarks:
        errs = validate_benchmark(b)
        if errs:
            all_valid = False
            print(f"  ✗ {b.get('benchmark_id', '???')}: {'; '.join(errs)}")
        elif args.dry_run:
            print(f"  ✓ {b.get('benchmark_id', '???')}: schema valid")

    if not all_valid:
        print("\nSchema validation failed. Fix errors before running.")
        sys.exit(1)

    if args.dry_run:
        print("\nDry run complete — all schemas valid.")
        sys.exit(0)

    # Run benchmarks
    print("\nRunning benchmarks...\n")
    results: List[Dict[str, Any]] = []

    for i, bench in enumerate(benchmarks, 1):
        bid = bench["benchmark_id"]
        difficulty = bench["metadata"].get("difficulty", "?")
        print(f"[{i}/{len(benchmarks)}] {bid} ({difficulty})...", end=" ", flush=True)

        result = run_single_benchmark(bench, verbose=args.verbose)
        results.append(result)

        verdict = result["verdict"]
        timing = f"{result['timing_s']:.1f}s" if result["timing_s"] > 0 else "—"
        print(f"{verdict} ({timing})")

        if args.verbose and result.get("checks"):
            for field, check in result["checks"].items():
                status = check["status"]
                detected = check.get("detected", "?")
                expected = check.get("expected", "?")
                print(f"    {field}: {status} (detected={detected}, expected={expected})")

    # Summary
    print_summary(results)

    # Save
    if not args.no_save:
        out_path = save_results(results)
        print(f"\nResults saved to: {out_path}")

    # Optional: ingest SOFT_PASS results into the learning pipeline
    if args.ingest:
        print("\n── Ingesting SOFT_PASS results as pattern_boundary clusters ─────")
        try:
            from scripts.ingest_soft_pass import _load_runs, _load_ground_truths, analyse_soft_passes, ingest_clusters
            runs = _load_runs(5)
            gts = _load_ground_truths()
            clusters = analyse_soft_passes(runs, gts, min_runs=args.ingest_min_runs)
            result_db = ingest_clusters(clusters)
            print(f"  ✓ {result_db['ingested']} cluster(s) ingested from {len(clusters)} confusion pair(s)")
        except Exception as exc:
            print(f"  [warn] SOFT_PASS ingestion failed: {exc}")


if __name__ == "__main__":
    main()
