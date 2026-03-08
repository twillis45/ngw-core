from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from engine.selector import select_best_system


ENGINE_VERSION = "1.0.0"

app = FastAPI(title="NGW Core v1", version=ENGINE_VERSION)
app.mount("/static", StaticFiles(directory="static"), name="static")


class SystemRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

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
    model_config = ConfigDict(extra="allow")

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


def _reason_list(outcome: Any) -> List[str]:
    reasons = list(getattr(outcome, "reasons", []) or [])
    while len(reasons) < 4:
        reasons.append("Confidence included and used for explanation.")
    return reasons[:8]

def _pick_breakdown(pick, confidence_score, reasons):
    bd = pick.breakdown
    return {
        "system_id": pick.breakdown.system_id,
        "system_name": pick.breakdown.system_name,
        "base_score": float(bd.base_score),
        "modifier": float(bd.modifier),
        "final_score": float(bd.final_score),
        "confidence": {
            "score": float(confidence_score),
            "reasons": reasons,
        },
        "components": [c.model_dump() for c in bd.components],
        "feature_bonuses": [b.model_dump() for b in bd.feature_bonuses],
        "notes": list(bd.notes),
    }


def _pick_reason(index: int, pick: Any, winner_pick: Any, confidence_score: float) -> str:
    score = float(pick.breakdown.final_score)
    if index == 0:
        return (
            f"Primary: {pick.breakdown.system_name} selected with score {score:.1f} "
            f"and confidence {float(confidence_score):.1f}."
        )

    winner_score = float(winner_pick.breakdown.final_score)
    if score == winner_score:
        return "Alternative: tied on score (tie-break applied)."

    gap = winner_score - score
    return f"Alternative: behind by {gap:.1f} points."


def _content_from_picks(picks: List[Any], confidence_score: float) -> str:
    primary = picks[0]
    primary_name = primary.breakdown.system_name or primary.breakdown.system_id
    primary_score = float(primary.breakdown.final_score)

    lines = [
        (
            f"Recommended: {primary_name} "
            f"(score {primary_score:.1f}; "
            f"confidence {float(confidence_score):.1f}/100)."
        )
    ]

    if len(picks) > 1:
        for idx, pick in enumerate(picks[1:], start=2):
            alt_name = pick.breakdown.system_name or pick.breakdown.system_id
            lines.append(f"Alt #{idx}: {alt_name}")

    return "\n".join(lines)

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "engine_version": ENGINE_VERSION}


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/static/index.html", status_code=307)


@app.post("/recommend")
def recommend(body: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.time()

    try:
        req = RecommendRequest.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_json_safe_errors(e.errors()))

    try:
        outcome = select_best_system(
            [s.model_dump() for s in req.systems],
            input_ctx=req.input,
            modifiers_available=req.modifiers_available,
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_json_safe_errors(e.errors()))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=[{"msg": str(e)}])

    reasons = _reason_list(outcome)
    confidence_score = float(getattr(outcome.confidence, "score", 0))

    top_picks = list(outcome.top_picks)
    winner_pick = top_picks[0]

    structured_picks: List[Dict[str, Any]] = []
    for idx, pick in enumerate(top_picks):
        structured_picks.append(
            {
                "rank": pick.rank,
                "breakdown": _pick_breakdown(pick, confidence_score, reasons),
                "reason": _pick_reason(idx, pick, winner_pick, confidence_score),
                "diagram_spec": pick.diagram_spec.model_dump(),
            }
        )

    content = _content_from_picks(top_picks, confidence_score)

    structured = {
        "selection": {
            "confidence": confidence_score,
            "winner": {
                "system_id": winner_pick.breakdown.system_id,
                "system_name": winner_pick.breakdown.system_name,
                "final_score": float(winner_pick.breakdown.final_score),
                "confidence": {
                    "score": confidence_score,
                    "reasons": reasons,
                },
            },
            "top_picks": structured_picks,
        }
    }

    metadata = dict(req.metadata or {})
    metadata["engine_version"] = ENGINE_VERSION

    return {
        "status": "success",
        "request_id": f"req_{uuid.uuid4().hex[:12]}",
        "metadata": metadata,
        "usage": {
            "processing_ms": max(0, int((time.time() - t0) * 1000))
        },
        "result": {
            "content": content,
            "structured": structured,
            "diagram_spec": winner_pick.diagram_spec.model_dump(),
            "confidence": confidence_score,
        },
    }
