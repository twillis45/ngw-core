from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from engine.diagram import build_diagram_spec
from engine.scoring import score_system
from models.output_model import SelectionPick, SelectionResult, WinnerInfo


@dataclass(frozen=True)
class RankedSystem:
    rank: int
    breakdown: Any
    reason: str
    diagram_spec: Any


@dataclass(frozen=True)
class SelectorOutcome:
    total_candidates: int
    confidence: float
    winner: WinnerInfo
    rankings: List[SelectionPick]
    reasons: List[str]
    top_picks: List[SelectionPick]


def _build_reasons(winner_pick: SelectionPick, runner_up: Optional[SelectionPick]) -> List[str]:
    winner_score = float(winner_pick.breakdown.final_score)
    reasons = [
        f"selected winner by highest final score {winner_score:.1f}.",
        "Strongest criterion coverage came from the winner's weighted criteria.",
        "Feature bonuses and modifier signals were considered in scoring.",
        "Confidence included and used for explanation.",
        "Diagram generated per pick for expected shadow/shape.",
    ]
    if runner_up is not None:
        runner_score = float(runner_up.breakdown.final_score)
        gap = winner_score - runner_score
        if gap == 0:
            reasons.insert(
                1,
                (
                    f"Tie on final score between "
                    f"{winner_pick.breakdown.system_name} and "
                    f"{runner_up.breakdown.system_name}; "
                    f"lexicographic id tie-break selected "
                    f"{winner_pick.breakdown.system_id}."
                ),
            )
        else:
            reasons.insert(1, f"Winner margin over runner-up: {gap:.2f} points.")
    return reasons


def _pick_reason(index: int, pick: SelectionPick, winner_pick: SelectionPick, confidence_score: float) -> str:
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


def select_best_system(
    systems: Sequence[Dict[str, Any]],
    *,
    input_ctx: Optional[Dict[str, Any]] = None,
    modifiers_available: Optional[List[str]] = None,
) -> SelectorOutcome:
    if not systems:
        raise ValueError("systems must be non-empty")

    master_mode = (input_ctx or {}).get("master_mode")

    picks: List[SelectionPick] = []
    for rank_seed, system in enumerate(systems, start=1):
        breakdown = score_system(system, input_ctx=input_ctx)
        diagram_spec = build_diagram_spec(system, modifiers_available=modifiers_available, master_mode=master_mode)
        picks.append(
            SelectionPick(
                rank=rank_seed,
                breakdown=breakdown,
                reason="",
                diagram_spec=diagram_spec,
            )
        )

    picks.sort(
        key=lambda p: (
            -float(p.breakdown.final_score),
            -float(p.breakdown.base_score),
            p.breakdown.system_id,
        )
    )

    reranked: List[SelectionPick] = []
    for idx, pick in enumerate(picks, start=1):
        reranked.append(
            SelectionPick(
                rank=idx,
                breakdown=pick.breakdown,
                reason="",
                diagram_spec=pick.diagram_spec,
            )
        )

    winner_pick = reranked[0]
    runner_up = reranked[1] if len(reranked) > 1 else None
    reasons = _build_reasons(winner_pick, runner_up)

    confidence_score = float(winner_pick.breakdown.confidence.score if winner_pick.breakdown.confidence else 0.0)

    finalized: List[SelectionPick] = []
    for idx, pick in enumerate(reranked):
        finalized.append(
            SelectionPick(
                rank=pick.rank,
                breakdown=pick.breakdown,
                reason=_pick_reason(idx, pick, winner_pick, confidence_score),
                diagram_spec=pick.diagram_spec,
            )
        )

    winner = WinnerInfo(
        system_id=winner_pick.breakdown.system_id,
        system_name=winner_pick.breakdown.system_name,
        final_score=float(winner_pick.breakdown.final_score),
        confidence=winner_pick.breakdown.confidence,
        rationale=" ".join(reasons),
    )

    top_picks = finalized[: min(3, len(finalized))]

    return SelectorOutcome(
        total_candidates=len(finalized),
        confidence=confidence_score,
        winner=winner,
        rankings=finalized,
        reasons=reasons,
        top_picks=top_picks,
    )


def as_public_selection(outcome: SelectorOutcome, *, trace: Optional[Dict[str, Any]] = None) -> SelectionResult:
    return SelectionResult(
        total_candidates=outcome.total_candidates,
        confidence=outcome.confidence,
        winner=outcome.winner,
        rankings=outcome.rankings,
        reasons=outcome.reasons,
        top_picks=outcome.top_picks,
        trace=trace or {},
    )
