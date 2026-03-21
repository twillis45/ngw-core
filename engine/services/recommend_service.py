"""Recommend service — assembles the recommend endpoint result.

This module owns the business logic for the /recommend endpoint.
The route is a thin HTTP layer that parses the request and returns the response.

The recommend endpoint is simpler than shoot-match:
  - Caller provides pre-formed systems and input context
  - No image analysis or pattern classification
  - Runs selector → formats picks → returns result

Candidate-first structure is preserved through the selector's top_picks,
which are already ranked candidates. The service surfaces:
  - primary_candidate (winner)
  - alternate_candidates (runners-up)
  - validation_scores (solver quality if provided)
  - confidence
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

ENGINE_VERSION = "1.0.0"


# ═══════════════════════════════════════════════════════════════════════════
# Result container
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class RecommendResult:
    """Structured result from the recommend service."""
    content: str = ""
    structured: Dict[str, Any] = dc_field(default_factory=dict)
    diagram_spec: Dict[str, Any] = dc_field(default_factory=dict)
    confidence: float = 0.0
    # Candidate-first fields
    primary_candidate: Optional[Dict[str, Any]] = None
    alternate_candidates: List[Dict[str, Any]] = dc_field(default_factory=list)
    validation_scores: Dict[str, Any] = dc_field(default_factory=dict)
    needs_review: bool = False
    processing_ms: int = 0
    request_id: str = ""


# ═══════════════════════════════════════════════════════════════════════════
# Response formatting helpers
# ═══════════════════════════════════════════════════════════════════════════

def _reason_list(outcome: Any) -> List[str]:
    reasons = list(getattr(outcome, "reasons", []) or [])
    while len(reasons) < 4:
        reasons.append("Confidence included and used for explanation.")
    return reasons[:8]


def _pick_breakdown(pick: Any, confidence_score: float, reasons: List[str]) -> Dict[str, Any]:
    bd = pick.breakdown
    return {
        "system_id": bd.system_id,
        "system_name": bd.system_name,
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


def _content_from_picks(picks: list, confidence_score: float) -> str:
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


# ═══════════════════════════════════════════════════════════════════════════
# Main service entry point
# ═══════════════════════════════════════════════════════════════════════════

def build_recommend_result(
    *,
    systems: List[Dict[str, Any]],
    input_ctx: Dict[str, Any],
    modifiers_available: List[str],
    solver_quality: Optional[Dict[str, Any]] = None,
) -> RecommendResult:
    """Build the complete recommend result.

    This is the single orchestration entry point for the /recommend route.
    The route only validates the request and returns this result.

    Parameters
    ----------
    systems : list of dicts
        Pre-formed system definitions from the caller.
    input_ctx : dict
        User input context (mood, environment, gear, etc.).
    modifiers_available : list of str
        Available modifier names.
    solver_quality : dict or None
        Solver quality signals for confidence modulation.

    Returns
    -------
    RecommendResult
        Complete result with picks, candidate structure, and confidence.
    """
    from engine.selector import select_best_system
    from engine.orchestrator import extract_solver_quality

    t0 = time.time()

    outcome = select_best_system(
        systems,
        input_ctx=input_ctx,
        modifiers_available=modifiers_available,
        solver_quality=solver_quality,
    )

    reasons = _reason_list(outcome)
    confidence_score = float(outcome.confidence)

    top_picks = list(outcome.top_picks)
    winner_pick = top_picks[0]

    # Build structured picks (backward compatible)
    structured_picks: List[Dict[str, Any]] = []
    for idx, pick in enumerate(top_picks):
        structured_picks.append({
            "rank": pick.rank,
            "breakdown": _pick_breakdown(pick, confidence_score, reasons),
            "reason": _pick_reason(idx, pick, winner_pick, confidence_score),
            "diagram_spec": pick.diagram_spec.model_dump() if pick.diagram_spec else None,
        })

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

    # Candidate-first structure — preserves alternates for downstream use
    primary_candidate = {
        "system_id": winner_pick.breakdown.system_id,
        "system_name": winner_pick.breakdown.system_name,
        "score": float(winner_pick.breakdown.final_score),
        "confidence": confidence_score,
    }
    alternate_candidates = [
        {
            "system_id": p.breakdown.system_id,
            "system_name": p.breakdown.system_name,
            "score": float(p.breakdown.final_score),
            "delta": float(winner_pick.breakdown.final_score) - float(p.breakdown.final_score),
        }
        for p in top_picks[1:]
    ]

    # Validation scores from solver quality (if provided)
    validation_scores: Dict[str, Any] = {}
    needs_review = False
    if solver_quality:
        validation_scores = {
            "overall_consistency": solver_quality.get("overall_consistency", 1.0),
            "high_contradiction_count": solver_quality.get("high_contradiction_count", 0),
            "ambiguity_class": solver_quality.get("ambiguity_class", "clean"),
        }
        needs_review = solver_quality.get("needs_review", False)

    return RecommendResult(
        content=content,
        structured=structured,
        diagram_spec=winner_pick.diagram_spec.model_dump() if winner_pick.diagram_spec else {},
        confidence=confidence_score,
        primary_candidate=primary_candidate,
        alternate_candidates=alternate_candidates,
        validation_scores=validation_scores,
        needs_review=needs_review,
        processing_ms=max(0, int((time.time() - t0) * 1000)),
        request_id=f"req_{uuid.uuid4().hex[:12]}",
    )
