"""Tests for engine/consensus_solver.py

Covers:
  1.  Empty inputs (no pass outputs)
  2.  Single-pass direction consensus (shadow pass only)
  3.  Multi-pass direction consensus (shadow + catchlight + LDF agreeing)
  4.  Multi-pass direction with disagreement (one dissenting)
  5.  Height class consensus (shadow + catchlight agreeing on "high")
  6.  Height class with mixed votes
  7.  Modifier consensus
  8.  Light count numeric consensus
  9.  Environment consensus (studio, outdoor, mixed)
  10. Full solve_dominant_source with realistic multi-pass data
  11. consensus_confidence helper

Organisation: ~50 tests across class-based groups for each dimension
and integration scenarios.
"""

import math

import pytest

from engine.consensus_solver import (
    _build_categorical_consensus,
    _build_direction_consensus,
    _build_numeric_consensus,
    _extract_direction_votes,
    _extract_environment_votes,
    _extract_height_votes,
    _extract_light_count_votes,
    _extract_modifier_votes,
    consensus_confidence,
    solve_dominant_source,
)
from engine.signal_weights import compute_pass_weights
from engine.solver_constants import CLOCK_TO_AZIMUTH, PASS_WEIGHT_DEFAULTS
from engine.solver_models import (
    ConsensusResult,
    ConsensusVote,
    DimensionConsensus,
    PassWeightProfile,
    SignalWeight,
)


# ======================================================================
# Helpers
# ======================================================================


def _default_weights() -> PassWeightProfile:
    """Return a PassWeightProfile with default weights from compute_pass_weights."""
    return compute_pass_weights()


def _custom_weights(**overrides: float) -> PassWeightProfile:
    """Build a PassWeightProfile with defaults, plus overrides by pass name."""
    profile = compute_pass_weights()
    for pass_name, weight_val in overrides.items():
        if pass_name in profile.weights:
            profile.weights[pass_name].adjusted_weight = weight_val
        else:
            profile.weights[pass_name] = SignalWeight(
                pass_name=pass_name,
                base_weight=weight_val,
                adjusted_weight=weight_val,
            )
    return profile


def _shadow_pass(shadow_deg: float, vert_deg: float = 0.0, conf: float = 0.8) -> dict:
    return {
        "ok": True,
        "shadow_vector_deg": shadow_deg,
        "shadow_vertical_angle_deg": vert_deg,
        "confidence": conf,
    }


def _ldf_pass(deg: float, conf: float = 0.7) -> dict:
    return {
        "ok": True,
        "dominant_light_vector_deg": deg,
        "confidence": conf,
    }


def _catchlight_pass(
    clock: int, count: int = 1, conf: float = 0.75, shapes: list = None
) -> dict:
    return {
        "ok": True,
        "primary_clock_position": clock,
        "catchlight_count": count,
        "shapes_seen": shapes or ["round"],
        "confidence": conf,
    }


def _modifier_pass(modifier: str, conf: float = 0.8) -> dict:
    return {
        "ok": True,
        "primary_modifier": modifier,
        "confidence": conf,
    }


def _penumbra_pass(size_class: str, conf: float = 0.7) -> dict:
    return {
        "ok": True,
        "estimated_source_size_class": size_class,
        "confidence": conf,
    }


def _hypothesis_engine(count: int, count_conf: float = 0.8, conf: float = 0.85) -> dict:
    return {
        "ok": True,
        "likely_light_count": count,
        "light_count_confidence": count_conf,
        "confidence": conf,
    }


def _environment_pass(env_type: str, conf: float = 0.8) -> dict:
    return {
        "ok": True,
        "environment_type": env_type,
        "confidence": conf,
    }


def _solar_pass(detected: bool = True, conf: float = 0.7) -> dict:
    return {
        "ok": True,
        "sun_detected": detected,
        "confidence": conf,
    }


def _window_pass(detected: bool = True, conf: float = 0.7) -> dict:
    return {
        "ok": True,
        "window_detected": detected,
        "confidence": conf,
    }


