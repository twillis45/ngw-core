"""Tests for engine/contradiction_engine.py

Covers:
  - Empty inputs (no contradictions, "clean" ambiguity)
  - Direction contradictions: shadow vs catchlight, shadow vs LDF, agreement
  - Height contradictions: high vs low, high vs eye_level, agreement
  - Modifier contradictions: hard penumbra + round catchlight, CV vs inference
  - Light count contradictions: diff>=3 (high), diff=2 (medium), diff=1 (no)
  - Environment contradictions: studio vs outdoor (high), other mismatches (low)
  - classify_ambiguity: clean, minor_conflicts, genuine_ambiguity, insufficient_data
  - Multiple contradictions across dimensions
  - ContradictionReport properties (has_serious_conflicts)
"""

import types

import pytest

from engine.contradiction_engine import (
    _check_direction_contradictions,
    _check_environment_contradictions,
    _check_height_contradictions,
    _check_light_count_contradictions,
    _check_modifier_contradictions,
    classify_ambiguity,
    find_contradictions,
)
from engine.solver_models import Contradiction, ContradictionReport


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _shadow_pass(vector_deg, vertical_deg=0.0, confidence=0.8):
    """Build a minimal shadow pass result dict."""
    return {
        "ok": True,
        "shadow_vector_deg": vector_deg,
        "shadow_vertical_angle_deg": vertical_deg,
        "confidence": confidence,
    }


def _ldf_pass(dominant_deg, confidence=0.8):
    """Build a minimal Light Direction Field pass result dict."""
    return {
        "ok": True,
        "dominant_light_vector_deg": dominant_deg,
        "confidence": confidence,
    }


def _catchlight_pass(clock, count=1, shapes=None, confidence=0.8):
    """Build a minimal catchlight pass result dict."""
    return {
        "ok": True,
        "primary_clock_position": clock,
        "catchlight_count": count,
        "shapes_seen": shapes or [],
        "confidence": confidence,
    }


def _penumbra_pass(size_class, confidence=0.8):
    """Build a minimal shadow penumbra pass result dict."""
    return {
        "ok": True,
        "estimated_source_size_class": size_class,
        "confidence": confidence,
    }


def _modifier_solver_pass(primary_modifier, confidence=0.8):
    """Build a minimal modifier shape solver pass result dict."""
    return {
        "ok": True,
        "primary_modifier": primary_modifier,
        "confidence": confidence,
    }


def _hypothesis_engine(count, confidence=0.8):
    """Build a minimal lighting hypothesis engine result dict."""
    return {
        "ok": True,
        "likely_light_count": count,
        "confidence": confidence,
    }


def _env_light_pass(env_type, confidence=0.8):
    """Build a minimal environment light pass result dict."""
    return {
        "ok": True,
        "environment_type": env_type,
        "confidence": confidence,
    }


def _solar_pass(sun_detected=True, confidence=0.8):
    """Build a minimal solar geometry pass result dict."""
    return {
        "ok": True,
        "sun_detected": sun_detected,
        "confidence": confidence,
    }


def _cue_report(cues_computed=5):
    """Create a simple namespace mimicking a cue report."""
    return types.SimpleNamespace(cues_computed=cues_computed)


def _cue_inference_with_modifier(family):
    """Create a cue_inference dict with source_quality modifier family."""
    return {
        "source_quality": types.SimpleNamespace(key_modifier_family=family),
    }


# ===========================================================================
# 1. Empty Inputs
# ===========================================================================


