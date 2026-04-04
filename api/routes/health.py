"""
API Key & Service Health — /api/health/*
========================================

GET  /api/health          — basic liveness check
GET  /api/health/api-keys — test configured API keys + return recent health events
POST /api/health/api-keys/probe — force a live key probe right now
"""
from __future__ import annotations

import logging
from typing import Dict

from fastapi import APIRouter, Depends

from auth.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

import os
ADMIN_EMAILS = {"todd@toddwillisphoto.com"}

def _require_admin(user: dict) -> None:
    if os.getenv("NGW_DEV_MODE", "").strip().lower() in ("1", "true", "yes"):
        return
    if not user or user.get("email") not in ADMIN_EMAILS:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/health")
async def liveness():
    """Basic liveness — always returns 200 if the server is up."""
    return {"ok": True, "service": "ngw-core"}


@router.get("/health/api-keys")
async def api_key_status(user=Depends(get_current_user)):
    """Return health status for all services: VLM, DB, SMTP, Stripe + recent VLM events."""
    _require_admin(user)
    from db.database import get_api_health_events, get_latest_api_health
    from engine.vlm          import _VLM_PROVIDER, _VLM_MODEL, vlm_available, _vlm_probe_result
    from engine.service_health import _db_probe_result, _smtp_probe_result, _stripe_probe_result

    latest        = get_latest_api_health(_VLM_PROVIDER) if _VLM_PROVIDER != "none" else None
    recent_events = get_api_health_events(limit=20)

    # Legacy convenience fields (kept for backward compat)
    smtp_configured = all([
        os.getenv("SMTP_HOST", "").strip(),
        os.getenv("SMTP_USER", "").strip(),
        os.getenv("SMTP_PASS", "").strip(),
    ])

    # has_errors = any startup probe failed OR recent VLM error events
    has_errors = any(e["event_type"] in ("401_error", "probe_fail") for e in recent_events[:5])
    if _vlm_probe_result and not _vlm_probe_result["ok"]:
        has_errors = True

    def _svc(r):
        if r is None:
            return {"ok": None, "detail": None}
        return {"ok": r.get("ok"), "detail": r.get("detail")}

    return {
        # VLM
        "provider":         _VLM_PROVIDER,
        "model":            _VLM_MODEL,
        "vlm_available":    vlm_available(),
        "vlm_probe_ok":     _vlm_probe_result["ok"] if _vlm_probe_result else None,
        "vlm_probe_detail": _vlm_probe_result.get("detail") if _vlm_probe_result else None,
        # VLM event log
        "latest_event":     latest,
        "recent_events":    recent_events,
        "has_errors":       has_errors,
        # Legacy SMTP fields
        "smtp_configured":  smtp_configured,
        "smtp_host":        os.getenv("SMTP_HOST", ""),
        "from_email":       os.getenv("FROM_EMAIL", ""),
        "app_url":          os.getenv("APP_URL", ""),
        # Structured per-service probe results (all four in one place)
        "services": {
            "vlm":    _svc(_vlm_probe_result),
            "db":     _svc(_db_probe_result),
            "smtp":   _svc(_smtp_probe_result),
            "stripe": _svc(_stripe_probe_result),
        },
    }


@router.post("/health/api-keys/probe")
async def force_key_probe(user=Depends(get_current_user)):
    """Run a live API key probe right now and return the result."""
    _require_admin(user)
    from engine.vlm import probe_api_key, vlm_available
    if not vlm_available():
        return {"ok": False, "detail": "VLM not configured — set VLM_PROVIDER and API key in .env"}
    result = probe_api_key()
    return result
