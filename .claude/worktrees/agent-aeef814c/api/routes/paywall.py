"""
POST /api/paywall/event    — unified paywall event (writes analytics + experiment tables)
POST /api/usage/increment  — server-side analysis count sync
POST /api/paywall/upgrade-intent — log upgrade funnel entry
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.security import get_optional_user
from db.experiments import record_experiment_event
from db.database import get_db, increment_analysis_count

logger = logging.getLogger(__name__)
router = APIRouter(tags=["paywall"])


# ── Models ────────────────────────────────────────────────────────────────────

class PaywallEvent(BaseModel):
    session_id: str
    event_name: str          # PAYWALL_TRIGGERED | PAYWALL_DISMISSED | PAYWALL_BYPASSED
    trigger: str             # success_moment | shoot_mode | analysis_limit | passive_nudge
    type: str                # hard | soft | value_triggered | nudge
    analysis_count: int = 0
    active_flags: List[str] = []
    data: dict = {}


class UsageIncrement(BaseModel):
    session_id: str
    event: str = "analysis_complete"


class UpgradeIntent(BaseModel):
    session_id: str
    plan: str                # pro | studio
    billing_period: str      # monthly | yearly
    price: float
    trigger: Optional[str] = None
    active_flags: List[str] = []


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/paywall/event", status_code=204)
async def paywall_event(
    body: PaywallEvent,
    user=Depends(get_optional_user),
):
    """
    Record a paywall lifecycle event.
    Writes to experiment_events for each active flag so metrics stay in sync.
    """
    CONVERSION_GROUPS = {"pricing", "paywall_timing", "cta_messaging"}

    try:
        from db.flags import get_flags_for_session
        flags = get_flags_for_session(body.session_id)
    except Exception:
        flags = {}

    for flag_name, flag_def in flags.items():
        if not flag_def.get("enabled"):
            continue
        if flag_def.get("group") not in CONVERSION_GROUPS:
            continue
        record_experiment_event(
            session_id=body.session_id,
            flag_name=flag_name,
            variant=flag_def.get("variant", "control"),
            event_name=body.event_name,
            data={
                "trigger": body.trigger,
                "type": body.type,
                "analysis_count": body.analysis_count,
                **body.data,
            },
        )

    logger.info(
        "paywall_event session=%s event=%s trigger=%s",
        body.session_id, body.event_name, body.trigger,
    )


@router.post("/paywall/upgrade-intent", status_code=204)
async def upgrade_intent(
    body: UpgradeIntent,
    user=Depends(get_optional_user),
):
    """Log an upgrade funnel entry (user reached pricing screen and selected a plan)."""
    try:
        from db.flags import get_flags_for_session
        flags = get_flags_for_session(body.session_id)
    except Exception:
        flags = {}

    for flag_name, flag_def in flags.items():
        if not flag_def.get("enabled"):
            continue
        record_experiment_event(
            session_id=body.session_id,
            flag_name=flag_name,
            variant=flag_def.get("variant", "control"),
            event_name="UPGRADE_STARTED",
            data={
                "plan": body.plan,
                "billing_period": body.billing_period,
                "price": body.price,
                "trigger": body.trigger,
            },
        )


@router.post("/usage/increment", status_code=200)
async def usage_increment(
    body: UsageIncrement,
    user=Depends(get_optional_user),
):
    """
    Increment analysis count for a session.
    Returns current count and whether the session is at the paywall threshold.
    """
    try:
        from db.flags import get_flags_for_session
        flags = get_flags_for_session(body.session_id)
        paywall_flag = next(
            (f for f in flags.values() if f.get("group") == "paywall_timing" and f.get("enabled")),
            None,
        )
        threshold = (paywall_flag or {}).get("config", {}).get("threshold", 3)
    except Exception:
        threshold = 3

    try:
        result = increment_analysis_count(body.session_id)
        count = result["count"]
    except Exception as exc:
        logger.warning("Failed to increment analysis count for session=%s: %s", body.session_id, exc)
        count = 0

    is_at_limit = count >= threshold
    logger.info(
        "usage_increment session=%s count=%d threshold=%d at_limit=%s",
        body.session_id, count, threshold, is_at_limit,
    )
    return {"threshold": threshold, "count": count, "is_at_limit": is_at_limit}
