"""User data routes: kit, setups, feedback sync, setup sharing."""
from __future__ import annotations

import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.security import get_current_user
from auth.plan_guard import require_plan
from db.database import (
    save_user_kit, get_user_kit, delete_user_kit,
    save_user_setup, get_user_setups, delete_user_setup,
    save_user_feedback, get_user_feedback,
    save_user_preference, get_all_user_preferences,
    get_db,
)

router = APIRouter(prefix="/user", tags=["user-data"])


# ── Kit ────────────────────────────────────────────────────

class KitBody(BaseModel):
    lights: List[Dict[str, Any]] = Field(default_factory=list)
    modifiers: List[str] = Field(default_factory=list)
    support: List[str] = Field(default_factory=list)


@router.get("/kit")
def kit_get(user=Depends(get_current_user)):
    kit = get_user_kit(user["id"])
    if not kit:
        return {"kit": None}
    return kit


@router.put("/kit")
def kit_save(body: KitBody, user=Depends(get_current_user)):
    result = save_user_kit(user["id"], body.model_dump())
    return result


@router.delete("/kit")
def kit_delete(user=Depends(get_current_user)):
    delete_user_kit(user["id"])
    return {"status": "ok"}


# ── Saved Setups ───────────────────────────────────────────

class SetupBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    tag: str = Field(default="personal")
    result: Dict[str, Any]


@router.get("/setups")
def setups_list(user=Depends(get_current_user)):
    return {"setups": get_user_setups(user["id"])}


@router.post("/setups", status_code=201)
def setups_save(body: SetupBody, user=Depends(get_current_user)):
    entry = save_user_setup(user["id"], body.name, body.tag, body.result)
    return entry


@router.delete("/setups/{setup_id}")
def setups_delete(setup_id: str, user=Depends(get_current_user)):
    ok = delete_user_setup(user["id"], setup_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Setup not found")
    return {"status": "ok"}


# ── Feedback ───────────────────────────────────────────────

class FeedbackBody(BaseModel):
    setup_id: str
    mood: Optional[str] = None
    pattern: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="")
    analysis_id: Optional[str] = None
    system_version: Optional[str] = None


@router.get("/feedback")
def feedback_list(user=Depends(get_current_user)):
    return {"feedback": get_user_feedback(user["id"])}


@router.post("/feedback", status_code=201)
def feedback_save(body: FeedbackBody, user=Depends(get_current_user)):
    entry = save_user_feedback(
        user["id"], body.setup_id, body.mood, body.pattern, body.rating, body.comment,
        analysis_id=body.analysis_id,
        system_version=body.system_version,
    )
    return entry


# ── User Preferences ───────────────────────────────────────
# Generic key-value store for UI preferences (tab order, layout, etc.)
# Values are arbitrary JSON — clients decide structure per key.

_PREF_KEY_MAX = 64


class PrefBody(BaseModel):
    value: Any


@router.get("/preferences")
def preferences_get_all(user=Depends(get_current_user)):
    """Return all stored preferences for the current user."""
    return {"preferences": get_all_user_preferences(user["id"])}


@router.put("/preferences/{key}", status_code=200)
def preferences_save(key: str, body: PrefBody, user=Depends(get_current_user)):
    """Upsert a single preference value. Key must be ≤64 chars."""
    if len(key) > _PREF_KEY_MAX:
        raise HTTPException(status_code=400, detail=f"Preference key must be ≤{_PREF_KEY_MAX} characters.")
    save_user_preference(user["id"], key, body.value)
    return {"status": "ok", "key": key}


# ── Sync (download all user data) ─────────────────────────

@router.get("/sync")
def sync_all(user=Depends(get_current_user)):
    """Return all user data for client-side sync."""
    return {
        "kit": get_user_kit(user["id"]),
        "setups": get_user_setups(user["id"]),
        "feedback": get_user_feedback(user["id"]),
        "preferences": get_all_user_preferences(user["id"]),
    }


# ── Setup Sharing (Studio-tier) ──────────────────────────────

@router.post("/setups/{setup_id}/share")
def toggle_setup_sharing(setup_id: str, user=Depends(require_plan("studio"))):
    """Toggle sharing for a saved setup. Returns the share URL or null."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, shared, share_token FROM user_setups WHERE id = ? AND user_id = ?",
            (setup_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Setup not found")

        if row["shared"]:
            # Turn off sharing
            conn.execute(
                "UPDATE user_setups SET shared = 0, share_token = NULL WHERE id = ?",
                (setup_id,),
            )
            return {"shared": False, "share_url": None}
        else:
            # Turn on sharing — generate token
            token = secrets.token_urlsafe(16)
            conn.execute(
                "UPDATE user_setups SET shared = 1, share_token = ? WHERE id = ?",
                (token, setup_id),
            )
            return {"shared": True, "share_token": token}
