"""Style DNA route — thin HTTP layer for Phase 8.

All business logic lives in engine.services.style_dna_service.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.orchestrator import analyze_image
from engine.services.style_dna_service import analyze_user_portfolio

logger = logging.getLogger(__name__)
router = APIRouter()


class StyleDNARequest(BaseModel):
    """Input for the /style-dna endpoint."""
    imagePaths: List[str] = Field(
        ...,
        min_length=1,
        description="List of server-side image paths to analyse (use /upload-reference first).",
    )


@router.post("/style-dna")
async def style_dna(req: StyleDNARequest) -> Dict[str, Any]:
    """Analyse a portfolio of images and return Style DNA.

    Upload images first via /upload-reference, then pass their server paths here.

    Returns:
        signaturePattern     dominant lighting pattern
        patternDistribution  frequency breakdown of all detected patterns
        contrastProfile      average contrast ratio and profile (flat/natural/dramatic)
        modifierUsage        modifier frequency breakdown
        lightCountProfile    average and distribution of light counts
        toneProfile          brightness distribution, B&W percentage
        keySidePreference    left / right / unknown key light preference
        suggestions          improvement suggestions based on portfolio analysis
    """
    if len(req.imagePaths) > 50:
        raise HTTPException(
            status_code=422,
            detail="Maximum 50 images per Style DNA request.",
        )

    analysis_results = []
    failed = 0
    for path in req.imagePaths:
        try:
            ar = analyze_image(path, run_extended=True, run_solver=False)
            if ar.ok:
                analysis_results.append(ar)
            else:
                failed += 1
        except Exception:
            logger.exception("Style DNA — image analysis failed for %s", path)
            failed += 1

    if not analysis_results:
        raise HTTPException(
            status_code=422,
            detail="All image analyses failed — check image paths and formats.",
        )

    dna = analyze_user_portfolio(analysis_results)
    return {
        "status": "success",
        "analysedImages": len(analysis_results),
        "failedImages": failed,
        "styleDNA": dna,
    }
