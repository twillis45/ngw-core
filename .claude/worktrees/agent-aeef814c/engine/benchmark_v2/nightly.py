"""
Benchmark System v2 — Nightly drift detector.

Runs on a 24-hour schedule via .github/workflows/nightly.yml.

Purpose: catch silent performance degradation between CI runs —
  e.g. data drift, model configuration drift, or environment decay
  that no single PR would trigger.

Drift thresholds are LOOSER than CI (trend detection, not blocking):
  overall   drift > 2%   → create Candidate
  pattern   drift > 4%   → create Candidate
  confidence drift > 0.04 → create Candidate

When drift is detected:
  1. Creates a rule Candidate with reason="benchmark_drift"
  2. Returns a structured summary for GitHub Actions step output
  3. Does NOT update the baseline (only CI merges can do that)
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Thresholds (looser than CI — trend detection only) ────────────────────────
DRIFT_OVERALL     = 0.02   # 2%
DRIFT_PATTERN     = 0.04   # 4%
DRIFT_CONFIDENCE  = 0.04   # +0.04


def run_nightly_check(
    triggered_by: str = "nightly_scheduler",
) -> Dict[str, Any]:
    """
    Run a full benchmark and detect drift vs the active baseline.
    Creates Candidates for any drift items found.
    Returns a structured summary.
    """
    from engine.benchmark_v2.runner import run_benchmark
    from db.benchmark_baseline import compare_to_baseline

    started_at = time.time()
    logger.info("Nightly benchmark drift check started")

    # ── Run benchmark ──────────────────────────────────────────────────────────
    try:
        run_result = run_benchmark(
            run_type     = "nightly",
            trigger      = "scheduled",
            triggered_by = triggered_by,
            notes        = "Nightly drift detection run",
        )
    except Exception as exc:
        logger.exception("Nightly benchmark failed")
        return {
            "status":      "error",
            "error":       str(exc),
            "duration_s":  round(time.time() - started_at, 1),
            "checked_at":  time.time(),
        }

    # ── Compare to baseline ────────────────────────────────────────────────────
    comparison = compare_to_baseline(run_result)

    # ── Detect drift (looser thresholds) ──────────────────────────────────────
    drift_items = _detect_drift(comparison, run_result)

    # ── Create candidates for each drift item ─────────────────────────────────
    candidates_created = 0
    if drift_items:
        candidates_created = _create_drift_candidates(
            drift_items, run_result, triggered_by
        )

    duration = round(time.time() - started_at, 1)
    status   = "drift_detected" if drift_items else "clean"

    logger.info(
        "Nightly check complete: status=%s score=%.3f drift_items=%d candidates=%d duration=%.1fs",
        status, run_result.get("overall_score", 0.0),
        len(drift_items), candidates_created, duration,
    )

    return {
        "status":              status,
        "run_id":              run_result.get("run_id"),
        "overall_score":       run_result.get("overall_score"),
        "delta":               comparison.get("delta"),
        "drift_items":         drift_items,
        "candidates_created":  candidates_created,
        "has_baseline":        comparison.get("has_baseline"),
        "duration_s":          duration,
        "checked_at":          time.time(),
    }


# ── Drift detection ───────────────────────────────────────────────────────────

def _detect_drift(
    comparison: Dict[str, Any],
    run_result: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Apply loose thresholds to find silent drift."""
    drift: List[Dict[str, Any]] = []

    if not comparison.get("has_baseline"):
        return drift

    # Overall drift
    overall_delta = comparison.get("delta", 0.0)
    if overall_delta < -DRIFT_OVERALL:
        drift.append({
            "type":    "overall",
            "delta":   overall_delta,
            "score":   comparison.get("overall_score"),
            "message": f"Overall score drifted {overall_delta:.1%} below baseline",
        })

    # Per-pattern drift (from regression list — same data, different threshold)
    for reg in comparison.get("regressions", []):
        if reg.get("type") == "pattern":
            d = reg.get("delta", 0.0)
            if d < -DRIFT_PATTERN:
                drift.append({
                    "type":       "pattern",
                    "pattern_id": reg["pattern_id"],
                    "delta":      d,
                    "score":      reg.get("current"),
                    "message":    f"Pattern '{reg['pattern_id']}' drifted {d:.1%} below baseline",
                })

    # Confidence error drift
    conf_delta = comparison.get("confidence_delta", 0.0)
    if conf_delta > DRIFT_CONFIDENCE:
        drift.append({
            "type":    "confidence",
            "delta":   conf_delta,
            "score":   comparison.get("confidence_error"),
            "message": f"Confidence error drifted +{conf_delta:.3f} above baseline",
        })

    return drift


# ── Candidate creation ────────────────────────────────────────────────────────

def _create_drift_candidates(
    drift_items: List[Dict[str, Any]],
    run_result: Dict[str, Any],
    triggered_by: str,
) -> int:
    """Create a rule candidate for each drift item. Returns count created."""
    from db.database import create_rule_candidate

    created = 0
    run_id  = run_result.get("run_id", "unknown")

    for item in drift_items:
        pattern_id = item.get("pattern_id", "system")
        try:
            create_rule_candidate(
                title=(
                    f"Nightly Drift — {pattern_id} "
                    f"({item['delta']:+.1%})"
                ),
                description=(
                    f"{item['message']}. "
                    f"Detected in nightly benchmark run {run_id[:8]}. "
                    f"Current score: {item.get('score', 'unknown')}."
                ),
                rationale="benchmark_drift",
                proposed_change={
                    "status":     "needs_investigation",
                    "reason":     "benchmark_drift",
                    "type":       item["type"],
                    "pattern_id": pattern_id,
                    "delta":      item["delta"],
                    "run_id":     run_id,
                    "score":      item.get("score"),
                },
                status="proposed",
                created_by=triggered_by,
            )
            created += 1
            logger.info(
                "Created drift candidate for %s (delta=%.3f)",
                pattern_id, item["delta"]
            )
        except Exception as exc:
            logger.warning("Could not create drift candidate for %s: %s", pattern_id, exc)

    return created
