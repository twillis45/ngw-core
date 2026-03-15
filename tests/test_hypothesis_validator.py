"""Tests for the lighting simulator and hypothesis validator."""

import pytest

from engine.solver_models import (
    CanonicalDirection,
    LightingHypothesis,
    LightSource,
)
from engine.lighting_simulator import simulate_hypothesis
from engine.hypothesis_validator import validate_hypothesis


def _make_hypothesis(
    key_az=315.0, key_elev=30.0, modifier="softbox", fill=False,
    bg=False, environment="studio", key_distance=None,
):
    """Build a hypothesis with configurable parameters."""
    sources = [
        LightSource(
            role="key",
            direction=CanonicalDirection(azimuth_deg=key_az, elevation_deg=key_elev),
            modifier=modifier,
            size_class="large" if modifier in ("softbox", "large_octa") else "small",
            intensity_relative=1.0,
            confidence=0.8,
            distance_ft_estimate=key_distance,
        ),
    ]
    if fill:
        sources.append(LightSource(
            role="fill",
            direction=CanonicalDirection(azimuth_deg=(key_az + 180) % 360, elevation_deg=0),
            modifier="umbrella_white",
            intensity_relative=0.5,
            confidence=0.7,
        ))
    if bg:
        sources.append(LightSource(
            role="background",
            intensity_relative=0.8,
            confidence=0.6,
        ))

    return LightingHypothesis(
        hypothesis_id="test_h",
        sources=sources,
        light_count=len(sources),
        modifier_family=modifier,
        environment=environment,
        confidence=0.75,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Simulator tests
# ═══════════════════════════════════════════════════════════════════════════

class TestLightingSimulator:

    def test_shadow_direction_opposite_key(self):
        hyp = _make_hypothesis(key_az=315.0)
        pred = simulate_hypothesis(hyp)
        # Shadow should be ~135° (opposite of 315°)
        assert pred.predicted_shadow_direction_deg == pytest.approx(135.0, abs=1)

    def test_highlight_direction_matches_key(self):
        hyp = _make_hypothesis(key_az=45.0)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_highlight_direction_deg == pytest.approx(45.0, abs=1)

    def test_soft_modifier_predicts_soft_shadow(self):
        hyp = _make_hypothesis(modifier="softbox")
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_shadow_softness == "soft"

    def test_hard_modifier_predicts_hard_shadow(self):
        hyp = _make_hypothesis(modifier="bare_bulb")
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_shadow_softness == "hard"

    def test_unknown_modifier_falls_back_to_size(self):
        hyp = _make_hypothesis(modifier="unknown")
        # Sources[0].size_class is "small" for unknown modifier
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_shadow_softness == "hard"

    def test_catchlight_clock_front_key(self):
        hyp = _make_hypothesis(key_az=0.0)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_catchlight_clock == 12

    def test_catchlight_clock_left_key(self):
        hyp = _make_hypothesis(key_az=90.0)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_catchlight_clock == 9

    def test_fill_visibility_with_fill(self):
        hyp = _make_hypothesis(fill=True)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_fill_visibility in ("moderate", "strong", "subtle")

    def test_fill_visibility_without_fill(self):
        hyp = _make_hypothesis(fill=False)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_fill_visibility == "none"

    def test_background_dark_in_studio_no_bg_light(self):
        hyp = _make_hypothesis(environment="studio", bg=False)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_background_illumination == "dark"

    def test_background_gradient_with_bg_light(self):
        hyp = _make_hypothesis(bg=True)
        pred = simulate_hypothesis(hyp)
        assert pred.predicted_background_illumination in ("gradient", "even")

    def test_no_sources_low_confidence(self):
        hyp = LightingHypothesis(hypothesis_id="empty")
        pred = simulate_hypothesis(hyp)
        assert pred.confidence < 0.2

    def test_confidence_higher_with_known_modifier(self):
        known = simulate_hypothesis(_make_hypothesis(modifier="beauty_dish"))
        unknown = simulate_hypothesis(_make_hypothesis(modifier="unknown"))
        assert known.confidence > unknown.confidence


# ═══════════════════════════════════════════════════════════════════════════
# Validator tests
# ═══════════════════════════════════════════════════════════════════════════

class TestHypothesisValidator:

    def test_perfect_match(self):
        hyp = _make_hypothesis(key_az=315.0, modifier="softbox")
        pred = simulate_hypothesis(hyp)
        observed = {
            "shadow_direction_deg": 135.0,
            "shadow_softness": "soft",
            "fill_visibility": "none",
            "background_illumination": "dark",
        }
        score = validate_hypothesis(hyp, pred, observed)
        assert score.overall_score > 0.8
        assert len(score.mismatches) == 0

    def test_direction_mismatch(self):
        hyp = _make_hypothesis(key_az=315.0)
        pred = simulate_hypothesis(hyp)
        observed = {
            "shadow_direction_deg": 45.0,  # 90° off
        }
        score = validate_hypothesis(hyp, pred, observed)
        dir_match = next(m for m in score.per_dimension if m.dimension == "direction")
        assert dir_match.match_score < 0.7

    def test_softness_mismatch(self):
        hyp = _make_hypothesis(modifier="softbox")  # predicts soft
        pred = simulate_hypothesis(hyp)
        observed = {
            "shadow_softness": "hard",
        }
        score = validate_hypothesis(hyp, pred, observed)
        mod_match = next(m for m in score.per_dimension if m.dimension == "modifier")
        assert mod_match.match_score == 0.0
        assert any("softness" in m.lower() for m in score.mismatches)

    def test_empty_observations(self):
        hyp = _make_hypothesis()
        pred = simulate_hypothesis(hyp)
        score = validate_hypothesis(hyp, pred, {})
        # No observations → no dimension matches → score is 0
        assert score.overall_score == 0.0
        assert len(score.per_dimension) == 0

    def test_fill_visibility_close_match(self):
        hyp = _make_hypothesis(fill=True)
        pred = simulate_hypothesis(hyp)
        observed = {"fill_visibility": "moderate"}
        score = validate_hypothesis(hyp, pred, observed)
        fill_match = next(m for m in score.per_dimension if m.dimension == "fill_visibility")
        assert fill_match.match_score >= 0.5  # close enough

    def test_background_match(self):
        hyp = _make_hypothesis(environment="studio", bg=False)
        pred = simulate_hypothesis(hyp)
        observed = {"background_illumination": "dark"}
        score = validate_hypothesis(hyp, pred, observed)
        bg_match = next(m for m in score.per_dimension if m.dimension == "background")
        assert bg_match.match_score == 1.0

    def test_overall_uses_weights(self):
        """Overall score should weight direction more than background."""
        hyp = _make_hypothesis(key_az=315.0, modifier="softbox")
        pred = simulate_hypothesis(hyp)

        # Direction perfect, background wrong
        obs1 = {
            "shadow_direction_deg": 135.0,
            "background_illumination": "even",  # wrong
        }
        # Direction wrong, background perfect
        obs2 = {
            "shadow_direction_deg": 315.0,  # wrong
            "background_illumination": "dark",  # correct
        }

        score1 = validate_hypothesis(hyp, pred, obs1)
        score2 = validate_hypothesis(hyp, pred, obs2)
        # Direction has 2x weight of background, so score1 should be higher
        assert score1.overall_score > score2.overall_score
