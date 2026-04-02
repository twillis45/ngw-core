"""Tests for the solver trace builder."""

import pytest

from engine.solver_models import (
    ConsensusResult,
    ConsensusVote,
    Contradiction,
    ContradictionReport,
    DimensionConsensus,
    LightingHypothesis,
    PassWeightProfile,
    RegionReliability,
    SignalWeight,
    ValidationScore,
)
from engine.solver_trace import build_solver_trace


def _make_weights(**overrides):
    """Build a PassWeightProfile with default weights."""
    defaults = {
        "shadow_pass": SignalWeight(pass_name="shadow_pass", base_weight=1.0, adjusted_weight=1.0),
        "catchlight_pass": SignalWeight(pass_name="catchlight_pass", base_weight=0.9, adjusted_weight=0.9),
        "highlight_pass": SignalWeight(pass_name="highlight_pass", base_weight=0.8, adjusted_weight=0.8),
    }
    defaults.update(overrides)
    return PassWeightProfile(weights=defaults)


def _make_consensus():
    """Build a simple consensus result with two dimensions."""
    return ConsensusResult(
        dimensions={
            "direction": DimensionConsensus(
                dimension="direction",
                consensus_value=315.0,
                consensus_confidence=0.85,
                contributing_votes=[
                    ConsensusVote(pass_name="shadow_pass", value=310.0, weight=1.0, confidence=0.9),
                    ConsensusVote(pass_name="catchlight_pass", value=320.0, weight=0.9, confidence=0.8),
                ],
                dissenting_votes=[
                    ConsensusVote(pass_name="highlight_pass", value=45.0, weight=0.8, confidence=0.4),
                ],
            ),
            "height": DimensionConsensus(
                dimension="height",
                consensus_value="high",
                consensus_confidence=0.7,
                contributing_votes=[
                    ConsensusVote(pass_name="shadow_pass", value="high", weight=1.0, confidence=0.8),
                ],
                dissenting_votes=[],
            ),
        },
        overall_agreement=0.77,
        dominant_direction_deg=315.0,
        dominant_height_class="high",
    )


def _make_contradictions(high_count=0):
    contradictions = []
    for i in range(high_count):
        contradictions.append(Contradiction(
            contradiction_id=f"c_{i}",
            pass_a="shadow_pass",
            pass_b="catchlight_pass",
            dimension="direction",
            value_a=310.0,
            value_b=120.0,
            severity="high",
            resolution_hint="Check for multiple light sources",
        ))
    return ContradictionReport(
        contradictions=contradictions,
        high_severity_count=high_count,
    )


def _make_candidates(count=2, confidences=None):
    confs = confidences or [0.8, 0.5]
    return [
        LightingHypothesis(
            hypothesis_id=f"h_{i}",
            confidence=confs[i] if i < len(confs) else 0.3,
            generation_reason="primary" if i == 0 else "alternate",
        )
        for i in range(count)
    ]


class TestBuildSolverTrace:
    """Tests for the main build_solver_trace function."""

    def test_empty_call(self):
        """Should return a valid trace with no data."""
        trace = build_solver_trace()
        assert trace.total_duration_ms == 0.0
        assert trace.signal_contributions == []
        assert trace.needs_review is False

    def test_with_all_inputs(self):
        trace = build_solver_trace(
            consensus_result=_make_consensus(),
            pass_weight_profile=_make_weights(),
            contradiction_report=_make_contradictions(high_count=1),
            region_reliability=RegionReliability(
                face=0.9, torso=0.6, background=0.3,
                shadow_regions=0.7, highlight_regions=0.5,
            ),
            candidates=_make_candidates(),
            best_index=0,
            overall_consistency=0.7,
            duration_ms=150.0,
        )
        assert trace.total_duration_ms == 150.0
        assert len(trace.signal_contributions) > 0
        assert len(trace.top_contributors) > 0
        assert len(trace.contradiction_impacts) == 1
        assert len(trace.candidate_rankings) == 2
        assert trace.regional_confidence is not None
        assert trace.signal_reliability is not None

    def test_signal_contributions_include_dissenting(self):
        trace = build_solver_trace(
            consensus_result=_make_consensus(),
            pass_weight_profile=_make_weights(),
        )
        # highlight_pass is dissenting on direction
        dissenting = [
            c for c in trace.signal_contributions
            if c.pass_name == "highlight_pass" and not c.contributed_to_consensus
        ]
        assert len(dissenting) > 0

    def test_top_contributors_ranked_by_contribution(self):
        trace = build_solver_trace(
            consensus_result=_make_consensus(),
            pass_weight_profile=_make_weights(),
        )
        # shadow_pass should rank first (highest weight * confidence)
        assert trace.top_contributors[0] == "shadow_pass"

    def test_downgraded_signals_tracked(self):
        weights = _make_weights(
            catchlight_pass=SignalWeight(
                pass_name="catchlight_pass",
                base_weight=0.9,
                adjusted_weight=0.3,
                downgrade_reasons=["no_face_mesh"],
            ),
        )
        trace = build_solver_trace(
            consensus_result=_make_consensus(),
            pass_weight_profile=weights,
        )
        assert "catchlight_pass" in trace.downgraded_signals


