"""
distillation_candidates.py  —  Phase 5b diagnostic: identify distillation candidates.

Runs the gold set and surfaces entries that meet candidate criteria for future
distillation, with EXPLICIT SEPARATION between primary-path and specialty-path
resolutions.

DIAGNOSTIC ONLY — no thresholds modified, no pipeline behavior changed,
no gold-set mutations, no automatic distillation decisions.

⚠️  The specialty-path confidence floor (SPECIALTY_CONF_THRESHOLD = 0.28)
    is PROVISIONAL and DIAGNOSTIC ONLY.
    It is NOT a production threshold.
    It is inferred from 2 data points (rim_only=0.322, low_key=0.290) and must
    be re-evaluated when >= 5 specialty-path gold cases are available.

Path type is determined from the runtime field authoritative_pattern_source:
  - source.startswith("specialty:") → path_type = "specialty"
  - otherwise                       → path_type = "primary"
  This marker is set in engine/orchestrator.py line ~1915.

Outputs:
  Human-readable summary to stdout
  JSON report to data/distillation_candidates/<timestamp>.json (unless --no-save)

Usage:
    python3 scripts/intelligence/distillation_candidates.py
    python3 scripts/intelligence/distillation_candidates.py --no-vlm
    python3 scripts/intelligence/distillation_candidates.py --no-save
    python3 scripts/intelligence/distillation_candidates.py --verbose
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Repo path setup ──────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / ".env")

GOLD_MANIFEST   = REPO_ROOT / "data" / "gold_set" / "manifest.json"
CANDIDATES_DIR  = REPO_ROOT / "data" / "distillation_candidates"


# ── Candidate thresholds ──────────────────────────────────────────────────────

# Primary-path: standard confidence + trust criteria.
PRIMARY_CONF_THRESHOLD  = 0.50
PRIMARY_TRUST_THRESHOLD = 0.8

# Specialty-path: structurally lower confidence floor.
#
# ⚠️  PROVISIONAL DIAGNOSTIC-ONLY THRESHOLD — NOT A PRODUCTION THRESHOLD.
# Specialty-resolved patterns (e.g. rim_only, low_key) report lower confidence
# because no primary classifier fires with high confidence. The 0.28 floor is
# inferred from 2 data points from Phase 5a calibration:
#   - rim_only  conf=0.322 (correct, specialty:lighting_inference)
#   - low_key   conf=0.290 (correct, specialty:lighting_inference)
# Re-evaluate when >= 5 specialty-path gold cases are available.
SPECIALTY_CONF_THRESHOLD  = 0.28   # PROVISIONAL — see above
SPECIALTY_TRUST_THRESHOLD = 0.7

# Patterns where geometry ambiguity makes a strict single-label gold entry
# particularly suspect at low trust scores.
AMBIGUOUS_GEOMETRY_PATTERNS: frozenset[str] = frozenset({
    "loop", "rembrandt", "short", "butterfly", "clamshell", "broad",
})

# Specialty patterns that benefit from an extra manual check before distillation.
# These are complex multi-light or product setups not covered by primary classifiers.
SPECIALTY_MANUAL_CHECK_PATTERNS: frozenset[str] = frozenset({
    "athletic_rim_sculpt", "bottle_backlight", "editorial_rim_key",
    "ring_light", "tabletop_soft_product", "golden_hour", "gobo",
})


# ── Gold set loader ──────────────────────────────────────────────────────────

def load_gold_manifest() -> list[dict]:
    if not GOLD_MANIFEST.exists():
        print(f"[error] Gold manifest not found: {GOLD_MANIFEST}", file=sys.stderr)
        sys.exit(1)
    with open(GOLD_MANIFEST) as f:
        data = json.load(f)
    entries = data if isinstance(data, list) else data.get("entries", [])
    return [e for e in entries if e.get("image_path") and e.get("expected_pattern")]


# ── Path classification ──────────────────────────────────────────────────────

def _classify_path(source: str) -> str:
    """Classify resolution path from authoritative_pattern_source.

    Returns 'specialty' if source starts with 'specialty:', else 'primary'.

    Truth: the 'specialty:' prefix is set in engine/orchestrator.py line ~1915
    when the specialty resolution path fires. This is the canonical marker —
    do not infer path type from pattern name alone.
    """
    return "specialty" if (source or "").startswith("specialty:") else "primary"


# ── Per-image runner ─────────────────────────────────────────────────────────

def _run_one_extended(image_path: Path, run_vlm: bool) -> dict:
    """Run analyze_image and capture authoritative_pattern_source.

    Extends calibration_report._run_one() with path-type instrumentation.
    Does not modify pipeline behavior.
    """
    from engine.orchestrator import analyze_image

    start = time.time()
    try:
        ar = analyze_image(str(image_path), run_extended=True, run_vlm=run_vlm, run_solver=False)
        elapsed_ms = int((time.time() - start) * 1000)

        if not ar.ok:
            return {"ok": False, "error": "analyze_image returned ok=False", "elapsed_ms": elapsed_ms}

        predicted  = ar.authoritative_pattern or "unknown"
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

        # ── Phase 5b: capture authoritative_pattern_source ───────────────────
        # This is the key field that distinguishes primary-path from specialty-path.
        # Set by orchestrator.py line ~1915 when specialty resolution fires.
        authoritative_source = getattr(ar, "authoritative_pattern_source", "none") or "none"

        return {
            "ok":                         True,
            "predicted":                  predicted,
            "confidence":                 round(confidence, 4),
            "authoritative_pattern_source": authoritative_source,
            "elapsed_ms":                 elapsed_ms,
        }
    except Exception as exc:
        return {
            "ok":         False,
            "error":      str(exc),
            "elapsed_ms": int((time.time() - start) * 1000),
        }


# ── Evaluation ───────────────────────────────────────────────────────────────

def _evaluate_extended(result: dict, entry: dict) -> dict:
    """Evaluate result against gold-set entry. Includes trust_score for candidate check."""
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

    return {
        "image_path":   entry["image_path"],
        "expected":     expected,
        "predicted":    predicted,
        "confidence":   confidence,
        "correctness":  correctness,
        "is_correct":   is_correct,
        "trust_score":  entry.get("trust_score", 0.7),
        "elapsed_ms":   result.get("elapsed_ms", 0),
        "authoritative_pattern_source": result.get("authoritative_pattern_source", "none"),
    }


# ── Candidate classification ─────────────────────────────────────────────────

def _is_candidate(eval_row: dict, path_type: str) -> tuple[bool, str]:
    """Determine if an evaluated entry is a distillation candidate.

    Returns (is_candidate, candidate_reason).

    ⚠️  SPECIALTY THRESHOLD IS PROVISIONAL (see module docstring).
    """
    is_correct   = eval_row.get("is_correct", False)
    confidence   = eval_row.get("confidence", 0.0)
    trust_score  = eval_row.get("trust_score", 0.7)
    in_review    = eval_row.get("in_review_queue", False)

    if not is_correct:
        return False, "miss"

    if in_review:
        return False, "excluded_review_queue"

    if path_type == "specialty":
        if confidence >= SPECIALTY_CONF_THRESHOLD and trust_score >= SPECIALTY_TRUST_THRESHOLD:
            return True, "correct_specialty_adjusted"
        conf_fail  = confidence < SPECIALTY_CONF_THRESHOLD
        trust_fail = trust_score < SPECIALTY_TRUST_THRESHOLD
        if conf_fail and trust_fail:
            return False, "below_specialty_conf_and_trust_threshold"
        if conf_fail:
            return False, "below_specialty_conf_threshold"
        return False, "below_specialty_trust_threshold"

    # Primary path
    if confidence >= PRIMARY_CONF_THRESHOLD and trust_score >= PRIMARY_TRUST_THRESHOLD:
        return True, "correct_primary_threshold"
    conf_fail  = confidence < PRIMARY_CONF_THRESHOLD
    trust_fail = trust_score < PRIMARY_TRUST_THRESHOLD
    if conf_fail and trust_fail:
        return False, "below_primary_conf_and_trust_threshold"
    if conf_fail:
        return False, "below_primary_conf_threshold"
    return False, "below_primary_trust_threshold"


# ── Gold-set review queue ────────────────────────────────────────────────────

def _build_review_queue(entries: list[dict]) -> list[dict]:
    """Flag gold-set entries requiring human review before distillation.

    No gold-set mutations. Review is a recommendation only.

    Review reasons:
      review_low_trust_strict_ambiguous — trust <= 0.5, single-label, ambiguous geometry
      review_low_trust                  — trust <= 0.5, not strict
      review_specialty_manual_check     — specialty pattern at trust <= 0.7
    """
    queue = []
    for entry in entries:
        trust    = entry.get("trust_score", 0.7)
        expected = entry.get("expected_pattern", "")
        acceptable = entry.get("acceptable_patterns", [expected])
        is_strict  = len(acceptable) == 1

        reason: str | None = None

        if trust <= 0.5 and is_strict and expected in AMBIGUOUS_GEOMETRY_PATTERNS:
            reason = "review_low_trust_strict_ambiguous"
        elif trust <= 0.5:
            reason = "review_low_trust"
        elif expected in SPECIALTY_MANUAL_CHECK_PATTERNS and trust <= 0.7:
            reason = "review_specialty_manual_check"

        if reason:
            queue.append({
                "image_path":          entry["image_path"],
                "expected_pattern":    expected,
                "trust_score":         trust,
                "acceptable_patterns": acceptable,
                "is_strict":           is_strict,
                "review_reason":       reason,
            })

    return queue


# ── Report writer ─────────────────────────────────────────────────────────────

def _print_report(
    candidates: list[dict],
    review_queue: list[dict],
    evals: list[dict],
    verbose: bool,
) -> None:
    total          = len(evals)
    n_cand         = len(candidates)
    n_primary      = sum(1 for c in candidates if c["path_type"] == "primary")
    n_specialty    = sum(1 for c in candidates if c["path_type"] == "specialty")
    n_review       = len(review_queue)

    print("\n" + "═" * 70)
    print("  NGW Distillation Candidate Report — Phase 5b (diagnostic only)")
    print("═" * 70)
    print(f"  Gold cases evaluated:       {total}")
    print(f"  Total candidates:           {n_cand}")
    print(f"    Primary-path candidates:  {n_primary}  (threshold: conf ≥ {PRIMARY_CONF_THRESHOLD}, trust ≥ {PRIMARY_TRUST_THRESHOLD})")
    print(f"    Specialty-path candidates:{n_specialty}  (threshold: conf ≥ {SPECIALTY_CONF_THRESHOLD} ⚠provisional, trust ≥ {SPECIALTY_TRUST_THRESHOLD})")
    print(f"  Review queue:               {n_review}  (human sign-off required)")
    print()
    print("  ⚠  Specialty confidence floor (0.28) is PROVISIONAL — 2 data points.")
    print("     NOT a production threshold. Re-evaluate at >= 5 specialty-path cases.")
    print()

    if candidates:
        print("  ✓  CANDIDATES")
        print("  " + "─" * 66)
        for c in candidates:
            print(
                f"  {c['expected']:<28}  path={c['path_type']:<10}"
                f"  conf={c['confidence']:.3f}  trust={c['trust_score']:.1f}"
                f"  reason={c['candidate_reason']}"
            )
            if verbose:
                print(f"     source: {c['authoritative_pattern_source']}")
        print()

    if review_queue:
        print("  ⚠  REVIEW QUEUE  (not candidates — human review required)")
        print("  " + "─" * 66)
        for r in review_queue:
            strict_flag = " [strict]" if r["is_strict"] else ""
            print(
                f"  {r['expected_pattern']:<28}  trust={r['trust_score']:.1f}"
                f"{strict_flag}  reason={r['review_reason']}"
            )
        print()

    # Excluded entries (not candidates, not in review queue)
    non_candidates = [e for e in evals if not e.get("distillation_candidate") and not e.get("in_review_queue")]
    if non_candidates and verbose:
        print("  ✗  NOT YET CANDIDATES  (correct but below threshold, or miss)")
        print("  " + "─" * 66)
        for e in non_candidates:
            print(
                f"  {e['expected']:<28}  path={e.get('path_type','?'):<10}"
                f"  conf={e['confidence']:.3f}  correct={e['is_correct']}"
                f"  reason={e.get('candidate_reason','?')}"
            )
        print()

    print("  Note: outputs are diagnostic only. No thresholds were modified.")
    print("        No gold-set entries were mutated.")
    print("        Specialty threshold is provisional and not for production use.")
    print("═" * 70 + "\n")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="NGW Phase 5b — Distillation Candidate Diagnostics (diagnostic only)"
    )
    parser.add_argument("--no-vlm",   action="store_true", help="Skip VLM call (fast mode)")
    parser.add_argument("--no-save",  action="store_true", help="Do not write JSON report to disk")
    parser.add_argument("--verbose",  action="store_true", help="Print per-case details")
    parser.add_argument("--patterns", nargs="*",           help="Limit to specific patterns")
    args = parser.parse_args()

    run_vlm = not args.no_vlm

    entries = load_gold_manifest()
    if args.patterns:
        entries = [e for e in entries if e.get("expected_pattern") in args.patterns]

    if not entries:
        print("[warn] No gold set entries found (or none matched --patterns filter).")
        sys.exit(0)

    print(f"[info] Phase 5b — distillation candidate diagnostics")
    print(f"[info] Gold entries: {len(entries)}  vlm={'on' if run_vlm else 'off'}")
    print(f"[info] Specialty threshold: {SPECIALTY_CONF_THRESHOLD} ⚠ PROVISIONAL DIAGNOSTIC ONLY")

    # ── Build review queue from manifest (static, no runtime needed) ──────────
    review_queue = _build_review_queue(entries)
    review_image_paths = {r["image_path"] for r in review_queue}

    # ── Run evaluations ───────────────────────────────────────────────────────
    evals: list[dict] = []
    errors: list[str] = []

    for i, entry in enumerate(entries, 1):
        img_path = REPO_ROOT / entry["image_path"].lstrip("/")

        if not img_path.exists():
            if args.verbose:
                print(f"  [{i}/{len(entries)}] SKIP  {img_path.name}  (file not found)")
            errors.append(entry["image_path"])
            continue

        result = _run_one_extended(img_path, run_vlm=run_vlm)
        if not result["ok"]:
            if args.verbose:
                print(f"  [{i}/{len(entries)}] ERROR  {img_path.name}  {result.get('error','')}")
            errors.append(entry["image_path"])
            continue

        ev = _evaluate_extended(result, entry)

        # Derive path type from runtime authoritative_pattern_source
        path_type = _classify_path(ev["authoritative_pattern_source"])
        ev["path_type"] = path_type

        # Flag entries in review queue
        in_review = ev["image_path"] in review_image_paths
        ev["in_review_queue"] = in_review

        # Candidate check
        is_cand, reason = _is_candidate(ev, path_type)
        ev["distillation_candidate"] = is_cand
        ev["candidate_reason"]       = reason

        evals.append(ev)

        if args.verbose:
            marker = "✓" if ev["is_correct"] else "✗"
            cand_flag = " [CANDIDATE]" if is_cand else (" [REVIEW]" if in_review else "")
            print(
                f"  [{i}/{len(entries)}] {marker}  {img_path.name:<40}"
                f"  pred={ev['predicted']:<22}  conf={ev['confidence']:.3f}"
                f"  path={path_type}{cand_flag}"
            )

    if not evals:
        print("[error] No images evaluated successfully.")
        sys.exit(1)

    # ── Assemble candidate list ───────────────────────────────────────────────
    candidates = [
        {
            "image_path":                   ev["image_path"],
            "expected":                     ev["expected"],
            "predicted":                    ev["predicted"],
            "confidence":                   ev["confidence"],
            "correctness":                  ev["correctness"],
            "path_type":                    ev["path_type"],
            "authoritative_pattern_source": ev["authoritative_pattern_source"],
            "candidate_reason":             ev["candidate_reason"],
            "trust_score":                  ev["trust_score"],
        }
        for ev in evals
        if ev["distillation_candidate"]
    ]

    _print_report(candidates, review_queue, evals, verbose=args.verbose)

    # ── Save JSON report ──────────────────────────────────────────────────────
    if not args.no_save:
        CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
        ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = CANDIDATES_DIR / f"candidates_{ts}.json"

        report = {
            "generated_at": ts,
            "vlm_enabled":  run_vlm,
            "gold_cases":   len(entries),
            "evaluated":    len(evals),
            "errors":       len(errors),
            "note": (
                "Diagnostic only. No thresholds modified. No pipeline behavior changed. "
                "No gold-set mutations. Specialty threshold is provisional and not for production use."
            ),
            "summary": {
                "total_candidates":         len(candidates),
                "primary_path_candidates":  sum(1 for c in candidates if c["path_type"] == "primary"),
                "specialty_path_candidates": sum(1 for c in candidates if c["path_type"] == "specialty"),
                "review_queue_size":        len(review_queue),
                "provisional_specialty_floor": SPECIALTY_CONF_THRESHOLD,
                "provisional_specialty_floor_note": (
                    "PROVISIONAL DIAGNOSTIC ONLY — not a production threshold. "
                    "Inferred from 2 data points. Re-evaluate at >= 5 specialty-path gold cases."
                ),
                "primary_conf_threshold":   PRIMARY_CONF_THRESHOLD,
                "primary_trust_threshold":  PRIMARY_TRUST_THRESHOLD,
                "specialty_trust_threshold": SPECIALTY_TRUST_THRESHOLD,
            },
            "candidates":    candidates,
            "review_queue":  review_queue,
        }

        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        print(f"[info] Report saved → {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
