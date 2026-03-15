"""Solver trace builder — constructs structured debug traces from pipeline data.

The solver trace answers four key questions:
    1. Which signals contributed most to the reconstruction?
    2. Which signals were downgraded and why?
    3. Which contradictions mattered most?
    4. Why did the primary candidate rank highest?

Usage::

    from engine.solver_trace import build_solver_trace

    trace = build_solver_trace(
        consensus_result=consensus,
        pass_weight_profile=weights,
        contradiction_report=contradictions,
        region_reliability=reliability,
        candidates=candidates,
        best_index=0,
    )
"""

from __future__ import annotations

from typing import Dict, List, Optional

from engine.enums import ConfidenceLevel
from engine.solver_models import (
    CandidateRanking,
    ConsensusResult,
    ContradictionImpact,
    ContradictionReport,
    LightingHypothesis,
    PassWeightProfile,
    RegionalConfidenceSummary,
    RegionReliability,
    SignalContribution,
    SignalReliabilitySummary,
    SolverTrace,
    ValidationScore,
)


# ═══════════════════════════════════════════════════════════════════════════
# Thresholds
# ═══════════════════════════════════════════════════════════════════════════

_NEEDS_REVIEW_CONTRADICTION_THRESHOLD = 2   # >=2 high-severity contradictions
_NEEDS_REVIEW_CONSISTENCY_THRESHOLD = 0.4   # overall consistency below this
_LOW_CONFIDENCE_THRESHOLD = 0.3
_EXCLUDED_WEIGHT_THRESHOLD = 0.15


# ═══════════════════════════════════════════════════════════════════════════
# Main builder
# ═══════════════════════════════════════════════════════════════════════════

def build_solver_trace(
    *,
    consensus_result: Optional[ConsensusResult] = None,
    pass_weight_profile: Optional[PassWeightProfile] = None,
    contradiction_report: Optional[ContradictionReport] = None,
    region_reliability: Optional[RegionReliability] = None,
    candidates: Optional[List[LightingHypothesis]] = None,
    validation_scores: Optional[List[ValidationScore]] = None,
    best_index: int = 0,
    overall_consistency: float = 0.0,
    duration_ms: float = 0.0,
) -> SolverTrace:
    """Build a complete solver trace from pipeline outputs.

    All arguments are optional — the trace degrades gracefully when
    data is unavailable.
    """
    trace = SolverTrace(total_duration_ms=duration_ms)

    # ── Signal contributions ──
    if consensus_result and pass_weight_profile:
        contributions = _extract_signal_contributions(
            consensus_result, pass_weight_profile
        )
        trace.signal_contributions = contributions
        trace.top_contributors = _rank_contributors(contributions)

    # ── Downgraded signals (independent of consensus) ──
    if pass_weight_profile:
        trace.downgraded_signals = pass_weight_profile.downgraded_passes()

    # ── Contradiction impacts ──
    if contradiction_report:
        impacts = _extract_contradiction_impacts(contradiction_report)
        trace.contradiction_impacts = impacts
        trace.total_confidence_reduction = sum(
            ci.confidence_reduction for ci in impacts
        )

    # ── Candidate rankings ──
    cands = candidates or []
    trace.candidates_generated = len(cands)
    trace.final_candidate_count = len(cands)
    if cands:
        rankings = _build_candidate_rankings(
            cands, validation_scores, best_index
        )
        trace.candidate_rankings = rankings
        if rankings:
            trace.primary_candidate_explanation = rankings[0].ranking_explanation

    # ── Regional confidence ──
    if region_reliability:
        trace.regional_confidence = _build_regional_confidence(
            region_reliability
        )

    # ── Signal reliability ──
    if pass_weight_profile:
        trace.signal_reliability = _build_signal_reliability(
            pass_weight_profile
        )

    # ── Needs review? ──
    review_reasons = _check_needs_review(
        contradiction_report=contradiction_report,
        overall_consistency=overall_consistency,
        candidates=cands,
        best_index=best_index,
    )
    trace.needs_review = len(review_reasons) > 0
    trace.needs_review_reasons = review_reasons

    return trace


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _extract_signal_contributions(
    consensus: ConsensusResult,
    weights: PassWeightProfile,
) -> List[SignalContribution]:
    """Extract per-signal contribution records from consensus + weights."""
    contributions = []

    for dim_name, dim_consensus in consensus.dimensions.items():
        all_votes = dim_consensus.contributing_votes + dim_consensus.dissenting_votes
        contributing_names = {
            v.pass_name for v in dim_consensus.contributing_votes
        }

        for vote in all_votes:
            sw = weights.weights.get(vote.pass_name)
            base_w = sw.base_weight if sw else 1.0
            adj_w = sw.adjusted_weight if sw else vote.weight
            downgrade_reasons = sw.downgrade_reasons if sw else []

            contributions.append(SignalContribution(
                pass_name=vote.pass_name,
                dimension=dim_name,
                value_reported=vote.value,
                raw_confidence=vote.confidence,
                adjusted_weight=adj_w,
                effective_contribution=adj_w * vote.confidence,
                was_downgraded=adj_w < base_w,
                downgrade_reasons=list(downgrade_reasons),
                contributed_to_consensus=vote.pass_name in contributing_names,
            ))

    return contributions


