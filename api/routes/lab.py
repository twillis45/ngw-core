"""Lab API routes — protected by dev email whitelist.

Provides:
- Dev access check
- Full-fidelity image analysis (workbench)
- Gold set CRUD
- Rule candidate CRUD
- Batch evaluation
"""
from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from auth.dev_guard import get_dev_user
from db.database import (
    get_db,
    create_gold_set_entry,
    get_gold_set_entries,
    get_gold_set_entry,
    update_gold_set_entry,
    delete_gold_set_entry,
    create_rule_candidate,
    get_rule_candidates,
    get_rule_candidate,
    update_rule_candidate,
    delete_rule_candidate,
)

router = APIRouter(prefix="/lab", tags=["lab"])

UPLOAD_DIR = Path("data/uploads/lab")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tiff", ".tif"}
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/tiff",
}


async def _validate_upload(upload: UploadFile) -> bytes:
    """Read file contents and validate size + MIME type. Returns raw bytes."""
    content = await upload.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {_MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )
    ext = Path(upload.filename or "image.jpg").suffix.lower()
    ct = (upload.content_type or "").split(";")[0].strip().lower()
    if ext not in _ALLOWED_IMAGE_EXTS and ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext or ct}'. Please upload a JPEG, PNG, WebP, HEIC, or TIFF image.",
        )
    return content


# ── Models ────────────────────────────────────────────────

class GoldSetCreate(BaseModel):
    image_path: str
    expected_analysis: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    status: str = "draft"  # draft | approved | archived


class GoldSetUpdate(BaseModel):
    expected_analysis: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class RuleCandidateCreate(BaseModel):
    title: str
    description: str
    rationale: Optional[str] = None
    source_gold_set_id: Optional[str] = None
    proposed_change: Dict[str, Any] = Field(default_factory=dict)
    status: str = "proposed"  # proposed | accepted | rejected | implemented


class RuleCandidateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    rationale: Optional[str] = None
    proposed_change: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


# ── Status / Access Check ─────────────────────────────────

@router.get("/status")
async def lab_status(user: Dict = Depends(get_dev_user)):
    """Check dev access. Returns 200 if authorized, 403 otherwise."""
    return {
        "status": "ok",
        "user": user.get("email"),
        "lab_version": "0.1.0",
    }


# ── Workbench: Full-fidelity Analysis ─────────────────────