class TestEmptyInputs:
    """No pass outputs should yield no contradictions and 'clean' ambiguity."""

    def test_empty_dict_no_contradictions(self):
        report = find_contradictions({})
        assert report.contradictions == []
        assert report.high_severity_count == 0

    def test_empty_dict_clean_ambiguity(self):
        report = find_contradictions({})
        assert report.ambiguity_class == "clean"

    def test_empty_dict_has_no_serious_conflicts(self):
        report = find_contradictions({})
        assert report.has_serious_conflicts is False

    def test_none_values_in_passes(self):
        """Passes present but with None/missing ok should be ignored."""
        report = find_contradictions({
            "shadow_pass": {"ok": False},
            "catchlight_pass": None,
            "light_direction_field_pass": {},
        })
        assert report.contradictions == []
        assert report.ambiguity_class == "clean"

    def test_passes_with_ok_false(self):
        report = find_contradictions({
            "shadow_pass": {"ok": False, "shadow_vector_deg": 90.0},
            "catchlight_pass": {"ok": False, "primary_clock_position": 9},
        })
        assert report.contradictions == []


# ===========================================================================
# 2-4. Direction Contradictions
# ===========================================================================


class TestDirectionContradictions:
    """Direction contradiction tests between shadow, catchlight, and LDF."""

    def test_shadow_left_catchlight_right_high_severity(self):
        """Shadow falls left (-90 deg) -> canonical 90 (key from right).
        Catchlight at 9 o'clock -> canonical -90 (key from left).
        Angular distance = 180 deg -> high severity."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0),
            "catchlight_pass": _catchlight_pass(clock=9),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) >= 1
        c = contras[0]
        assert c.dimension == "direction"
        assert c.severity == "high"

    def test_shadow_45_ldf_120_medium_severity(self):
        """Shadow at 45 deg -> canonical 225 -> normalized -135.
        LDF at 120 deg (already canonical).
        Angular distance between -135 and 120 is 105 -> but let's check the
        actual engine values:
          shadow canonical = _normalize(45+180) = _normalize(225) = -135
          LDF = 120
          dist = min(|(-135)-120|, 360 - |(-135)-120|) = min(255, 105) = 105
        105 > 90 -> actually high severity.

        Adjust: pick values that give medium (>60 and <=90).
        Shadow at 45 -> canonical -135.
        LDF at 135 -> dist = min(|-135-135|, 360-270) = min(270,90) = 90.
        90 is not > 90, so no contradiction.

        Try LDF at 130 -> dist = min(|-135-130|, 360-265) = min(265, 95) = 95 -> high.
        Try LDF at 150 -> dist = min(|-135-150|, 360-285) = min(285, 75) = 75 -> medium.
        """
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=45.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=150.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) >= 1
        c = contras[0]
        assert c.dimension == "direction"
        assert c.severity == "medium"

    def test_shadow_and_ldf_agree_within_15(self):
        """Shadow at 0 deg -> canonical 180/-180. LDF at 175 deg.
        dist = min(|(-180)-175|, 360-355) = min(355, 5) = 5. Within 15 -> no contradiction."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=175.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_shadow_and_ldf_agree_exact(self):
        """Shadow at 90 deg -> canonical -90. LDF at -90 -> exact match."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=90.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=-90.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_three_passes_one_disagrees(self):
        """Shadow, LDF, and catchlight — shadow agrees with LDF but catchlight disagrees."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=90.0),          # canonical -90
            "light_direction_field_pass": _ldf_pass(dominant_deg=-90.0),  # -90
            "catchlight_pass": _catchlight_pass(clock=3),           # canonical 90
        }
        contras = _check_direction_contradictions(passes, None, None)
        # shadow vs catchlight: dist=180 -> high
        # LDF vs catchlight: dist=180 -> high
        # shadow vs LDF: dist=0 -> no contradiction
        high_contras = [c for c in contras if c.severity == "high"]
        assert len(high_contras) == 2

    def test_catchlight_12_canonical_0(self):
        """Catchlight at 12 o'clock -> canonical 0 deg (key from front)."""
        passes = {
            "catchlight_pass": _catchlight_pass(clock=12),
            "light_direction_field_pass": _ldf_pass(dominant_deg=0.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_direction_contradiction_fields_populated(self):
        """Verify contradiction fields are properly populated."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0),
            "catchlight_pass": _catchlight_pass(clock=9),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) >= 1
        c = contras[0]
        assert c.contradiction_id != ""
        assert c.pass_a in ("shadow_pass", "catchlight_pass")
        assert c.pass_b in ("shadow_pass", "catchlight_pass")
        assert c.resolution_hint != ""
        assert "direction" == c.dimension


# ===========================================================================
# 5-7. Height Contradictions
# ===========================================================================


class TestHeightContradictions:
    """Height contradiction tests between shadow vertical angle and catchlight clock."""

    def test_shadow_high_catchlight_low_high_severity(self):
        """Shadow vertical angle 45 -> 'high'. Catchlight at 6 -> 'low'.
        high vs low -> high severity."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=6),
        }
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"
        assert contras[0].dimension == "height"

    def test_shadow_high_catchlight_eye_level_low_severity(self):
        """Shadow vertical 45 -> 'high'. Catchlight at 3 -> 'eye_level'.
        high vs eye_level -> low severity."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=3),
        }
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "low"

    def test_both_high_no_contradiction(self):
        """Shadow vertical 45 -> 'high'. Catchlight at 12 -> 'high'. No contradiction."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=12),
        }
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_both_low_no_contradiction(self):
        """Shadow vertical -45 -> 'low'. Catchlight at 6 -> 'low'."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=-45.0),
            "catchlight_pass": _catchlight_pass(clock=6),
        }
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_eye_level_vs_low_low_severity(self):
        """Shadow vertical 5 -> 'eye_level'. Catchlight at 5 -> 'low'.
        eye_level vs low -> low severity."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=5.0),
            "catchlight_pass": _catchlight_pass(clock=5),
        }
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "low"

    def test_height_contradiction_values(self):
        """Check that value_a and value_b reflect height class strings."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=6),
        }
        contras = _check_height_contradictions(passes, None, None)
        c = contras[0]
        assert c.value_a in ("high", "low", "eye_level")
        assert c.value_b in ("high", "low", "eye_level")
        assert c.value_a != c.value_b


# ===========================================================================
# 8-9. Modifier Contradictions
# ===========================================================================


class TestModifierContradictions:
    """Modifier contradiction tests: penumbra vs catchlight shape, CV vs inference."""

    def test_hard_penumbra_round_catchlight_medium(self):
        """Hard (small) penumbra + round catchlight shape -> medium severity."""
        passes = {
            "shadow_penumbra_pass": _penumbra_pass(size_class="small"),
            "catchlight_pass": _catchlight_pass(clock=12, shapes=["round"]),
        }
        contras = _check_modifier_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "medium"
        assert contras[0].dimension == "modifier"

    def test_cv_modifier_vs_inference_disagree_medium(self):
        """CV modifier says 'softbox' but inference says 'umbrella' -> medium."""
        passes = {
            "modifier_shape_solver_pass": _modifier_solver_pass("softbox"),
        }
        cue_inf = _cue_inference_with_modifier("umbrella")
        contras = _check_modifier_contradictions(passes, None, cue_inf)
        assert len(contras) == 1
        assert contras[0].severity == "medium"
        assert contras[0].pass_a == "modifier_shape_solver_pass"
        assert contras[0].pass_b == "cue_inference_source_quality"

    def test_cv_modifier_vs_inference_agree_no_contradiction(self):
        """Both say 'softbox' -> no contradiction."""
        passes = {
            "modifier_shape_solver_pass": _modifier_solver_pass("softbox"),
        }
        cue_inf = _cue_inference_with_modifier("softbox")
        contras = _check_modifier_contradictions(passes, None, cue_inf)
        assert len(contras) == 0

    def test_soft_penumbra_round_catchlight_no_contradiction(self):
        """Soft (large) penumbra + round catchlight -> consistent, no contradiction."""
        passes = {
            "shadow_penumbra_pass": _penumbra_pass(size_class="large"),
            "catchlight_pass": _catchlight_pass(clock=12, shapes=["round"]),
        }
        contras = _check_modifier_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_hard_penumbra_rectangular_catchlight_no_contradiction(self):
        """Hard (small) penumbra + rectangular catchlight -> consistent (grid)."""
        passes = {
            "shadow_penumbra_pass": _penumbra_pass(size_class="small"),
            "catchlight_pass": _catchlight_pass(clock=12, shapes=["rectangular"]),
        }
        contras = _check_modifier_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_cv_modifier_unknown_no_contradiction(self):
        """CV modifier is 'unknown' -> no contradiction even if inference differs."""
        passes = {
            "modifier_shape_solver_pass": _modifier_solver_pass("unknown"),
        }
        cue_inf = _cue_inference_with_modifier("umbrella")
        contras = _check_modifier_contradictions(passes, None, cue_inf)
        assert len(contras) == 0


# ===========================================================================
# 10-12. Light Count Contradictions
# ===========================================================================


class TestLightCountContradictions:
    """Light count contradiction tests between hypothesis engine and catchlight count."""

    def test_hypothesis_2_catchlight_5_high_severity(self):
        """Diff = 3 -> high severity."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2),
            "catchlight_pass": _catchlight_pass(clock=12, count=5),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"
        assert contras[0].dimension == "light_count"

    def test_hypothesis_2_catchlight_4_medium_severity(self):
        """Diff = 2 -> medium severity."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2),
            "catchlight_pass": _catchlight_pass(clock=12, count=4),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "medium"

    def test_hypothesis_2_catchlight_3_no_contradiction(self):
        """Diff = 1 -> no contradiction (below threshold of 2)."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=2),
            "catchlight_pass": _catchlight_pass(clock=12, count=3),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_hypothesis_matches_catchlight_no_contradiction(self):
        """Exact match -> no contradiction."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=3),
            "catchlight_pass": _catchlight_pass(clock=12, count=3),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_large_diff_high_severity(self):
        """Diff = 5 -> high severity."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=1),
            "catchlight_pass": _catchlight_pass(clock=12, count=6),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"
        assert contras[0].value_a == 1
        assert contras[0].value_b == 6

    def test_catchlight_count_zero_ignored(self):
        """Catchlight count of 0 should not be included in signals."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=3),
            "catchlight_pass": _catchlight_pass(clock=12, count=0),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 0


# ===========================================================================
# 13-14. Environment Contradictions
# ===========================================================================


class TestEnvironmentContradictions:
    """Environment contradiction tests."""

    def test_studio_vs_outdoor_sun_high_severity(self):
        """studio vs outdoor_sun -> high severity."""
        passes = {
            "environment_light_pass": _env_light_pass("studio"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        contras = _check_environment_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"
        assert contras[0].dimension == "environment"

    def test_different_but_not_studio_vs_outdoor_low_severity(self):
        """indoor_ambient vs outdoor_shade -> both non-studio and non-standard outdoor,
        but let's pick two that differ without being studio-vs-outdoor.
        Use environment_light_pass='indoor_ambient' vs solar_geometry_pass with
        sun_detected=False (no solar signal).

        Better: use two environment passes that disagree.
        environment_light_pass='indoor_ambient' will conflict with a window pass
        that says 'indoor_ambient' — no, that agrees.

        Use environment_light_pass='indoor_ambient' vs
        solar with sun_detected=True -> solar maps to 'outdoor_sun'.
        indoor_ambient is not in STUDIO_TYPES and outdoor_sun is in OUTDOOR_TYPES.
        Neither side is studio, so it's not studio-vs-outdoor.
        Actually, a_studio=False, b_outdoor=True, a_outdoor=False, b_studio=False
        -> neither (a_studio and b_outdoor) nor (a_outdoor and b_studio) -> low severity.
        """
        passes = {
            "environment_light_pass": _env_light_pass("indoor_ambient"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        contras = _check_environment_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "low"

    def test_same_environment_no_contradiction(self):
        """Both say outdoor_sun -> no contradiction."""
        passes = {
            "environment_light_pass": _env_light_pass("outdoor_sun"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        contras = _check_environment_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_studio_portrait_vs_outdoor_high_severity(self):
        """studio_portrait is in STUDIO_TYPES, outdoor is in OUTDOOR_TYPES -> high."""
        passes = {
            "environment_light_pass": _env_light_pass("studio_portrait"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        contras = _check_environment_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"

    def test_environment_unknown_ignored(self):
        """environment_type='unknown' should not produce signals."""
        passes = {
            "environment_light_pass": _env_light_pass("unknown"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        contras = _check_environment_contradictions(passes, None, None)
        # Only solar is signaled; environment_light_pass is excluded
        # Single signal -> no pairwise comparison -> no contradiction
        assert len(contras) == 0


# ===========================================================================
# 15-18. classify_ambiguity
# ===========================================================================


class TestClassifyAmbiguity:
    """Tests for the classify_ambiguity function."""

    def test_clean_with_no_contradictions(self):
        result = classify_ambiguity([], cue_report=_cue_report(5))
        assert result == "clean"

    def test_minor_conflicts_with_one_high_severity(self):
        """1 high-severity (which is > 0 but <= THRESHOLD of 2) -> minor_conflicts."""
        contras = [
            Contradiction(severity="high", dimension="direction"),
        ]
        result = classify_ambiguity(contras, cue_report=_cue_report(5))
        assert result == "minor_conflicts"

    def test_minor_conflicts_with_two_high_severity(self):
        """2 high-severity (== THRESHOLD of 2) -> minor_conflicts (not >2)."""
        contras = [
            Contradiction(severity="high", dimension="direction"),
            Contradiction(severity="high", dimension="height"),
        ]
        result = classify_ambiguity(contras, cue_report=_cue_report(5))
        assert result == "minor_conflicts"

    def test_genuine_ambiguity_with_three_high_severity(self):
        """>2 high-severity -> genuine_ambiguity."""
        contras = [
            Contradiction(severity="high", dimension="direction"),
            Contradiction(severity="high", dimension="height"),
            Contradiction(severity="high", dimension="light_count"),
        ]
        result = classify_ambiguity(contras, cue_report=_cue_report(5))
        assert result == "genuine_ambiguity"

    def test_insufficient_data_with_low_cue_count(self):
        """cues_computed < MIN_CUES_FOR_RELIABLE (3) -> insufficient_data."""
        result = classify_ambiguity([], cue_report=_cue_report(2))
        assert result == "insufficient_data"

    def test_insufficient_data_overrides_high_severity(self):
        """Even with high severity contradictions, insufficient cues -> insufficient_data."""
        contras = [
            Contradiction(severity="high", dimension="direction"),
            Contradiction(severity="high", dimension="height"),
            Contradiction(severity="high", dimension="light_count"),
        ]
        result = classify_ambiguity(contras, cue_report=_cue_report(1))
        assert result == "insufficient_data"

    def test_no_cue_report_allows_clean(self):
        """No cue_report -> skip cue count check -> clean is possible."""
        result = classify_ambiguity([])
        assert result == "clean"

    def test_many_low_medium_minor_conflicts(self):
        """More than 3 low/medium contradictions -> minor_conflicts (>3 total)."""
        contras = [
            Contradiction(severity="low", dimension="height"),
            Contradiction(severity="medium", dimension="modifier"),
            Contradiction(severity="low", dimension="environment"),
            Contradiction(severity="medium", dimension="direction"),
        ]
        result = classify_ambiguity(contras, cue_report=_cue_report(5))
        assert result == "minor_conflicts"

    def test_cue_count_exactly_at_threshold(self):
        """cues_computed == MIN_CUES_FOR_RELIABLE (3) -> NOT insufficient."""
        result = classify_ambiguity([], cue_report=_cue_report(3))
        assert result == "clean"


# ===========================================================================
# 19. Multiple Contradictions Across Dimensions
# ===========================================================================


class TestMultipleDimensions:
    """Test that contradictions from multiple dimensions accumulate correctly."""

    def test_direction_and_height_and_count(self):
        """Direction high + height high + count medium all found."""
        passes = {
            # Direction: shadow canonical 90, catchlight canonical -90 -> dist=180 -> high
            "shadow_pass": _shadow_pass(vector_deg=-90.0, vertical_deg=45.0),
            # Catchlight at 9 -> canonical -90; but clock 6 for height -> 'low'
            "catchlight_pass": _catchlight_pass(clock=6, count=5, shapes=["round"]),
            # Hypothesis says 2 lights vs catchlight 5 -> diff=3 -> high
            "lighting_hypothesis_engine": _hypothesis_engine(count=2),
        }
        report = find_contradictions(passes)
        dims = {c.dimension for c in report.contradictions}
        assert "direction" in dims
        assert "height" in dims
        assert "light_count" in dims

    def test_all_dimensions_present(self):
        """Build a scenario where all 5 dimensions produce contradictions."""
        passes = {
            # Direction: shadow canonical 90, LDF at -90 -> dist=180 -> high
            "shadow_pass": _shadow_pass(vector_deg=-90.0, vertical_deg=45.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=-90.0),
            # Height: shadow 'high' (45 deg), catchlight 'low' (clock=6) -> high
            "catchlight_pass": _catchlight_pass(clock=6, count=5, shapes=["round"]),
            # Modifier: hard penumbra + round catchlight -> medium
            "shadow_penumbra_pass": _penumbra_pass(size_class="small"),
            # Count: hypothesis 1 vs catchlight 5 -> diff=4 -> high
            "lighting_hypothesis_engine": _hypothesis_engine(count=1),
            # Environment: studio vs outdoor_sun -> high
            "environment_light_pass": _env_light_pass("studio"),
            "solar_geometry_pass": _solar_pass(sun_detected=True),
        }
        report = find_contradictions(passes)
        dims = {c.dimension for c in report.contradictions}
        assert "direction" in dims
        assert "height" in dims
        assert "modifier" in dims
        assert "light_count" in dims
        assert "environment" in dims
        assert len(report.contradictions) >= 5

    def test_report_notes_contain_summary(self):
        """Report notes should contain a summary string."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0),
            "catchlight_pass": _catchlight_pass(clock=9),
        }
        report = find_contradictions(passes)
        assert len(report.notes) >= 1
        assert "contradictions" in report.notes[0].lower() or "found" in report.notes[0].lower()


