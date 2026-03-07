from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from models.output_model import Confidence, SelectionResult, WinnerInfo, AlternativeInfo, ScoreBreakdown
from engine.scoring import score_system
from engine.diagram import build_diagram_spec, DiagramSpec


@dataclass(frozen=True)
class RankedSystem:
    rank: int
    system_id: str
    system_name: str
    score_breakdown: ScoreBreakdown
    diagram_spec: DiagramSpec


@dataclass(frozen=True)
class SelectorOutcome:
    total_candidates: int
    winner: RankedSystem
    rankings: List[RankedSystem]
    confidence: Confidence
    reasons: List[str]
    top_picks: List[RankedSystem]


def _confidence(winner: ScoreBreakdown, runner_up: Optional[ScoreBreakdown]) -> Confidence:
    if runner_up is None:
        return Confidence(score=100, method="single", details={})

    w = max(winner.final_score, 1e-9)
    margin = winner.final_score - runner_up.final_score
    pct = int(max(0.0, min(100.0, (margin / w) * 100.0)))

    richness = min(20, len(winner.components) * 5)  # more evidence => more confidence
    pct = int(max(0, min(100, pct + richness)))

    return Confidence(score=pct, method="margin+evidence", details={"margin": margin, "richness": richness})


def select_best_system(
    systems: Sequence[Dict[str, Any]],
    *,
    input_ctx: Optional[Dict[str, Any]] = None,
    modifiers_available: Optional[List[str]] = None,
) -> SelectorOutcome:
    if not systems:
        raise ValueError("systems must be non-empty")

    ranked: List[RankedSystem] = []
    for s in systems:
        sid = str(s.get("id") or s.get("system_id") or s.get("name") or "unknown")
        name = str(s.get("name") or sid)
        bd = score_system(s, input_ctx=input_ctx)
        diag = build_diagram_spec(s, modifiers_available=modifiers_available)
        ranked.append(RankedSystem(rank=0, system_id=sid, system_name=name, score_breakdown=bd, diagram_spec=diag))

    ranked_sorted = sorted(
        ranked,
        key=lambda r: (-r.score_breakdown.final_score, -r.score_breakdown.base_score, r.system_id),
    )
    ranked_sorted = [r.__class__(i + 1, r.system_id, r.system_name, r.score_breakdown, r.diagram_spec) for i, r in enumerate(ranked_sorted)]

    winner = ranked_sorted[0]
    runner_up = ranked_sorted[1].score_breakdown if len(ranked_sorted) > 1 else None

    conf = _confidence(winner.score_breakdown, runner_up)

    reasons: List[str] = []
    reasons.append(f"Selected '{winner.system_id}' because it has the highest final score.")
    reasons.append(f"Winner final_score={winner.score_breakdown.final_score:.3f}, base_score={winner.score_breakdown.base_score:.3f}, modifier={winner.score_breakdown.modifier:.3f}.")
    if runner_up is not None:
        delta = winner.score_breakdown.final_score - runner_up.final_score
        reasons.append(f"Next best was {ranked_sorted[1].system_id} at {runner_up.final_score:.3f} (Δ {delta:.3f}).")
    reasons.append(f"Confidence computed via {conf.method}.")
    if len(reasons) < 4:
        reasons.append("Deterministic tie-breakers applied (score, base, id).")

    top_picks = ranked_sorted[: min(3, len(ranked_sorted))]

    return SelectorOutcome(
        total_candidates=len(ranked_sorted),
        winner=winner,
        rankings=ranked_sorted,
        confidence=conf,
        reasons=reasons,
        top_picks=top_picks,
    )


def as_public_selection(outcome: SelectorOutcome, *, trace: Optional[Dict[str, Any]] = None) -> SelectionResult:
    winner_bd = outcome.winner.score_breakdown
    winner = WinnerInfo(
        system_id=outcome.winner.system_id,
        confidence=outcome.confidence,
        rationale=" ".join(outcome.reasons),
        score_breakdown=winner_bd,
    )

    alternatives: List[AlternativeInfo] = []
    for r in outcome.rankings[1:]:
        alternatives.append(
            AlternativeInfo(
                system_id=r.system_id,
                score=r.score_breakdown.final_score,
                delta=winner_bd.final_score - r.score_breakdown.final_score,
                notes=list(r.score_breakdown.notes),
            )
        )

    return SelectionResult(winner=winner, alternatives=alternatives, trace=trace or {})
