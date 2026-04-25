"""Team Sessions API — create and share shoot session context.

A photographer creates a session from the cockpit. The session stores the
lighting setup data (pattern, diagram, coaching notes) behind a short share
token. An assistant opens the token URL on their device and sees the setup.

Sessions expire after 24 hours. No real-time sync — this is a persistent
"here's what we're shooting" handoff, not a live collaboration tool.

Routes:
    POST   /api/team-sessions          — create session (authenticated)
    GET    /api/team-sessions/{token}   — view session (no auth, token is access)
    PUT    /api/team-sessions/{token}   — update session (creator only)
"""
from __future__ import annotations

import json
import time
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth.dev_guard import get_dev_user
from auth.rate_limit import check_rate_limit
from db.database import (
    create_team_session,
    get_team_session_by_token,
    update_team_session,
    cleanup_expired_team_sessions,
)

router = APIRouter(prefix="/api/team-sessions", tags=["team-sessions"])


class CreateSessionBody(BaseModel):
    setup_name: str = Field(..., min_length=1, max_length=120)
    setup_data: dict = Field(...)


class UpdateSessionBody(BaseModel):
    setup_name: Optional[str] = None
    setup_data: Optional[dict] = None


@router.post("")
async def create_session(
    body: CreateSessionBody,
    request: Request,
    user: Dict = Depends(get_dev_user),
):
    """Create a shared shoot session. Returns a short share token + URL."""
    check_rate_limit("team_session_create", request, limit=10, window=3600)

    # Opportunistic cleanup — delete sessions that expired >1h ago
    cleanup_expired_team_sessions()

    email = user.get("email", "unknown")
    session = create_team_session(
        creator_email=email,
        setup_name=body.setup_name,
        setup_data=json.dumps(body.setup_data, default=str),
    )

    # Build the share URL — use the request's base URL
    base = str(request.base_url).rstrip("/")
    share_url = f"{base}/static/ui/?session={session['share_token']}"

    return {
        **session,
        "share_url": share_url,
    }


@router.get("/{share_token}")
async def get_session(
    share_token: str,
    request: Request,
):
    """View a shared session. No authentication required — the token IS the access."""
    check_rate_limit("team_session_view", request, limit=60, window=60)

    session = get_team_session_by_token(share_token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["expires_at"] < time.time():
        raise HTTPException(
            status_code=410,
            detail="Session expired",
            headers={"X-Expired-At": str(session["expires_at"])},
        )

    # Parse the JSON setup_data back to a dict
    setup_data = session.get("setup_data")
    if isinstance(setup_data, str):
        try:
            setup_data = json.loads(setup_data)
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "id": session["id"],
        "share_token": session["share_token"],
        "setup_name": session["setup_name"],
        "setup_data": setup_data,
        "creator_email": session["creator_email"],
        "created_at": session["created_at"],
        "expires_at": session["expires_at"],
    }


@router.put("/{share_token}")
async def update_session_endpoint(
    share_token: str,
    body: UpdateSessionBody,
    request: Request,
    user: Dict = Depends(get_dev_user),
):
    """Update a session. Creator only."""
    session = get_team_session_by_token(share_token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["expires_at"] < time.time():
        raise HTTPException(status_code=410, detail="Session expired")

    if session["creator_email"] != user.get("email"):
        raise HTTPException(status_code=403, detail="Only the session creator can update")

    updated = update_team_session(
        share_token,
        setup_name=body.setup_name,
        setup_data=json.dumps(body.setup_data, default=str) if body.setup_data else None,
    )
    return updated
