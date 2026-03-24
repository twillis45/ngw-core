"""Recommend route — thin HTTP layer.

All business logic lives in engine.services.recommend_service.
This route only:
  1. Validates the request
  2. Calls build_recommend_result()
  3. Formats the HTTP response
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from auth.security import get_optional_user
from db.database import get_analysis_count, get_active_subscription
from engine.services.recommend_service import (
    build_recommend_result,
    ENGINE_VERSION,
)

_DEFAULT_PAYWALL_THRESHOLD = 3

router = APIRouter()


# ── Request models ──

class SystemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: Optional[str] = None
    criteria: Dict[str, Any] = Field(default_factory=dict)
    features: Dict[str, Any] = Field(default_factory=dict)
    taxonomy_refs: Dict[str, Any] = Field(default_factory=dict)
    modifier: Optional[float] = None

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not str(v).strip():
            raise ValueError("id must be non-empty")
        return str(v).strip()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not str(v).strip():
            raise ValueError("name must be non-empty")
        return str(v).strip()


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    systems: List[SystemRequest] = Field(min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    modifiers_available: List[str] = Field(default_factory=list)


def _json_safe_errors(errs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for e in errs:
        item = dict(e)
        ctx = item.get("ctx")
        if isinstance(ctx, dict):
            item["ctx"] = {k: str(v) for k, v in ctx.items()}
        out.append(item)
    return out


# ── Endpoint ──

@router.post("/recommend")
def recommend(body: Dict[str, Any], user=Depends(get_optional_user)) -> Dict[str, Any]:
    """Recommend a lighting system from caller-provided candidates.

    This route is a thin HTTP layer. All business logic — selection,
    scoring, response formatting — lives in
    engine.services.recommend_service.build_recommend_result().

    Server-side paywall gate: free/anonymous sessions are capped at
    the paywall_timing flag threshold (default 3). Paid subscribers bypass.
    """
    # ── Paywall gate ─────────────────────────────────────────────────────────
    is_paid = False
    if user:
        try:
            sub = get_active_subscription(user.get("email", ""))
            is_paid = sub is not None
        except Exception:
            pass

    if not is_paid:
        session_id: str = (body.get("metadata") or {}).get("session_id", "")
        if session_id:
            count = get_analysis_count(session_id)
            threshold = _DEFAULT_PAYWALL_THRESHOLD
            try:
                from db.flags import get_flags_for_session
                flags = get_flags_for_session(session_id)
                paywall_flag = next(
                    (f for f in flags.values()
                     if f.get("group") == "paywall_timing" and f.get("enabled")),
                    None,
                )
                if paywall_flag:
                    threshold = paywall_flag.get("config", {}).get("threshold", _DEFAULT_PAYWALL_THRESHOLD)
            except Exception:
                pass
            if count >= threshold:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "code": "PAYWALL_LIMIT_REACHED",
                        "message": "Free analysis limit reached. Upgrade to Pro for unlimited analyses.",
                        "count": count,
                        "threshold": threshold,
                    },
                )
    # ─────────────────────────────────────────────────────────────────────────

    try:
        req = RecommendRequest.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_json_safe_errors(e.errors()))

    try:
        result = build_recommend_result(
            systems=[s.model_dump() for s in req.systems],
            input_ctx=req.input,
            modifiers_available=req.modifiers_available,
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_json_safe_errors(e.errors()))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=[{"msg": str(e)}])

    metadata = dict(req.metadata or {})
    metadata["engine_version"] = ENGINE_VERSION

    response: Dict[str, Any] = {
        "status": "success",
        "request_id": result.request_id,
        "metadata": metadata,
        "usage": {
            "processing_ms": result.processing_ms,
        },
        "result": {
            "content": result.content,
            "structured": result.structured,
            "diagram_spec": result.diagram_spec,
            "confidence": result.confidence,
        },
    }

    # Candidate-first data (new — consumers can adopt progressively)
    if result.primary_candidate:
        response["candidates"] = {
            "primary_candidate": result.primary_candidate,
            "alternate_candidates": result.alternate_candidates,
        }
    if result.validation_scores:
        response["validationScores"] = result.validation_scores
    if result.needs_review:
        response["needsReview"] = True

    return response
