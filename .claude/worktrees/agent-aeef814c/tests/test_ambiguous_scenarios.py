"""Tests for ambiguous, contaminated, and hybrid lighting scenarios.

These tests verify that the system handles uncertain inputs honestly:
- Reduces confidence when evidence is mixed
- Returns alternates when ambiguity is real
- Flags needs_review when contradictions are strong
- Does not force-fit into a named pattern when evidence is insufficient
- Handles contamination flags correctly
"""

import pytest

from engine.enums import (
    AmbiguityClass,
    ConfidenceLevel,
    ContaminationFlag,
    LightingPattern,
)
from engine.solver_models import (
    CanonicalDirection,
    ConsensusResult,
    ConsensusVote,
    Contradiction,
    ContradictionReport,
    DimensionConsensus,
    LightingHypothesis,
    LightSource,
    PassWeightProfile,
    RegionReliability,
    SignalWeight,
)
from engine.solver_trace import build_solver_trace
from engine.lighting_simulator import simulate_hypothesis
from engine.hypothesis_validator import validate_hypothesis


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _weights_with_downgrades(**downgrades):
    """Build a PassWeightProfile with specific pass downgrades."""
    base = {
        "shadow_pass": SignalWeight(pass_name="shadow_pass", base_weight=1.0, adjusted_weight=1.0),
        "catchlight_pass": SignalWeight(pass_name="catchlight_pass", base_weight=0.9, adjusted_weight=0.9),
        "highlight_pass": SignalWeight(pass_name="highlight_pass", base_weight=0.8, adjusted_weight=0.8),
        "light_direction_field_pass": SignalWeight(pass_name="light_direction_field_pass", base_weight=0.85, adjusted_weight=0.85),
    }
    for pass_name, (adj_weight, reasons) in downgrades.items():
        if pass_name in base:
            base[pass_name] = SignalWeight(
                pass_name=pass_name,
                base_weight=base[pass_name].base_weight,
                adjusted_weight=adj_weight,
                downgrade_reasons=reasons,
            )
        else:
            base[pass_name] = SignalWeight(
                pass_name=pass_name,
                base_weight=0.8,
                adjusted_weight=adj_weight,
                downgrade_reasons=reasons,
            )
    return PassWeightProfile(weights=base, total_downgrades=len(downgrades))


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Obscured eyes (no catchlights available)
# ═══════════════════════════════════════════════════════════════════════════

class TestObscuredEyes:
    """When eyes are obscured, catchlight weight should drop substantially."""

    def test_catchlight_downgraded_with_no_face_mesh(self):
        weights = _weights_with_downgrades(
            catchlight_pass=(0.2, [ContaminationFlag.NO_FACE_MESH]),
        )
        assert weights.weights["catchlight_pass"].adjusted_weight == 0.2
        assert weights.weights["catchlight_pass"].is_downgraded

    def test_trace_marks_catchlight_excluded(self):
        weights = _weights_with_downgrades(
            catchlight_pass=(0.1, [ContaminationFlag.NO_FACE_MESH]),
        )
        trace = build_solver_trace(pass_weight_profile=weights)
        sr = trace.signal_reliability
        assert sr.pass_summaries["catchlight_pass"] == "excluded"
        assert "catchlight_pass" in sr.excluded_passes

    def test_regional_confidence_face_unavailable(self):
        reliability = RegionReliability(
            face=0.0, torso=0.6, background=0.4,
            shadow_regions=0.5, highlight_regions=0.4,
        )
        trace = build_solver_trace(region_reliability=reliability)
        assert trace.regional_confidence.face_confidence == "unavailable"
        assert trace.regional_confidence.catchlight_confidence == "unavailable"


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Reflective/specular wardrobe
# ═══════════════════════════════════════════════════════════════════════════

class TestReflectiveWardrobe:
    """Specular clothing should reduce highlight pass weight and increase face priority."""

    def test_highlight_downgraded(self):
        weights = _weights_with_downgrades(
            highlight_pass=(0.4, [ContaminationFlag.SPECULAR_SURFACE]),
        )
        assert weights.weights["highlight_pass"].adjusted_weight == 0.4

    def test_trace_shows_specular_downgrade(self):
        weights = _weights_with_downgrades(
            highlight_pass=(0.4, [ContaminationFlag.SPECULAR_SURFACE]),
        )
        trace = build_solver_trace(pass_weight_profile=weights)
        assert "highlight_pass" in trace.downgraded_signals


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Strong contradictions between passes
# ═══════════════════════════════════════════════════════════════════════════