def _rank_contributors(contributions: List[SignalContribution]) -> List[str]:
    """Rank pass names by total effective contribution across dimensions."""
    totals: Dict[str, float] = {}
    for c in contributions:
        if c.contributed_to_consensus:
            totals[c.pass_name] = totals.get(c.pass_name, 0.0) + c.effective_contribution
    return sorted(totals, key=lambda p: totals[p], reverse=True)


def _extract_contradiction_impacts(
    report: ContradictionReport,
) -> List[ContradictionImpact]:
    """Convert contradiction report entries into impact records."""
    impacts = []
    for c in report.contradictions:
        severity_penalty = {"low": 0.02, "medium": 0.08, "high": 0.15}
        penalty = severity_penalty.get(c.severity, 0.05)

        impacts.append(ContradictionImpact(
            contradiction_id=c.contradiction_id,
            dimension=c.dimension,
            severity=c.severity,
            passes_involved=[c.pass_a, c.pass_b],
            impact_description=(
                f"{c.dimension}: {c.pass_a} reports {c.value_a}, "
                f"{c.pass_b} reports {c.value_b}"
            ),
            confidence_reduction=penalty,
            triggered_alternate=c.severity == "high",
        ))

    return impacts


def _build_candidate_rankings(
    candidates: List[LightingHypothesis],
    validation_scores: Optional[List[ValidationScore]],
    best_index: int,
) -> List[CandidateRanking]:
    """Build ranked candidate list with explanations."""
    val_map: Dict[str, float] = {}
    if validation_scores:
        for vs in validation_scores:
            val_map[vs.hypothesis_id] = vs.overall_score

    rankings = []
    scored = []
    for i, cand in enumerate(candidates):
        val_score = val_map.get(cand.hypothesis_id, 0.0)
        total = cand.confidence * 0.6 + val_score * 0.4
        scored.append((i, cand, total, val_score))

    scored.sort(key=lambda x: x[2], reverse=True)

    for rank, (idx, cand, total, val_score) in enumerate(scored):
        explanation = _explain_ranking(cand, rank, total, val_score, idx == best_index)
        rankings.append(CandidateRanking(
            hypothesis_id=cand.hypothesis_id,
            rank=rank,
            total_score=total,
            consistency_score=val_score,
            signal_support_score=cand.confidence,
            ranking_explanation=explanation,
        ))

    return rankings


