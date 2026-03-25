"""
Value State Detection — Part 16.1
Detects which of 5 value states the user is in to drive adaptive pricing.

STATES (priority order):
  SUCCESS_MOMENT   — NAILED_IT just triggered, high confidence result
  FAILURE_TENSION  — MISSED_IT just triggered, frustration signal
  HIGH_INTENT      — returning user, deep engagement, shoot mode usage
  DISCOVERY        — multiple analyses, exploring blueprints, moderate engagement
  LOW_VALUE        — first session, low engagement, no outcome yet
"""
from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Optional

from db.database import get_db


class ValueState(str, Enum):
    SUCCESS_MOMENT  = "success_moment"
    FAILURE_TENSION = "failure_tension"
    HIGH_INTENT     = "high_intent"
    DISCOVERY       = "discovery"
    LOW_VALUE       = "low_value"


def detect_value_state(
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    recent_outcome: Optional[str] = None,   # "nailed_it" | "missed_it" — from client signal
    usage_count: int = 0,
    session_count: int = 0,
    shoot_mode_used: bool = False,
    blueprint_views: int = 0,
) -> Dict[str, Any]:
    """
    Detect user value state from signals.
    Returns {"state": ValueState, "signals": {...}, "confidence": float}

    Priority order:
      1. SUCCESS_MOMENT  (recent_outcome == nailed_it, or DB nailed_it event)
      2. FAILURE_TENSION (recent_outcome == missed_it, or DB failure event)
      3. HIGH_INTENT     (returning user OR shoot mode with usage)
      4. DISCOVERY       (multiple analyses OR blueprint views)
      5. LOW_VALUE       (default)
    """
    signals: Dict[str, Any] = {
        "recent_outcome":  recent_outcome,
        "usage_count":     usage_count,
        "session_count":   session_count,
        "shoot_mode_used": shoot_mode_used,
        "blueprint_views": blueprint_views,
    }

    # Enrich from DB if identifiers are available
    if session_id or user_id:
        try:
            db_signals = _load_db_signals(session_id=session_id, user_id=user_id)
            signals.update(db_signals)
        except Exception:
            pass

    # ── Priority 1: Success moment ────────────────────────────────────────────
    if recent_outcome == "nailed_it" or signals.get("recent_nailed_it"):
        return {"state": ValueState.SUCCESS_MOMENT, "signals": signals, "confidence": 0.95}

    # ── Priority 2: Failure tension ───────────────────────────────────────────
    if recent_outcome == "missed_it" or signals.get("recent_missed_it"):
        return {"state": ValueState.FAILURE_TENSION, "signals": signals, "confidence": 0.90}

    # ── Priority 3: High intent ───────────────────────────────────────────────
    effective_sessions   = max(session_count, signals.get("db_session_count", 0))
    effective_usage      = max(usage_count,   signals.get("db_usage_count", 0))
    effective_shoot      = shoot_mode_used or signals.get("db_shoot_mode_used", False)

    if effective_sessions >= 2 or (effective_shoot and effective_usage >= 2):
        return {"state": ValueState.HIGH_INTENT, "signals": signals, "confidence": 0.80}

    # ── Priority 4: Discovery ─────────────────────────────────────────────────
    effective_blueprints = max(blueprint_views, signals.get("db_blueprint_views", 0))

    if effective_usage >= 2 or effective_blueprints >= 1:
        return {"state": ValueState.DISCOVERY, "signals": signals, "confidence": 0.75}

    # ── Default: Low value ────────────────────────────────────────────────────
    return {"state": ValueState.LOW_VALUE, "signals": signals, "confidence": 0.70}


def _load_db_signals(
    session_id: Optional[str],
    user_id: Optional[str],
) -> Dict[str, Any]:
    """Load enrichment signals from the database (7-day window)."""
    out: Dict[str, Any] = {}
    cutoff = time.time() - 86400 * 7

    try:
        with get_db() as conn:
            # Recent NAILED_IT events
            if user_id:
                row = conn.execute(
                    "SELECT COUNT(*) AS n FROM nailed_it_events"
                    " WHERE user_id=? AND created_at>=?",
                    (user_id, cutoff),
                ).fetchone()
                if row and row["n"] > 0:
                    out["recent_nailed_it"] = True

            # Recent failure (MISSED_IT) events
            if user_id or session_id:
                key, val = ("user_id", user_id) if user_id else ("session_id", session_id)
                row = conn.execute(
                    f"SELECT COUNT(*) AS n FROM failure_events"
                    f" WHERE {key}=? AND created_at>=?",
                    (val, cutoff),
                ).fetchone()
                if row and row["n"] > 0:
                    out["recent_missed_it"] = True

            # Analysis count
            count_key = f"user:{user_id}" if user_id else session_id
            if count_key:
                row = conn.execute(
                    "SELECT count FROM session_analysis_counts WHERE session_id=?",
                    (count_key,),
                ).fetchone()
                if row:
                    out["db_usage_count"] = row["count"]
    except Exception:
        pass

    return out
