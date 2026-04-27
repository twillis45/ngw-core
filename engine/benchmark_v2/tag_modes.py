"""Auto-tag tool for benchmark `expected_mode` field — Phase 2 Block C, gate A.

Runs the analyzer over every benchmark JSON and produces a manifest of
*proposed* `expected_mode` values. The tool **does not modify any benchmark
file**.  Its output is a manifest for human review per the rule:

    "Do not let the engine grade itself with unreviewed self-assigned truth."

Auto-confident vs needs-review classification:

    AUTO_CONFIDENT
      - predicted_mode == "classical"
      - mode_confidence >= 0.80
      - analyzer's authoritative_pattern matches the benchmark's
        ground_truth.expected_pattern (or appears in acceptable_patterns)
      - no contradictions surfaced on the result

    NEEDS_REVIEW
      - any non-classical predicted_mode (bounded / hybrid / insufficient)
      - classical with low mode_confidence
      - classical where the pattern does not align with ground truth
      - any image where the analyzer raised contradictions

A reviewer reads the manifest, decides per-row whether the proposed mode
is correct, and only then a separate apply step writes the field into the
benchmark JSON.  This module performs no writes.

Run:
    .venv/bin/python -m engine.benchmark_v2.tag_modes
    .venv/bin/python -m engine.benchmark_v2.tag_modes --json   # JSON output
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional


# Quiet the noisy mediapipe / tflite logs before importing anything heavy.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")
logging.getLogger().setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

from engine.orchestrator import analyze_image  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"

AUTO_CONF_FLOOR = 0.80


def _load_benchmark(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text())
    except Exception as e:  # noqa: BLE001
        return {"_load_error": str(e)}


def _expected_pattern_set(bench: Dict[str, Any]) -> List[str]:
    gt = bench.get("ground_truth") or {}
    primary = gt.get("expected_pattern")
    acceptable = list(gt.get("acceptable_patterns") or [])
    out: List[str] = []
    if primary:
        out.append(primary)
    for p in acceptable:
        if p not in out:
            out.append(p)
    return out


def _classify(
    predicted_mode: str,
    mode_confidence: float,
    authoritative_pattern: str,
    expected_patterns: List[str],
    contradictions_count: int,
    bench_load_error: Optional[str],
) -> str:
    """Return 'auto_confident' or 'needs_review' or 'error'."""
    if bench_load_error:
        return "error"
    if predicted_mode != "classical":
        return "needs_review"
    if mode_confidence < AUTO_CONF_FLOOR:
        return "needs_review"
    if not authoritative_pattern or authoritative_pattern == "unknown":
        return "needs_review"
    if expected_patterns and authoritative_pattern not in expected_patterns:
        return "needs_review"
    if contradictions_count > 0:
        return "needs_review"
    return "auto_confident"


def _resolve_image_path(bench: Dict[str, Any], bench_path: Path) -> Optional[Path]:
    rel = bench.get("image_path")
    if not rel:
        return None
    candidate = (REPO_ROOT / rel).resolve()
    if candidate.exists():
        return candidate
    # Some benchmarks reference images relative to benchmarks/.  Fallback.
    candidate2 = (BENCHMARKS_DIR / rel).resolve()
    if candidate2.exists():
        return candidate2
    return None


def build_manifest(verbose: bool = False) -> List[Dict[str, Any]]:
    manifest: List[Dict[str, Any]] = []
    bench_files = sorted(BENCHMARKS_DIR.glob("*.json"))
    if verbose:
        print(f"[tag_modes] {len(bench_files)} benchmark files to probe", flush=True)

    for bench_path in bench_files:
        bench = _load_benchmark(bench_path) or {}
        load_error = bench.get("_load_error")
        image_path = None if load_error else _resolve_image_path(bench, bench_path)
        expected_patterns = [] if load_error else _expected_pattern_set(bench)

        row: Dict[str, Any] = {
            "benchmark_file": bench_path.name,
            "image_path": str(image_path.relative_to(REPO_ROOT)) if image_path else None,
            "expected_pattern": (bench.get("ground_truth") or {}).get("expected_pattern"),
            "acceptable_patterns": expected_patterns,
            "predicted_mode": None,
            "mode_confidence": None,
            "authoritative_pattern": None,
            "pattern_status": None,
            "pattern_confidence": None,
            "contradictions_count": None,
            "mode_rationale": None,
            "proposed_expected_mode": None,
            "classification": None,
            "review_reason": None,
            "error": load_error,
        }

        if load_error:
            row["classification"] = "error"
            row["review_reason"] = f"benchmark file unreadable: {load_error}"
            manifest.append(row)
            continue

        if image_path is None:
            row["classification"] = "error"
            row["review_reason"] = "image_path missing or file not found"
            manifest.append(row)
            continue

        try:
            r = analyze_image(
                str(image_path),
                run_extended=True, run_vlm=False, run_solver=True, debug=False,
            )
        except Exception as e:  # noqa: BLE001
            row["classification"] = "error"
            row["review_reason"] = f"analyzer raised: {type(e).__name__}: {e}"
            manifest.append(row)
            continue

        predicted_mode = r.analysis_mode.value
        mode_confidence = float(r.mode_confidence)
        contradictions = list(getattr(r.pattern_candidates, "contradictions", []) or [])

        row.update({
            "predicted_mode": predicted_mode,
            "mode_confidence": round(mode_confidence, 3),
            "authoritative_pattern": r.authoritative_pattern,
            "pattern_status": r.pattern_status.value if hasattr(r.pattern_status, "value") else str(r.pattern_status),
            "pattern_confidence": round(float(r.pattern_confidence), 3),
            "contradictions_count": len(contradictions),
            "mode_rationale": r.mode_rationale,
        })

        classification = _classify(
            predicted_mode,
            mode_confidence,
            r.authoritative_pattern or "",
            expected_patterns,
            len(contradictions),
            load_error,
        )
        row["classification"] = classification
        row["proposed_expected_mode"] = predicted_mode if classification == "auto_confident" else None

        # Review reason — surfaces WHY the analyzer's read is non-trivial.
        if classification == "needs_review":
            reasons = []
            if predicted_mode != "classical":
                reasons.append(f"non-classical predicted_mode={predicted_mode}")
            if mode_confidence < AUTO_CONF_FLOOR:
                reasons.append(f"mode_confidence {mode_confidence:.2f} < {AUTO_CONF_FLOOR}")
            if r.authoritative_pattern and expected_patterns and r.authoritative_pattern not in expected_patterns:
                reasons.append(
                    f"analyzer pattern '{r.authoritative_pattern}' not in "
                    f"benchmark's acceptable {expected_patterns}"
                )
            if not r.authoritative_pattern or r.authoritative_pattern == "unknown":
                reasons.append("analyzer emitted unknown pattern")
            if len(contradictions) > 0:
                reasons.append(f"{len(contradictions)} contradiction(s) on result")
            row["review_reason"] = "; ".join(reasons) or "non-trivial analyzer output"

        manifest.append(row)

        if verbose:
            tag = "AUTO" if classification == "auto_confident" else (
                "REVIEW" if classification == "needs_review" else "ERROR"
            )
            print(
                f"  [{tag:>6}] {bench_path.name:<60} "
                f"predicted={predicted_mode:<12} mc={mode_confidence:.2f} "
                f"pat={r.authoritative_pattern:<22} expected={row['expected_pattern']}",
                flush=True,
            )

    return manifest


def print_summary(manifest: List[Dict[str, Any]]) -> None:
    n = len(manifest)
    n_auto = sum(1 for r in manifest if r["classification"] == "auto_confident")
    n_rev = sum(1 for r in manifest if r["classification"] == "needs_review")
    n_err = sum(1 for r in manifest if r["classification"] == "error")
    print()
    print(f"=== TAG MANIFEST SUMMARY ===")
    print(f"total benchmarks   : {n}")
    print(f"auto_confident     : {n_auto}  (predicted=classical, mc>={AUTO_CONF_FLOOR}, pattern matches, no contradictions)")
    print(f"needs_review       : {n_rev}")
    print(f"error              : {n_err}")
    print()
    print("AUTO-CONFIDENT proposals (classical, mode_conf >= 0.80, pattern matches):")
    for r in manifest:
        if r["classification"] == "auto_confident":
            print(
                f"  {r['benchmark_file']:<60} "
                f"-> expected_mode='classical' (mc={r['mode_confidence']:.2f}, "
                f"pat={r['authoritative_pattern']})"
            )
    print()
    print("NEEDS-REVIEW (manual decision required before applying):")
    for r in manifest:
        if r["classification"] == "needs_review":
            print(
                f"  {r['benchmark_file']:<60} "
                f"predicted={r['predicted_mode']:<12} mc={r['mode_confidence']:.2f} "
                f"pat={r['authoritative_pattern']:<22} "
                f"expected_pattern={r['expected_pattern']}\n"
                f"     reason: {r['review_reason']}"
            )
    if n_err:
        print()
        print("ERRORS:")
        for r in manifest:
            if r["classification"] == "error":
                print(f"  {r['benchmark_file']}: {r['review_reason']}")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--json", action="store_true",
        help="emit JSON manifest to stdout (machine-readable)",
    )
    p.add_argument(
        "--out", type=Path, default=None,
        help="write JSON manifest to this file (in addition to stdout summary)",
    )
    p.add_argument("--verbose", action="store_true", default=False)
    args = p.parse_args(argv)

    manifest = build_manifest(verbose=args.verbose)

    if args.json:
        print(json.dumps(manifest, indent=2, default=repr))
    else:
        print_summary(manifest)

    if args.out:
        args.out.write_text(json.dumps(manifest, indent=2, default=repr))
        print(f"\nmanifest written to {args.out}")

    # Always exit 0 — this is a proposal tool, not a CI gate.  Manual
    # review (and a separate apply step) is required to merge tags.
    return 0


if __name__ == "__main__":
    sys.exit(main())
