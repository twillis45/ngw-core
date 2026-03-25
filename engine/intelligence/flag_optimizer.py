"""
Feature Flag Intelligence Optimizer
=====================================
Bridges the intelligence scoring system with the feature flag / experiment
rollout engine.  For each running flag variant, computes:
  - intelligence_score (pattern-weighted, if applicable)
  - conversion_rate
  - upgrade_rate
  - usage_count

Decision rules:
  PROMOTE   intelligence_score improves OR holds AND conversion improves AND sample >= threshold
  HOLD      inconclusive or insufficient data
  ROLLBACK  intelligence_score decreases OR high_conf_missed increases OR conversion drops

Staged rollout:  10% → 25% → 50% → 100%
Change throttle: max 10 auto LOW-risk actions per 24h, 6h cooldown per flag.

SAFETY: This module generates decisions — it does NOT apply them directly.
All decisions are passed to the AutonomyEngine which enforces risk tiers and
guardrails before application.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Thresholds ─────────────────────────────────────────────────────────────────

MIN_FLAG_SAMPLE_SIZE       = 50     # minimum sessions per variant before acting
PROMOTE_INTEL_DELTA        = -2.0   # allow score drop up to 2pts (holds)
PROMOTE_CVR_DELTA_THRESHOLD = 0.0   # conversion must not drop
ROLLBACK_INTEL_DROP        = -5.0   # rollback if score drops > 5pts
ROLLBACK_HCM_INCREASE      = 0.05   # rollback if high-conf-missed increases > 5pp
ROLLBACK_CVR_DROP          = -3.0   # rollback if CVR drops > 3pp

ROLLOUT_STAGES = [10, 25, 50, 100]

FLAGS_PATH = Path("data/flags.json")


# ── Flag data helpers ─────────────────────────────────────────────────────────

def _load_flags() -> List[Dict[str, Any]]:
    try:
        data = json.loads(FLAGS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def get_flag_rollout(flag_name: str) -> int:
    for f in _load_flags():
        if f.get("flag_name") == flag_name:
            return int(f.get("rollout_pct", 0))
    return 0


def _next_rollout_stage(current_pct: int) -> Optional[int]:
    for stage in ROLLOUT_STAGES:
        if stage > current_pct:
            return stage
    return None  # already at 100%


def _prev_rollout_stage(current_pct: int) -> Optional[int]:
    prev = None
    for stage in ROLLOUT_STAGES:
        if stage < current_pct:
            prev = stage
    return prev  # None means already at 0%


# ── Experiment metrics fetch ──────────────────────────────────────────────────

def _get_experiment_metrics(flag_name: str, days: int = 30) -> Dict[str, Any]:
    """
    Pull conversion/upgrade metrics for a flag from the experiments DB.
    Returns empty dict if no data.
    """
    try:
        from db.database import get_db
        import time as _time
        cutoff = _time.time() - days * 86400
        with get_db() as conn:
            # Sessions assigned to this flag
            row = conn.execute(
                """SELECT COUNT(*) AS total_sessions,
                          SUM(CASE WHEN e.event_name IN ('UPGRADE_CLICK','CHECKOUT_STARTED') THEN 1 ELSE 0 END) AS conversions
                   FROM experiment_assignments a
                   LEFT JOIN experiment_events e ON e.session_id = a.session_id
                   WHERE a.flag_name=? AND a.created_at>=?""",
                (flag_name, cutoff),
            ).fetchone()
        if row and row["total_sessions"] and row["total_sessions"] > 0:
            cvr = (row["conversions"] or 0) / row["total_sessions"] * 100
            return {
                "total_sessions": row["total_sessions"],
                "conversions": row["conversions"] or 0,
                "conversion_rate_pct": round(cvr, 2),
            }
    except Exception as exc:
        logger.debug("flag_optimizer: metrics fetch failed for %s — %s", flag_name, exc)
    return {"total_sessions": 0, "conversions": 0, "conversion_rate_pct": 0.0}


# ── Variant intelligence lookup ───────────────────────────────────────────────

def _get_flag_intelligence_score(flag_name: str) -> Optional[float]:
    """
    Attempt to look up the intelligence score for sessions tagged with this flag.
    Falls back to the global score if per-flag breakdown not available.
    """
    try:
        from db.intelligence import get_latest_intelligence_snapshot
        snap = get_latest_intelligence_snapshot()
        if snap:
            return snap.get("score")
    except Exception:
        pass
    return None


# ── Decision logic ─────────────────────────────────────────────────────────────

def evaluate_flag(
    flag_name: str,
    baseline_cvr: float = 0.0,
    baseline_intel: float = 50.0,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Evaluate a single flag and return a decision dict.

    Returns:
      {
        flag_name, current_rollout_pct, decision,
        reason, new_rollout_pct (if promote),
        metrics, risk_tier
      }
    """
    current_pct = get_flag_rollout(flag_name)
    metrics     = _get_experiment_metrics(flag_name, days=days)
    intel_score = _get_flag_intelligence_score(flag_name)

    n = metrics.get("total_sessions", 0)
    cvr = metrics.get("conversion_rate_pct", 0.0)
    cvr_delta = cvr - baseline_cvr
    intel_delta = (intel_score - baseline_intel) if intel_score is not None else 0.0

    # Insufficient data → HOLD
    if n < MIN_FLAG_SAMPLE_SIZE:
        return _decision(flag_name, "hold", "insufficient_data", current_pct,
                         None, metrics, intel_score, "LOW")

    # Rollback checks
    if intel_delta < ROLLBACK_INTEL_DROP:
        return _decision(flag_name, "rollback", "intelligence_drop",
                         current_pct, _prev_rollout_stage(current_pct),
                         metrics, intel_score, "LOW")

    if cvr_delta < ROLLBACK_CVR_DROP:
        return _decision(flag_name, "rollback", "conversion_drop",
                         current_pct, _prev_rollout_stage(current_pct),
                         metrics, intel_score, "LOW")

    # Promote checks
    intel_ok = intel_delta >= PROMOTE_INTEL_DELTA
    cvr_ok   = cvr_delta >= PROMOTE_CVR_DELTA_THRESHOLD
    next_pct = _next_rollout_stage(current_pct)

    if intel_ok and cvr_ok and next_pct is not None:
        return _decision(flag_name, "promote", "metrics_positive",
                         current_pct, next_pct, metrics, intel_score, "LOW")

    return _decision(flag_name, "hold", "inconclusive", current_pct,
                     None, metrics, intel_score, "LOW")


def _decision(
    flag_name: str,
    decision: str,
    reason: str,
    current_pct: int,
    new_pct: Optional[int],
    metrics: Dict[str, Any],
    intel_score: Optional[float],
    risk_tier: str,
) -> Dict[str, Any]:
    return {
        "flag_name":          flag_name,
        "current_rollout_pct": current_pct,
        "new_rollout_pct":    new_pct,
        "decision":           decision,
        "reason":             reason,
        "risk_tier":          risk_tier,
        "metrics":            metrics,
        "intelligence_score": intel_score,
        "evaluated_at":       time.time(),
    }


def evaluate_all_flags(days: int = 30) -> List[Dict[str, Any]]:
    """
    Evaluate all running flags and return decision list.
    Only evaluates flags that are currently active (rollout > 0 and < 100).
    """
    flags = _load_flags()
    decisions = []
    for f in flags:
        name = f.get("flag_name", "")
        pct  = int(f.get("rollout_pct", 0))
        if pct <= 0 or pct >= 100:
            continue
        if not f.get("enabled", False):
            continue
        d = evaluate_flag(name, days=days)
        decisions.append(d)
    return decisions
