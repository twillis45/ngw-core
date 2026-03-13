"""Dev guard — email whitelist for NGW Lab access.

Reads allowed emails from NGW_DEV_EMAILS env var (comma-separated).
Wraps get_current_user() with an additional 403 check.
"""
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import Depends, HTTPException, Request, status

from auth.security import get_current_user, get_optional_user


def _get_dev_emails() -> set:
    """Parse NGW_DEV_EMAILS env var into a set of lowercase emails."""
    raw = os.getenv("NGW_DEV_EMAILS", "")
    if not raw.strip():
        return set()
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _dev_mode_active() -> bool:
    """Check if NGW_DEV_MODE env var is set to a truthy value."""
    return os.getenv("NGW_DEV_MODE", "").strip().lower() in ("1", "true", "yes")


_DEV_MODE_USER = {"id": "dev-mode", "email": "dev@localhost", "name": "Dev Mode"}


async def get_dev_user(user: Dict[str, Any] = Depends(get_optional_user)) -> Dict[str, Any]:
    """FastAPI dependency — returns user dict or raises 403 if not a whitelisted dev.

    Requires:
      1. Valid JWT (via get_current_user → 401 if missing/invalid)
      2. User email in NGW_DEV_EMAILS list → 403 if not whitelisted

    If NGW_DEV_MODE=1, bypasses both checks and returns a mock dev user.
    """
    # Dev mode bypass — skip all auth checks
    if _dev_mode_active():
        return _DEV_MODE_USER

    # Normal auth path — require valid user
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    allowed = _get_dev_emails()

    # If no whitelist configured, deny all (fail-closed)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lab access not configured. Set NGW_DEV_EMAILS env var.",
        )

    user_email = (user.get("email") or "").lower()
    if user_email not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account does not have Lab access.",
        )

    return user