# ======================================================================
# 1. Empty Inputs
# ======================================================================


class TestEmptyInputs:
    """When no pass outputs are provided, the solver should return a valid
    ConsensusResult with no dominant values and zero agreement."""

    def test_empty_dict_returns_valid_result(self):
        result = solve_dominant_source({}, _default_weights())
        assert isinstance(result, ConsensusResult)

    def test_empty_dict_all_dimensions_present(self):
        result = solve_dominant_source({}, _default_weights())
        for dim in ("direction", "height", "modifier", "light_count", "environment"):
            assert dim in result.dimensions

    def test_empty_dict_no_dominant_direction(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.dominant_direction_deg is None

    def test_empty_dict_no_dominant_height(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.dominant_height_class is None

    def test_empty_dict_no_dominant_modifier(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.dominant_modifier is None

    def test_empty_dict_no_dominant_light_count(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.dominant_light_count is None

    def test_empty_dict_no_dominant_environment(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.dominant_environment is None

    def test_empty_dict_zero_overall_agreement(self):
        result = solve_dominant_source({}, _default_weights())
        assert result.overall_agreement == pytest.approx(0.0)

    def test_failed_passes_ignored(self):
        """Passes with ok=False should be ignored."""
        outputs = {
            "shadow_pass": {"ok": False, "shadow_vector_deg": 45.0, "confidence": 0.9},
            "catchlight_pass": {"ok": False, "primary_clock_position": 2, "confidence": 0.9},
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg is None

    def test_non_dict_passes_ignored(self):
        """Non-dict pass values should be gracefully skipped."""
        outputs = {
            "shadow_pass": "not a dict",
            "catchlight_pass": None,
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg is None


# ======================================================================
# 2. Single-Pass Direction Consensus (Shadow Pass Only)
# ======================================================================


class TestSinglePassDirection:
    """Shadow pass is the only direction contributor."""

    def test_shadow_pass_only_produces_direction(self):
        # Shadow falls at 0 deg -> canonical = 0 + 180 = 180 deg (behind)
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.8)}
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg is not None

    def test_shadow_pass_canonical_conversion(self):
        # Shadow falls at 0 deg -> key light canonical = 180 deg (behind)
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.9)}
        result = solve_dominant_source(outputs, _default_weights())
        assert abs(result.dominant_direction_deg) == pytest.approx(180.0, abs=1.0)

    def test_shadow_45_deg_right(self):
        # Shadow falls at -135 deg -> canonical = -135 + 180 = 45 deg (front-right)
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=-135.0, conf=0.9)}
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg == pytest.approx(45.0, abs=1.0)

    def test_single_pass_has_one_contributing_vote(self):
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.8)}
        result = solve_dominant_source(outputs, _default_weights())
        dir_dim = result.dimensions["direction"]
        assert len(dir_dim.contributing_votes) == 1
        assert len(dir_dim.dissenting_votes) == 0

    def test_single_pass_confidence_equals_resultant(self):
        # With a single angle, the weighted circular mean resultant should be 1.0
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.8)}
        result = solve_dominant_source(outputs, _default_weights())
        dir_dim = result.dimensions["direction"]
        assert dir_dim.consensus_confidence == pytest.approx(1.0, abs=0.01)


# ======================================================================
# 3. Multi-Pass Direction Consensus (Agreement)
# ======================================================================