def _explain_ranking(
    cand: LightingHypothesis,
    rank: int,
    total: float,
    val_score: float,
    is_best: bool,
) -> str:
    """Generate a human-readable explanation for why a candidate ranked where it did."""
    parts = []
    conf_level = ConfidenceLevel.from_score(cand.confidence)

    if is_best:
        parts.append("Selected as primary candidate")
    else:
        parts.append(f"Alternate candidate (rank {rank + 1})")

    parts.append(f"with {conf_level.label.lower()} signal confidence ({cand.confidence:.2f})")

    if cand.generation_reason:
        parts.append(f"generated because: {cand.generation_reason}")

    if cand.constraint_violations:
        parts.append(
            f"with {len(cand.constraint_violations)} constraint violation(s)"
        )

    return "; ".join(parts)


def _build_regional_confidence(
    reliability: RegionReliability,
) -> RegionalConfidenceSummary:
    """Map region reliability scores to coarse confidence labels."""
    def _label(score: float) -> str:
        if score < 0.01:
            return "unavailable"
        if score < 0.3:
            return "low"
        if score < 0.6:
            return "moderate"
        return "high"

    notes = list(reliability.degradation_reasons) if reliability.degradation_reasons else []

    return RegionalConfidenceSummary(
        face_confidence=_label(reliability.face),
        torso_confidence=_label(reliability.torso),
        background_confidence=_label(reliability.background),
        catchlight_confidence=_label(reliability.face),  # catchlights depend on face
        shadow_confidence=_label(reliability.shadow_regions),
        highlight_confidence=_label(reliability.highlight_regions),
        summary_notes=notes,
    )


def _build_signal_reliability(
    weights: PassWeightProfile,
) -> SignalReliabilitySummary:
    """Map pass weights to coarse reliability labels."""
    summaries: Dict[str, str] = {}
    excluded: List[str] = []
    exclusion_reasons: Dict[str, str] = {}

    for name, sw in weights.weights.items():
        w = sw.adjusted_weight
        if w < _EXCLUDED_WEIGHT_THRESHOLD:
            summaries[name] = "excluded"
            excluded.append(name)
            reason = ", ".join(sw.downgrade_reasons) if sw.downgrade_reasons else "below threshold"
            exclusion_reasons[name] = reason
        elif w < 0.4:
            summaries[name] = "low"
        elif w < 0.7:
            summaries[name] = "moderate"
        else:
            summaries[name] = "high"

    return SignalReliabilitySummary(
        pass_summaries=summaries,
        excluded_passes=excluded,
        exclusion_reasons=exclusion_reasons,
    )


def _check_needs_review(
    *,
    contradiction_report: Optional[ContradictionReport],
    overall_consistency: float,
    candidates: List[LightingHypothesis],
    best_index: int,
) -> List[str]:
    """Determine whether the result needs human review."""
    reasons = []

    # High-severity contradictions
    if contradiction_report:
        high_count = contradiction_report.high_severity_count
        if high_count >= _NEEDS_REVIEW_CONTRADICTION_THRESHOLD:
            reasons.append(
                f"{high_count} high-severity contradictions detected"
            )

    # Low overall consistency
    if overall_consistency > 0 and overall_consistency < _NEEDS_REVIEW_CONSISTENCY_THRESHOLD:
        reasons.append(
            f"Overall consistency very low ({overall_consistency:.2f})"
        )

    # Best candidate has low confidence
    if candidates and 0 <= best_index < len(candidates):
        best = candidates[best_index]
        if best.confidence < _LOW_CONFIDENCE_THRESHOLD:
            reasons.append(
                f"Primary candidate confidence is low ({best.confidence:.2f})"
            )

    # Multiple candidates with similar scores
    if len(candidates) >= 2:
        top_conf = candidates[0].confidence if candidates else 0
        second_conf = candidates[1].confidence if len(candidates) > 1 else 0
        if top_conf > 0 and second_conf > 0:
            ratio = second_conf / top_conf
            if ratio > 0.85:
                reasons.append(
                    "Multiple candidates with similar confidence — ambiguous"
                )

    return reasons
