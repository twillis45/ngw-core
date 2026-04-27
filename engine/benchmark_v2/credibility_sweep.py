"""Phase 3C — calibration sweep for candidate credibility weights.

Pressure-tests the weights used by `compute_candidate_credibility` and
the long-term BOUNDED predicate's downstream consumption.  The sweep
produces ranked candidate settings against the existing 48-benchmark
corpus on the metrics the strategy cares about.

Strategy: each benchmark is run through the analyzer ONCE per run to
populate result inputs (pattern_candidates, cue_report, lighting_intel,
reference_analysis, etc.).  The sweep then re-runs ONLY:
  - compute_candidate_credibility(result, weights=w) per config
  - route_analysis_mode(result) to recompute the mode

This is cheap: one analyzer pass per image, then 81 cred+route sims per
image.  No new CV runs.

Sweep grid (per the Phase 3C prompt):
  ev_match_weight        ∈ {0.08, 0.10, 0.12}
  contradiction_weight   ∈ {0.10, 0.15, 0.20}
  source_trust_demoted   ∈ {0.60, 0.70, 0.80}
  source_trust_fallback  ∈ {0.40, 0.50, 0.60}

3⁴ = 81 configurations.  Composite score named explicitly; no hidden
weighting.  Output is a ranked table written to stdout (or --out file).

Run:
    .venv/bin/python -m engine.benchmark_v2.credibility_sweep
    .venv/bin/python -m engine.benchmark_v2.credibility_sweep --top 20
    .venv/bin/python -m engine.benchmark_v2.credibility_sweep --json --out sweep.json
"""
from __future__ import annotations

import argparse
import itertools
import json
import logging
import os
import sys
import warnings
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")
logging.getLogger().setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