# ===========================================================================
# 20. ContradictionReport Properties
# ===========================================================================


class TestContradictionReportProperties:
    """Test ContradictionReport model properties and fields."""

    def test_has_serious_conflicts_true_with_high(self):
        report = ContradictionReport(
            contradictions=[Contradiction(severity="high")],
            high_severity_count=1,
        )
        assert report.has_serious_conflicts is True

    def test_has_serious_conflicts_false_with_zero(self):
        report = ContradictionReport(
            contradictions=[Contradiction(severity="medium")],
            high_severity_count=0,
        )
        assert report.has_serious_conflicts is False

    def test_has_serious_conflicts_false_empty(self):
        report = ContradictionReport()
        assert report.has_serious_conflicts is False

    def test_high_severity_count_from_find(self):
        """find_contradictions should correctly count high-severity items."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=6),  # height: low -> high vs high
        }
        report = find_contradictions(passes)
        actual_high = sum(1 for c in report.contradictions if c.severity == "high")
        assert report.high_severity_count == actual_high

    def test_ambiguity_class_set_by_find(self):
        """find_contradictions should set ambiguity_class from classify_ambiguity."""
        report = find_contradictions({})
        assert report.ambiguity_class == "clean"

    def test_report_default_values(self):
        report = ContradictionReport()
        assert report.contradictions == []
        assert report.ambiguity_class == "clean"
        assert report.high_severity_count == 0
        assert report.has_serious_conflicts is False


# ===========================================================================
# Edge Cases and Additional Coverage
# ===========================================================================


class TestEdgeCases:
    """Edge cases and boundary condition tests."""

    def test_catchlight_clock_0_treated_as_12(self):
        """Clock position 0 should be treated as 12 for height classification."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=0.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=0),
        }
        # clock 0 % 12 = 0, `or 12` makes it 12 -> 'high'
        # shadow vertical 45 -> 'high' -> no contradiction
        contras = _check_height_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_angular_distance_boundary_exactly_60(self):
        """60 deg is NOT > 60, so no contradiction should be raised."""
        # shadow at -60 -> canonical = -60 + 180 = 120
        # LDF at 60 -> dist = min(|120-60|, 360-60) = min(60, 300) = 60
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-60.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=60.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_angular_distance_just_over_60(self):
        """61 deg -> medium severity."""
        # shadow at -60 -> canonical 120.
        # LDF at 59 -> dist = min(|120-59|, 360-61) = min(61, 299) = 61 -> medium.
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-60.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=59.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "medium"

    def test_angular_distance_boundary_exactly_90(self):
        """90 deg is NOT > 90, so severity = medium (not high)."""
        # shadow at -90 -> canonical 90
        # LDF at 0 -> dist = min(|90-0|, 360-90) = min(90, 270) = 90
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=0.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        # 90 is not > 90, but is > 60 -> medium
        assert len(contras) == 1
        assert contras[0].severity == "medium"

    def test_angular_distance_just_over_90(self):
        """91 deg -> high severity."""
        # shadow at -90 -> canonical 90
        # LDF at -1 -> dist = min(|90-(-1)|, 360-91) = min(91, 269) = 91 -> high
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0),
            "light_direction_field_pass": _ldf_pass(dominant_deg=-1.0),
        }
        contras = _check_direction_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"

    def test_light_count_diff_exactly_2(self):
        """Diff = 2 should produce medium severity."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=1),
            "catchlight_pass": _catchlight_pass(clock=12, count=3),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "medium"

    def test_light_count_diff_exactly_3(self):
        """Diff = 3 should produce high severity."""
        passes = {
            "lighting_hypothesis_engine": _hypothesis_engine(count=1),
            "catchlight_pass": _catchlight_pass(clock=12, count=4),
        }
        contras = _check_light_count_contradictions(passes, None, None)
        assert len(contras) == 1
        assert contras[0].severity == "high"

    def test_find_contradictions_with_cue_report_insufficient(self):
        """Passing a cue_report with low cues -> insufficient_data ambiguity."""
        report = find_contradictions({}, cue_report=_cue_report(1))
        assert report.ambiguity_class == "insufficient_data"

    def test_find_contradictions_with_cue_report_sufficient(self):
        """Passing a cue_report with enough cues -> clean (no contradictions)."""
        report = find_contradictions({}, cue_report=_cue_report(10))
        assert report.ambiguity_class == "clean"

    def test_solar_sun_not_detected_no_signal(self):
        """Solar pass with sun_detected=False should not contribute environment signal."""
        passes = {
            "environment_light_pass": _env_light_pass("studio"),
            "solar_geometry_pass": _solar_pass(sun_detected=False),
        }
        contras = _check_environment_contradictions(passes, None, None)
        assert len(contras) == 0

    def test_contradiction_id_uniqueness(self):
        """Each contradiction should have a unique ID within a report."""
        passes = {
            "shadow_pass": _shadow_pass(vector_deg=-90.0, vertical_deg=45.0),
            "catchlight_pass": _catchlight_pass(clock=6, count=5),
            "light_direction_field_pass": _ldf_pass(dominant_deg=-90.0),
            "lighting_hypothesis_engine": _hypothesis_engine(count=1),
        }
        report = find_contradictions(passes)
        ids = [c.contradiction_id for c in report.contradictions]
        assert len(ids) == len(set(ids)), "Contradiction IDs must be unique"