@router.post("/analyze")
async def lab_analyze(
    image: UploadFile = File(...),
    debug: bool = Query(False, description="Generate debug overlay image"),
    user: Dict = Depends(get_dev_user),
):
    """Run full pipeline analysis on an uploaded image.

    Returns complete model dumps for debugging/review.
    When debug=True, also generates a visual debug overlay showing
    all detected signals and returns the overlay URL.
    """
    content = await _validate_upload(image)
    # Save uploaded file
    ext = Path(image.filename or "image.jpg").suffix.lower() or ".jpg"
    fname = f"lab_{uuid.uuid4().hex[:12]}{ext}"
    fpath = UPLOAD_DIR / fname

    with open(fpath, "wb") as f:
        f.write(content)

    # Run full analysis pipeline via orchestrator
    try:
        from engine.orchestrator import analyze_image

        ar = analyze_image(str(fpath), run_extended=True, run_vlm=True, debug=debug)

        if not ar.ok:
            raise HTTPException(status_code=500, detail="; ".join(ar.notes))

        # ── Debug overlay generation (diagnostic only) ──
        debug_overlay_url = None
        if debug and ar.pipeline_results is not None:
            try:
                from engine.vision_debug import generate_analysis_overlay

                img_bgr = ar.debug_data.get("img_bgr")
                face_box = ar.debug_data.get("face_box")
                masks = ar.debug_data.get("masks", {})
                person_mask = masks.get("person") if isinstance(masks, dict) else None

                overlay_filename = f"overlay_{fpath.stem}_{uuid.uuid4().hex[:8]}.jpg"
                overlay_path = Path("static/debug") / overlay_filename

                saved_path = generate_analysis_overlay(
                    img_bgr,
                    ar.pipeline_results,
                    face_box=face_box,
                    person_mask=person_mask,
                    output_path=str(overlay_path),
                )
                if saved_path:
                    debug_overlay_url = f"/static/debug/{overlay_filename}"
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("Debug overlay failed: %s", exc)

        # Serialize VLM description for comparison view
        vlm_data = None
        vlm_desc = ar.vlm_description
        if vlm_desc and getattr(vlm_desc, "ok", False):
            vlm_data = vlm_desc.model_dump() if hasattr(vlm_desc, "model_dump") else vlm_desc.__dict__

        # Check VLM availability so UI can show button state
        try:
            from engine.vlm import vlm_available as _vlm_available
            vlm_is_available = _vlm_available()
        except Exception:
            vlm_is_available = False

        # Serialize CV vision data (strip numpy arrays)
        cv_data = {k: v for k, v in ar.vision_data.items() if not k.startswith("_")}

        # Lighting inference data
        lighting_data = ar.lighting_intel.model_dump() if hasattr(ar.lighting_intel, "model_dump") else {}

        # Solver result (new — enrichment from solver chain)
        solver_data = None
        if ar.solver_result and hasattr(ar.solver_result, "model_dump"):
            solver_data = ar.solver_result.model_dump()

        # Extract reconstruction + edge_case_flags from pipeline_results for the UI
        pipeline_recon = None
        pipeline_edge_flags = None
        if ar.pipeline_results:
            recon_pass = ar.pipeline_results.get("reconstruction", {})
            if recon_pass.get("ok"):
                pipeline_recon = {k: v for k, v in recon_pass.items() if k != "ok"}
            edge_flags = ar.pipeline_results.get("edge_case_flags")
            if edge_flags:
                pipeline_edge_flags = edge_flags if isinstance(edge_flags, dict) else {}

        # Also pull edge_case_flags from the AnalysisResult dataclass if available
        if pipeline_edge_flags is None and ar.edge_case_flags is not None:
            pipeline_edge_flags = (
                ar.edge_case_flags.model_dump()
                if hasattr(ar.edge_case_flags, "model_dump")
                else vars(ar.edge_case_flags)
            )

        response = {
            "status": "ok",
            "image_path": str(fpath),
            "description": ar.description,
            "reference_analysis": ar.reference_analysis.model_dump() if ar.reference_analysis else {},
            "vlm": vlm_data,
            "vlm_available": vlm_is_available,
            "vlm_reconstruction": ar.vlm_reconstruction,
            "cv": cv_data,
            "classification": ar.classification,
            "lighting_inference": lighting_data,
            "solver": solver_data,
            "reconstruction": pipeline_recon,
            "edge_case_flags": pipeline_edge_flags,
            "analyzed_by": user.get("email"),
            "analyzed_at": time.time(),
        }

        if debug_overlay_url:
            response["debug_overlay_url"] = debug_overlay_url

        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


def _generate_debug_overlay(raw: Dict[str, Any], image_path: Path) -> Optional[str]:
    """Run the extended vision pipeline and generate a debug overlay image.

    This is diagnostic-only — it does not change analysis outputs.
    Returns the URL path to the overlay image, or None on failure.
    """
    try:
        import numpy as np
        from engine.vision_passes import run_extended_pipeline
        from engine.vision_debug import generate_analysis_overlay

        img_bgr = raw.get("_debug_img_bgr")
        masks = raw.get("_debug_masks", {})
        face_box = raw.get("_debug_face_box")

        if img_bgr is None:
            return None

        # Extract masks
        person_mask = masks.get("person") if isinstance(masks, dict) else None
        skin_mask = masks.get("skin") if isinstance(masks, dict) else None
        background_mask = masks.get("background") if isinstance(masks, dict) else None

        # Existing catchlight + geometry data from the basic vision pipeline
        vision_data = raw.get("vision", {})
        existing_catchlights = vision_data.get("catchlights")
        existing_geometry = vision_data.get("pose")

        # Run the full extended pipeline (11 passes)
        pipeline_results = run_extended_pipeline(
            img_bgr,
            person_mask=person_mask,
            skin_mask=skin_mask,
            background_mask=background_mask,
            face_box=face_box,
            existing_catchlights=existing_catchlights,
            existing_geometry=existing_geometry,
        )

        # Generate overlay with unique filename
        overlay_filename = f"overlay_{image_path.stem}_{uuid.uuid4().hex[:8]}.jpg"
        overlay_path = Path("static/debug") / overlay_filename

        saved_path = generate_analysis_overlay(
            img_bgr,
            pipeline_results,
            face_box=face_box,
            person_mask=person_mask,
            output_path=str(overlay_path),
        )

        if saved_path:
            return f"/static/debug/{overlay_filename}"
        return None

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Debug overlay generation failed: %s", exc)
        return None


# ── Gold Set CRUD ─────────────────────────────────────────

@router.get("/gold-set")
async def list_gold_set(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: Dict = Depends(get_dev_user),
):
    """List gold set entries, optionally filtered by status."""
    entries = get_gold_set_entries(status=status, limit=limit)
    return {"entries": entries, "count": len(entries)}


