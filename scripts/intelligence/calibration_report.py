"""
calibration_report.py  —  Phase 5a diagnostic: per-pattern confidence calibration.

Runs the gold set evaluation path and surfaces per-pattern calibration issues.
Does NOT modify any thresholds, configs, or pipeline behavior.

Flags:
  overconfident_miss    — confidence > OVERCONFIDENT_THRESH on a miss
  underconfident_hit    — confidence < UNDERCONFIDENT_THRESH on a correct prediction
  insufficient_sample   — fewer than MIN_SAMPLE_SIZE gold cases for this pattern

Outputs:
  Human-readable summary to stdout
  JSON summary to data/calibration_reports/<timestamp>.json (unless --no-save)

Usage:
    python3 scripts/intelligence/calibration_report.py
    python3 scripts/intelligence/calibration_report.py --no-vlm
    python3 scripts/intelligence/calibration_report.py --no-save
    python3 scripts/intelligence/calibration_report.py --verbose
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ── Repo path setup ──────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / ".env")

GOLD_MANIFEST   = REPO_ROOT / "data" / "gold_set" / "manifest.json"
REPORTS_DIR     = REPO_ROOT / "data" / "calibration_reports"

# ── Calibration thresholds ────────────────────────────────────────────────────
OVERCONFIDENT_THRESH  = 0.70   # confidence > this on a miss = overconfident
UNDERCONFIDENT_THRESH = 0.50   # confidence < this on a correct hit = underconfident
MIN_SAMPLE_SIZE       = 3      # fewer cases than this → insufficient_sample flag


# ── Gold set loader ──────────────────────────────────────────────────────────

def load_gold_manifest() -> list[dict]:
    if not GOLD_MANIFEST.exists():
        print(f"[error] Gold manifest not found: {GOLD_MANIFEST}", file=sys.stderr)
        sys.exit(1)
    with open(GOLD_MANIFEST) as f:
        data = json.load(f)
    entries = data if isinstance(data, list) else data.get("entries", [])
    return [e for e in entries if e.get("image_path") and e.get("expected_pattern")]


# ── Per-image runner (reuses batch_runner logic) ─────────────────────────────

def _run_one(image_path: Path, run_vlm: bool) -> dict:
    from engine.orchestrator import analyze_image
    start = time.time()
    try:
        ar = analyze_image(str(image_path), run_extended=True, run_vlm=run_vlm, run_solver=False)
        elapsed_ms = int((time.time() - start) * 1000)
        if not ar.ok:
            return {"ok": False, "error": "analyze_image returned ok=False", "elapsed_ms": elapsed_ms}

        predicted = ar.authoritative_pattern or "unknown"
        confidence = 0.0
        pc = ar.pattern_candidates
        if pc is not None:
            try:
                if hasattr(pc, "winner") and pc.winner:
                    confidence = getattr(pc.winner, "confidence", 0.0)
                elif hasattr(pc, "primary") and pc.primary:
                    confidence = getattr(pc.primary, "confidence", 0.0)
            except Exception:
                pass
        if confidence == 0.0 and ar.classification:
            confidence = ar.classification.get("confidence", 0.0)

        return {"ok": True, "predicted": predicted, "confidence": round(confidence, 4), "elapsed_ms": elapsed_ms}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "elapsed_ms": int((time.time() - start) * 1000)}


def _evaluate(result: dict, entry: dict) -> dict:
    expected   = entry.get("expected_pattern", "")
    acceptable = set(entry.get("acceptable_patterns", [expected]))
    predicted  = result.get("predicted", "unknown")
    confidence = result.get("confidence", 0.0)

    exact_match      = predicted == expected
    acceptable_match = predicted in acceptable

    if exact_match:
        correctness = "exact"
    elif acceptable_match:
        correctness = "acceptable"
    else:
        correctness = "miss"

    is_correct = correctness in ("exact", "acceptable")

    flags = []
    if not is_correct and confidence > OVERCONFIDENT_THRESH:
        flags.append("overconfident_miss")
    if is_correct and confidence < UNDERCONFIDENT_THRESH:
        flags.append("underconfident_hit")

    return {
        "image_path":   entry["image_path"],
        "expected":     expected,
        "predicted":    predicted,
        "confidence":   confidence,
        "correctness":  correctness,
        "is_correct":   is_correct,
        "flags":        flags,
        "elapsed_ms":   result.get("elapsed_ms", 0),
    }


# ── Per-pattern aggregation ──────────────────────────────────────────────────

def _aggregate_by_pattern(evals: list[dict]) -> dict[str, dict]:
    buckets: dict[str, list] = defaultdict(list)
    for ev in evals:
        buckets[ev["expected"]].append(ev)

    out = {}
    for pat, cases in sorted(buckets.items()):
        total        = len(cases)
        correct      = sum(1 for c in cases if c["is_correct"])
        accuracy     = round(correct / total, 3) if total else 0.0
        avg_conf     = round(sum(c["confidence"] for c in cases) / total, 3) if total else 0.0
        avg_conf_ok  = round(sum(c["confidence"] for c in cases if c["is_correct"]) / max(correct, 1), 3)
        avg_conf_bad = round(sum(c["confidence"] for c in cases if not c["is_correct"]) / max(total - correct, 1), 3)

        overconf_misses = [c for c in cases if "overconfident_miss" in c["flags"]]
        underconf_hits  = [c for c in cases if "underconfident_hit" in c["flags"]]

        pattern_flags = []
        if total < MIN_SAMPLE_SIZE:
            pattern_flags.append("insufficient_sample")
        if overconf_misses:
            pattern_flags.append("overconfident_miss")
        if underconf_hits:
            pattern_flags.append("underconfident_hit")

        out[pat] = {
            "pattern":             pat,
            "total_cases":         total,
            "correct":             correct,
            "accuracy":            accuracy,
            "avg_confidence":      avg_conf,
            "avg_conf_on_correct": avg_conf_ok,
            "avg_conf_on_miss":    avg_conf_bad,
            "overconfident_misses": len(overconf_misses),
            "underconfident_hits":  len(underconf_hits),
            "flags":               pattern_flags,
            "cases":               cases,
        }
    return out


# ── Report printer ────────────────────────────────────────────────────────────

def _print_report(by_pattern: dict, totals: dict, verbose: bool) -> None:
    print("\n" + "═" * 70)
    print("  NGW Calibration Report — Phase 5a (diagnostic only)")
    print("═" * 70)
    print(f"  Gold cases:  {totals['total']}")
    print(f"  Correct:     {totals['correct']}  ({totals['accuracy_pct']:.1f}%)")
    print(f"  Avg conf:    {totals['avg_confidence']:.3f}")
    print(f"  Overconf misses:   {totals['overconfident_misses']}")
    print(f"  Underconf hits:    {totals['underconfident_hits']}")
    print(f"  Insufficient sample patterns: {totals['insufficient_sample_patterns']}")
    print()

    has_flags = {pat: d for pat, d in by_pattern.items() if d["flags"]}
    clean     = {pat: d for pat, d in by_pattern.items() if not d["flags"]}

    if has_flags:
        print("  ⚠  FLAGGED PATTERNS")
        print("  " + "─" * 66)
        for pat, d in sorted(has_flags.items()):
            flag_str = ", ".join(d["flags"])
            print(f"  {pat:<30}  acc={d['accuracy']:.0%}  conf={d['avg_confidence']:.3f}"
                  f"  [{flag_str}]  n={d['total_cases']}")
            if verbose:
                for case in d["cases"]:
                    marker = "✓" if case["is_correct"] else "✗"
                    cf = ", ".join(case["flags"]) or "—"
                    print(f"     {marker}  {Path(case['image_path']).name:<40}"
                          f"  pred={case['predicted']:<22}  conf={case['confidence']:.3f}  {cf}")
        print()

    if clean:
        print("  ✓  CLEAN PATTERNS")
        print("  " + "─" * 66)
        for pat, d in sorted(clean.items()):
            print(f"  {pat:<30}  acc={d['accuracy']:.0%}  conf={d['avg_confidence']:.3f}"
                  f"  n={d['total_cases']}")

    print()
    print("  Note: outputs are diagnostic only. No thresholds were modified.")
    print("═" * 70 + "\n")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="NGW Phase 5a — Calibration Report")
    parser.add_argument("--no-vlm",   action="store_true", help="Skip VLM call (fast mode)")
    parser.add_argument("--no-save",  action="store_true", help="Do not write JSON report to disk")
    parser.add_argument("--verbose",  action="store_true", help="Print per-case results")
    parser.add_argument("--patterns", nargs="*",           help="Limit to specific patterns")
    args = parser.parse_args()

    run_vlm = not args.no_vlm

    entries = load_gold_manifest()
    if args.patterns:
        entries = [e for e in entries if e.get("expected_pattern") in args.patterns]

    if not entries:
        print("[warn] No gold set entries found (or none matched --patterns filter).")
        sys.exit(0)

    print(f"[info] Running calibration over {len(entries)} gold set entries  (vlm={'on' if run_vlm else 'off'})")

    evals: list[dict] = []
    errors: list[str] = []
    for i, entry in enumerate(entries, 1):
        img_path = REPO_ROOT / entry["image_path"].lstrip("/")
        if not img_path.exists():
            if args.verbose:
                print(f"  [{i}/{len(entries)}] SKIP  {img_path.name}  (file not found)")
            errors.append(entry["image_path"])
            continue

        result = _run_one(img_path, run_vlm=run_vlm)
        if not result["ok"]:
            if args.verbose:
                print(f"  [{i}/{len(entries)}] ERROR  {img_path.name}  {result.get('error','')}")
            errors.append(entry["image_path"])
            continue

        ev = _evaluate(result, entry)
        evals.append(ev)

        if args.verbose:
            marker = "✓" if ev["is_correct"] else "✗"
            flag_str = (" [" + ", ".join(ev["flags"]) + "]") if ev["flags"] else ""
            print(f"  [{i}/{len(entries)}] {marker}  {img_path.name:<42}"
                  f"  pred={ev['predicted']:<22}  conf={ev['confidence']:.3f}{flag_str}")

    if not evals:
        print("[error] No images evaluated successfully.")
        sys.exit(1)

    by_pattern = _aggregate_by_pattern(evals)

    total       = len(evals)
    correct     = sum(1 for e in evals if e["is_correct"])
    accuracy    = round(correct / total, 3) if total else 0.0
    avg_conf    = round(sum(e["confidence"] for e in evals) / total, 3) if total else 0.0
    oc_misses   = sum(1 for e in evals if "overconfident_miss" in e["flags"])
    uc_hits     = sum(1 for e in evals if "underconfident_hit" in e["flags"])
    insuf_pats  = sum(1 for d in by_pattern.values() if "insufficient_sample" in d["flags"])

    totals = {
        "total":                       total,
        "correct":                     correct,
        "accuracy":                    accuracy,
        "accuracy_pct":                accuracy * 100,
        "avg_confidence":              avg_conf,
        "overconfident_misses":        oc_misses,
        "underconfident_hits":         uc_hits,
        "insufficient_sample_patterns": insuf_pats,
        "errors":                      len(errors),
    }

    _print_report(by_pattern, totals, verbose=args.verbose)

    if not args.no_save:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = REPORTS_DIR / f"calibration_{ts}.json"

        # Strip per-case detail from saved JSON to keep it compact
        summary_by_pattern = {
            pat: {k: v for k, v in d.items() if k != "cases"}
            for pat, d in by_pattern.items()
        }
        report = {
            "generated_at":  ts,
            "vlm_enabled":   run_vlm,
            "gold_entries":  len(entries),
            "evaluated":     total,
            "errors":        len(errors),
            "totals":        totals,
            "by_pattern":    summary_by_pattern,
            "note":          "Diagnostic only. No thresholds were modified.",
        }
        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        print(f"[info] Report saved → {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
