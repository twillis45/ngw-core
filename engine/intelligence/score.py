"""
NGW Intelligence Scoring Engine
=================================
Computes global and per-pattern intelligence scores from outcome events.

Formula (global):
  raw = (nailed_it_rate × 40)
      - (missed_it_rate  × 30)
      - (high_conf_missed_rate × 20)
      + (confidence_alignment  × 5)
      + (high_value_signal_rate × 5)
  score = clamp(raw + 50, 0, 100)

Range: 0–100
  80–100  → strong
  65–79   → healthy, needs improvement
  50–64   → warning
   <50    → critical

Pattern score uses same formula scoped per pattern.
Global weighted score = Σ (pattern_score × usage_weight).

Minimum sample size: MIN_OUTCOMES_FOR_SCORE = 10
Below threshold: marked insufficient_data=True, score excluded from global weighted mean.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from db.database import get_db
from db.intelligence import (
    save_intelligence_snapshot,
    save_pattern_intelligence_batch,
    get_latest_intelligence_snapshot,
)

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

MIN_OUTCOMES_FOR_SCORE   = 10     # below this → insufficient_data
HIGH_CONFIDENCE_THRESHOLD = 0.60  # matches failure_classifier.py
HIGH_VALUE_SIGNAL_THRESHOLD = 0.70  # signal_quality threshold for "high value"

SCORE_INTERPRETATION = {
    (80, 101): "strong",
    (65,  80): "healthy",
    (50,  65): "warning",
    ( 0,  50): "critical",
}


def _interpret(score: float) -> str:
    for (lo, hi), label in SCORE_INTERPRETATION.items():
        if lo <= score < hi:
            return label
    return "critical"


# ── Raw outcome queries ────────────────────────────────────────────────────────

def _get_outcomes(days: int = 30, pattern: Optional[str] = None) -> Dict[str, Any]:
    """
    Pull nailed_it + missed_it events from both outcome tables.
    Returns aggregated counts and per-event confidence lists.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        # Nailed-it events
        if pattern:
            ni_rows = conn.execute(
                """SELECT confidence, signal_quality FROM nailed_it_events
                   WHERE created_at>=? AND predicted_pattern=?""",
                (cutoff, pattern),
            ).fetchall()
            mi_rows = conn.execute(
                """SELECT confidence, signal_quality FROM failure_events
                   WHERE created_at>=? AND predicted_pattern=?""",
                (cutoff, pattern),
            ).fetchall()
        else:
            ni_rows = conn.execute(
                "SELECT confidence, signal_quality FROM nailed_it_events WHERE created_at>=?",
                (cutoff,),
            ).fetchall()
            mi_rows = conn.execute(
                "SELECT confidence, signal_quality FROM failure_events WHERE created_at>=?",
                (cutoff,),
            ).fetchall()

    ni_confidences = [r["confidence"] for r in ni_rows if r["confidence"] is not None]
    mi_confidences = [r["confidence"] for r in mi_rows if r["confidence"] is not None]
    ni_signals     = [r["signal_quality"] for r in ni_rows if r["signal_quality"] is not None]
    mi_signals     = [r["signal_quality"] for r in mi_rows if r["signal_quality"] is not None]

    return {
        "total_nailed_it": len(ni_rows),
        "total_missed_it": len(mi_rows),
        "total_outcomes":  len(ni_rows) + len(mi_rows),
        "ni_confidences":  ni_confidences,
        "mi_confidences":  mi_confidences,
        "ni_signals":      ni_signals,
        "mi_signals":      mi_signals,
    }


def _compute_confidence_alignment(
    ni_confidences: List[float],
    mi_confidences: List[float],
) -> float:
    """
    Alignment = 1 - mean(|confidence - correctness|)
    where correctness = 1.0 for nailed_it, 0.0 for missed_it.
    Returns 0.0 if no data.
    """
    errors: List[float] = []
    for c in ni_confidences:
        errors.append(abs(c - 1.0))  # should be high confidence
    for c in mi_confidences:
        errors.append(abs(c - 0.0))  # should be low confidence
    if not errors:
        return 0.0
    return max(0.0, 1.0 - (sum(errors) / len(errors)))


