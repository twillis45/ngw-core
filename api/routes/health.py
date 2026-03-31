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
    """Return API key health status: last probe result + recent error events."""
    _require_admin(user)
    from db.database import get_api_health_events, get_latest_api_health
    from engine.vlm import _VLM_PROVIDER, _VLM_MODEL, vlm_available

    latest = get_latest_api_health(_VLM_PROVIDER) if _VLM_PROVIDER != "none" else None
    recent_events = get_api_health_events(limit=20)

    smtp_configured = all([
        os.getenv("SMTP_HOST", "").strip(),
        os.getenv("SMTP_USER", "").strip(),
        os.getenv("SMTP_PASS", "").strip(),
    ])
    from_email = os.getenv("FROM_EMAIL", "")
    app_url    = os.getenv("APP_URL", "")

    return {
        "provider":        _VLM_PROVIDER,
        "model":           _VLM_MODEL,
        "vlm_available":   vlm_available(),
        "latest_event":    latest,
        "recent_events":   recent_events,
        "has_errors":      any(e["event_type"] in ("401_error", "probe_fail") for e in recent_events[:5]),
        "smtp_configured": smtp_configured,
        "smtp_host":       os.getenv("SMTP_HOST", ""),
        "from_email":      from_email,
        "app_url":         app_url,
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
