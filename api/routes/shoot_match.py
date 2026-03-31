"""Shoot-match route — thin HTTP layer.

All business logic lives in engine.services.shoot_match_service.
This route only:
  1. Parses the HTTP request
  2. Resolves taxonomy labels → internal codes
  3. Calls build_shoot_match_result()
  4. Formats the HTTP response
"""

from __future__ import annotations

import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from auth.security import get_current_user
from auth.rate_limit import check_rate_limit
from pydantic import BaseModel, Field

# Service layer — all business logic
from engine.services.shoot_match_service import (
    build_shoot_match_result,
    MOOD_MAP,
    ENVIRONMENT_MAP,
    MODIFIER_LABELS,
    ROLE_LABELS,
    _map_light,
)

# Still needed for upload-reference (lightweight analysis, not full shoot-match)
from engine.lighting_inference import (
    build_reference_description,
    match_catchlights_to_diagram,
)
from engine.orchestrator import analyze_image
from engine.diagram import build_reference_diagram
from engine.master_mode import list_modes

logger = logging.getLogger(__name__)

router = APIRouter()

# Taxonomy maps are imported from engine.services.shoot_match_service
# (MOOD_MAP, ENVIRONMENT_MAP, MODIFIER_LABELS, ROLE_LABELS, etc.)


# ── Request model ──

class ShootMatchRequest(BaseModel):
    subject: str = "headshot"
    mood: str
    environment: str
    ceiling: str = "normal"
    gearMode: str = "anyGear"
    gear: List[str] = Field(default_factory=list)
    skinTone: Optional[str] = None
    referenceImage: Optional[str] = None
    masterMode: Optional[str] = None
    priorAnalysis: Optional[Dict[str, Any]] = None


# NGW_UPLOAD_DIR overrides the upload location (e.g. a Render persistent disk path).
# The returned path is always relative to the project root for static file serving,
# so point this at the same location that main.py mounts as /static.
# Default: static/uploads (served at /static/uploads/...)
UPLOAD_DIR = Path(os.environ.get("NGW_UPLOAD_DIR", "static/uploads"))

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tiff", ".tif"}
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/tiff",
}


async def _validate_upload(file: UploadFile) -> bytes:
    """Read file contents and validate size + MIME type. Returns raw bytes."""
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {_MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )
    ext = Path(file.filename or "photo.jpg").suffix.lower()
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ext not in _ALLOWED_IMAGE_EXTS and ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext or ct}'. Please upload a JPEG, PNG, WebP, HEIC, or TIFF image.",
        )
    return content