class TestMultiPassDirectionAgreement:
    """Shadow, catchlight, and LDF all agree on approximately the same direction."""

    def test_three_passes_agreeing(self):
        # Shadow at -180 deg -> canonical = -180 + 180 = 0 deg (front)
        # LDF at 0 deg (already canonical) -> 0 deg (front)
        # Catchlight at clock 12 -> 0 deg (front)
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg == pytest.approx(0.0, abs=5.0)

    def test_three_passes_high_confidence(self):
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        dir_dim = result.dimensions["direction"]
        assert dir_dim.consensus_confidence > 0.9

    def test_all_contributing_none_dissenting(self):
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        dir_dim = result.dimensions["direction"]
        assert len(dir_dim.contributing_votes) == 3
        assert len(dir_dim.dissenting_votes) == 0

    def test_right_side_agreement(self):
        # Shadow at -90 deg -> canonical = -90+180 = 90 (right)
        # LDF at 90 deg (already canonical)
        # Catchlight at clock 3 -> 90 deg
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-90.0, conf=0.85),
            "light_direction_field_pass": _ldf_pass(deg=90.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=3, conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_direction_deg == pytest.approx(90.0, abs=5.0)


# ======================================================================
# 4. Multi-Pass Direction with Disagreement
# ======================================================================


class TestMultiPassDirectionDisagreement:
    """One pass disagrees with the others, creating a dissenting vote."""

    def test_one_dissenter_direction(self):
        # Shadow -> canonical 0 (front), LDF -> 0 (front), catchlight clock 6 -> 180 (behind)
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=6, conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        dir_dim = result.dimensions["direction"]
        assert len(dir_dim.dissenting_votes) >= 1

    def test_dissenter_does_not_dominate(self):
        # With two passes at 0 and one at 180, consensus should be near 0
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=5.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=6, conf=0.5),
        }
        result = solve_dominant_source(outputs, _default_weights())
        # Should be closer to 0 than to 180
        assert abs(result.dominant_direction_deg) < 90.0

    def test_dissenter_lowers_confidence(self):
        # First: all agree
        outputs_agree = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result_agree = solve_dominant_source(outputs_agree, _default_weights())

        # Second: one dissents
        outputs_dissent = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=6, conf=0.85),
        }
        result_dissent = solve_dominant_source(outputs_dissent, _default_weights())

        assert result_dissent.dimensions["direction"].consensus_confidence < (
            result_agree.dimensions["direction"].consensus_confidence
        )

    def test_spread_increases_with_disagreement(self):
        outputs_agree = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
        }
        outputs_spread = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.8),
        }
        result_agree = solve_dominant_source(outputs_agree, _default_weights())
        result_spread = solve_dominant_source(outputs_spread, _default_weights())
        # Shadow at 0 -> canonical 180, LDF at 0. These disagree by 180 deg.
        assert result_spread.dimensions["direction"].spread > (
            result_agree.dimensions["direction"].spread
        )


# ======================================================================
# 5. Height Class Consensus (Agreement)
# ======================================================================


class TestHeightClassAgreement:
    """Shadow and catchlight both indicate "high"."""

    def test_shadow_high_catchlight_high(self):
        # Shadow vertical angle 45 deg -> "high" (threshold 20 to 90)
        # Catchlight clock 12 -> "high" (clock 10-2 = high)
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=45.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_height_class == "high"

    def test_height_confidence_when_agreeing(self):
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=45.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=1, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        height_dim = result.dimensions["height"]
        assert height_dim.consensus_confidence == pytest.approx(1.0, abs=0.01)

    def test_eye_level_agreement(self):
        # Shadow vertical angle 5 deg -> "eye_level" (threshold -10 to 20)
        # Catchlight clock 3 -> "eye_level"
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=5.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=3, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_height_class == "eye_level"

    def test_low_agreement(self):
        # Shadow vertical angle -30 deg -> "low"
        # Catchlight clock 5 -> "low" (clock 4-8 = low)
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=-30.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=5, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_height_class == "low"


# ======================================================================
# 6. Height Class with Mixed Votes
# ======================================================================


class TestHeightClassMixed:
    """Shadow and catchlight disagree on height class."""

    def test_high_vs_eye_level(self):
        # Shadow says high (vert 45), catchlight clock 3 says eye_level
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=45.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=3, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        height_dim = result.dimensions["height"]
        # Should have one dissenting vote
        assert len(height_dim.dissenting_votes) == 1

    def test_winner_has_higher_effective_weight(self):
        # Shadow weight=1.0, conf=0.9, catchlight weight=0.9, conf=0.5
        # Shadow effective = 1.0*0.9 = 0.9 > catchlight effective = 0.9*0.5 = 0.45
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=45.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=3, conf=0.5),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_height_class == "high"

    def test_low_vs_high_consensus_confidence_below_one(self):
        # Complete disagreement -> confidence should be less than 1.0
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=-30.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        height_dim = result.dimensions["height"]
        assert height_dim.consensus_confidence < 1.0


