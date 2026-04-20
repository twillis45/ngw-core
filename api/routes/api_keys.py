"""
API Key management — Studio-tier feature.

POST   /api/api-keys       — generate a new API key
GET    /api/api-keys       — list active keys (prefix + metadata only)
DELETE /api/api-keys/{id}  — revoke a key
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.plan_guard import require_plan
from db.database import create_api_key, list_api_keys, revoke_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])


class CreateKeyBody(BaseModel):
    name: str = Field(default="Default", max_length=80)


@router.post("", status_code=201)
def key_create(body: CreateKeyBody, user=Depends(require_plan("studio"))):
    """Generate a new API key. Returns the full key ONCE — it cannot be retrieved later."""
    email = user.get("email", "")
    # Limit to 5 active keys per user
    existing = list_api_keys(email)
    if len(existing) >= 5:
        raise HTTPException(400, "Maximum 5 active API keys per account.")
    key = create_api_key(email, name=body.name)
    logger.info("api_key: created key %s for %s", key["prefix"], email)
    return {
        "id": key["id"],
        "key": key["key"],  # full key shown only once
        "prefix": key["prefix"],
        "name": key["name"],
    }


@router.get("")
def key_list(user=Depends(require_plan("studio"))):
    """List all active API keys (prefix only — full key is never stored)."""
    email = user.get("email", "")
    return {"keys": list_api_keys(email)}


@router.delete("/{key_id}")
def key_revoke(key_id: str, user=Depends(require_plan("studio"))):
    """Revoke an API key immediately."""
    email = user.get("email", "")
    ok = revoke_api_key(key_id, email)
    if not ok:
        raise HTTPException(404, "Key not found.")
    logger.info("api_key: revoked key %s for %s", key_id, email)
    return {"status": "ok"}