def _compute_high_value_signal_rate(
    ni_signals: List[float],
    mi_signals: List[float],
) -> float:
    """% of all sessions with signal_quality >= HIGH_VALUE_SIGNAL_THRESHOLD."""
    all_signals = ni_signals + mi_signals
    if not all_signals:
        return 0.0
    high = sum(1 for s in all_signals if s >= HIGH_VALUE_SIGNAL_THRESHOLD)
    return high / len(all_signals)


def _score_from_components(
    nailed_it_rate: float,
    missed_it_rate: float,
    high_conf_missed_rate: float,
    confidence_alignment: float,
    high_value_signal_rate: float,
) -> float:
    raw = (
        nailed_it_rate       * 40
        - missed_it_rate       * 30
        - high_conf_missed_rate * 20
        + confidence_alignment  * 5
        + high_value_signal_rate * 5
    )
    return max(0.0, min(100.0, raw + 50))


# ── Global score ───────────────────────────────────────────────────────────────

def compute_global_score(days: int = 30, save: bool = True) -> Dict[str, Any]:
    """
    Compute the global NGW Intelligence Score for the last `days` days.
    Optionally persists the snapshot to the DB.
    """
    data = _get_outcomes(days=days)
    total = data["total_outcomes"]
    ni    = data["total_nailed_it"]
    mi    = data["total_missed_it"]

    if total == 0:
        components = {
            "nailed_it_rate": 0.0, "missed_it_rate": 0.0,
            "high_conf_missed_rate": 0.0, "confidence_alignment": 0.0,
            "high_value_signal_rate": 0.0,
            "total_outcomes": 0, "total_nailed_it": 0, "total_missed_it": 0,
            "insufficient_data": True,
        }
        return {
            "score": 50.0,
            "interpretation": "warning",
            "insufficient_data": True,
            "components": components,
            "window_days": days,
        }

    nailed_it_rate  = ni / total
    missed_it_rate  = mi / total

    # High-confidence MISSED_IT rate
    hcm = sum(1 for c in data["mi_confidences"] if c >= HIGH_CONFIDENCE_THRESHOLD)
    high_conf_missed_rate = hcm / total

    confidence_alignment   = _compute_confidence_alignment(data["ni_confidences"], data["mi_confidences"])
    high_value_signal_rate = _compute_high_value_signal_rate(data["ni_signals"], data["mi_signals"])

    score = _score_from_components(
        nailed_it_rate, missed_it_rate, high_conf_missed_rate,
        confidence_alignment, high_value_signal_rate,
    )

    components = {
        "nailed_it_rate":        round(nailed_it_rate, 4),
        "missed_it_rate":        round(missed_it_rate, 4),
        "high_conf_missed_rate": round(high_conf_missed_rate, 4),
        "confidence_alignment":  round(confidence_alignment, 4),
        "high_value_signal_rate": round(high_value_signal_rate, 4),
        "total_outcomes": total,
        "total_nailed_it": ni,
        "total_missed_it": mi,
        "insufficient_data": total < MIN_OUTCOMES_FOR_SCORE,
    }

    if save:
        try:
            save_intelligence_snapshot(score, components, window_days=days)
        except Exception as exc:
            logger.warning("score: failed to save snapshot — %s", exc)

    result = {
        "score":            round(score, 1),
        "interpretation":   _interpret(score),
        "insufficient_data": total < MIN_OUTCOMES_FOR_SCORE,
        "components":       components,
        "window_days":      days,
    }
    logger.info("intelligence_score: %.1f (%s) from %d outcomes", score, result["interpretation"], total)
    return result


# ── Pattern-level scores ───────────────────────────────────────────────────────

def _get_all_patterns(days: int = 30) -> List[str]:
    """Return all distinct patterns that have any outcome in the window."""
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        ni_pats = conn.execute(
            "SELECT DISTINCT predicted_pattern FROM nailed_it_events WHERE created_at>=?",
            (cutoff,),
        ).fetchall()
        mi_pats = conn.execute(
            "SELECT DISTINCT predicted_pattern FROM failure_events WHERE created_at>=?",
            (cutoff,),
        ).fetchall()
    patterns = set(r["predicted_pattern"] for r in ni_pats + mi_pats if r["predicted_pattern"])
    return sorted(patterns)