# ======================================================================
# 7. Modifier Consensus
# ======================================================================


class TestModifierConsensus:
    """Modifier family votes from modifier_shape_solver and penumbra passes."""

    def test_single_modifier_pass(self):
        outputs = {
            "modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "softbox"

    def test_penumbra_large_maps_to_softbox(self):
        outputs = {
            "shadow_penumbra_pass": _penumbra_pass("large", conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "softbox"

    def test_penumbra_small_maps_to_bare(self):
        outputs = {
            "shadow_penumbra_pass": _penumbra_pass("small", conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "bare"

    def test_penumbra_medium_maps_to_beauty_dish(self):
        outputs = {
            "shadow_penumbra_pass": _penumbra_pass("medium", conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "beauty_dish"

    def test_penumbra_very_large_maps_to_umbrella(self):
        outputs = {
            "shadow_penumbra_pass": _penumbra_pass("very_large", conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "umbrella"

    def test_modifier_agreement_two_sources(self):
        # Both agree on softbox
        outputs = {
            "modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.85),
            "shadow_penumbra_pass": _penumbra_pass("large", conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier == "softbox"
        mod_dim = result.dimensions["modifier"]
        assert mod_dim.consensus_confidence == pytest.approx(1.0, abs=0.01)

    def test_modifier_disagreement(self):
        # Modifier says softbox, penumbra says bare
        outputs = {
            "modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.8),
            "shadow_penumbra_pass": _penumbra_pass("small", conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        mod_dim = result.dimensions["modifier"]
        assert len(mod_dim.dissenting_votes) == 1
        assert mod_dim.consensus_confidence < 1.0

    def test_unknown_modifier_ignored(self):
        outputs = {
            "modifier_shape_solver_pass": _modifier_pass("unknown", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier is None

    def test_unknown_penumbra_size_ignored(self):
        outputs = {
            "shadow_penumbra_pass": _penumbra_pass("unknown", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_modifier is None


# ======================================================================
# 8. Light Count Numeric Consensus
# ======================================================================


class TestLightCountConsensus:
    """Light count via lighting_hypothesis_engine and catchlight_count."""

    def test_single_hypothesis_engine_count(self):
        outputs = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2, count_conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_light_count == 2

    def test_catchlight_count_contributes(self):
        # catchlight_count=3 from catchlight pass
        outputs = {
            "catchlight_pass": _catchlight_pass(clock=1, count=3, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_light_count == 3

    def test_hypothesis_and_catchlight_agree(self):
        outputs = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2, count_conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=1, count=2, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_light_count == 2

    def test_hypothesis_and_catchlight_disagree(self):
        # Hypothesis says 1, catchlight says 3
        outputs = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=1, count_conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=1, count=3, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        count_dim = result.dimensions["light_count"]
        # Weighted average should be between 1 and 3
        assert 1.0 <= float(count_dim.consensus_value) <= 3.0

    def test_zero_catchlight_count_ignored(self):
        # catchlight_count=0 should not produce a vote
        outputs = {
            "catchlight_pass": _catchlight_pass(clock=1, count=0, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_light_count is None

    def test_light_count_rounds_to_int(self):
        outputs = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2, count_conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=1, count=3, conf=0.3),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert isinstance(result.dominant_light_count, int)


# ======================================================================
# 9. Environment Consensus
# ======================================================================


class TestEnvironmentConsensus:
    """Environment classification: studio, outdoor_sun, indoor_ambient, mixed."""

    def test_studio_from_environment_pass(self):
        outputs = {
            "environment_light_pass": _environment_pass("studio", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment == "studio"

    def test_outdoor_from_solar_pass(self):
        outputs = {
            "solar_geometry_pass": _solar_pass(detected=True, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment == "outdoor_sun"

    def test_indoor_ambient_from_window_pass(self):
        outputs = {
            "window_geometry_pass": _window_pass(detected=True, conf=0.7),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment == "indoor_ambient"

    def test_mixed_environment_votes(self):
        # Environment says studio, solar says outdoor_sun
        outputs = {
            "environment_light_pass": _environment_pass("studio", conf=0.9),
            "solar_geometry_pass": _solar_pass(detected=True, conf=0.8),
        }
        result = solve_dominant_source(outputs, _default_weights())
        env_dim = result.dimensions["environment"]
        assert len(env_dim.dissenting_votes) == 1

    def test_environment_unknown_ignored(self):
        outputs = {
            "environment_light_pass": _environment_pass("unknown", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment is None

    def test_solar_not_detected_no_vote(self):
        outputs = {
            "solar_geometry_pass": _solar_pass(detected=False, conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment is None

    def test_window_not_detected_no_vote(self):
        outputs = {
            "window_geometry_pass": _window_pass(detected=False, conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert result.dominant_environment is None


# ======================================================================
# 10. Full solve_dominant_source Integration
# ======================================================================


class TestSolveDominantSourceIntegration:
    """Realistic multi-pass scenarios going through the full solver."""

    def test_classic_portrait_setup(self):
        """Rembrandt-style portrait: key light upper-right, studio, softbox, 2 lights."""
        outputs = {
            # Shadow falls lower-left -> key is upper-right
            # Shadow at -135 deg -> canonical = -135+180 = 45 (right-front)
            "shadow_pass": _shadow_pass(shadow_deg=-135.0, vert_deg=40.0, conf=0.9),
            # LDF agrees: 45 deg
            "light_direction_field_pass": _ldf_pass(deg=45.0, conf=0.8),
            # Catchlight at 2 o'clock -> 60 deg (close to 45)
            "catchlight_pass": _catchlight_pass(clock=2, count=2, conf=0.85),
            # Modifier: softbox
            "modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.8),
            "shadow_penumbra_pass": _penumbra_pass("large", conf=0.75),
            # 2 lights
            "lighting_hypothesis_engine": _hypothesis_engine(count=2, count_conf=0.9),
            # Studio
            "environment_light_pass": _environment_pass("studio", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())

        # Direction ~ 45-50 deg (right-front)
        assert 30.0 <= result.dominant_direction_deg <= 70.0
        assert result.dominant_height_class == "high"
        assert result.dominant_modifier == "softbox"
        assert result.dominant_light_count == 2
        assert result.dominant_environment == "studio"
        assert result.overall_agreement > 0.5

    def test_outdoor_natural_light(self):
        """Outdoor shot with sun from right side."""
        outputs = {
            # Shadow falls left -> key is right: shadow at 90 -> canonical = 90+180=270 -> -90
            # Actually shadow at 90 means shadow goes right. So key is left.
            # For key from right: shadow at -90 -> canonical -90+180 = 90
            "shadow_pass": _shadow_pass(shadow_deg=-90.0, vert_deg=50.0, conf=0.7),
            "solar_geometry_pass": _solar_pass(detected=True, conf=0.85),
            "environment_light_pass": _environment_pass("outdoor_sun", conf=0.8),
            "lighting_hypothesis_engine": _hypothesis_engine(count=1, count_conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())

        assert result.dominant_direction_deg == pytest.approx(90.0, abs=5.0)
        assert result.dominant_height_class == "high"
        assert result.dominant_environment == "outdoor_sun"
        assert result.dominant_light_count == 1

    def test_all_dimensions_populated(self):
        """When all passes contribute, all dimensions should have values."""
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=30.0, conf=0.9),
            "light_direction_field_pass": _ldf_pass(deg=180.0, conf=0.8),
            "catchlight_pass": _catchlight_pass(clock=6, count=1, conf=0.85),
            "modifier_shape_solver_pass": _modifier_pass("beauty_dish", conf=0.8),
            "shadow_penumbra_pass": _penumbra_pass("medium", conf=0.7),
            "lighting_hypothesis_engine": _hypothesis_engine(count=1, count_conf=0.9),
            "environment_light_pass": _environment_pass("studio", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())

        assert result.dominant_direction_deg is not None
        assert result.dominant_height_class is not None
        assert result.dominant_modifier is not None
        assert result.dominant_light_count is not None
        assert result.dominant_environment is not None

    def test_overall_agreement_range(self):
        """Overall agreement should be between 0 and 1."""
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=30.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=6, count=1, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        assert 0.0 <= result.overall_agreement <= 1.0


# ======================================================================
# 11. consensus_confidence Helper
# ======================================================================


class TestConsensusConfidence:
    """The consensus_confidence() helper should return the overall_agreement."""

    def test_returns_overall_agreement(self):
        result = solve_dominant_source({}, _default_weights())
        assert consensus_confidence(result) == result.overall_agreement

    def test_with_data(self):
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=12, conf=0.85),
        }
        result = solve_dominant_source(outputs, _default_weights())
        conf = consensus_confidence(result)
        assert 0.0 <= conf <= 1.0
        assert conf == pytest.approx(result.overall_agreement)

    def test_empty_result_zero(self):
        result = ConsensusResult()
        assert consensus_confidence(result) == 0.0

    def test_high_agreement_scenario(self):
        outputs = {
            "shadow_pass": _shadow_pass(shadow_deg=-180.0, vert_deg=45.0, conf=0.95),
            "light_direction_field_pass": _ldf_pass(deg=0.0, conf=0.9),
            "catchlight_pass": _catchlight_pass(clock=12, count=2, conf=0.9),
            "modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.9),
            "shadow_penumbra_pass": _penumbra_pass("large", conf=0.85),
            "lighting_hypothesis_engine": _hypothesis_engine(count=2, count_conf=0.95),
            "environment_light_pass": _environment_pass("studio", conf=0.9),
        }
        result = solve_dominant_source(outputs, _default_weights())
        conf = consensus_confidence(result)
        assert conf > 0.5


# ======================================================================
# Vote Extraction Unit Tests
# ======================================================================


class TestDirectionVoteExtraction:
    """Unit tests for _extract_direction_votes."""

    def test_shadow_vote_canonical_angle(self):
        pw = _default_weights()
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.8)}
        votes = _extract_direction_votes(outputs, pw)
        assert len(votes) == 1
        # shadow 0 -> canonical 180 (or -180 due to normalization)
        assert abs(votes[0].value) == pytest.approx(180.0, abs=0.1)
        assert votes[0].pass_name == "shadow_pass"

    def test_ldf_vote_pass_through(self):
        pw = _default_weights()
        outputs = {"light_direction_field_pass": _ldf_pass(deg=45.0, conf=0.7)}
        votes = _extract_direction_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == pytest.approx(45.0, abs=0.1)

    def test_catchlight_clock_to_canonical(self):
        pw = _default_weights()
        outputs = {"catchlight_pass": _catchlight_pass(clock=3, conf=0.7)}
        votes = _extract_direction_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == pytest.approx(90.0, abs=0.1)

    def test_catchlight_clock_9_left(self):
        pw = _default_weights()
        outputs = {"catchlight_pass": _catchlight_pass(clock=9, conf=0.7)}
        votes = _extract_direction_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == pytest.approx(-90.0, abs=0.1)

    def test_weights_applied_from_profile(self):
        pw = _custom_weights(shadow_pass=0.3)
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, conf=0.8)}
        votes = _extract_direction_votes(outputs, pw)
        assert votes[0].weight == pytest.approx(0.3)

    def test_missing_shadow_deg_no_vote(self):
        pw = _default_weights()
        outputs = {"shadow_pass": {"ok": True, "confidence": 0.8}}
        votes = _extract_direction_votes(outputs, pw)
        assert len(votes) == 0


class TestHeightVoteExtraction:
    """Unit tests for _extract_height_votes."""

    def test_shadow_high(self):
        pw = _default_weights()
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=45.0, conf=0.8)}
        votes = _extract_height_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == "high"

    def test_shadow_eye_level(self):
        pw = _default_weights()
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=5.0, conf=0.8)}
        votes = _extract_height_votes(outputs, pw)
        assert votes[0].value == "eye_level"

    def test_shadow_low(self):
        pw = _default_weights()
        outputs = {"shadow_pass": _shadow_pass(shadow_deg=0.0, vert_deg=-30.0, conf=0.8)}
        votes = _extract_height_votes(outputs, pw)
        assert votes[0].value == "low"

    def test_catchlight_clock_12_high(self):
        pw = _default_weights()
        outputs = {"catchlight_pass": _catchlight_pass(clock=12, conf=0.7)}
        votes = _extract_height_votes(outputs, pw)
        assert votes[0].value == "high"

    def test_catchlight_clock_3_eye_level(self):
        pw = _default_weights()
        outputs = {"catchlight_pass": _catchlight_pass(clock=3, conf=0.7)}
        votes = _extract_height_votes(outputs, pw)
        assert votes[0].value == "eye_level"

    def test_catchlight_clock_5_low(self):
        pw = _default_weights()
        outputs = {"catchlight_pass": _catchlight_pass(clock=5, conf=0.7)}
        votes = _extract_height_votes(outputs, pw)
        assert votes[0].value == "low"


class TestModifierVoteExtraction:
    """Unit tests for _extract_modifier_votes."""

    def test_modifier_solver_vote(self):
        pw = _default_weights()
        outputs = {"modifier_shape_solver_pass": _modifier_pass("softbox", conf=0.8)}
        votes = _extract_modifier_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == "softbox"

    def test_penumbra_large_vote(self):
        pw = _default_weights()
        outputs = {"shadow_penumbra_pass": _penumbra_pass("large", conf=0.7)}
        votes = _extract_modifier_votes(outputs, pw)
        assert len(votes) == 1
        assert votes[0].value == "softbox"

    def test_unknown_penumbra_no_vote(self):
        pw = _default_weights()
        outputs = {"shadow_penumbra_pass": _penumbra_pass("unknown", conf=0.9)}
        votes = _extract_modifier_votes(outputs, pw)
        assert len(votes) == 0


class TestEnvironmentVoteExtraction:
    """Unit tests for _extract_environment_votes."""

    def test_env_pass_vote(self):
        pw = _default_weights()
        outputs = {"environment_light_pass": _environment_pass("studio", conf=0.8)}
        votes = _extract_environment_votes(outputs, pw)
        assert any(v.value == "studio" for v in votes)

    def test_solar_pass_outdoor_vote(self):
        pw = _default_weights()
        outputs = {"solar_geometry_pass": _solar_pass(detected=True, conf=0.7)}
        votes = _extract_environment_votes(outputs, pw)
        assert any(v.value == "outdoor_sun" for v in votes)

    def test_window_pass_indoor_vote(self):
        pw = _default_weights()
        outputs = {"window_geometry_pass": _window_pass(detected=True, conf=0.7)}
        votes = _extract_environment_votes(outputs, pw)
        assert any(v.value == "indoor_ambient" for v in votes)

    def test_env_unknown_no_vote(self):
        pw = _default_weights()
        outputs = {"environment_light_pass": _environment_pass("unknown", conf=0.9)}
        votes = _extract_environment_votes(outputs, pw)
        assert len(votes) == 0


# ======================================================================
# Consensus Builder Unit Tests
# ======================================================================


class TestBuildDirectionConsensus:
    """Unit tests for _build_direction_consensus."""

    def test_empty_votes(self):
        dc = _build_direction_consensus([])
        assert dc.dimension == "direction"
        assert dc.consensus_value is None
        assert dc.consensus_confidence == 0.0

    def test_single_vote(self):
        votes = [ConsensusVote(pass_name="a", value=45.0, weight=1.0, confidence=0.9)]
        dc = _build_direction_consensus(votes)
        assert dc.consensus_value == pytest.approx(45.0, abs=1.0)
        assert dc.consensus_confidence == pytest.approx(1.0, abs=0.01)

    def test_two_identical_votes(self):
        votes = [
            ConsensusVote(pass_name="a", value=90.0, weight=1.0, confidence=0.8),
            ConsensusVote(pass_name="b", value=90.0, weight=1.0, confidence=0.8),
        ]
        dc = _build_direction_consensus(votes)
        assert dc.consensus_value == pytest.approx(90.0, abs=1.0)
        assert dc.consensus_confidence == pytest.approx(1.0, abs=0.01)

    def test_opposite_votes_low_confidence(self):
        votes = [
            ConsensusVote(pass_name="a", value=0.0, weight=1.0, confidence=0.8),
            ConsensusVote(pass_name="b", value=180.0, weight=1.0, confidence=0.8),
        ]
        dc = _build_direction_consensus(votes)
        assert dc.consensus_confidence < 0.5


class TestBuildCategoricalConsensus:
    """Unit tests for _build_categorical_consensus."""

    def test_empty_votes(self):
        dc = _build_categorical_consensus("height", [])
        assert dc.dimension == "height"
        assert dc.consensus_value is None
        assert dc.consensus_confidence == 0.0

    def test_unanimous(self):
        votes = [
            ConsensusVote(pass_name="a", value="high", weight=1.0, confidence=0.9),
            ConsensusVote(pass_name="b", value="high", weight=0.8, confidence=0.8),
        ]
        dc = _build_categorical_consensus("height", votes)
        assert dc.consensus_value == "high"
        assert dc.consensus_confidence == pytest.approx(1.0, abs=0.01)
        assert len(dc.dissenting_votes) == 0

    def test_majority_wins(self):
        votes = [
            ConsensusVote(pass_name="a", value="high", weight=1.0, confidence=0.9),
            ConsensusVote(pass_name="b", value="high", weight=0.8, confidence=0.8),
            ConsensusVote(pass_name="c", value="low", weight=0.5, confidence=0.7),
        ]
        dc = _build_categorical_consensus("height", votes)
        assert dc.consensus_value == "high"
        assert len(dc.dissenting_votes) == 1


class TestBuildNumericConsensus:
    """Unit tests for _build_numeric_consensus."""

    def test_empty_votes(self):
        dc = _build_numeric_consensus("light_count", [])
        assert dc.dimension == "light_count"
        assert dc.consensus_value is None

    def test_single_vote(self):
        votes = [ConsensusVote(pass_name="a", value=2, weight=1.0, confidence=0.9)]
        dc = _build_numeric_consensus("light_count", votes)
        assert dc.consensus_value == pytest.approx(2.0, abs=0.1)

    def test_weighted_average(self):
        votes = [
            ConsensusVote(pass_name="a", value=2, weight=1.0, confidence=1.0),
            ConsensusVote(pass_name="b", value=4, weight=1.0, confidence=1.0),
        ]
        dc = _build_numeric_consensus("light_count", votes)
        assert dc.consensus_value == pytest.approx(3.0, abs=0.1)


# ======================================================================
# PassWeightProfile Tests
# ======================================================================


class TestPassWeightProfile:
    """Tests for PassWeightProfile.get_weight behavior."""

    def test_default_weight_for_unknown_pass(self):
        pw = _default_weights()
        assert pw.get_weight("nonexistent_pass") == 0.5

    def test_known_pass_returns_configured_weight(self):
        pw = _default_weights()
        assert pw.get_weight("shadow_pass") == pytest.approx(
            PASS_WEIGHT_DEFAULTS["shadow_pass"]
        )

    def test_custom_weight_override(self):
        pw = _custom_weights(shadow_pass=0.1)
        assert pw.get_weight("shadow_pass") == pytest.approx(0.1)