@router.get("/gold-set/{entry_id}")
async def get_gold_set(entry_id: str, user: Dict = Depends(get_dev_user)):
    """Get a single gold set entry."""
    entry = get_gold_set_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Gold set entry not found")
    return entry


@router.post("/gold-set")
async def create_gold_set(body: GoldSetCreate, user: Dict = Depends(get_dev_user)):
    """Create a new gold set entry."""
    entry = create_gold_set_entry(
        image_path=body.image_path,
        expected_analysis=body.expected_analysis,
        notes=body.notes,
        status=body.status,
        created_by=user.get("email", "unknown"),
    )
    return entry


@router.put("/gold-set/{entry_id}")
async def update_gold_set(
    entry_id: str,
    body: GoldSetUpdate,
    user: Dict = Depends(get_dev_user),
):
    """Update a gold set entry."""
    existing = get_gold_set_entry(entry_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Gold set entry not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return existing

    entry = update_gold_set_entry(entry_id, **updates)
    return entry


@router.get("/gold-set/{entry_id}/image")
async def get_gold_set_image(entry_id: str, user: Dict = Depends(get_dev_user)):
    """Serve the image file associated with a gold set entry."""
    entry = get_gold_set_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Gold set entry not found")
    image_path = Path(entry.get("image_path", ""))
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    # Detect media type from suffix
    suffix = image_path.suffix.lower()
    media_type_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".heic": "image/heic", ".heif": "image/heif",
    }
    media_type = media_type_map.get(suffix, "image/jpeg")
    return FileResponse(str(image_path), media_type=media_type)


@router.delete("/gold-set/{entry_id}")
async def delete_gold_set(entry_id: str, user: Dict = Depends(get_dev_user)):
    """Delete a gold set entry."""
    deleted = delete_gold_set_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Gold set entry not found")
    return {"status": "deleted", "id": entry_id}


# ── Gold Set Evaluation ──────────────────────────────────

@router.post("/gold-set/evaluate")
async def evaluate_gold_set(
    limit: int = Query(50, ge=1, le=200),
    user: Dict = Depends(get_dev_user),
):
    """Run analysis pipeline on all approved gold set entries and compare results.

    Scaffold — returns structure ready for comparison logic.
    """
    entries = get_gold_set_entries(status="approved", limit=limit)
    results = []

    for entry in entries:
        image_path = entry.get("image_path", "")
        if not Path(image_path).exists():
            results.append({
                "entry_id": entry["id"],
                "image_path": image_path,
                "status": "skipped",
                "reason": "Image file not found",
            })
            continue

        try:
            from engine.orchestrator import analyze_image

            ar = analyze_image(image_path, run_extended=False, run_solver=False)
            if not ar.ok:
                raise RuntimeError("; ".join(ar.notes))

            actual_data = ar.reference_analysis.model_dump() if ar.reference_analysis else {}

            results.append({
                "entry_id": entry["id"],
                "image_path": image_path,
                "status": "analyzed",
                "expected": entry.get("expected_analysis", {}),
                "actual": actual_data,
            })
        except Exception as e:
            results.append({
                "entry_id": entry["id"],
                "image_path": image_path,
                "status": "error",
                "error": str(e),
            })

    return {
        "evaluated": len(results),
        "results": results,
        "evaluated_by": user.get("email"),
        "evaluated_at": time.time(),
    }


# ── Rule Candidates CRUD ─────────────────────────────────

@router.get("/candidates")
async def list_candidates(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: Dict = Depends(get_dev_user),
):
    """List rule candidates, optionally filtered by status."""
    candidates = get_rule_candidates(status=status, limit=limit)
    return {"candidates": candidates, "count": len(candidates)}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, user: Dict = Depends(get_dev_user)):
    """Get a single rule candidate."""
    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Rule candidate not found")
    return candidate


@router.post("/candidates")
async def create_candidate(body: RuleCandidateCreate, user: Dict = Depends(get_dev_user)):
    """Create a new rule candidate."""
    candidate = create_rule_candidate(
        title=body.title,
        description=body.description,
        rationale=body.rationale,
        source_gold_set_id=body.source_gold_set_id,
        proposed_change=body.proposed_change,
        status=body.status,
        created_by=user.get("email", "unknown"),
    )
    return candidate


