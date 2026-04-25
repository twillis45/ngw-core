"""
Public Studio API — API-key authenticated analysis endpoint.

POST /api/v1/analyze   — upload an image, get JSON analysis result
                         Authenticated via X-API-Key header (not JWT).
                         Rate limited: 100 requests/hour per key.
"""
from __future__ import annotations

import logging
import os
import tempfile
import time

from fastapi import APIRouter, Depends, File, HTTPException, Header, UploadFile

from db.database import validate_api_key, get_active_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["studio-api"])

# Simple in-memory rate limiter (resets on restart — acceptable for MVP)
_rate_limits: dict[str, list[float]] = {}
RATE_LIMIT = 100  # requests per hour
RATE_WINDOW = 3600  # seconds


def _check_rate_limit(key_prefix: str):
    now = time.time()
    window_start = now - RATE_WINDOW
    hits = _rate_limits.get(key_prefix, [])
    hits = [t for t in hits if t > window_start]
    if len(hits) >= RATE_LIMIT:
        raise HTTPException(429, f"Rate limit exceeded ({RATE_LIMIT}/hour). Try again later.")
    hits.append(now)
    _rate_limits[key_prefix] = hits


async def get_api_key_user(x_api_key: str = Header(..., alias="X-API-Key")):
    """Validate API key and return the associated user email."""
    if not x_api_key or not x_api_key.startswith("ngw_studio_"):
        raise HTTPException(401, "Invalid API key format.")

    email = validate_api_key(x_api_key)
    if not email:
        raise HTTPException(401, "Invalid or revoked API key.")

    # Verify the user still has an active Studio subscription
    sub = get_active_subscription(email)
    if not sub or sub.get("status") != "active":
        raise HTTPException(403, "No active Studio subscription found for this API key.")
    plan = sub.get("plan", "")
    if plan not in ("studio", "enterprise"):
        raise HTTPException(403, "API access requires a Studio subscription.")

    _check_rate_limit(x_api_key[:16])

    return {"email": email, "plan": plan}


@router.post("/analyze")
async def api_analyze(
    image: UploadFile = File(...),
    user=Depends(get_api_key_user),
):
    """
    Analyze a lighting reference image. Returns JSON with pattern, confidence,
    lighting inference, and diagram specification.

    Authentication: X-API-Key header (generate keys at /api/api-keys).
    Rate limit: 100 requests/hour.
    """
    data = await image.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "Image exceeds 20 MB limit.")

    suffix = os.path.splitext(image.filename or "img.jpg")[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()

        from engine.orchestrator import analyze_image, analysis_result_to_replay_dict
        ar = analyze_image(tmp.name, run_extended=True, run_vlm=False, run_solver=True)

        if not ar or not getattr(ar, "ok", False):
            raise HTTPException(500, "Analysis failed. The image may not contain a detectable face or lighting setup.")

        # Return the full replay dict (same format used for stored results)
        result = analysis_result_to_replay_dict(ar)

        # EXIF camera data — best-effort extraction
        from api.routes.lab import _extract_exif
        exif = _extract_exif(data)

        return {
            "status": "ok",
            "analysis_id": getattr(ar, "analysis_id", None),
            "pattern": getattr(ar, "authoritative_pattern", None) or "unknown",
            "confidence": round(getattr(ar, "pattern_confidence", 0.0), 3),
            "camera_settings": exif if exif else None,
            "result": result,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("studio_api: analysis failed — %s", exc)
        raise HTTPException(500, f"Analysis error: {str(exc)[:200]}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