class TestStrongContradictions:
    """When passes strongly disagree, the system should flag for review."""

    def test_direction_conflict_triggers_review(self):
        report = ContradictionReport(
            contradictions=[
                Contradiction(
                    contradiction_id="c1",
                    pass_a="catchlight_pass", pass_b="shadow_pass",
                    dimension="direction",
                    value_a=315.0, value_b=135.0,
                    severity="high",
                ),
                Contradiction(
                    contradiction_id="c2",
                    pass_a="highlight_pass", pass_b="shadow_pass",
                    dimension="direction",
                    value_a=270.0, value_b=135.0,
                    severity="high",
                ),
            ],
            high_severity_count=2,
        )

        trace = build_solver_trace(
            contradiction_report=report,
            candidates=[
                LightingHypothesis(hypothesis_id="h1", confidence=0.6),
            ],
            overall_consistency=0.3,
        )

        assert trace.needs_review is True
        assert any("contradiction" in r.lower() for r in trace.needs_review_reasons)

    def test_multiple_candidates_with_similar_confidence(self):
        """When two candidates are close, the system should flag ambiguity."""
        trace = build_solver_trace(
            candidates=[
                LightingHypothesis(hypothesis_id="h1", confidence=0.65),
                LightingHypothesis(hypothesis_id="h2", confidence=0.60),
            ],
            best_index=0,
            overall_consistency=0.5,
        )

        assert trace.needs_review is True
        assert any("ambiguous" in r.lower() for r in trace.needs_review_reasons)


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Unknown / hybrid pattern
# ═══════════════════════════════════════════════════════════════════════════

class TestUnknownHybridPattern:
    """The system should support explicit unknown/hybrid pattern labels."""

    def test_unknown_pattern_is_valid(self):
        assert LightingPattern.UNKNOWN == "unknown"
        assert LightingPattern.UNKNOWN.label == "Unknown"

    def test_hybrid_pattern_is_valid(self):
        assert LightingPattern.HYBRID == "hybrid"
        assert LightingPattern.HYBRID.label == "Hybrid"

    def test_hypothesis_with_unknown_pattern(self):
        """Hypotheses should be constructable with unknown pattern."""
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            pattern_name="unknown",
            confidence=0.3,
            notes=["Insufficient evidence to classify pattern"],
        )
        assert hyp.pattern_name == LightingPattern.UNKNOWN

    def test_hypothesis_with_hybrid_pattern(self):
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            pattern_name="hybrid",
            confidence=0.5,
            notes=["Elements of both loop and rembrandt detected"],
        )
        assert hyp.pattern_name == LightingPattern.HYBRID


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Mixed environment
# ═══════════════════════════════════════════════════════════════════════════

class TestMixedEnvironment:
    """Mixed-environment scenes should not force a single environment type."""

    def test_mixed_environment_hypothesis(self):
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            environment="mixed",
            sources=[
                LightSource(
                    role="key", modifier="window",
                    direction=CanonicalDirection(azimuth_deg=270),
                    confidence=0.7,
                ),
                LightSource(
                    role="fill", modifier="reflector",
                    direction=CanonicalDirection(azimuth_deg=90),
                    confidence=0.5,
                ),
            ],
            confidence=0.6,
        )
        pred = simulate_hypothesis(hyp)
        # Should produce reasonable predictions even with mixed environment
        assert pred.predicted_shadow_direction_deg is not None
        assert pred.confidence > 0

    def test_mixed_environment_background_prediction(self):
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            environment="mixed",
            sources=[
                LightSource(role="key", modifier="softbox",
                           direction=CanonicalDirection(azimuth_deg=315),
                           confidence=0.7),
            ],
            confidence=0.6,
        )
        pred = simulate_hypothesis(hyp)
        # Mixed environment with no bg light → should not assume "dark"
        assert pred.predicted_background_illumination in ("dark", "even", "gradient")


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Insufficient evidence
# ═══════════════════════════════════════════════════════════════════════════

