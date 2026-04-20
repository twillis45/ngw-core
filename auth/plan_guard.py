"""Plan-tier gate — FastAPI dependency that enforces a minimum subscription plan.

Usage:
    @router.post("/batch/analyze")
    async def batch_analyze(user=Depends(require_plan("studio"))):
        ...

Returns 403 with a clear message when the user's plan is below the minimum.
"""
from __future__ import annotations

from functools import lru_cache
from fastapi import Depends, HTTPException
from auth.security import get_current_user
from db.database import get_active_subscription

PLAN_ORDER = {"free": 0, "paid": 1, "pro": 2, "studio": 3, "enterprise": 4}

# Admin emails always pass (enterprise tier)
_ADMIN_EMAILS: set[str] | None = None


def _get_admin_emails() -> set[str]:
    global _ADMIN_EMAILS
    if _ADMIN_EMAILS is None:
        try:
            from db.provenance import get_internal_emails
            _ADMIN_EMAILS = get_internal_emails()
        except Exception:
            _ADMIN_EMAILS = set()
    return _ADMIN_EMAILS


def _user_plan(email: str) -> str:
    """Resolve the effective plan tier for a user email."""
    if email.lower() in _get_admin_emails():
        return "enterprise"
    sub = get_active_subscription(email)
    if sub and sub.get("status") == "active":
        return sub.get("plan", "pro")
    return "free"


def _meets_plan(user_plan: str, required: str) -> bool:
    return PLAN_ORDER.get(user_plan, 0) >= PLAN_ORDER.get(required, 0)


PLAN_LABELS = {
    "pro": "Pro",
    "studio": "Studio",
    "enterprise": "Enterprise",
}


def require_plan(min_plan: str):
    """Return a FastAPI dependency that enforces a minimum plan tier."""

    async def _guard(user=Depends(get_current_user)):
        email = user.get("email", "")
        effective = _user_plan(email)
        if not _meets_plan(effective, min_plan):
            label = PLAN_LABELS.get(min_plan, min_plan.title())
            raise HTTPException(
                status_code=403,
                detail=f"This feature requires a {label} subscription. "
                       f"Your current plan: {PLAN_LABELS.get(effective, effective.title())}.",
            )
        # Attach plan info to user dict for downstream use
        user["effective_plan"] = effective
        return user

    return _guard