class TestNeedsReview:
    """Tests for the needs_review flag logic."""

    def test_no_review_clean(self):
        trace = build_solver_trace(
            contradiction_report=_make_contradictions(high_count=0),
            candidates=_make_candidates(1, [0.8]),
            overall_consistency=0.8,
        )
        assert trace.needs_review is False

    def test_review_high_contradictions(self):
        trace = build_solver_trace(
            contradiction_report=_make_contradictions(high_count=3),
            candidates=_make_candidates(1, [0.8]),
            overall_consistency=0.8,
        )
        assert trace.needs_review is True
        assert any("contradiction" in r.lower() for r in trace.needs_review_reasons)

    def test_review_low_consistency(self):
        trace = build_solver_trace(
            contradiction_report=_make_contradictions(0),
            candidates=_make_candidates(1, [0.8]),
            overall_consistency=0.2,
        )
        assert trace.needs_review is True
        assert any("consistency" in r.lower() for r in trace.needs_review_reasons)

    def test_review_low_confidence(self):
        trace = build_solver_trace(
            candidates=_make_candidates(1, [0.15]),
            best_index=0,
            overall_consistency=0.8,
        )
        assert trace.needs_review is True
        assert any("confidence" in r.lower() for r in trace.needs_review_reasons)

    def test_review_ambiguous_candidates(self):
        # Two candidates with nearly equal confidence
        trace = build_solver_trace(
            candidates=_make_candidates(2, [0.75, 0.72]),
            best_index=0,
            overall_consistency=0.7,
        )
        assert trace.needs_review is True
        assert any("ambiguous" in r.lower() for r in trace.needs_review_reasons)


class TestRegionalConfidence:
    def test_maps_scores_to_labels(self):
        trace = build_solver_trace(
            region_reliability=RegionReliability(
                face=0.9,
                torso=0.0,
                background=0.5,
                shadow_regions=0.2,
                highlight_regions=0.7,
            ),
        )
        rc = trace.regional_confidence
        assert rc.face_confidence == "high"
        assert rc.torso_confidence == "unavailable"
        assert rc.background_confidence == "moderate"
        assert rc.shadow_confidence == "low"
        assert rc.highlight_confidence == "high"


class TestSignalReliability:
    def test_labels_passes(self):
        weights = _make_weights(
            shadow_pass=SignalWeight(pass_name="shadow_pass", base_weight=1.0, adjusted_weight=0.1),
        )
        trace = build_solver_trace(pass_weight_profile=weights)
        sr = trace.signal_reliability
        assert sr.pass_summaries["shadow_pass"] == "excluded"
        assert "shadow_pass" in sr.excluded_passes
        assert sr.pass_summaries["catchlight_pass"] == "high"


class TestContradictionImpact:
    def test_impact_records(self):
        trace = build_solver_trace(
            contradiction_report=_make_contradictions(high_count=2),
        )
        assert len(trace.contradiction_impacts) == 2
        assert trace.total_confidence_reduction > 0
        assert all(ci.triggered_alternate for ci in trace.contradiction_impacts)