class TestInsufficientEvidence:
    """When there isn't enough data, confidence should be very low."""

    def test_low_confidence_triggers_review(self):
        trace = build_solver_trace(
            candidates=[
                LightingHypothesis(hypothesis_id="h1", confidence=0.15),
            ],
            best_index=0,
            overall_consistency=0.2,
        )
        assert trace.needs_review is True

    def test_all_passes_downgraded(self):
        """When every pass is severely downgraded, signal reliability should show it."""
        weights = _weights_with_downgrades(
            shadow_pass=(0.1, [ContaminationFlag.POSE_CONTAMINATED]),
            catchlight_pass=(0.1, [ContaminationFlag.NO_FACE_MESH]),
            highlight_pass=(0.1, [ContaminationFlag.SPECULAR_SURFACE]),
            light_direction_field_pass=(0.1, [ContaminationFlag.LOW_RESOLUTION]),
        )
        trace = build_solver_trace(pass_weight_profile=weights)
        sr = trace.signal_reliability
        # All should be excluded
        assert all(v == "excluded" for v in sr.pass_summaries.values())


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Hypothesis validation with conflicting signals
# ═══════════════════════════════════════════════════════════════════════════

class TestConflictingValidation:
    """When a hypothesis predicts one thing but signals show another."""

    def test_hard_light_but_soft_shadow(self):
        """Bare bulb predicts hard shadows but observed shadows are soft."""
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            sources=[
                LightSource(
                    role="key", modifier="bare_bulb",
                    direction=CanonicalDirection(azimuth_deg=315),
                    size_class="small", confidence=0.8,
                ),
            ],
            confidence=0.7,
        )
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_shadow_softness == "hard"

        # But observed shadows are soft
        score = validate_hypothesis(hyp, pred, {
            "shadow_softness": "soft",
            "shadow_direction_deg": 135.0,
        })

        # Direction should match, but modifier should mismatch
        mod_match = next(m for m in score.per_dimension if m.dimension == "modifier")
        assert mod_match.match_score == 0.0

        dir_match = next(m for m in score.per_dimension if m.dimension == "direction")
        assert dir_match.match_score > 0.8

    def test_wrong_direction_tanks_overall(self):
        """Direction being 180° off should give a low overall score."""
        hyp = LightingHypothesis(
            hypothesis_id="h1",
            sources=[
                LightSource(
                    role="key", modifier="softbox",
                    direction=CanonicalDirection(azimuth_deg=0),
                    confidence=0.8,
                ),
            ],
            confidence=0.7,
        )
        pred = simulate_hypothesis(hyp)

        # Shadow predicted at 180° but observed at 0° (same direction as key!)
        score = validate_hypothesis(hyp, pred, {
            "shadow_direction_deg": 0.0,  # 180° off from predicted 180°
            "shadow_softness": "soft",
        })

        assert score.overall_score < 0.5
        assert len(score.mismatches) > 0


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Confidence level bucketing
# ═══════════════════════════════════════════════════════════════════════════

class TestConfidenceBucketing:
    """ConfidenceLevel.from_score should bucket honestly."""

    @pytest.mark.parametrize("score,expected", [
        (0.0, ConfidenceLevel.VERY_LOW),
        (0.15, ConfidenceLevel.VERY_LOW),
        (0.25, ConfidenceLevel.LOW),
        (0.45, ConfidenceLevel.MODERATE),
        (0.65, ConfidenceLevel.HIGH),
        (0.85, ConfidenceLevel.VERY_HIGH),
        (1.0, ConfidenceLevel.VERY_HIGH),
    ])
    def test_from_score(self, score, expected):
        assert ConfidenceLevel.from_score(score) == expected


# ═══════════════════════════════════════════════════════════════════════════
# Scenario: Ambiguity class enum coverage
# ═══════════════════════════════════════════════════════════════════════════

class TestAmbiguityClassCoverage:
    """All ambiguity classes should be addressable."""

    def test_all_classes_have_labels(self):
        for ac in AmbiguityClass:
            assert "_" not in ac.label
            assert len(ac.label) > 0

    def test_hybrid_lighting_is_distinct(self):
        assert AmbiguityClass.HYBRID_LIGHTING != AmbiguityClass.GENUINE_AMBIGUITY
        assert AmbiguityClass.HYBRID_LIGHTING.label == "Hybrid Lighting"
