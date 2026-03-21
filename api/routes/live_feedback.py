"""Live Feedback route — thin HTTP layer for Phase 7.

All business logic lives in engine.services.live_feedback_service.
This route only:
  1. Parses the HTTP request
  2. Runs analyze_image() on reference + test image paths
  3. Calls analyze_shoot_deviation()
  4. Returns the HTTP response
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from engine.orchestrator import analyze_image
from engine.services.live_feedback_service import analyze_shoot_deviation

logger = logging.getLogger(__name__)
router = APIRouter()


class LiveFeedbackRequest(BaseModel):
    """Input for the /live-feedback endpoint."""
    referencePath: str   # path to already-uploaded reference image
    testPath: str        # path to the most recent test shot


@router.post("/live-feedback")
async def live_feedback(req: LiveFeedbackRequest) -> Dict[str, Any]:
    """Compare a test shot against a reference image and return corrective actions.

    Both images must be reachable server-side (use /upload-reference first).

    Returns:
        matchScore       0.0–1.0 match quality
        matchLabel       excellent | good | fair | poor | mismatch
        deviations       list of detected deviations sorted by severity
        priorityAction   most important corrective action
        summary          human-readable one-liner
    """
    # Analyse reference
    try:
        ref_ar = analyze_image(req.referencePath, run_extended=True, run_solver=False)
    except Exception as e:
        logger.exception("Live feedback — reference image analysis failed")
        raise HTTPException(status_code=500, detail=f"Reference analysis failed: {e}") from e

    if not ref_ar.ok:
        raise HTTPException(status_code=422, detail="Reference image analysis returned no result.")

    # Analyse test shot
    try:
        test_ar = analyze_image(req.testPath, run_extended=True, run_solver=False)
    except Exception as e:
        logger.exception("Live feedback — test image analysis failed")
        raise HTTPException(status_code=500, detail=f"Test image analysis failed: {e}") from e

    if not test_ar.ok:
        raise HTTPException(status_code=422, detail="Test image analysis returned no result.")

    feedback = analyze_shoot_deviation(ref_ar, test_ar)
    return {"status": "success", "feedback": feedback}