@router.put("/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: str,
    body: RuleCandidateUpdate,
    user: Dict = Depends(get_dev_user),
):
    """Update a rule candidate."""
    existing = get_rule_candidate(candidate_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Rule candidate not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return existing

    candidate = update_rule_candidate(candidate_id, **updates)
    return candidate


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, user: Dict = Depends(get_dev_user)):
    """Delete a rule candidate."""
    deleted = delete_rule_candidate(candidate_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule candidate not found")
    return {"status": "deleted", "id": candidate_id}


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE IMAGE INGESTION
# ═══════════════════════════════════════════════════════════════════════════


class ReferenceIngestMetadata(BaseModel):
    """Metadata for ingesting a reference image."""
    reference_id: str
    pattern_id: str
    photographer: str = ""
    dataset_tier: str = "community"
    entry_trust_score: float = 0.5
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    environment: Optional[str] = None
    light_count: Optional[int] = None
    key_direction_deg: Optional[float] = None
    key_height_relative: Optional[str] = None
    shadow_pattern: Optional[str] = None
    modifier_family: Optional[str] = None
    estimated_distance_ft: Optional[float] = None
    matched_setup_ids: Optional[List[str]] = None
    notes: Optional[str] = None
    # Legacy fields
    lighting_pattern: Optional[str] = None
    lights: Optional[List[Dict[str, Any]]] = None
    shadow_signature: Optional[Dict[str, str]] = None
    camera: Optional[Dict[str, Any]] = None
    use_cases: Optional[List[str]] = None
    lighting_notes: Optional[str] = None


REFERENCE_UPLOAD_DIR = Path("data/uploads/reference_ingest")
REFERENCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/reference-library/ingest")
async def ingest_reference_image(
    image: UploadFile = File(...),
    metadata_json: str = Query(..., description="JSON string of ReferenceIngestMetadata"),
    overwrite: bool = Query(False, description="Overwrite existing files"),
    user: Dict = Depends(get_dev_user),
):
    """Ingest a reference image with validated metadata.

    Saves image to data/reference_library/<pattern_id>/, writes a sidecar
    JSON alongside it, and rebuilds the central reference_index.json.

    The metadata_json query parameter should be a JSON string matching
    the ReferenceIngestMetadata schema.
    """
    from engine.reference_ingestion import ingest_reference as _ingest
    from engine.reference_matcher import reload_references

    image_content = await _validate_upload(image)

    # Parse metadata
    try:
        meta_raw = json.loads(metadata_json)
        meta_model = ReferenceIngestMetadata(**meta_raw)
        metadata = meta_model.model_dump(exclude_none=True)
    except (json.JSONDecodeError, Exception) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc}")

    # Save uploaded image to temp location
    ext = Path(image.filename or "image.jpg").suffix.lower() or ".jpg"
    fname = f"{metadata.get('reference_id', 'unknown')}{ext}"
    tmp_path = REFERENCE_UPLOAD_DIR / fname

    with open(tmp_path, "wb") as f:
        f.write(image_content)

    try:
        result = _ingest(
            tmp_path,
            metadata,
            overwrite=overwrite,
        )

        # Reload matcher cache so scoring picks up new entry
        try:
            reload_references()
        except Exception:
            pass

        result["ingested_by"] = user.get("email")
        return result

    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}")
    finally:
        # Clean up temp file (already copied to pattern folder)
        if tmp_path.exists():
            tmp_path.unlink()


