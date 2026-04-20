"""
Client Brief Analysis — Studio-tier feature.

POST /api/brief/analyze  — upload 3-5 mood board images, get common thread synthesis
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth.plan_guard import require_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/brief", tags=["brief"])

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="brief")


def _analyze_one(image_bytes: bytes, filename: str) -> dict:
    """Analyze a single image and return summary."""
    tmp = None
    try:
        suffix = os.path.splitext(filename)[1] or ".jpg"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(image_bytes)
        tmp.close()

        from engine.orchestrator import analyze_image
        ar = analyze_image(tmp.name, run_extended=True, run_vlm=False, run_solver=True)

        pattern = getattr(ar, "authoritative_pattern", None) or "unknown"
        confidence = getattr(ar, "pattern_confidence", 0.0)

        # Extract key position from lighting inference if available
        key_position = None
        modifier = None
        try:
            li = getattr(ar, "classification", None) or {}
            if hasattr(li, "get"):
                key_position = li.get("key_direction") or li.get("key_position")
                modifier = li.get("modifier_family") or li.get("modifier")
        except Exception:
            pass

        return {
            "filename": filename,
            "status": "ok",
            "pattern": pattern,
            "confidence": round(confidence, 3),
            "key_position": key_position,
            "modifier": modifier,
        }
    except Exception as exc:
        logger.error("brief: analysis failed for %s — %s", filename, exc)
        return {"filename": filename, "status": "error", "error": str(exc)[:200]}
    finally:
        if tmp:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


def _synthesize(results: list[dict]) -> dict:
    """Find the common thread across multiple analyses."""
    ok_results = [r for r in results if r.get("status") == "ok"]
    if not ok_results:
        return {"common_pattern": "unknown", "common_modifier": None, "key_position": None, "avg_confidence": 0, "consensus_strength": "none"}

    # Common pattern (mode)
    patterns = [r["pattern"] for r in ok_results if r["pattern"] != "unknown"]
    pattern_counts = Counter(patterns)
    common_pattern = pattern_counts.most_common(1)[0][0] if pattern_counts else "unknown"
    pattern_agreement = pattern_counts.get(common_pattern, 0) / len(ok_results) if ok_results else 0

    # Common modifier
    modifiers = [r["modifier"] for r in ok_results if r.get("modifier")]
    modifier_counts = Counter(modifiers)
    common_modifier = modifier_counts.most_common(1)[0][0] if modifier_counts else None

    # Key position consensus
    positions = [r["key_position"] for r in ok_results if r.get("key_position")]
    position_counts = Counter(positions)
    common_position = position_counts.most_common(1)[0][0] if position_counts else None

    # Average confidence
    confidences = [r["confidence"] for r in ok_results]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    # Consensus strength
    if pattern_agreement >= 0.8:
        strength = "strong"
    elif pattern_agreement >= 0.5:
        strength = "moderate"
    else:
        strength = "weak"

    return {
        "common_pattern": common_pattern,
        "common_modifier": common_modifier,
        "key_position": common_position,
        "avg_confidence": round(avg_confidence, 3),
        "pattern_agreement": round(pattern_agreement, 2),
        "consensus_strength": strength,
        "recommendation": (
            f"These references share a {common_pattern} pattern"
            + (f" with {common_modifier}" if common_modifier else "")
            + (f", key position {common_position}" if common_position else "")
            + f". Set up a single {common_pattern} lighting configuration to cover all of them."
        ),
    }


@router.post("/analyze")
async def brief_analyze(
    images: List[UploadFile] = File(...),
    user=Depends(require_plan("studio")),
):
    """Upload 3-5 mood board images. Returns individual analyses + common thread synthesis."""
    if len(images) < 2:
        raise HTTPException(400, "At least 2 images required for brief analysis.")
    if len(images) > 5:
        raise HTTPException(400, "Maximum 5 images per brief.")

    image_data = []
    for img in images:
        data = await img.read()
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(400, f"Image {img.filename} exceeds 20 MB limit.")
        image_data.append((img.filename or "image.jpg", data))

    loop = asyncio.get_event_loop()
    results = []
    for filename, data in image_data:
        result = await loop.run_in_executor(_executor, _analyze_one, data, filename)
        results.append(result)

    synthesis = _synthesize(results)

    return {
        "status": "ok",
        "image_count": len(image_data),
        "individual_results": results,
        "synthesis": synthesis,
    }
