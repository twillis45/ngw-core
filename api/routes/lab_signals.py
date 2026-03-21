"""
Session Signals API — /api/lab/signals/*

These endpoints are the write/read surface for the learning bootstrap system.
Every session that produces an analysis result should emit at least one signal.

Signal rules (non-negotiable):
  1. Every session must produce a signal
  2. No silent sessions
  3. If no user input → outcome is inferred ('unknown' or 'close')
  4. Signals are written immediately — no batching
  5. All writes are synchronous

signal_source values:
  live          — real user session (all analytics enabled)
  seeded        — bootstrap/synthetic data (all analytics disabled)
  internal      — developer/admin session (all analytics disabled)
  expert_review — curator session (all analytics disabled)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from auth.dev_guard import get_dev_user
from db.signals import (
    record_signal,
    get_summary,
    get_pattern_breakdown,
    get_recent_signals,
    get_confidence_calibration,
    get_hygiene_summary,
    get_recalibration_hints,
    get_calibration_by_environment,
    get_gold_set_suggestions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab/signals", tags=["signals"])

_VALID_SOURCES = {"live", "seeded", "internal", "expert_review", "all"}


# ─── Request models ─────────────────────────────────────────────────────────────

class RecordSignalRequest(BaseModel):
    # Required
    pattern_id: str = Field(..., min_length=1, max_length=64)

    # Core learning fields
    confidence_score:   Optional[float] = Field(None, ge=0.0, le=1.0)
    outcome:            Optional[str]   = None   # nailed_it | close | failed

    # Session context
    session_id:         Optional[str]  = None
    user_id:            Optional[str]  = None
    input_method:       Optional[str]  = None   # wizard | reference_photo | manual
    subject_type:       Optional[str]  = None
    environment:        Optional[str]  = None   # studio | indoor | outdoor
    mood:               Optional[str]  = None

    # Shoot mode data
    shoot_mode_entered: bool = False
    steps_completed:    int  = 0
    steps_total:        int  = 0
    deviation_count:    int  = 0

    # Revenue / conversion
    saved_setup:        bool  = False
    upgraded:           bool  = False
    revenue_value:      float = 0.0

    # Signal hygiene
    signal_source: str = Field("live", description="live | seeded | internal | expert_review")

    @field_validator("outcome")
    @classmethod
    def validate_outcome(cls, v):
        allowed = {"nailed_it", "close", "failed", None}
        if v not in allowed:
            raise ValueError(f"outcome must be one of {allowed - {None}}, got '{v}'")
        return v

    @field_validator("pattern_id")
    @classmethod
    def normalise_pattern(cls, v):
        return v.strip().lower().replace("-", "_").replace(" ", "_")

    @field_validator("signal_source")
    @classmethod
    def validate_source(cls, v):
        allowed = {"live", "seeded", "internal", "expert_review"}
        if v not in allowed:
            raise ValueError(f"signal_source must be one of {allowed}, got '{v}'")
        return v


# ─── Endpoints ───────────────────────────────────────────────────────────────────

@router.post("")
async def post_signal(body: RecordSignalRequest):
    """
    Record one session signal. No auth required — called from client-side
    at the moment the user taps 'Nailed It / Close / Didn't Work'.

    signal_source controls analytics inclusion:
      'live' (default) → all include_* flags = true
      any other        → all include_* flags = false

    Infers outcome to 'unknown' if none provided.
    Writes immediately and synchronously.
    """
    try:
        sig = record_signal(
            pattern_id         = body.pattern_id,
            confidence_score   = body.confidence_score,
            outcome            = body.outcome,
            session_id         = body.session_id,
            user_id            = body.user_id,
            input_method       = body.input_method,
            subject_type       = body.subject_type,
            environment        = body.environment,
            mood               = body.mood,
            shoot_mode_entered = body.shoot_mode_entered,
            steps_completed    = body.steps_completed,
            steps_total        = body.steps_total,
            deviation_count    = body.deviation_count,
            saved_setup        = body.saved_setup,
            upgraded           = body.upgraded,
            revenue_value      = body.revenue_value,
            signal_source      = body.signal_source,
        )
        return {
            "success":       True,
            "signal_id":     sig["id"],
            "created_at":    sig["created_at"],
            "outcome":       sig["outcome"],
            "signal_source": body.signal_source,
        }
    except Exception as exc:
        logger.error("Signal write failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/summary")
async def signals_summary(
    days:   int            = Query(30, ge=1, le=365),
    source: Optional[str]  = Query(None, description="live|seeded|internal|expert_review|all — default: metrics-eligible"),
    user:   Dict           = Depends(get_dev_user),
):
    """
    Headline KPIs for the signals panel.

    source=None (default) → metrics-eligible rows only (include_in_metrics=1)
    source='live'         → signal_source='live' rows
    source='all'          → all rows regardless of eligibility

    Returns:
      total_sessions, success_rate, top_pattern, worst_pattern,
      conversion_rate, avg_confidence, revenue_total
    """
    _validate_source_param(source)
    return get_summary(days=days, source=source)


@router.get("/patterns")
async def signals_patterns(
    days:   int            = Query(30, ge=1, le=365),
    source: Optional[str]  = Query(None, description="live|seeded|internal|expert_review|all — default: learning-eligible"),
    user:   Dict           = Depends(get_dev_user),
):
    """
    Per-pattern aggregation — primary learning feed.

    source=None (default) → learning-eligible rows only (include_in_learning=1)
    source='all'          → all rows (useful for comparing seeded vs live)

    Bootstrap validation: clamshell should have highest success_rate,
    split should have lowest. If ordering is wrong, check seed data or
    model confidence calibration.
    """
    _validate_source_param(source)
    return get_pattern_breakdown(days=days, source=source)


@router.get("/calibration")
async def signals_calibration(
    days:   int            = Query(30, ge=1, le=365),
    source: Optional[str]  = Query(None),
    user:   Dict           = Depends(get_dev_user),
):
    """
    Confidence vs outcome mismatch per pattern.
    'overconfident' flag = predicted > actual by >20pp → CI alert candidate.
    """
    _validate_source_param(source)
    return get_confidence_calibration(days=days, source=source)


@router.get("/recent")
async def signals_recent(
    limit:      int            = Query(50, ge=1, le=200),
    pattern_id: Optional[str]  = Query(None),
    source:     Optional[str]  = Query("live", description="live|seeded|internal|expert_review|all — default: live"),
    user:       Dict           = Depends(get_dev_user),
):
    """
    Latest N signals, optionally filtered by pattern and/or source.
    Defaults to source='live' so the feed shows real user sessions.
    """
    _validate_source_param(source)
    return get_recent_signals(limit=limit, pattern_id=pattern_id, source=source)


@router.get("/hygiene")
async def signals_hygiene(
    user: Dict = Depends(get_dev_user),
):
    """
    Signal Hygiene summary card.

    Returns counts by signal_source and by analytics eligibility:
      live, seeded, internal, expert_review,
      learning_eligible, metrics_eligible, conversion_eligible, cohorts_eligible
    """
    return get_hygiene_summary()


@router.post("/seed")
async def seed_signals_endpoint(
    force: bool = Query(False),
    user: Dict = Depends(get_dev_user),
):
    """
    Insert bootstrap seed data (45 synthetic rows across 5 patterns).
    Only runs when table is empty unless force=true.

    All rows are written with signal_source='seeded' and all include_* flags = false.
    They will NOT appear in default analytics queries.
    Used during initial setup and testing.
    """
    from db.signals import seed_signals as _seed
    inserted = _seed(force=force)
    return {
        "inserted": inserted,
        "message":  f"Seeded {inserted} rows (signal_source='seeded', excluded from analytics)",
    }


@router.get("/recalibration-hints")
async def signals_recalibration_hints(
    days: int = Query(30, ge=1, le=365),
    user: Dict = Depends(get_dev_user),
):
    """
    Concrete per-pattern recalibration suggestions.
    Returns patterns where avg confidence exceeds success rate by >10pp,
    with a suggested new confidence floor and exact reduction amount.
    """
    return {"hints": get_recalibration_hints(days=days)}


@router.get("/calibration-env")
async def signals_calibration_by_env(
    days: int = Query(30, ge=1, le=365),
    user: Dict = Depends(get_dev_user),
):
    """Per-(pattern, environment) calibration breakdown."""
    return {"calibration": get_calibration_by_environment(days=days)}


@router.get("/gold-set-suggestions")
async def signals_gold_set_suggestions(
    days:  int = Query(90, ge=7, le=365),
    limit: int = Query(20, ge=1, le=100),
    user: Dict = Depends(get_dev_user),
):
    """
    Surface high-quality live signals as gold set candidates.
    Criteria: nailed_it + confidence >= 0.80 + input_method=reference_photo + not already in gold set.
    """
    return {"suggestions": get_gold_set_suggestions(days=days, limit=limit)}


# ─── Helpers ─────────────────────────────────────────────────────────────────────

def _validate_source_param(source: Optional[str]) -> None:
    if source is not None and source not in _VALID_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"source must be one of {sorted(_VALID_SOURCES)}, got '{source}'",
        )
