from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from engine.rule_engine import ENGINE_VERSION, LightingSystemsPayload, run_rule_engine
from models.output_model import NGWResponse, ResultPayload, StatusCode, UsageStats

router = APIRouter()


def _json_safe_errors(errs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for e in errs:
        ee = dict(e)
        ctx = ee.get("ctx")
        if isinstance(ctx, dict) and "error" in ctx:
            ctx = dict(ctx)
            ctx["error"] = str(ctx["error"])
            ee["ctx"] = ctx
        out.append(ee)
    return out


@router.post("/recommend")
def recommend(body: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.time()

    try:
        payload = LightingSystemsPayload.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_json_safe_errors(e.errors()))

    if not payload.systems:
        raise HTTPException(status_code=422, detail=[{"msg": "systems must not be empty"}])

    out = run_rule_engine(systems=[s.model_dump() for s in payload.systems])
    selection = out.selection

    request_id = f"req_{uuid.uuid4().hex[:12]}"

    primary_pick = selection.top_picks[0]
    primary_name = primary_pick.breakdown.system_name or primary_pick.breakdown.system_id
    primary_conf = (
        primary_pick.breakdown.confidence.score
        if primary_pick.breakdown.confidence is not None
        else selection.confidence
    )

    lines = [
        f"Primary: Recommended: {primary_name} (score {primary_pick.breakdown.final_score:.2f}; confidence {primary_conf:.1f}/100).",
    ]

    alts = selection.rankings[1:4]
    for i in range(1, 4):
        if i <= len(alts):
            pick = alts[i - 1]
            nm = pick.breakdown.system_name or pick.breakdown.system_id
            lines.append(f"Alt #{i}: {nm} — {pick.reason}")
        else:
            lines.append(f"Alt #{i}: n/a — Alternative: n/a")

    content = "\n".join(lines)

    if len(payload.systems) == 1:
        content = "\n".join(line for line in content.splitlines() if "Alt #" not in line).strip()

    structured_top_picks = [
        {
            "rank": p.rank,
            "breakdown": p.breakdown.model_dump(),
            "reason": p.reason,
            "diagram_spec": p.diagram_spec.model_dump(),
        }
        for p in selection.top_picks
    ]

    structured = {
        "selection": {
            "confidence": float(selection.confidence),
            "winner": {
                "system_id": selection.winner.system_id,
                "system_name": selection.winner.system_name,
                "final_score": float(selection.winner.final_score),
                "confidence": {
                    "score": float(selection.winner.confidence.score),
                    "reasons": list(selection.winner.confidence.reasons),
                },
            },
            "top_picks": structured_top_picks,
        }
    }

    diagram_spec = primary_pick.diagram_spec.model_dump()
    diagram_spec.setdefault("subject", {"position": "center"})
    diagram_spec.setdefault("camera", {"angle": "eye_level", "lens": "standard"})

    usage = UsageStats(processing_ms=round((time.time() - t0) * 1000, 3))

    metadata = dict(body.get("metadata") or {})
    metadata.setdefault("engine_version", ENGINE_VERSION)

    resp = NGWResponse(
        request_id=request_id,
        status=StatusCode.SUCCESS,
        result=ResultPayload(
            content=content,
            structured=structured,
            diagram_spec=diagram_spec,
            confidence=float(selection.confidence),
        ),
        usage=usage,
        metadata=metadata,
    )
    return resp.model_dump()
