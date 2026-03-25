"""Admin API for managing lighting systems, image ground truth, and feedback."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from auth.dev_guard import get_dev_user
from pydantic import BaseModel, Field

from db.database import (
    get_admin_changelog,
    get_feedback_aggregates,
    get_image_ground_truths,
    log_admin_change,
    refresh_feedback_aggregates,
    save_image_ground_truth,
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


@router.post("/image-labels", status_code=201)
def create_image_label(req: ImageLabelRequest) -> Dict[str, Any]:
    result = save_image_ground_truth(
        image_path=req.image_path,
        expected_mood=req.expected_mood,
        expected_pattern=req.expected_pattern,
        actual_mood=req.actual_mood,
        actual_pattern=req.actual_pattern,
        corrections=req.corrections,
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
