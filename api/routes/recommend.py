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

    # explicit empty check (tests want 422, not ValueError later)
    if not payload.systems:
        raise HTTPException(status_code=422, detail=[{"msg": "systems must not be empty"}])

    out = run_rule_engine(systems=[s.model_dump() for s in payload.systems])

    request_id = f"req_{uuid.uuid4().hex[:12]}"

    # Content formatting
    primary_pick = out.selection.top_picks[0]
    primary_name = primary_pick.breakdown.system_name or primary_pick.breakdown.system_id
    lines = [
        f"Primary: Recommended: {primary_name} (score {primary_pick.breakdown.final_score:.2f}; confidence {primary_pick.breakdown.confidence.score:.1f}/100).",
    ]

    # Add exactly 3 alternatives (Alt #1..Alt #3) from rankings; fill missing with n/a
    alts = out.selection.rankings[1:4]
    for i in range(1, 4):
        if i <= len(alts):
            r = alts[i - 1]
            bd = r.breakdown
            nm = bd.system_name or bd.system_id
            if float(bd.final_score) == float(primary_pick.breakdown.final_score):
                reason = "Alternative: tied on score (tie-break applied)."
            else:
                gap = float(primary_pick.breakdown.final_score) - float(bd.final_score)
                reason = f"Alternative: behind by {gap:.1f} points."
            lines.append(f"Alt #{i}: {nm} — {reason}")
        else:
            lines.append(f"Alt #{i}: n/a — Alternative: n/a")

    content = "\n".join(lines)

    # Structured output contract
    structured_top_picks = []
    for p in out.selection.top_picks:
        structured_top_picks.append(
            {
                "rank": p.rank,
                "breakdown": p.breakdown.model_dump(),  # <-- tests expect this key
                "reason": p.reason,
                "diagram_spec": p.diagram_spec.model_dump(),
            }
        )

    structured = {
        "selection": {
            "confidence": float(out.selection.confidence),
            "winner": {
                "system_id": out.selection.winner.system_id,
                "system_name": out.selection.winner.system_name,
                "final_score": float(out.selection.winner.final_score),
                "confidence": {"score": float(out.selection.winner.confidence.score), "reasons": list(out.selection.winner.confidence.reasons)},
            },
            "top_picks": structured_top_picks,
        }
    }

    # Diagram spec in result must include "subject"
    diagram_spec = primary_pick.diagram_spec.model_dump()
    diagram_spec.setdefault("subject", {"position": "center"})
    diagram_spec.setdefault("camera", {"angle": "eye_level", "lens": "standard"})

    usage = UsageStats(processing_ms=round((time.time() - t0) * 1000, 3))

    metadata = dict(body.get("metadata") or {})
    metadata.setdefault("engine_version", ENGINE_VERSION)
    # Single-system response MUST NOT include Alt lines (tests expect no "Alt #")
    try:
        systems_evaluated = getattr(out, "systems_evaluated", None)
        systems_list = getattr(out, "systems", None) or []
        if systems_evaluated == 1 or len(systems_list) == 1:
            content = "\n".join(
                line for line in content.splitlines()
                if "Alt #" not in line
            ).strip()
    except Exception:
        # fail-open: never break the endpoint over content formatting
        pass

    resp = NGWResponse(
        request_id=request_id,
        status=StatusCode.SUCCESS,
        result=ResultPayload(
            content=content,
            structured=structured,
            diagram_spec=diagram_spec,
            confidence=float(out.selection.confidence),
        ),
        usage=usage,
        metadata=metadata,
    )
    return resp.model_dump()
