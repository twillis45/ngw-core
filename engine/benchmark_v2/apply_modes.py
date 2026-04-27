"""Apply reviewed `expected_mode` decisions to benchmark JSONs.

Phase 2 Block C, gate A — applies a human-reviewed manifest of mode tags
to the corresponding benchmark JSON files.

Each benchmark gets a new field `ground_truth.expected_mode` whose value
is one of: "classical" | "bounded" | "hybrid" | "insufficient".  The field
is added next to existing `expected_pattern`, `expected_light_count`, etc.

Usage:
    .venv/bin/python -m engine.benchmark_v2.apply_modes              # uses embedded decisions
    .venv/bin/python -m engine.benchmark_v2.apply_modes --decisions-file path/to/decisions.json

Decisions file format:
    {"<benchmark_filename>": "<mode>", ...}

Idempotent: running twice produces the same content.  Existing
`expected_mode` values are overwritten.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"

VALID_MODES = {"classical", "bounded", "hybrid", "insufficient"}


# ─── Embedded reviewed decisions (Phase 2 first-pass) ───────────────────────
# Source: human review of the auto-tag manifest emitted by tag_modes.py.
# Per Complex-Lighting Strategy Phase 2 §11 "Lab calibration", all values
# below have been reviewed before merge.  The engine is NOT grading itself.
PHASE_2_DECISIONS: Dict[str, str] = {
    # Group: auto-confident classical (11)
    "athletic_rim_sculpt.json": "classical",
    "editorial_rim_key.json": "classical",
    "rembrandt_t1_rembrandt_bw_highcontrast_woman_white_bg.json": "classical",
    "rembrandt_t1_rembrandt_bw_lowkey_turned_woman.json": "classical",
    "rembrandt_t1_rembrandt_bw_man_short_light_turned.json": "classical",
    "rembrandt_t1_rembrandt_color_closeup_green_eyes_woman.json": "classical",
    "rembrandt_t1_rembrandt_lowkey_dark_skin_woman.json": "classical",
    "rim_only.json": "classical",
    "short_fashion_key.json": "classical",
    "split_strong.json": "classical",
    "window_negative_fill.json": "classical",

    # Group C: classical-with-contradictions, reviewed → classical (25)
    "beauty_dish_clean.json": "classical",
    "broad.json": "classical",
    "butterfly.json": "classical",
    "clamshell_clean.json": "classical",
    "high_key.json": "classical",
    "high_key_beauty.json": "classical",
    "hurley_triangle.json": "classical",
    "loop_standard.json": "classical",
    "overcast_natural.json": "classical",
    "overfill_flat.json": "classical",
    "rembrandt_classic.json": "classical",
    "rembrandt_t1_0aec889aedc9d6c6155b6bba28138929.json": "classical",
    "rembrandt_t1_download.json": "classical",
    "rembrandt_t1_rembrandt_bw_beauty_woman_keyleft.json": "classical",
    "rembrandt_t1_rembrandt_bw_editorial_man_keyright.json": "classical",
    "rembrandt_t1_rembrandt_bw_woman_long_hair_keyleft.json": "classical",
    "rembrandt_t1_rembrandt_bw_woman_scarf_keyright.json": "classical",
    "rembrandt_t1_rembrandt_color_dark_skin_woman_updo.json": "classical",
    "rembrandt_t1_rembrandt_color_fashion_woman_latex_coll.json": "classical",
    "ring_light.json": "classical",
    "short.json": "classical",
    "soft_editorial_key.json": "classical",
    "white_seamless_catalog.json": "classical",
    "window_light_side.json": "classical",
    "window_soft_side.json": "classical",

    # Group A: pattern-mismatch decisions
    "low_key.json": "classical",
    "mixed_light_failure.json": "insufficient",
    "rembrandt_t1_rembrandt_color_editorial_blonde_ocean.json": "bounded",

    # Group B: INSUFFICIENT on no-face / projected scenes
    "bottle_backlight.json": "insufficient",
    "tabletop_soft_product.json": "insufficient",
    "projected.json": "insufficient",

    # Phase 3A curation pass (2026-04-27) — photographer-verified additions.
    # See review_notes in each benchmark JSON for per-image rationale.
    # No engine grading itself: every tag below was assigned from visual
    # photographer review, not because the engine happens to predict it.
    "bounded_butterfly_vs_clamshell_beauty.json": "bounded",
    "bounded_loop_vs_short_rihanna_t1.json": "bounded",
    "bounded_loop_vs_short_jewelry_t1.json": "bounded",
    "bounded_loop_vs_rembrandt_bw_t1.json": "bounded",
    "hybrid_key_plus_hair_light_corporate_t1.json": "hybrid",
    "insufficient_glasses_corporate_t1.json": "insufficient",
}


def _load_decisions(path: Optional[Path]) -> Dict[str, str]:
    if path is None:
        return dict(PHASE_2_DECISIONS)
    raw = json.loads(path.read_text())
    if not isinstance(raw, dict):
        raise ValueError(f"decisions file must be a JSON object, got {type(raw).__name__}")
    return {str(k): str(v) for k, v in raw.items()}


def _apply_one(bench_path: Path, mode: str, dry_run: bool) -> str:
    """Add expected_mode to one benchmark JSON.  Returns status string."""
    if mode not in VALID_MODES:
        return f"INVALID_MODE: {mode}"
    bench = json.loads(bench_path.read_text())
    gt = bench.get("ground_truth")
    if gt is None or not isinstance(gt, dict):
        return "NO_GROUND_TRUTH_BLOCK"
    prior = gt.get("expected_mode")
    if prior == mode:
        return f"unchanged ({mode})"
    gt["expected_mode"] = mode
    if not dry_run:
        bench_path.write_text(json.dumps(bench, indent=2) + "\n")
    return f"set ({prior!r} -> {mode!r})"


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--decisions-file", type=Path, default=None,
        help="path to a JSON {benchmark_filename: mode} dict (default: embedded PHASE_2_DECISIONS)",
    )
    p.add_argument(
        "--dry-run", action="store_true", default=False,
        help="show what would change but write no files",
    )
    args = p.parse_args(argv)

    decisions = _load_decisions(args.decisions_file)

    print(f"applying {len(decisions)} expected_mode decisions"
          f"{' (DRY RUN)' if args.dry_run else ''}")
    print()

    n_changed = 0
    n_unchanged = 0
    n_missing = 0
    n_error = 0
    for fname, mode in sorted(decisions.items()):
        path = BENCHMARKS_DIR / fname
        if not path.exists():
            print(f"  MISSING  {fname}")
            n_missing += 1
            continue
        try:
            status = _apply_one(path, mode, args.dry_run)
        except Exception as e:  # noqa: BLE001
            print(f"  ERROR    {fname}: {type(e).__name__}: {e}")
            n_error += 1
            continue
        if status.startswith("set"):
            print(f"  UPDATED  {fname:<60} {status}")
            n_changed += 1
        elif status.startswith("unchanged"):
            print(f"  ok       {fname:<60} {status}")
            n_unchanged += 1
        else:
            print(f"  PROBLEM  {fname}: {status}")
            n_error += 1

    print()
    print(f"=== APPLY SUMMARY ===")
    print(f"updated   : {n_changed}")
    print(f"unchanged : {n_unchanged}")
    print(f"missing   : {n_missing}")
    print(f"errors    : {n_error}")
    print()
    if args.dry_run:
        print("(dry-run — no files were written)")

    return 0 if n_error == 0 and n_missing == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