@router.post("/upload-reference")
async def upload_reference(
    request: Request,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    """Save an uploaded reference image, run basic analysis, and return both."""
    check_rate_limit("upload_reference", request, limit=20, window=60)
    content = await _validate_upload(file)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo.jpg").suffix.lower() or ".jpg"
    filename = f"ref_{uuid.uuid4().hex[:8]}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        f.write(content)

    analysis = None
    lighting_intel = None
    try:
        # Use extended pipeline so the reference eval analysis screen and the
        # shoot-match blueprint both resolve from the same truth source.
        # run_extended=True enables VLW reconciliation, extended vision passes,
        # and cross-classifier resolution — the same depth as shoot_match itself.
        # This is one-time per image upload (not real-time), so the extra latency
        # (~3-5s) is acceptable for accuracy.
        ar = analyze_image(str(dest), run_extended=True, run_solver=False)
        if ar.ok:
            raw = ar.description
            vision = ar.vision_data
            lighting_intel = ar.lighting_intel

            # Build classification dict and enrich with the resolved
            # authoritative_pattern so the priorAnalysis mechanism in
            # shoot-match can anchor pattern detection to what was shown
            # on the reference eval screen, rather than re-deriving it.
            _cls = dict(ar.classification or {})
            if ar.authoritative_pattern and ar.authoritative_pattern != "unknown":
                _cls["lightingPattern"] = ar.authoritative_pattern
                _cls["patternSource"] = ar.authoritative_pattern_source

            analysis = {
                "palette": raw.get("palette", {}),
                "orientation": raw.get("orientation"),
                "isGrayscale": raw.get("is_grayscale_like", False),
                "classification": _cls,
            }

            if vision and vision.get("ok"):
                analysis["skinTone"] = vision.get("skin_tone")
                catchlights = vision.get("catchlights")
                if catchlights and catchlights.get("ok"):
                    analysis["catchlights"] = catchlights

                # Surface background data
                region = vision.get("region_attribution", {})
                masks = region.get("masks", {})
                palettes = region.get("palettes", {})
                bg_palette = palettes.get("background_palette")
                if bg_palette is not None:
                    analysis["background"] = {
                        "palette": bg_palette,
                        "ratio": masks.get("background_ratio"),
                    }

                if lighting_intel is not None:
                    # Enrich background with light detection
                    if lighting_intel.background_light_detected:
                        bg_section = analysis.get("background", {})
                        bg_section["lightDetected"] = True
                        bg_section["lightConfidence"] = (
                            lighting_intel.background_light_confidence
                        )
                        analysis["background"] = bg_section

                    # Build detected diagram
                    ref_diagram = build_reference_diagram(
                        pattern=lighting_intel.pattern,
                        modifier_family=lighting_intel.modifier_family,
                        light_count=lighting_intel.light_count,
                        key_position_text=lighting_intel.key_position_text,
                        fill_method_text=lighting_intel.fill_method_text,
                        background_light=lighting_intel.background_light_detected,
                        key_side=lighting_intel.key_side,
                    )
                    ref_diagram_dict = ref_diagram.model_dump()

                    # Match catchlights to diagram lights
                    raw_catchlights: List[Dict[str, Any]] = []
                    cd = vision.get("catchlights", {})
                    if cd and cd.get("ok"):
                        raw_catchlights = cd.get("catchlights", [])

                    matched_lights = match_catchlights_to_diagram(
                        diagram_lights=ref_diagram_dict["lights"],
                        catchlights=raw_catchlights,
                        pattern=lighting_intel.pattern,
                    )

                    diagram_lights: List[Dict[str, Any]] = []
                    for ml in matched_lights:
                        entry: Dict[str, Any] = {
                            **_map_light(ml),
                            "detectedFrom": ml.get("detectedFrom", []),
                        }
                        if ml.get("role") == "background":
                            entry["detectedFromNote"] = (
                                "Background lights illuminate the backdrop, "
                                "not the subject's eyes. This light was "
                                "inferred from background brightness analysis, "
                                "not from catchlight evidence."
                            )
                        diagram_lights.append(entry)

                    analysis["detectedDiagram"] = {
                        "lights": diagram_lights,
                        "subject": ref_diagram_dict["subject"],
                        "camera": ref_diagram_dict["camera"],
                        "raw": ref_diagram_dict,
                    }

                    # Build the reference description (sub-keys: catchlights,
                    # lightQuality, background, pattern, subject).
                    ref_description = build_reference_description(
                        vision_data=vision,
                        classification=ar.classification,
                        image_analysis=raw,
                        inference=lighting_intel,
                        cue_report=ar.cue_report,
                        vlm_description=ar.vlm_description,
                    )

                    # Override referenceAnalysis with the orchestrator-resolved
                    # version — it has been through pattern_candidates resolution
                    # and _sync_authoritative_pattern_to_cards(), so all three
                    # cards (image_read, lighting_read, recreation_setup) agree
                    # on the authoritative pattern.  This is the single truth
                    # source: the analysis screen and the blueprint both read
                    # from the same resolved data.
                    if ar.reference_analysis is not None:
                        try:
                            ref_description["referenceAnalysis"] = ar.reference_analysis.model_dump()
                        except Exception:
                            pass  # keep build_reference_description() result on failure

                    analysis["description"] = ref_description

                    # Lighting intelligence summary
                    analysis["lightingIntelligence"] = {
                        "detectedPattern": lighting_intel.pattern,
                        "patternConfidence": lighting_intel.pattern_confidence,
                        "detectedModifier": lighting_intel.modifier_family,
                        "modifierConfidence": lighting_intel.modifier_confidence,
                        "lightCount": lighting_intel.light_count,
                        "keyPosition": lighting_intel.key_position_text,
                        "keySide": lighting_intel.key_side,
                        "fillMethod": lighting_intel.fill_method_text,
                        "backgroundLight": lighting_intel.background_light_detected,
                        "backgroundLightConfidence": (
                            lighting_intel.background_light_confidence
                        ),
                        "notes": lighting_intel.notes,
                    }
    except Exception:
        logger.exception("Reference image analysis failed")

    return {"path": str(dest), "analysis": analysis}


# ═══════════════════════════════════════════════════════════════════════════
# Multi-image merge — consensus analysis from individually-uploaded images
# ═══════════════════════════════════════════════════════════════════════════

class MergeAnalysesRequest(BaseModel):
    """Input for /merge-analyses."""
    imagePaths: List[str] = Field(
        ..., min_length=2,
        description="Server-side paths from /upload-reference responses.",
    )


@router.post("/merge-analyses")
async def merge_analyses(
    req: MergeAnalysesRequest,
    request: Request,
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    """Merge per-image analyses into a consensus view.

    Runs analyze_image on each path (fast — results are cached in-process),
    then extracts signals and builds a consensus: dominant pattern, average
    contrast, modifier/light-count consensus, and per-image breakdown.

    Frontend calls this after all individual uploads complete.
    """
    from engine.services.style_dna_service import _extract_image_signals

    check_rate_limit("merge_analyses", request, limit=10, window=60)

    if len(req.imagePaths) > 10:
        raise HTTPException(status_code=422, detail="Maximum 10 images per merge.")

    analysis_results = []
    per_image = []
    for path in req.imagePaths:
        # Normalize web-relative paths
        norm_path = path
        if path.startswith('/') and not Path(path).exists():
            norm_path = path.lstrip('/')
        try:
            ar = analyze_image(norm_path, run_extended=True, run_solver=False)
            if ar.ok:
                analysis_results.append(ar)
                signals = _extract_image_signals(ar)
                per_image.append({
                    "path": path,
                    "pattern": signals["pattern"] if signals else "unknown",
                    "mood": signals["mood"] if signals else None,
                    "modifier": signals["modifier"] if signals else None,
                    "lightCount": signals["light_count"] if signals else 0,
                    "keySide": signals["key_side"] if signals else "unknown",
                    "confidence": signals["pattern_confidence"] if signals else 0,
                })
            else:
                per_image.append({"path": path, "pattern": "failed", "error": "analysis_failed"})
        except Exception:
            logger.exception("Merge analyses — image failed: %s", path)
            per_image.append({"path": path, "pattern": "failed", "error": "exception"})

    if not analysis_results:
        raise HTTPException(status_code=422, detail="All image analyses failed.")

    # Build consensus from extracted signals
    from collections import Counter

    all_signals = [
        sig for ar in analysis_results
        if (sig := _extract_image_signals(ar)) is not None
    ]
    total = len(all_signals)

    # Dominant pattern — confidence-weighted vote
    pattern_votes: Counter = Counter()
    for s in all_signals:
        weight = s.get("pattern_confidence", 0.5)
        pattern_votes[s["pattern"]] += weight
    dominant_pattern = pattern_votes.most_common(1)[0][0] if pattern_votes else "unknown"

    # Agreement score — what fraction voted for the dominant pattern
    agreement = (
        sum(1 for s in all_signals if s["pattern"] == dominant_pattern) / total
        if total else 0
    )

    # Consensus mood — simple majority
    mood_votes: Counter = Counter(s["mood"] for s in all_signals if s["mood"])
    consensus_mood = mood_votes.most_common(1)[0][0] if mood_votes else None

    # Average light count
    light_counts = [s["light_count"] for s in all_signals if s["light_count"] > 0]
    avg_lights = round(sum(light_counts) / len(light_counts), 1) if light_counts else 0

    # Consensus modifier
    mod_votes: Counter = Counter(s["modifier"] for s in all_signals if s["modifier"])
    consensus_modifier = mod_votes.most_common(1)[0][0] if mod_votes else None

    # Key side preference
    side_votes: Counter = Counter(s["key_side"] for s in all_signals if s["key_side"] != "unknown")
    key_side = side_votes.most_common(1)[0][0] if side_votes else "unknown"

    # Average contrast
    ratios = [s["contrast_ratio"] for s in all_signals if s.get("contrast_ratio")]
    avg_contrast = round(sum(ratios) / len(ratios), 2) if ratios else None

    return {
        "status": "success",
        "imageCount": total,
        "consensus": {
            "pattern": dominant_pattern,
            "patternLabel": {
                "rembrandt": "Rembrandt", "loop": "Loop", "butterfly": "Butterfly",
                "split": "Split", "broad": "Broad", "short": "Short",
                "flat": "Flat", "rim_only": "Rim Only", "high_key": "High Key",
                "low_key": "Low Key", "natural_window": "Window Light",
            }.get(dominant_pattern, dominant_pattern.replace("_", " ").title()),
            "agreement": round(agreement, 2),
            "mood": consensus_mood,
            "modifier": consensus_modifier,
            "lightCount": avg_lights,
            "keySide": key_side,
            "contrastRatio": avg_contrast,
        },
        "perImage": per_image,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Main shoot-match endpoint — thin HTTP layer
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/shoot-match")
def shoot_match(request: Request, req: ShootMatchRequest) -> Dict[str, Any]:
    """Match user inputs to a lighting setup.

    This route is a thin HTTP layer. All business logic — system filtering,
    pattern resolution, card assembly, reference enrichment — lives in
    engine.services.shoot_match_service.build_shoot_match_result().
    """
    check_rate_limit("shoot_match", request, limit=30, window=60)
    # Resolve taxonomy labels → internal codes
    mood = MOOD_MAP.get(req.mood, "natural")
    environment = ENVIRONMENT_MAP.get(req.environment, "studio_small")

    # Extract prior pattern from pre-computed ref eval analysis, if provided.
    # This anchors pattern detection to what the ref eval screen showed rather
    # than re-deriving it from a fresh (and potentially diverging) analysis run.
    prior_pattern: Optional[str] = None
    prior_confidence: Optional[float] = None
    if req.priorAnalysis:
        cls = req.priorAnalysis.get("classification") or {}
        pat = cls.get("lightingPattern") or cls.get("lighting_pattern")
        if pat and pat != "unknown":
            prior_pattern = pat
            prior_confidence = cls.get("confidence")

    # Delegate to service layer
    result = build_shoot_match_result(
        mood=mood,
        environment=environment,
        gear=req.gear,
        gear_mode=req.gearMode,
        skin_tone=req.skinTone,
        master_mode=req.masterMode,
        reference_image=req.referenceImage,
        prior_pattern=prior_pattern,
        prior_confidence=prior_confidence,
    )

    # Handle empty result (no systems matched)
    if not result.cards:
        raise HTTPException(
            status_code=422,
            detail="No lighting setups match your selections. Try broadening your gear or environment.",
        )

    # Format HTTP response — backward compatible with existing UI contract
    response: Dict[str, Any] = {
        "status": "success",
        "requestId": result.request_id,
        "processingMs": result.processing_ms,
        "cards": result.cards,
        "authoritative_pattern": result.authoritative_pattern,
    }

    # Photographer-centric structured output (Phase 3)
    if result.shoot_loop:
        response["shootLoop"] = result.shoot_loop

    # Candidate-first pattern data (new — UI can adopt progressively)
    if result.pattern_candidates:
        response["patternCandidates"] = result.pattern_candidates.to_dict()

    # Validation / contradiction signals
    if result.validation_scores:
        response["validationScores"] = result.validation_scores
    if result.contradictions:
        response["contradictions"] = result.contradictions
    if result.needs_review:
        response["needsReview"] = True

    # Gear match quality
    if result.gear_match:
        response["gearMatch"] = result.gear_match

    # VLM data
    if result.vlm_description is not None:
        response["vlmDescription"] = result.vlm_description
    if result.vlm_reconstruction is not None:
        response["vlmReconstruction"] = result.vlm_reconstruction

    # Reference image analysis
    if result.reference_analysis:
        response["referenceImageAnalysis"] = result.reference_analysis

    # Lighting intelligence
    if result.lighting_intelligence:
        response["lightingIntelligence"] = result.lighting_intelligence

    # Perception / robustness layer
    if result.face_validation:
        response["faceValidation"] = result.face_validation
    if result.signal_reliability:
        response["signalReliability"] = result.signal_reliability
    if result.edge_case_flags:
        response["edgeCaseFlags"] = result.edge_case_flags

    return response


# ── Master Modes listing ──

@router.get("/master-modes")
async def get_master_modes():
    """Return available master modes for the UI."""
    return {"modes": list_modes()}
