"""Admin API for managing lighting systems, image ground truth, and feedback."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from auth.dev_guard import get_dev_user
from pydantic import BaseModel, Field

import time as _time

from db.database import (
    get_admin_changelog,
    get_feedback_aggregates,
    get_image_ground_truths,
    get_image_correction_log,
    get_vlm_disagreements,
    get_feedback_calibration,
    log_admin_change,
    refresh_feedback_aggregates,
    save_image_ground_truth,
    save_truth_and_log_corrections,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_dev_user)])

SYSTEMS_PATH = Path("data/lighting_systems.json")
PATCH_PATH = Path("data/systems_patch.json")

REQUIRED_CRITERIA = {"brightness", "energy_efficiency", "color_accuracy", "lifespan_hours", "cost_effectiveness"}


# ── Helpers ───────────────────────────────────────────────

def _load_systems_file() -> Dict[str, Any]:
    with open(SYSTEMS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_systems_file(data: Dict[str, Any]) -> None:
    data["total_systems"] = len(data["systems"])
    fd, tmp = tempfile.mkstemp(dir=SYSTEMS_PATH.parent, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, SYSTEMS_PATH)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _validate_system(system: Dict[str, Any], require_id: bool = True) -> None:
    if require_id and not system.get("id"):
        raise HTTPException(status_code=422, detail="System must have an 'id'")
    if not system.get("name"):
        raise HTTPException(status_code=422, detail="System must have a 'name'")
    criteria = system.get("criteria", {})
    missing = REQUIRED_CRITERIA - set(criteria.keys())
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing criteria fields: {sorted(missing)}")
    if not system.get("features"):
        raise HTTPException(status_code=422, detail="System must have 'features'")
    if not system.get("taxonomy_refs"):
        raise HTTPException(status_code=422, detail="System must have 'taxonomy_refs'")


# ── Systems CRUD ──────────────────────────────────────────

@router.get("/systems")
def list_systems(mood: Optional[str] = Query(None)) -> Dict[str, Any]:
    data = _load_systems_file()
    systems = data["systems"]
    if mood:
        systems = [s for s in systems if s.get("taxonomy_refs", {}).get("mood") == mood]
    return {"total": len(systems), "systems": systems}


@router.get("/systems/{system_id}")
def get_system(system_id: str) -> Dict[str, Any]:
    data = _load_systems_file()
    for s in data["systems"]:
        if s["id"] == system_id:
            return s
    raise HTTPException(status_code=404, detail=f"System '{system_id}' not found")


class SystemCreateRequest(BaseModel):
    id: str
    name: str
    criteria: Dict[str, Any]
    features: Dict[str, Any]
    taxonomy_refs: Dict[str, Any]
    modifier: float = Field(default=1.0)
    why_this_works: str = ""
    failure_modes: List[str] = Field(default_factory=list)
    substitutions: List[Dict[str, Any]] = Field(default_factory=list)
    difficulty: int = 2
    setup_time_minutes: int = 15


@router.post("/systems", status_code=201)
def create_system(req: SystemCreateRequest) -> Dict[str, Any]:
    system = req.model_dump()
    _validate_system(system)

    data = _load_systems_file()
    existing_ids = {s["id"] for s in data["systems"]}
    if system["id"] in existing_ids:
        raise HTTPException(status_code=409, detail=f"System '{system['id']}' already exists")

    data["systems"].append(system)
    _save_systems_file(data)
    log_admin_change("system", system["id"], "create", {"after": system})
    return system


class SystemUpdateRequest(BaseModel):
    name: Optional[str] = None
    criteria: Optional[Dict[str, Any]] = None
    features: Optional[Dict[str, Any]] = None
    taxonomy_refs: Optional[Dict[str, Any]] = None
    modifier: Optional[float] = None
    why_this_works: Optional[str] = None
    failure_modes: Optional[List[str]] = None
    substitutions: Optional[List[Dict[str, Any]]] = None
    difficulty: Optional[int] = None
    setup_time_minutes: Optional[int] = None


@router.put("/systems/{system_id}")
def update_system(system_id: str, req: SystemUpdateRequest) -> Dict[str, Any]:
    data = _load_systems_file()
    target = None
    for s in data["systems"]:
        if s["id"] == system_id:
            target = s
            break
    if target is None:
        raise HTTPException(status_code=404, detail=f"System '{system_id}' not found")

    before = dict(target)
    updates = req.model_dump(exclude_none=True)
    target.update(updates)

    _save_systems_file(data)
    log_admin_change("system", system_id, "update", {"before": before, "after": dict(target)})
    return target


@router.delete("/systems/{system_id}")
def delete_system(system_id: str) -> Dict[str, str]:
    data = _load_systems_file()
    original_len = len(data["systems"])
    data["systems"] = [s for s in data["systems"] if s["id"] != system_id]
    if len(data["systems"]) == original_len:
        raise HTTPException(status_code=404, detail=f"System '{system_id}' not found")

    _save_systems_file(data)
    log_admin_change("system", system_id, "delete", {"removed": system_id})
    return {"status": "deleted", "id": system_id}


@router.post("/systems/merge-patch")
def merge_patch() -> Dict[str, Any]:
    if not PATCH_PATH.exists():
        raise HTTPException(status_code=404, detail="No systems_patch.json found")

    with open(PATCH_PATH, encoding="utf-8") as f:
        patch_systems = json.load(f)

    if not isinstance(patch_systems, list):
        raise HTTPException(status_code=422, detail="Patch file must be a JSON array")

    data = _load_systems_file()
    existing_ids = {s["id"] for s in data["systems"]}

    added = []
    for ps in patch_systems:
        if ps.get("id") not in existing_ids:
            data["systems"].append(ps)
            existing_ids.add(ps["id"])
            added.append(ps["id"])

    _save_systems_file(data)
    log_admin_change("system", "batch", "merge", {"added_ids": added, "source": "systems_patch.json"})
    return {"merged": len(added), "added_ids": added, "total_systems": data["total_systems"]}


# ── Image Ground Truth ────────────────────────────────────

class ImageLabelRequest(BaseModel):
    image_path: str
    expected_mood: Optional[str] = None
    expected_pattern: Optional[str] = None
    actual_mood: Optional[str] = None
    actual_pattern: Optional[str] = None
    corrections: Optional[Dict[str, Any]] = None
    # Analysis traceability (Phase 4b)
    analysis_id:    Optional[str] = None
    system_version: Optional[str] = None


@router.post("/image-labels", status_code=201)
def create_image_label(req: ImageLabelRequest, user: Dict = Depends(get_dev_user)) -> Dict[str, Any]:
    corrected_by = user.get("email", "admin")
    corrected_at = str(_time.time())

    # Build correction-log entries for each field explicitly set
    _correction_fields = [
        ("expected_pattern", req.expected_pattern),
        ("expected_mood",    req.expected_mood),
        ("actual_pattern",   req.actual_pattern),
        ("actual_mood",      req.actual_mood),
    ]
    log_entries = [
        {
            "corrected_by":   corrected_by,
            "corrected_at":   corrected_at,
            "field_name":     field_name,
            "new_value":      str(value),
            "old_value":      None,  # Phase 4b: no prior-state diff
            "analysis_id":    req.analysis_id,
            "system_version": req.system_version,
            "source":         "admin",
        }
        for field_name, value in _correction_fields
        if value is not None
    ]

    result = save_truth_and_log_corrections(
        image_path=req.image_path,
        expected_mood=req.expected_mood,
        expected_pattern=req.expected_pattern,
        actual_mood=req.actual_mood,
        actual_pattern=req.actual_pattern,
        corrections=req.corrections,
        correction_log_entries=log_entries,
    )
    log_admin_change("image_label", result["id"], "create", req.model_dump())
    return result


@router.get("/image-labels")
def list_image_labels(limit: int = Query(100, ge=1, le=500)) -> Dict[str, Any]:
    labels = get_image_ground_truths(limit=limit)
    return {"total": len(labels), "labels": labels}


# ── Feedback Summary ──────────────────────────────────────

@router.get("/feedback-summary")
def feedback_summary() -> Dict[str, Any]:
    aggregates = get_feedback_aggregates()
    return {"total": len(aggregates), "aggregates": aggregates}


@router.post("/feedback-summary/refresh")
def refresh_summary() -> Dict[str, Any]:
    count = refresh_feedback_aggregates()
    return {"refreshed": count}


# ── Changelog ─────────────────────────────────────────────

@router.get("/changelog")
def changelog(limit: int = Query(50, ge=1, le=500)) -> Dict[str, Any]:
    entries = get_admin_changelog(limit=limit)
    return {"total": len(entries), "entries": entries}


# ── Phase 5a: Calibration data surfaces ───────────────────────────────────────

@router.get("/vlm-disagreements")
def list_vlm_disagreements(
    analysis_id:      Optional[str] = Query(None),
    pipeline_version: Optional[str] = Query(None),
    field_name:       Optional[str] = Query(None),
    agreement:        Optional[str] = Query(None),
    limit:            int           = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    """Phase 5a — read VLM disagreement records persisted during analysis.

    Diagnostic only. Supports filtering by analysis_id, pipeline_version,
    field_name (e.g. 'pattern'), and agreement ('confirmed' | 'conflicting' | 'vlm_only').
    """
    rows = get_vlm_disagreements(
        analysis_id=analysis_id,
        pipeline_version=pipeline_version,
        field_name=field_name,
        agreement=agreement,
        limit=limit,
    )
    return {"total": len(rows), "records": rows}


@router.get("/correction-log")
def list_correction_log(
    image_path:  Optional[str] = Query(None),
    field_name:  Optional[str] = Query(None),
    analysis_id: Optional[str] = Query(None),
    limit:       int           = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    """Phase 5a — read image correction log entries.

    Append-only history of admin corrections to image ground truth labels.
    Supports filtering by image_path, field_name, and analysis_id.
    """
    rows = get_image_correction_log(
        image_path=image_path,
        field_name=field_name,
        analysis_id=analysis_id,
        limit=limit,
    )
    return {"total": len(rows), "entries": rows}


@router.get("/feedback-calibration")
def feedback_calibration(
    system_version: Optional[str] = Query(None),
    limit:          int           = Query(200, ge=1, le=500),
) -> Dict[str, Any]:
    """Phase 5a — per-pattern feedback aggregates for calibration diagnostics.

    Only includes rows with analysis_id IS NOT NULL (traceable feedback).
    Optionally filter by system_version to scope to a specific pipeline release.
    Outputs are diagnostic only — not used for automatic threshold updates.
    """
    rows = get_feedback_calibration(system_version=system_version, limit=limit)
    return {
        "total":          len(rows),
        "system_version": system_version,
        "note":           "Diagnostic only. Traceable feedback rows only (analysis_id IS NOT NULL).",
        "patterns":       rows,
    }


# ── Phase 5c: Distillation candidate reviews ──────────────────────────────────

from db.distillation_reviews import (  # noqa: E402
    VALID_STATUSES,
    get_reviews,
    get_review,
    update_review,
    insert_from_workbench,
)


class DistillationReviewUpdateRequest(BaseModel):
    review_status: str
    rationale: str = ""
    notes: str = ""


@router.get("/distillation-reviews")
def list_distillation_reviews(
    review_status: Optional[str] = Query(None),
    path_type:     Optional[str] = Query(None),
    entry_type:    Optional[str] = Query(None),
    limit:         int           = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    """Phase 5c — list distillation candidate review rows.

    Supports filtering by review_status, path_type, and entry_type.
    Results are ordered by entry_type ASC, expected_pattern ASC.
    """
    if review_status is not None and review_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid review_status {review_status!r}. Must be one of: {sorted(VALID_STATUSES)}",
        )
    rows = get_reviews(
        status=review_status,
        path_type=path_type,
        entry_type=entry_type,
        limit=limit,
    )
    return {"total": len(rows), "reviews": rows}


@router.get("/distillation-reviews/{review_id}")
def get_distillation_review(review_id: str) -> Dict[str, Any]:
    """Phase 5c — get a single distillation candidate review row by id."""
    row = get_review(review_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Review '{review_id}' not found")
    return row


@router.patch("/distillation-reviews/{review_id}")
def patch_distillation_review(
    review_id: str,
    req: DistillationReviewUpdateRequest,
    user: Dict = Depends(get_dev_user),
) -> Dict[str, Any]:
    """Phase 5c — update the review decision for one distillation candidate.

    Only review_status, reviewer, reviewed_at, rationale, and notes are modified.
    Source facts (expected_pattern, predicted_pattern, confidence, path_type, etc.)
    are never touched.

    Raises 422 if review_status is invalid, 404 if the row does not exist.
    """
    reviewer = user.get("email", "admin")
    try:
        updated = update_review(
            review_id=review_id,
            review_status=req.review_status,
            reviewer=reviewer,
            rationale=req.rationale,
            notes=req.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail=f"Review '{review_id}' not found")
    return updated


class WorkbenchTeachRequest(BaseModel):
    image_path: str
    predicted_pattern: str
    expected_pattern: str          # same as predicted when correct; correction when wrong
    confidence: float = 0.0
    path_type: str = "primary"
    correctness: str               # "correct" | "incorrect"
    notes: str = ""


@router.post("/distillation-reviews/from-workbench")
def teach_from_workbench(
    req: WorkbenchTeachRequest,
    user: Dict = Depends(get_dev_user),
) -> Dict[str, Any]:
    """Record a teach label from the Lab Workbench.

    Creates a distillation_candidate_review row keyed by image_path.
    Idempotent — repeated submits for the same image return the existing row.

    review_status is set to 'approved_candidate' when correctness='correct',
    'pending_review' when correctness='incorrect'.
    """
    reviewer = user.get("email", "admin")
    row = insert_from_workbench(
        image_path=req.image_path,
        predicted_pattern=req.predicted_pattern,
        expected_pattern=req.expected_pattern,
        confidence=req.confidence,
        path_type=req.path_type,
        correctness=req.correctness,
        reviewer=reviewer,
        notes=req.notes,
    )

    # Also record a live signal for the learning loop when marked correct
    if req.correctness == "correct":
        try:
            from db.signals import record_signal
            record_signal(
                pattern_id=req.expected_pattern,
                confidence_score=req.confidence,
                outcome="nailed_it",
                input_method="reference_photo",
                signal_source="internal",
                image_path=req.image_path,
                analysis_id=None,
            )
        except Exception:
            pass  # non-fatal — don't fail the teach label if signal write fails

    return {"status": "ok", "review": row}


@router.get("/distillation-reviews/{review_id}/image")
def get_distillation_review_image(
    review_id: str,
    user: Dict = Depends(get_dev_user),
):
    """Serve the image file associated with a distillation review entry."""
    row = get_review(review_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Review '{review_id}' not found")
    image_path = Path(row.get("image_path", ""))
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    suffix = image_path.suffix.lower()
    media_type_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
    }
    media_type = media_type_map.get(suffix, "application/octet-stream")
    return FileResponse(str(image_path), media_type=media_type)
