"""
batch_runner.py  —  Run analyze_image() over the gold set and log prediction vs. ground truth.

Outputs:
  data/intelligence_runs/<timestamp>/results.json   — full per-image detail
  data/intelligence_runs/<timestamp>/summary.json   — aggregate metrics

Usage:
    # Full gold set evaluation (default)
    python3 scripts/intelligence/batch_runner.py

    # Specific patterns only
    python3 scripts/intelligence/batch_runner.py --patterns loop rembrandt butterfly

    # Skip VLM (fast, CPU only)
    python3 scripts/intelligence/batch_runner.py --no-vlm

    # Limit to N images
    python3 scripts/intelligence/batch_runner.py --limit 10

    # Verbose: print each result as it runs
    python3 scripts/intelligence/batch_runner.py --verbose

    # Use uploads directory instead of gold set
    python3 scripts/intelligence/batch_runner.py --source uploads --limit 50
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Repo path setup ──────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / ".env")

GOLD_MANIFEST  = REPO_ROOT / "data" / "gold_set" / "manifest.json"
UPLOADS_DIR    = REPO_ROOT / "static" / "uploads"
RUNS_DIR       = REPO_ROOT / "data" / "intelligence_runs"


# ── Core runner ──────────────────────────────────────────────────────────────

def _run_one(image_path: Path, run_vlm: bool = False) -> dict:
    """Run analyze_image on a single image. Returns raw result dict."""
    from engine.orchestrator import analyze_image

    start = time.time()
    try:
        ar = analyze_image(
            str(image_path),
            run_extended=True,
            run_vlm=run_vlm,
            run_solver=False,
        )
        elapsed_ms = int((time.time() - start) * 1000)

        if not ar.ok:
            return {
                "ok": False,
                "error": "analyze_image returned ok=False",
                "elapsed_ms": elapsed_ms,
            }

        # Extract primary pattern prediction
        predicted_pattern = ar.authoritative_pattern or "unknown"
        confidence = 0.0

        pc = ar.pattern_candidates
        if pc is not None:
            # Get confidence for the winning pattern
            try:
                if hasattr(pc, "winner") and pc.winner:
                    confidence = getattr(pc.winner, "confidence", 0.0)
                elif hasattr(pc, "primary") and pc.primary:
                    confidence = getattr(pc.primary, "confidence", 0.0)
            except Exception:
                pass

        # Fallback: check classification dict
        if confidence == 0.0 and ar.classification:
            confidence = ar.classification.get("confidence", 0.0)

        # All candidate patterns (for acceptable_patterns check)
        candidate_patterns: list[str] = []
        if pc is not None:
            try:
                for cand in (pc.all_candidates if hasattr(pc, "all_candidates") else []):
                    pname = getattr(cand, "pattern", None) or getattr(cand, "name", None)
                    if pname:
                        candidate_patterns.append(pname)
            except Exception:
                pass

        # Signal reliability
        signal_info = {}
        if ar.signal_reliability:
            try:
                sr = ar.signal_reliability
                signal_info = {
                    "face_detected": getattr(sr, "face_detected", None),
                    "catchlight_quality": getattr(sr, "catchlight_quality", None),
                    "overall_score": getattr(sr, "overall_score", None),
                }
            except Exception:
                pass

        return {
            "ok": True,
            "predicted_pattern": predicted_pattern,
            "confidence": round(confidence, 4),
            "candidate_patterns": candidate_patterns[:5],
            "light_count": getattr(ar, "light_count", None),
            "signal_reliability": signal_info,
            "elapsed_ms": elapsed_ms,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "elapsed_ms": int((time.time() - start) * 1000),
        }


def _evaluate(result: dict, entry: dict) -> dict:
    """Compare prediction to ground truth. Returns evaluation dict."""
    expected = entry.get("expected_pattern", "")
    acceptable = set(entry.get("acceptable_patterns", [expected]))
    predicted = result.get("predicted_pattern", "unknown")
    confidence = result.get("confidence", 0.0)

    exact_match = predicted == expected
    acceptable_match = predicted in acceptable

    # Also check if any candidate pattern is acceptable
    candidates = result.get("candidate_patterns", [])
    candidate_acceptable = any(c in acceptable for c in candidates)

    # Determine correctness level
    if exact_match:
        correctness = "exact"
    elif acceptable_match:
        correctness = "acceptable"
    elif candidate_acceptable:
        correctness = "candidate_hit"
    else:
        correctness = "miss"

    # Confidence calibration: is confidence appropriate for correctness?
    MIN_CONFIDENT_CORRECT = 0.60
    MIN_CONFIDENT_WRONG = 0.70  # being >0.70 confident about a miss is a calibration failure

    cal_issue = None
    if correctness == "exact" and confidence < MIN_CONFIDENT_CORRECT:
        cal_issue = "under_confident_correct"
    elif correctness == "miss" and confidence > MIN_CONFIDENT_WRONG:
        cal_issue = "over_confident_miss"

    return {
        "correctness": correctness,
        "exact_match": exact_match,
        "acceptable_match": acceptable_match,
        "expected_pattern": expected,
        "predicted_pattern": predicted,
        "confidence": confidence,
        "calibration_issue": cal_issue,
        "dataset_tier": entry.get("dataset_tier", "community"),
        "trust_score": entry.get("trust_score", 0.7),
        "difficulty": entry.get("difficulty", "standard"),
    }


def run_gold_set(
    patterns: list[str] | None = None,
    run_vlm: bool = False,
    limit: int | None = None,
    verbose: bool = False,
) -> dict:
    """Run the full gold set batch evaluation. Returns aggregated report."""

    manifest = json.loads(GOLD_MANIFEST.read_text())
    entries = manifest["entries"]

    # Filter by pattern
    if patterns:
        entries = [e for e in entries if e["expected_pattern"] in patterns]

    # Apply limit
    if limit:
        entries = entries[:limit]

    print(f"Running batch evaluation: {len(entries)} images, vlm={run_vlm}")
    print("-" * 60)

    results = []
    start_all = time.time()

    for i, entry in enumerate(entries, 1):
        img_path = REPO_ROOT / entry["image_path"]
        if not img_path.exists():
            if verbose:
                print(f"[{i}/{len(entries)}] SKIP {entry['id']} — image not found")
            results.append({
                "id": entry["id"],
                "image_path": entry["image_path"],
                "ok": False,
                "error": "image_not_found",
                "evaluation": None,
                "raw": None,
            })
            continue

        raw = _run_one(img_path, run_vlm=run_vlm)
        eval_ = _evaluate(raw, entry) if raw["ok"] else None

        row = {
            "id": entry["id"],
            "image_path": entry["image_path"],
            "ok": raw["ok"],
            "error": raw.get("error"),
            "evaluation": eval_,
            "raw": raw,
            "entry": entry,
        }
        results.append(row)

        if verbose or not raw["ok"]:
            status = eval_["correctness"] if eval_ else f"ERROR: {raw.get('error', '?')}"
            conf = f"conf={raw.get('confidence', 0):.2f}" if raw["ok"] else ""
            print(
                f"[{i:2d}/{len(entries)}] {entry['id']:<35}"
                f"  expected={entry['expected_pattern']:<20}"
                f"  predicted={raw.get('predicted_pattern', '?'):<20}"
                f"  {status}  {conf}"
                f"  {raw.get('elapsed_ms', 0)}ms"
            )

    total_ms = int((time.time() - start_all) * 1000)

    # ── Aggregate metrics ────────────────────────────────────────────────────
    ok_results = [r for r in results if r["ok"] and r["evaluation"]]
    n_ok = len(ok_results)
    n_total = len(results)

    if n_ok == 0:
        print("No valid results to aggregate.")
        return {"results": results, "summary": None}

    exact       = sum(1 for r in ok_results if r["evaluation"]["exact_match"])
    acceptable  = sum(1 for r in ok_results if r["evaluation"]["acceptable_match"])
    misses      = sum(1 for r in ok_results if r["evaluation"]["correctness"] == "miss")
    cal_issues  = [r for r in ok_results if r["evaluation"]["calibration_issue"]]

    # Gold-tier only metrics (higher confidence labels)
    gold_results = [r for r in ok_results if r["evaluation"]["dataset_tier"] == "gold"]
    gold_exact = sum(1 for r in gold_results if r["evaluation"]["exact_match"]) if gold_results else 0

    # Per-pattern breakdown
    per_pattern: dict[str, dict] = {}
    for r in ok_results:
        ev = r["evaluation"]
        p = ev["expected_pattern"]
        if p not in per_pattern:
            per_pattern[p] = {"total": 0, "exact": 0, "acceptable": 0, "miss": 0, "confidences": []}
        per_pattern[p]["total"] += 1
        per_pattern[p][ev["correctness"]] = per_pattern[p].get(ev["correctness"], 0) + 1
        if ev["exact_match"]:
            per_pattern[p]["exact"] += 1
        if ev["acceptable_match"]:
            per_pattern[p]["acceptable"] += 1
        if ev["correctness"] == "miss":
            per_pattern[p]["miss"] += 1
        per_pattern[p]["confidences"].append(ev["confidence"])

    # Add accuracy and mean confidence per pattern
    for p, stats in per_pattern.items():
        t = stats["total"]
        stats["exact_accuracy"] = round(stats["exact"] / t, 3)
        stats["acceptable_accuracy"] = round(stats["acceptable"] / t, 3)
        confs = stats.pop("confidences")
        stats["mean_confidence"] = round(sum(confs) / len(confs), 3) if confs else 0.0

    # Top misclassifications
    misclassifications: list[dict] = []
    for r in ok_results:
        ev = r["evaluation"]
        if ev["correctness"] == "miss":
            misclassifications.append({
                "id": r["id"],
                "expected": ev["expected_pattern"],
                "predicted": ev["predicted_pattern"],
                "confidence": ev["confidence"],
                "trust_score": ev["trust_score"],
            })
    misclassifications.sort(key=lambda x: -x["trust_score"])  # high-trust misses first

    summary = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "run_vlm": run_vlm,
        "n_total": n_total,
        "n_evaluated": n_ok,
        "n_errors": n_total - n_ok,
        "exact_accuracy": round(exact / n_ok, 3),
        "acceptable_accuracy": round(acceptable / n_ok, 3),
        "miss_rate": round(misses / n_ok, 3),
        "gold_exact_accuracy": round(gold_exact / len(gold_results), 3) if gold_results else None,
        "calibration_issues": len(cal_issues),
        "total_ms": total_ms,
        "avg_ms_per_image": round(total_ms / n_total),
        "per_pattern": per_pattern,
        "top_misclassifications": misclassifications[:10],
        "calibration_failures": [
            {
                "id": r["id"],
                "issue": r["evaluation"]["calibration_issue"],
                "expected": r["evaluation"]["expected_pattern"],
                "predicted": r["evaluation"]["predicted_pattern"],
                "confidence": r["evaluation"]["confidence"],
            }
            for r in cal_issues
        ],
    }

    # Print summary
    print("\n" + "=" * 60)
    print(f"RESULTS  ({n_ok}/{n_total} evaluated)")
    print(f"  Exact accuracy:      {summary['exact_accuracy']:.1%}")
    print(f"  Acceptable accuracy: {summary['acceptable_accuracy']:.1%}")
    print(f"  Miss rate:           {summary['miss_rate']:.1%}")
    if gold_results:
        print(f"  Gold-tier exact:     {summary['gold_exact_accuracy']:.1%}  ({len(gold_results)} images)")
    print(f"  Calibration issues:  {len(cal_issues)}")
    print(f"  Total time:          {total_ms / 1000:.1f}s  ({summary['avg_ms_per_image']}ms/img)")

    if misclassifications:
        print(f"\n  Top misclassifications:")
        for m in misclassifications[:5]:
            print(f"    {m['expected']:<22} → {m['predicted']:<22} conf={m['confidence']:.2f}  [{m['id']}]")

    print("=" * 60)

    return {"results": results, "summary": summary}


def run_uploads(
    limit: int = 50,
    run_vlm: bool = False,
    verbose: bool = False,
) -> dict:
    """Run analyze_image over recent uploads (unlabeled). Records prediction + confidence."""
    imgs = sorted(UPLOADS_DIR.glob("*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True)
    imgs = imgs[:limit]

    print(f"Running uploads batch: {len(imgs)} images, vlm={run_vlm}")
    results = []
    for i, img_path in enumerate(imgs, 1):
        raw = _run_one(img_path, run_vlm=run_vlm)
        results.append({
            "filename": img_path.name,
            "predicted_pattern": raw.get("predicted_pattern", "unknown"),
            "confidence": raw.get("confidence", 0.0),
            "candidate_patterns": raw.get("candidate_patterns", []),
            "ok": raw["ok"],
            "error": raw.get("error"),
            "elapsed_ms": raw.get("elapsed_ms", 0),
        })
        if verbose:
            print(
                f"[{i:3d}] {img_path.name:<30}"
                f"  pattern={raw.get('predicted_pattern','?'):<22}"
                f"  conf={raw.get('confidence',0):.2f}"
                f"  {raw.get('elapsed_ms',0)}ms"
            )

    ok = [r for r in results if r["ok"]]
    if ok:
        patterns: dict[str, int] = {}
        for r in ok:
            p = r["predicted_pattern"]
            patterns[p] = patterns.get(p, 0) + 1
        low_conf = [r for r in ok if r["confidence"] < 0.50]
        print(f"\nUploads summary: {len(ok)}/{len(results)} ok")
        print(f"  Low-confidence (<0.50): {len(low_conf)} ({len(low_conf)/len(ok):.1%})")
        print(f"  Pattern distribution:")
        for p, cnt in sorted(patterns.items(), key=lambda x: -x[1]):
            print(f"    {p:<30} {cnt}")

    return {"results": results}


def save_run(data: dict, label: str = "gold") -> Path:
    """Save run results to data/intelligence_runs/<timestamp>/."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    run_dir = RUNS_DIR / f"{ts}_{label}"
    run_dir.mkdir(parents=True, exist_ok=True)

    summary_path = run_dir / "summary.json"
    results_path = run_dir / "results.json"

    if data.get("summary"):
        summary_path.write_text(json.dumps(data["summary"], indent=2))
    results_path.write_text(json.dumps(data["results"], indent=2))

    # Write latest symlink for easy access
    latest_link = RUNS_DIR / "latest"
    if latest_link.is_symlink():
        latest_link.unlink()
    latest_link.symlink_to(run_dir.name)

    print(f"\nSaved to: {run_dir}")
    return run_dir


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run batch intelligence evaluation over gold set or uploads."
    )
    parser.add_argument("--source", choices=["gold", "uploads"], default="gold")
    parser.add_argument("--patterns", nargs="+", help="Only evaluate these patterns")
    parser.add_argument("--no-vlm", action="store_true", help="Skip VLM (faster, CPU only)")
    parser.add_argument("--limit", type=int, help="Max number of images to run")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--no-save", action="store_true", help="Don't save results to disk")
    args = parser.parse_args()

    run_vlm = not args.no_vlm

    if args.source == "gold":
        data = run_gold_set(
            patterns=args.patterns,
            run_vlm=run_vlm,
            limit=args.limit,
            verbose=args.verbose,
        )
        if not args.no_save:
            save_run(data, label="gold")
    else:
        data = run_uploads(
            limit=args.limit or 50,
            run_vlm=run_vlm,
            verbose=args.verbose,
        )
        if not args.no_save:
            save_run(data, label="uploads")


if __name__ == "__main__":
    main()
