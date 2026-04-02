"""Blueprint route — thin HTTP layer for Phase 6.

All business logic lives in engine.services.blueprint_service.
This route only:
  1. Parses the HTTP request
  2. Calls build_lighting_blueprint()
  3. Returns the HTTP response
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.orchestrator import analyze_image
from engine.services.blueprint_service import build_lighting_blueprint

logger = logging.getLogger(__name__)
router = APIRouter()


class BlueprintRequest(BaseModel):
    """Input for the /blueprint endpoint."""
    imagePath: Optional[str] = None          # path to reference image (optional)
    pattern: Optional[str] = None            # override pattern (if no image)
    environment: Optional[str] = None
    subjectType: str = "headshot"
    gear: List[str] = Field(default_factory=list)


class _StubAnalysisResult:
    """Minimal AnalysisResult stub when no image is provided — pattern-only blueprint."""
    def __init__(self, pattern: str) -> None:
        self.authoritative_pattern = pattern
        self.lighting_intel = None
        self.cue_report = None
        self.face_validation = None
        self.edge_case_flags = None
        self.classification = None


@router.post("/blueprint")
async def get_blueprint(req: BlueprintRequest) -> Dict[str, Any]:
    """Generate a physically-shootable lighting blueprint.

    Provide either:
    - imagePath: path to an already-uploaded reference image (preferred), OR
    - pattern: a lighting pattern code for a pattern-only blueprint.

    Returns a complete blueprint with light positions, modifiers, camera
    settings, fallback options, and recommended gear kits (good/better/best).
    """
    analysis_result: Any

    if req.imagePath:
        # Normalize web-relative paths: '/static/uploads/...' → 'static/uploads/...'
        # Path() treats leading-slash strings as absolute filesystem paths, but
        # the upload-reference endpoint returns project-root-relative paths.
        image_path_str = req.imagePath
        if image_path_str.startswith('/') and not Path(image_path_str).exists():
            image_path_str = image_path_str.lstrip('/')
        # Full analysis from reference image
        try:
            ar = analyze_image(image_path_str, run_extended=True, run_solver=True)
        except Exception as e:
            logger.exception("Blueprint image analysis failed")
            raise HTTPException(status_code=500, detail=f"Image analysis failed: {e}") from e

        if not ar.ok:
            raise HTTPException(
                status_code=422,
                detail="Image analysis returned no usable result.",
            )
        analysis_result = ar

    elif req.pattern:
        # Pattern-only blueprint (no image signals)
        analysis_result = _StubAnalysisResult(req.pattern)

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'imagePath' or 'pattern'.",
        )

    blueprint = build_lighting_blueprint(
        analysis_result,
        environment=req.environment,
        subject_type=req.subjectType,
        gear=req.gear,
    )

    return {"status": "success", "blueprint": blueprint}
