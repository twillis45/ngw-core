"""
Reference Library + Shared Setups — Studio-tier features.

Reference Library:
  POST   /api/studio/references       — add reference image + link to analysis
  GET    /api/studio/references        — list user's references
  DELETE /api/studio/references/{id}   — delete a reference

Shared Setups (public):
  GET    /api/shared/setup/{token}     — view a shared setup (no auth required)
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth.plan_guard import require_plan
from db.database import (
    add_reference, list_references, delete_reference,
    get_db,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["studio"])

UPLOAD_DIR = os.path.join("data", "reference_library")


# ── Reference Library (Studio) ───────────────────────────────────────────────

@router.post("/api/studio/references", status_code=201)
async def create_reference(
    image: UploadFile = File(...),
    name: str = Form(...),
    category: str = Form("uncategorized"),
    analysis_id: Optional[str] = Form(None),
    notes: str = Form(""),
    tags: str = Form(""),
    user=Depends(require_plan("studio")),
):
    """Upload a reference image and save it to the user's library."""
    email = user.get("email", "")
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Save image to disk
    import uuid
    ext = os.path.splitext(image.filename or "img.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    data = await image.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "Image exceeds 20 MB limit.")
    with open(filepath, "wb") as f:
        f.write(data)

    ref = add_reference(
        user_email=email,
        name=name,
        image_path=filepath,
        analysis_id=analysis_id,
        category=category,
        notes=notes,
        tags=tags,
    )
    return ref


@router.get("/api/studio/references")
def get_references(
    category: Optional[str] = None,
    user=Depends(require_plan("studio")),
):
    """List all references in the user's library."""
    email = user.get("email", "")
    return {"references": list_references(email, category=category)}


@router.delete("/api/studio/references/{ref_id}")
def remove_reference(ref_id: str, user=Depends(require_plan("studio"))):
    """Delete a reference from the library."""
    email = user.get("email", "")
    ok = delete_reference(ref_id, email)
    if not ok:
        raise HTTPException(404, "Reference not found.")
    return {"status": "ok"}


# ── Shared Setup (public, no auth) ──────────────────────────────────────────

@router.get("/api/shared/setup/{share_token}")
def view_shared_setup(share_token: str):
    """Public endpoint to view a shared setup. No authentication required."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT name, tag, result_json, created_at FROM user_setups WHERE share_token = ? AND shared = 1",
            (share_token,),
        ).fetchone()

    if not row:
        raise HTTPException(404, "Shared setup not found or no longer shared.")

    result = {}
    try:
        result = json.loads(row["result_json"])
    except (json.JSONDecodeError, TypeError):
        pass

    return {
        "name": row["name"],
        "tag": row["tag"],
        "result": result,
        "created_at": row["created_at"],
    }