from engine.enums import AnalysisMode  # noqa: E402
from engine.orchestrator import (  # noqa: E402
    CredibilityWeights,
    analyze_image,
    compute_candidate_credibility,
    route_analysis_mode,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"

DEFAULT_GRID = {
    "ev_match_weight":       (0.08, 0.10, 0.12),
    "contradiction_weight":  (0.10, 0.15, 0.20),
    "source_trust_demoted":  (0.60, 0.70, 0.80),
    "source_trust_fallback": (0.40, 0.50, 0.60),
}

# Phase 3B reference (the current production weights — used as the
# baseline row in the output for direct comparison).
BASELINE_WEIGHTS = CredibilityWeights()


def _load_benchmarks() -> List[Tuple[str, Dict[str, Any], Path]]:
    """Return list of (benchmark_id, json_dict, image_path)."""
    rows = []
    for p in sorted(BENCHMARKS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        rel = data.get("image_path")
        if not rel:
            continue
        img = (REPO_ROOT / rel).resolve()
        if not img.exists():
            continue
        rows.append((data.get("benchmark_id", p.stem), data, img))
    return rows


def _capture_results() -> List[Tuple[Dict[str, Any], Any]]:
    """Run analyzer once per benchmark; return [(bench_dict, result)]."""
    benchmarks = _load_benchmarks()
    captured = []
    for i, (bid, data, img) in enumerate(benchmarks, 1):
        try:
            r = analyze_image(str(img), run_extended=True, run_vlm=False, run_solver=True)
            captured.append((data, r))
        except Exception as e:  # noqa: BLE001
            print(f"[sweep] analyzer failed on {bid}: {e}", file=sys.stderr)
    return captured


def _evaluate_config(
    captured: List[Tuple[Dict[str, Any], Any]],
    weights: CredibilityWeights,
) -> Dict[str, Any]:
    """Run cred+route sim for one weights config; return metrics."""
    matrix: Dict[str, Dict[str, int]] = {
        m: {n: 0 for n in ("classical", "bounded", "hybrid", "insufficient")}
        for m in ("classical", "bounded", "hybrid", "insufficient")
    }
    n_total = 0
    for bench, result in captured:
        expected = (bench.get("ground_truth") or {}).get("expected_mode")
        if not expected:
            continue
        # Recompute credibility with the candidate weights, then re-route.
        result.candidate_credibility = compute_candidate_credibility(result, weights=weights)
        mode, _, _ = route_analysis_mode(result)
        predicted = mode.value if hasattr(mode, "value") else str(mode)
        if expected in matrix and predicted in matrix[expected]:
            matrix[expected][predicted] += 1
            n_total += 1

    on_diag = sum(matrix[m][m] for m in matrix)
    n_cla = sum(matrix["classical"].values())
    n_bnd = sum(matrix["bounded"].values())
    n_hyb = sum(matrix["hybrid"].values())
    n_ins = sum(matrix["insufficient"].values())

    return {
        "weights":                asdict(weights),
        "n_total":                n_total,
        "mode_correctness_rate":  round(on_diag / n_total, 4) if n_total else 0.0,
        "bounded_recall":         round(matrix["bounded"]["bounded"] / n_bnd, 4) if n_bnd else 0.0,
        "hybrid_recall":          round(matrix["hybrid"]["hybrid"] / n_hyb, 4) if n_hyb else 0.0,
        "insufficient_recall":    round(matrix["insufficient"]["insufficient"] / n_ins, 4) if n_ins else 0.0,
        "cla_to_bnd_fp_rate":     round(matrix["classical"]["bounded"] / n_cla, 4) if n_cla else 0.0,
        "cla_to_hyb_fp_rate":     round(matrix["classical"]["hybrid"] / n_cla, 4) if n_cla else 0.0,
        "matrix":                 matrix,
    }


def _composite_score(metrics: Dict[str, Any]) -> float:
    """Named composite for ranking.

    Heavily weights mode_correctness, rewards bounded/hybrid/insufficient
    recall (the three classes Phase 3B aimed to improve), penalises
    classical→bounded and classical→hybrid false positives proportionally.

    Composite = 1.0 * mode_correctness
              + 0.30 * bounded_recall
              + 0.30 * hybrid_recall
              + 0.30 * insufficient_recall
              - 0.50 * cla_to_bnd_fp
              - 0.50 * cla_to_hyb_fp
    """
    return round(
        1.00 * metrics["mode_correctness_rate"]
      + 0.30 * metrics["bounded_recall"]
      + 0.30 * metrics["hybrid_recall"]
      + 0.30 * metrics["insufficient_recall"]
      - 0.50 * metrics["cla_to_bnd_fp_rate"]
      - 0.50 * metrics["cla_to_hyb_fp_rate"],
        4,
    )


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--top", type=int, default=15,
        help="show top N configs by composite score (default 15)",
    )
    p.add_argument(
        "--json", action="store_true",
        help="emit JSON of full ranked configs to stdout",
    )
    p.add_argument(
        "--out", type=Path, default=None,
        help="write JSON of all 81 configs to this file",
    )
    args = p.parse_args(argv)

    print("[sweep] running analyzer once per benchmark to capture inputs...", flush=True)
    captured = _capture_results()
    print(f"[sweep] captured {len(captured)} benchmark results", flush=True)

    # Build the grid
    keys = list(DEFAULT_GRID.keys())
    values = [DEFAULT_GRID[k] for k in keys]
    configs: List[CredibilityWeights] = []
    for combo in itertools.product(*values):
        kw = dict(zip(keys, combo))
        configs.append(CredibilityWeights(**kw))

    print(f"[sweep] evaluating {len(configs)} weight configurations...", flush=True)
    rows = []
    for i, w in enumerate(configs, 1):
        metrics = _evaluate_config(captured, w)
        metrics["composite"] = _composite_score(metrics)
        rows.append(metrics)

    rows.sort(key=lambda r: r["composite"], reverse=True)

    # Baseline row (Phase 3B production values) for direct comparison.
    baseline_metrics = _evaluate_config(captured, BASELINE_WEIGHTS)
    baseline_metrics["composite"] = _composite_score(baseline_metrics)

    if args.json:
        print(json.dumps({
            "baseline": baseline_metrics,
            "ranked": rows,
        }, indent=2))
    else:
        print()
        print("=" * 110)
        print(f"BASELINE (Phase 3B production weights)")
        print("-" * 110)
        _print_row(baseline_metrics, is_header=True)
        _print_row(baseline_metrics, is_header=False, mark="*BL*")
        print()
        print("=" * 110)
        print(f"TOP {min(args.top, len(rows))} CONFIGS by composite score")
        print("-" * 110)
        _print_row(rows[0], is_header=True)
        for i, m in enumerate(rows[: args.top], 1):
            _print_row(m, is_header=False, mark=f"#{i}")
        print()
        print("Composite = 1.00 × mode_correctness")
        print("          + 0.30 × (bounded_recall + hybrid_recall + insufficient_recall)")
        print("          - 0.50 × (cla_to_bnd_fp + cla_to_hyb_fp)")

    if args.out:
        args.out.write_text(json.dumps({
            "baseline": baseline_metrics,
            "ranked": rows,
        }, indent=2))
        print(f"\nfull manifest written to {args.out}")

    return 0


def _print_row(m: Dict[str, Any], *, is_header: bool, mark: str = "") -> None:
    w = m["weights"]
    if is_header:
        print(
            f"  {'#':<5}{'ev':>5}{'contra':>8}{'demote':>8}{'fallback':>10}"
            f"{'mode_ok':>9}{'bnd_R':>7}{'hyb_R':>7}{'ins_R':>7}"
            f"{'CLA→BND':>9}{'CLA→HYB':>9}{'composite':>11}"
        )
        return
    print(
        f"  {mark:<5}"
        f"{w['ev_match_weight']:>5.2f}"
        f"{w['contradiction_weight']:>8.2f}"
        f"{w['source_trust_demoted']:>8.2f}"
        f"{w['source_trust_fallback']:>10.2f}"
        f"{m['mode_correctness_rate']*100:>8.1f}%"
        f"{m['bounded_recall']*100:>6.1f}%"
        f"{m['hybrid_recall']*100:>6.1f}%"
        f"{m['insufficient_recall']*100:>6.1f}%"
        f"{m['cla_to_bnd_fp_rate']*100:>8.1f}%"
        f"{m['cla_to_hyb_fp_rate']*100:>8.1f}%"
        f"{m['composite']:>11.4f}"
    )


if __name__ == "__main__":
    sys.exit(main())