@router.post("/reference-library/rebuild-index")
async def rebuild_reference_index(user: Dict = Depends(get_dev_user)):
    """Rebuild the central reference_index.json from sidecar files.

    Scans all pattern subfolders for *.json sidecar files, merges with
    legacy references.json entries, and writes data/reference_index.json.
    """
    from engine.reference_ingestion import rebuild_index as _rebuild
    from engine.reference_matcher import reload_references

    try:
        index = _rebuild()
        reload_references()
        return {
            "status": "ok",
            "total_entries": index.get("total_entries", 0),
            "image_backed_count": index.get("image_backed_count", 0),
            "legacy_count": index.get("legacy_count", 0),
            "rebuilt_by": user.get("email"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Index rebuild failed: {exc}")


@router.post("/reference-library/generate-legacy-sidecars")
async def generate_sidecars_for_legacy(
    dry_run: bool = Query(False),
    user: Dict = Depends(get_dev_user),
):
    """Generate sidecar JSON stubs for existing references.json entries.

    Creates pattern subfolders and sidecar metadata files for each legacy
    reference entry.  Use dry_run=True to preview without writing.
    """
    from engine.reference_ingestion import generate_legacy_sidecars as _generate
    from engine.reference_ingestion import rebuild_index as _rebuild
    from engine.reference_matcher import reload_references

    try:
        results = _generate(dry_run=dry_run)

        created = sum(1 for r in results if r["status"] in ("created", "would_create"))
        existing = sum(1 for r in results if r["status"] == "already_exists")

        response: Dict[str, Any] = {
            "status": "ok",
            "dry_run": dry_run,
            "created": created,
            "already_existed": existing,
            "results": results,
        }

        if not dry_run and created > 0:
            index = _rebuild()
            reload_references()
            response["index_total_entries"] = index.get("total_entries", 0)

        return response

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sidecar generation failed: {exc}")


@router.post("/reference-library/validate")
async def validate_reference_metadata(
    metadata: Dict[str, Any],
    user: Dict = Depends(get_dev_user),
):
    """Validate reference metadata without ingesting.

    Returns validation result with any errors found.
    """
    from engine.reference_ingestion import validate_metadata as _validate

    is_valid, errors = _validate(metadata)
    return {
        "valid": is_valid,
        "errors": errors,
        "reference_id": metadata.get("reference_id"),
        "pattern_id": metadata.get("pattern_id"),
    }


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE LIBRARY MANAGEMENT (legacy CRUD)
# ═══════════════════════════════════════════════════════════════════════════

_REFERENCE_LIBRARY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "reference_library" / "references.json"


def _load_reference_library() -> List[Dict[str, Any]]:
    """Load reference library from disk."""
    try:
        with open(_REFERENCE_LIBRARY_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return []


def _save_reference_library(entries: List[Dict[str, Any]]) -> None:
    """Save reference library to disk."""
    with open(_REFERENCE_LIBRARY_PATH, "w") as f:
        json.dump(entries, f, indent=2)


class ReferenceEntryCreate(BaseModel):
    reference_id: str
    photographer: str = ""
    lighting_pattern: str
    environment: str = "studio"
    lights: List[Dict[str, Any]] = Field(default_factory=list)
    shadow_signature: Dict[str, str] = Field(default_factory=dict)
    camera: Dict[str, Any] = Field(default_factory=dict)
    use_cases: List[str] = Field(default_factory=list)
    dataset_tier: str = "community"
    entry_trust_score: float = 0.5


class ReferenceEntryUpdate(BaseModel):
    photographer: Optional[str] = None
    lighting_pattern: Optional[str] = None
    environment: Optional[str] = None
    lights: Optional[List[Dict[str, Any]]] = None
    shadow_signature: Optional[Dict[str, str]] = None
    camera: Optional[Dict[str, Any]] = None
    use_cases: Optional[List[str]] = None
    dataset_tier: Optional[str] = None
    entry_trust_score: Optional[float] = None


@router.get("/reference-library")
async def list_reference_entries(
    tier: Optional[str] = Query(None, description="Filter by dataset_tier"),
    user: Dict = Depends(get_dev_user),
):
    """List all reference library entries, optionally filtered by tier."""
    entries = _load_reference_library()
    if tier:
        entries = [e for e in entries if e.get("dataset_tier") == tier]
    return {"entries": entries, "total": len(entries)}


@router.get("/reference-library/{reference_id}")
async def get_reference_entry(reference_id: str, user: Dict = Depends(get_dev_user)):
    """Get a single reference entry by ID."""
    entries = _load_reference_library()
    for e in entries:
        if e.get("reference_id") == reference_id:
            return e
    raise HTTPException(status_code=404, detail="Reference entry not found")


@router.post("/reference-library")
async def create_reference_entry(body: ReferenceEntryCreate, user: Dict = Depends(get_dev_user)):
    """Create a new reference library entry.

    Community entries start with trust_score=0.5.
    Only LAB can promote to gold tier.
    """
    entries = _load_reference_library()

    # Check for duplicate ID
    for e in entries:
        if e.get("reference_id") == body.reference_id:
            raise HTTPException(status_code=409, detail=f"Reference ID '{body.reference_id}' already exists")

    new_entry = body.model_dump()
    entries.append(new_entry)
    _save_reference_library(entries)

    # Reload matcher cache
    try:
        from engine.reference_matcher import reload_references
        reload_references()
    except Exception:
        pass

    return new_entry


@router.put("/reference-library/{reference_id}")
async def update_reference_entry(
    reference_id: str,
    body: ReferenceEntryUpdate,
    user: Dict = Depends(get_dev_user),
):
    """Update an existing reference entry.

    This is the ONLY way to promote an entry to gold tier.
    """
    entries = _load_reference_library()

    target = None
    for e in entries:
        if e.get("reference_id") == reference_id:
            target = e
            break

    if target is None:
        raise HTTPException(status_code=404, detail="Reference entry not found")

    updates = body.model_dump(exclude_none=True)
    target.update(updates)
    _save_reference_library(entries)

    # Reload matcher cache
    try:
        from engine.reference_matcher import reload_references
        reload_references()
    except Exception:
        pass

    return target


@router.delete("/reference-library/{reference_id}")
async def delete_reference_entry(reference_id: str, user: Dict = Depends(get_dev_user)):
    """Delete a reference entry."""
    entries = _load_reference_library()
    original_len = len(entries)
    entries = [e for e in entries if e.get("reference_id") != reference_id]

    if len(entries) == original_len:
        raise HTTPException(status_code=404, detail="Reference entry not found")

    _save_reference_library(entries)

    try:
        from engine.reference_matcher import reload_references
        reload_references()
    except Exception:
        pass

    return {"status": "deleted", "id": reference_id}


@router.post("/reference-library/from-reconstruction")
async def create_reference_from_reconstruction(
    reconstruction: Dict[str, Any],
    photographer: str = "",
    lighting_pattern: str = "",
    reference_id: Optional[str] = None,
    user: Dict = Depends(get_dev_user),
):
    """Convert a validated reconstruction into a new reference entry.

    Creates a community-tier entry from reconstruction output.
    LAB must review and promote to gold via PUT.
    """
    if not reference_id:
        reference_id = f"lab_{uuid.uuid4().hex[:8]}"

    # Build light config from reconstruction
    lights = []
    key_light = {
        "role": "key",
        "modifier": reconstruction.get("primary_modifier_hypothesis", "unknown"),
        "angle_deg": reconstruction.get("key_light_angle_deg", 0),
        "height_deg": 0,
        "distance_ft": reconstruction.get("estimated_source_distance_ft")
                       or reconstruction.get("modifier_distance_ft", 5),
    }
    # Map height string to degrees
    height_str = reconstruction.get("key_light_height", "eye_level")
    _height_map = {
        "below_eye_level": -10, "eye_level": 0,
        "above_eye_level": 20, "high": 40,
    }
    key_light["height_deg"] = _height_map.get(height_str, 0)
    lights.append(key_light)

    if reconstruction.get("fill_present"):
        lights.append({"role": "fill", "modifier": "unknown"})

    # Shadow signature
    shadow_sig = {}
    softness = reconstruction.get("shadow_softness")
    if softness is not None:
        if softness > 0.7:
            shadow_sig["nose_shadow"] = "minimal"
            shadow_sig["cheek_shadow"] = "minimal"
        elif softness > 0.4:
            shadow_sig["nose_shadow"] = "soft"
            shadow_sig["cheek_shadow"] = "moderate"
        else:
            shadow_sig["nose_shadow"] = "visible"
            shadow_sig["cheek_shadow"] = "strong"

    entry = {
        "reference_id": reference_id,
        "photographer": photographer,
        "lighting_pattern": lighting_pattern,
        "environment": reconstruction.get("environment_class", "studio"),
        "lights": lights,
        "shadow_signature": shadow_sig,
        "camera": {
            "height_relative": reconstruction.get("camera_height_relative_to_subject", "eye_level"),
        },
        "use_cases": [],
        "dataset_tier": "community",
        "entry_trust_score": 0.5,
    }

    entries = _load_reference_library()
    entries.append(entry)
    _save_reference_library(entries)

    try:
        from engine.reference_matcher import reload_references
        reload_references()
    except Exception:
        pass

    return entry


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE DATASET (image-backed, pipeline-processed references)
# ═══════════════════════════════════════════════════════════════════════════


class ReferenceDatasetIngestMeta(BaseModel):
    """Metadata for dataset reference image ingestion."""
    reference_id: str
    pattern_id: str
    photographer: str = ""
    dataset_tier: str = "community"
    entry_trust_score: float = 0.5
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    environment: Optional[str] = None
    light_count: Optional[int] = None
    key_direction_deg: Optional[float] = None
    key_height_relative: Optional[str] = None
    shadow_pattern: Optional[str] = None
    modifier_family: Optional[str] = None
    estimated_distance_ft: Optional[float] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    title: Optional[str] = None
    # Archetype-related fields
    style_family: Optional[str] = None          # beauty|editorial|dramatic|natural|high_key|low_key
    catchlight_pattern: Optional[str] = None    # single|dual|triangular|strip|ring
    underfill_ev: Optional[float] = None        # EV difference key vs fill
    separation_light_type: Optional[str] = None # hair|rim|kicker|none
    source_type_candidates: Optional[List[str]] = None  # ["continuous_led", "strobe"]
    light_technology: Optional[str] = None      # continuous_led|continuous_panel|strobe|flash|mixed
    master_profile_id: Optional[str] = None     # penn|karsh|leibovitz|hurley|etc


DATASET_UPLOAD_DIR = Path("data/uploads/reference_dataset")
DATASET_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/reference-dataset/ingest")
async def ingest_dataset_reference(
    image: UploadFile = File(...),
    metadata_json: str = Query(..., description="JSON string of metadata"),
    run_pipeline: bool = Query(True, description="Run full vision pipeline"),
    run_vlm: bool = Query(True, description="Run VLM reconstruction"),
    overwrite: bool = Query(False, description="Overwrite existing entry"),
    user: Dict = Depends(get_dev_user),
):
    """Ingest a reference image into the reference dataset.

    Runs the full extended vision pipeline, stores signals, VLM reconstruction,
    debug overlay, and metadata.

    The metadata_json query parameter should be a JSON string matching
    the ReferenceDatasetIngestMeta schema.
    """
    from engine.reference_dataset import ingest_reference_image as _ingest

    image_content = await _validate_upload(image)

    # Parse metadata
    try:
        meta_raw = json.loads(metadata_json)
        meta_model = ReferenceDatasetIngestMeta(**meta_raw)
        metadata = meta_model.model_dump(exclude_none=True)
    except (json.JSONDecodeError, Exception) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc}")

    # Save uploaded image to temp location
    ext = Path(image.filename or "image.jpg").suffix.lower() or ".jpg"
    fname = f"{metadata.get('reference_id', 'unknown')}{ext}"
    tmp_path = DATASET_UPLOAD_DIR / fname

    with open(tmp_path, "wb") as f:
        f.write(image_content)

    try:
        result = _ingest(
            tmp_path,
            metadata,
            run_pipeline=run_pipeline,
            run_vlm=run_vlm,
            overwrite=overwrite,
        )
        result["ingested_by"] = user.get("email")
        return result

    except (ValueError, FileNotFoundError, FileExistsError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Dataset ingestion failed: {exc}")
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


@router.get("/reference-dataset")
async def list_dataset_entries(
    pattern_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="draft | approved | rejected"),
    tier: Optional[str] = Query(None, description="gold | community | synthetic"),
    user: Dict = Depends(get_dev_user),
):
    """List reference dataset entries with optional filters."""
    from engine.reference_dataset import list_entries

    entries = list_entries(pattern_id=pattern_id, status=status, tier=tier)
    return {"entries": entries, "count": len(entries)}


@router.get("/reference-dataset/version")
async def get_dataset_version_info(user: Dict = Depends(get_dev_user)):
    """Get dataset version information."""
    from engine.reference_dataset import get_dataset_version

    return get_dataset_version()


@router.get("/reference-dataset/manifest")
async def get_dataset_manifest(user: Dict = Depends(get_dev_user)):
    """Export full dataset manifest with statistics."""
    from engine.reference_dataset import export_dataset_manifest

    return export_dataset_manifest()


@router.get("/reference-dataset/{pattern_id}/{reference_id}")
async def get_dataset_entry(
    pattern_id: str,
    reference_id: str,
    include_signals: bool = Query(True),
    include_vlm: bool = Query(True),
    user: Dict = Depends(get_dev_user),
):
    """Get a single reference dataset entry with full data."""
    from engine.reference_dataset import get_entry

    entry = get_entry(
        pattern_id, reference_id,
        include_signals=include_signals,
        include_vlm=include_vlm,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Dataset entry not found")
    return entry


@router.get("/reference-dataset/{pattern_id}/{reference_id}/image")
async def serve_dataset_image(
    pattern_id: str,
    reference_id: str,
    user: Dict = Depends(get_dev_user),
):
    """Serve the original reference image."""
    from fastapi.responses import FileResponse
    from engine.reference_dataset import DATASET_ROOT

    image_path = DATASET_ROOT / pattern_id / reference_id / "image.jpg"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(image_path), media_type="image/jpeg")


@router.get("/reference-dataset/{pattern_id}/{reference_id}/thumbnail")
async def serve_dataset_thumbnail(
    pattern_id: str,
    reference_id: str,
    user: Dict = Depends(get_dev_user),
):
    """Serve the thumbnail image."""
    from fastapi.responses import FileResponse
    from engine.reference_dataset import DATASET_ROOT

    thumb_path = DATASET_ROOT / pattern_id / reference_id / "thumbnail.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.get("/reference-dataset/{pattern_id}/{reference_id}/debug-overlay")
async def serve_dataset_debug_overlay(
    pattern_id: str,
    reference_id: str,
    user: Dict = Depends(get_dev_user),
):
    """Serve the debug overlay image."""
    from fastapi.responses import FileResponse
    from engine.reference_dataset import DATASET_ROOT

    overlay_path = DATASET_ROOT / pattern_id / reference_id / "debug_overlay.png"
    if not overlay_path.exists():
        raise HTTPException(status_code=404, detail="Debug overlay not found")
    return FileResponse(str(overlay_path), media_type="image/png")


@router.post("/reference-dataset/{pattern_id}/{reference_id}/approve")
async def approve_dataset_entry(
    pattern_id: str,
    reference_id: str,
    user: Dict = Depends(get_dev_user),
):
    """Approve a reference dataset entry."""
    from engine.reference_dataset import approve_entry

    try:
        meta = approve_entry(
            pattern_id, reference_id,
            approved_by=user.get("email", "unknown"),
        )
        return {"status": "approved", "metadata": meta}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/reference-dataset/{pattern_id}/{reference_id}/reject")
async def reject_dataset_entry(
    pattern_id: str,
    reference_id: str,
    reason: str = Query("", description="Rejection reason"),
    user: Dict = Depends(get_dev_user),
):
    """Reject a reference dataset entry."""
    from engine.reference_dataset import reject_entry

    try:
        meta = reject_entry(pattern_id, reference_id, reason=reason)
        return {"status": "rejected", "metadata": meta}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/vlm-corrections")
async def vlm_corrections(user: Dict = Depends(get_dev_user)):
    """Summary of VLM overrides/enrichments vs CV — reveals systematic CV gaps."""
    from engine.vlm_improvement_log import read_improvement_summary
    return read_improvement_summary()


class ReferenceDatasetMetadataUpdate(BaseModel):
    """Partial metadata update for a reference dataset entry.

    Only user-owned fields are accepted.  System-managed fields
    (reference_id, pattern_id, approval_status, ingested_at, etc.)
    are stripped server-side even if submitted.
    """
    photographer: Optional[str] = None
    title: Optional[str] = None
    dataset_tier: Optional[str] = None          # gold | community | synthetic
    entry_trust_score: Optional[float] = None   # 0.0 – 1.0
    source_type: Optional[str] = None           # original_photo | screenshot | studio_test | found_online | book_scan | ai_generated
    source_url: Optional[str] = None
    environment: Optional[str] = None           # studio | natural | window_light | outdoor | mixed | unknown
    light_count: Optional[int] = None
    key_direction_deg: Optional[float] = None   # 0 – 360
    key_height_relative: Optional[str] = None   # below_eye_level | eye_level | above_eye_level | high | overhead
    shadow_pattern: Optional[str] = None
    modifier_family: Optional[str] = None
    estimated_distance_ft: Optional[float] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    # Archetype
    style_family: Optional[str] = None          # beauty | editorial | dramatic | natural | high_key | low_key
    catchlight_pattern: Optional[str] = None    # single | dual | triangular | strip | ring
    underfill_ev: Optional[float] = None
    separation_light_type: Optional[str] = None # hair | rim | kicker | none
    light_technology: Optional[str] = None      # continuous_led | continuous_panel | strobe | flash | mixed
    master_profile_id: Optional[str] = None


@router.patch("/reference-dataset/{pattern_id}/{reference_id}")
async def update_dataset_entry_metadata(
    pattern_id: str,
    reference_id: str,
    body: ReferenceDatasetMetadataUpdate,
    user: Dict = Depends(get_dev_user),
):
    """Partially update user-owned metadata fields for a reference dataset entry.

    Enum fields are validated server-side.  System fields are ignored.
    """
    from engine.reference_dataset import update_reference_metadata

    # Only send fields that were explicitly set (not None by default)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    try:
        updated = update_reference_metadata(pattern_id, reference_id, updates)
        return {"ok": True, "metadata": updated, "updated_by": user.get("email")}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Update failed: {exc}")


@router.post("/reference-dataset/{pattern_id}/{reference_id}/reprocess")
async def reprocess_dataset_entry(
    pattern_id: str,
    reference_id: str,
    run_vlm: bool = Query(True),
    user: Dict = Depends(get_dev_user),
):
    """Re-run the pipeline and VLM on an existing entry."""
    from engine.reference_dataset import reprocess_entry

    try:
        result = reprocess_entry(
            pattern_id, reference_id,
            run_vlm=run_vlm,
        )
        result["reprocessed_by"] = user.get("email")
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {exc}")
