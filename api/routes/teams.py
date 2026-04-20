"""
Team collaboration — Studio-tier feature.

POST   /api/teams                    — create a team
GET    /api/teams                    — list user's teams
POST   /api/teams/{id}/invite        — invite a member by email
GET    /api/teams/{id}/members       — list team members
DELETE /api/teams/{id}/members/{uid} — remove a member
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.plan_guard import require_plan
from db.database import (
    create_team, get_user_teams, get_team_members,
    add_team_member, remove_team_member,
    get_user_by_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/teams", tags=["teams"])


class CreateTeamBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class InviteBody(BaseModel):
    email: str = Field(..., min_length=3)


@router.post("", status_code=201)
def team_create(body: CreateTeamBody, user=Depends(require_plan("studio"))):
    """Create a new team. The creating user becomes the owner."""
    teams = get_user_teams(user["id"])
    # Limit to 3 teams per user
    owned = [t for t in teams if t.get("role") == "owner"]
    if len(owned) >= 3:
        raise HTTPException(400, "Maximum 3 teams per account.")
    team = create_team(user["id"], body.name)
    return team


@router.get("")
def team_list(user=Depends(require_plan("studio"))):
    """List all teams the user belongs to."""
    return {"teams": get_user_teams(user["id"])}


@router.get("/{team_id}/members")
def team_members(team_id: str, user=Depends(require_plan("studio"))):
    """List members of a team."""
    teams = get_user_teams(user["id"])
    if not any(t["id"] == team_id for t in teams):
        raise HTTPException(403, "You are not a member of this team.")
    return {"members": get_team_members(team_id)}


@router.post("/{team_id}/invite")
def team_invite(team_id: str, body: InviteBody, user=Depends(require_plan("studio"))):
    """Invite a user to the team by email. Only owners/admins can invite."""
    teams = get_user_teams(user["id"])
    membership = next((t for t in teams if t["id"] == team_id), None)
    if not membership:
        raise HTTPException(403, "You are not a member of this team.")
    if membership.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only team owners and admins can invite members.")

    # Find the user to invite
    invite_user = get_user_by_email(body.email.strip().lower())
    if not invite_user:
        raise HTTPException(404, "No account found for that email. They need to sign up first.")

    ok = add_team_member(team_id, invite_user["id"], role="member")
    if not ok:
        raise HTTPException(500, "Failed to add team member.")
    logger.info("team: %s invited %s to team %s", user["email"], body.email, team_id)
    return {"status": "ok", "invited": body.email}


@router.delete("/{team_id}/members/{member_id}")
def team_remove_member(team_id: str, member_id: str, user=Depends(require_plan("studio"))):
    """Remove a member from the team. Only owners can remove."""
    teams = get_user_teams(user["id"])
    membership = next((t for t in teams if t["id"] == team_id), None)
    if not membership:
        raise HTTPException(403, "You are not a member of this team.")
    if membership.get("role") != "owner":
        raise HTTPException(403, "Only team owners can remove members.")

    ok = remove_team_member(team_id, member_id)
    if not ok:
        raise HTTPException(404, "Member not found or is the team owner.")
    return {"status": "ok"}
