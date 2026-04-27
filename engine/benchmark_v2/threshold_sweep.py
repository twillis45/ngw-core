"""Threshold sensitivity sweep for the Phase 1 mode router.

Phase 2 Block C, gate C — measure how the mode-routing distribution and
INS false-positive rate change as the only continuous threshold in the
Phase 1 router is varied.

Phase 1 router thresholds:
  - INSUFFICIENT:  signal_strength_floor = 0.40   (continuous, swept)
  - INSUFFICIENT:  face_quality == "poor"         (categorical)
  - INSUFFICIENT:  face_detected == False         (categorical)
  - BOUNDED:       pattern_status == CONTESTED AND
                   "_demoted" in source AND
                   alternates >= 1                (categorical)

Only signal_strength_floor is continuous; sweeping it is the only
meaningful threshold experiment for Phase 1.  Phase 3 will introduce
many more swept thresholds with the complexity scorer.

Strategy: run the analyzer once per benchmark, capture the inputs to
route_analysis_mode (face_validation, signal_reliability, pattern_status,
source, alternates).  Then *simulate* what mode would have fired at each
candidate threshold value WITHOUT re-running the analyzer.  This keeps
the sweep cheap (one analyzer pass) while still being principled.

Output: a table showing (per threshold) how many benchmarks land in each
mode, and the false-positive INSUFFICIENT rate (benchmarks tagged
non-INSUFFICIENT that get routed INSUFFICIENT at that threshold).

Run:
    .venv/bin/python -m engine.benchmark_v2.threshold_sweep
    .venv/bin/python -m engine.benchmark_v2.threshold_sweep --steps 0.30,0.35,0.40,0.45,0.50,0.55
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")
logging.getLogger().setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

from engine.enums import AnalysisMode, FieldStatus  # noqa: E402
from engine.orchestrator import analyze_image  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"

DEFAULT_STEPS = (0.30, 0.35, 0.40, 0.45, 0.50, 0.55)


def _simulate_mode(
    face_detected: bool,
    face_quality: str,
    signal_strength: float,
    pattern_status: str,
    source: str,
    alternates_count: int,
    threshold: float,
) -> str:
    """Simulate route_analysis_mode at a given signal_strength threshold.

    Mirrors the logic in engine/orchestrator.py route_analysis_mode().
    Phase 1: INSUFFICIENT > BOUNDED-bootstrap > CLASSICAL.  HYBRID is
    deferred to Phase 3 and never fires here.
    """
    # Gate 1: INSUFFICIENT
    if not face_detected:
        return "insufficient"
    if face_quality == "poor":
        return "insufficient"
    if signal_strength < threshold:
        return "insufficient"

    # Gate 3: BOUNDED bootstrap
    if (
        pattern_status == "contested"
        and "_demoted" in source
        and alternates_count >= 1
    ):
        return "bounded"

    # Gate 4: CLASSICAL fallthrough
    return "classical"


def _capture_inputs() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    bench_files = sorted(BENCHMARKS_DIR.glob("*.json"))
    print(f"[sweep] running analyzer on {len(bench_files)} benchmarks "
          f"(one pass; thresholds are simulated post-hoc)", flush=True)

    for bench_path in bench_files:
        try:
            bench = json.loads(bench_path.read_text())
        except Exception:
            continue
        gt = bench.get("ground_truth") or {}
        rel = bench.get("image_path")
        if not rel:
            continue
        image_path = (REPO_ROOT / rel).resolve()
        if not image_path.exists():
            continue

        try:
            r = analyze_image(
                str(image_path), run_extended=True, run_vlm=False, run_solver=True,
            )
        except Exception:
            continue

        fv = getattr(r, "face_validation", None)
        sr = getattr(r, "signal_reliability", None)
        pc = getattr(r, "pattern_candidates", None)

        rows.append({
            "benchmark": bench_path.name,
            "expected_mode": gt.get("expected_mode"),
            "face_detected": bool(getattr(fv, "face_detected", False)) if fv else False,
            "face_quality": getattr(fv, "face_quality", "") if fv else "",
            "signal_strength": float(getattr(sr, "overall_signal_strength", 1.0)) if sr else 1.0,
            "pattern_status": r.pattern_status.value if hasattr(r.pattern_status, "value") else str(r.pattern_status),
            "source": getattr(r, "authoritative_pattern_source", "") or "",
            "alternates_count": len(getattr(pc, "alternates", []) or []) if pc else 0,
        })
    return rows


def _print_table(rows: List[Dict[str, Any]], thresholds: List[float]) -> None:
    print()
    print(f"=== THRESHOLD SENSITIVITY SWEEP — signal_strength_floor ===")
    print(f"  benchmark corpus size: {len(rows)}")
    print(f"  thresholds tested    : {thresholds}")
    print()
    header = (
        f"  {'threshold':<10}"
        f"{'n_classical':>12}{'n_bounded':>11}{'n_insufficient':>16}"
        f"{'fp_insufficient':>17}{'mode_correctness':>19}"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))

    for t in thresholds:
        n_cla = n_bnd = n_ins = 0
        n_correct = 0
        n_total = 0
        n_fp_ins = 0  # tagged != insufficient but routed to insufficient
        for r in rows:
            mode = _simulate_mode(
                r["face_detected"], r["face_quality"], r["signal_strength"],
                r["pattern_status"], r["source"], r["alternates_count"],
                t,
            )
            if mode == "classical":
                n_cla += 1
            elif mode == "bounded":
                n_bnd += 1
            elif mode == "insufficient":
                n_ins += 1
            tag = r.get("expected_mode")
            if tag:
                n_total += 1
                if mode == tag:
                    n_correct += 1
                if tag != "insufficient" and mode == "insufficient":
                    n_fp_ins += 1
        fp_ins_rate = (n_fp_ins / max(1, n_total - sum(1 for r in rows if r.get("expected_mode") == "insufficient")))
        # Precise FP-INS denom: benchmarks tagged != insufficient
        denom_non_ins = sum(1 for r in rows if r.get("expected_mode") and r.get("expected_mode") != "insufficient")
        fp_ins_rate = n_fp_ins / denom_non_ins if denom_non_ins else 0.0
        correctness = n_correct / n_total if n_total else 0.0
        marker = "  ← current" if abs(t - 0.40) < 1e-9 else ""
        print(
            f"  {t:<10.2f}"
            f"{n_cla:>12}{n_bnd:>11}{n_ins:>16}"
            f"{fp_ins_rate*100:>16.1f}%{correctness*100:>18.1f}%"
            f"{marker}"
        )

    print()
    print("  Notes:")
    print("    fp_insufficient   = (benchmarks tagged != insufficient && routed insufficient)")
    print("                        / (benchmarks tagged != insufficient)")
    print("    mode_correctness  = correct / tagged")
    print("    Strategy §11 calibration target: fp_insufficient ≤ 3%")
    print("    Phase 3 will introduce additional swept thresholds.")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--steps", type=str, default=None,
        help=f"comma-separated threshold values (default: {DEFAULT_STEPS})",
    )
    p.add_argument(
        "--out", type=Path, default=None,
        help="optional path to write captured inputs as JSON (machine-readable)",
    )
    args = p.parse_args(argv)

    if args.steps:
        thresholds = [float(x.strip()) for x in args.steps.split(",") if x.strip()]
    else:
        thresholds = list(DEFAULT_STEPS)

    rows = _capture_inputs()
    if not rows:
        print("no benchmarks captured — aborting", file=sys.stderr)
        return 1

    _print_table(rows, thresholds)

    if args.out:
        args.out.write_text(json.dumps(rows, indent=2, default=repr))
        print(f"\ncaptured inputs written to {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
