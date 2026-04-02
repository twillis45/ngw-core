"""
Benchmark System v2 — Fix success rate loader.

Aggregates historical pattern-level success signals from:
  1. feedback_aggregates table  (avg user rating, normalised 1-5 → 0-1)
  2. session_signals table      (outcome_score, if table exists)

Returns Dict[pattern_id, float] where float ∈ [0.0, 1.0].
Missing patterns default to 0.5 (neutral) in the scoring engine.
"""
from __future__ import annotations

import logging
from typing import Dict

logger = logging.getLogger(__name__)


def get_fix_success_rates() -> Dict[str, float]:
    """
    Load pattern → fix_success_rate mapping from all available signal sources.
    Safe to call even when tables are empty or partially populated.
    """
    rates: Dict[str, float] = {}

    # Source 1: User feedback ratings (most reliable signal available now)
    try:
        rates.update(_from_feedback_aggregates())
    except Exception as exc:
        logger.debug("feedback_aggregates unavailable: %s", exc)

    # Source 2: Session signals outcome scores (future / optional)
    try:
        rates.update(_from_session_signals())
    except Exception:
        pass  # Table may not exist yet — silent fallback

    return rates


def _from_feedback_aggregates() -> Dict[str, float]:
    """
    Pull avg_rating from feedback_aggregates.
    Normalise 1-5 rating scale → [0.0, 1.0].
    Only includes patterns with >= 3 ratings.
    """
    from db.database import get_db

    result: Dict[str, float] = {}
    with get_db() as conn:
        rows = conn.execute(
            """SELECT system_id, avg_rating, total_count
               FROM feedback_aggregates
               WHERE total_count >= 3
               ORDER BY total_count DESC"""
        ).fetchall()
    for r in rows:
        # 1-5 scale → 0-1: (rating - 1) / 4
        normalised = max(0.0, min(1.0, (float(r["avg_rating"]) - 1.0) / 4.0))
        result[r["system_id"]] = normalised
    return result


def _from_session_signals() -> Dict[str, float]:
    """
    Pull outcome_score from session_signals table if it exists.
    Expects columns: pattern_id, outcome_score (float 0-1).
    Requires >= 2 records per pattern.
    """
    from db.database import get_db

    result: Dict[str, float] = {}
    with get_db() as conn:
        rows = conn.execute(
            """SELECT pattern_id, AVG(outcome_score) AS avg_score
               FROM session_signals
               WHERE outcome_score IS NOT NULL
               GROUP BY pattern_id
               HAVING COUNT(*) >= 2"""
        ).fetchall()
    for r in rows:
        result[r["pattern_id"]] = max(0.0, min(1.0, float(r["avg_score"])))
    return result