def _pattern_priority(score: float, usage_count: int, missed_it_rate: float,
                      high_conf_missed_rate: float) -> str:
    """
    Priority level for the pattern: p1 (critical fix) → p4 (monitor).
    High-volume confidently-wrong patterns rank highest.
    """
    if score < 50 and usage_count >= 20:
        return "p1_critical"
    if score < 50 or (high_conf_missed_rate >= 0.2 and usage_count >= 10):
        return "p2_high"
    if score < 65 or missed_it_rate >= 0.3:
        return "p3_medium"
    return "p4_monitor"


def compute_pattern_scores(days: int = 30, save: bool = True) -> List[Dict[str, Any]]:
    """Compute intelligence scores for every pattern with data in window."""
    patterns = _get_all_patterns(days=days)
    results: List[Dict[str, Any]] = []

    for pattern in patterns:
        data = _get_outcomes(days=days, pattern=pattern)
        total = data["total_outcomes"]
        ni    = data["total_nailed_it"]
        mi    = data["total_missed_it"]
        sufficient = total >= MIN_OUTCOMES_FOR_SCORE

        if total == 0:
            continue

        nit_rate  = ni / total
        mit_rate  = mi / total
        hcm       = sum(1 for c in data["mi_confidences"] if c >= HIGH_CONFIDENCE_THRESHOLD)
        hcm_rate  = hcm / total
        conf_align = _compute_confidence_alignment(data["ni_confidences"], data["mi_confidences"])
        all_signals = data["ni_signals"] + data["mi_signals"]
        sig_avg = (sum(all_signals) / len(all_signals)) if all_signals else 0.0

        if sufficient:
            score = _score_from_components(nit_rate, mit_rate, hcm_rate, conf_align, sig_avg)
        else:
            # Still compute indicative score but flag it
            score = _score_from_components(nit_rate, mit_rate, hcm_rate, conf_align, sig_avg)

        priority = _pattern_priority(score, total, mit_rate, hcm_rate)

        results.append({
            "pattern":              pattern,
            "score":                round(score, 1),
            "interpretation":       _interpret(score),
            "nailed_it_rate":       round(nit_rate, 4),
            "missed_it_rate":       round(mit_rate, 4),
            "high_conf_missed_rate": round(hcm_rate, 4),
            "confidence_alignment": round(conf_align, 4),
            "signal_quality_avg":   round(sig_avg, 4),
            "usage_count":          total,
            "sufficient_data":      sufficient,
            "priority_level":       priority,
            "window_days":          days,
        })

    # Sort: p1 first, then by score ascending (worst patterns first)
    results.sort(key=lambda r: (r["priority_level"], r["score"]))

    if save and results:
        try:
            save_pattern_intelligence_batch(results, window_days=days)
        except Exception as exc:
            logger.warning("score: failed to save pattern scores — %s", exc)

    return results


# ── Weighted global score from patterns ───────────────────────────────────────

def compute_weighted_global_score(pattern_scores: List[Dict[str, Any]]) -> float:
    """
    Global score weighted by each pattern's usage share.
    Only includes patterns with sufficient_data=True.
    Falls back to unweighted mean if no sufficient-data patterns.
    """
    eligible = [p for p in pattern_scores if p.get("sufficient_data")]
    if not eligible:
        return 50.0  # neutral default
    total_usage = sum(p["usage_count"] for p in eligible)
    if total_usage == 0:
        return 50.0
    weighted = sum(p["score"] * (p["usage_count"] / total_usage) for p in eligible)
    return round(weighted, 1)


# ── Sample calculation (for docs / tests) ─────────────────────────────────────

def sample_score_calculation() -> Dict[str, Any]:
    """Return a worked example with synthetic values for documentation."""
    ni_rate  = 0.68
    mi_rate  = 0.32
    hcm_rate = 0.08   # 8% of all sessions were high-confidence wrong
    cal      = 0.72   # confidence aligns well
    hvs      = 0.55   # 55% have strong signal quality

    raw = ni_rate * 40 - mi_rate * 30 - hcm_rate * 20 + cal * 5 + hvs * 5
    score = max(0.0, min(100.0, raw + 50))
    return {
        "inputs": {
            "nailed_it_rate": ni_rate,
            "missed_it_rate": mi_rate,
            "high_conf_missed_rate": hcm_rate,
            "confidence_alignment": cal,
            "high_value_signal_rate": hvs,
        },
        "formula": "raw = (0.68×40) - (0.32×30) - (0.08×20) + (0.72×5) + (0.55×5)",
        "raw":   round(raw, 3),
        "score": round(score, 1),
        "interpretation": _interpret(score),
    }
