"""Tests for engine/scoring.py

Covers:
  Fix #2  — negative / NaN / Inf modifier → fallback
  Fix #3  — negative criterion values → clamped with annotation
  Fix #5  — unused Enum import removed (syntax-only, tested by import)
  Edge    — zero criteria, all-perfect scores, over-cap values
"""

import math

import pytest

from engine.scoring import (
    BASE_WEIGHTS,
    BONUS_RULES,
    CONTEXT_BONUS_WEIGHTS,
    FALLBACK_MODIFIER,
    NORMALISATION_CAPS,
    ScoreBreakdown,
    _compute_context_bonuses,
    _normalise,
    _was_clamped,
    score_system,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _minimal_system(**overrides) -> dict:
    base = {"id": "test-1", "name": "Test System", "criteria": {}, "features": {}}
    base.update(overrides)
    return base


# ── _normalise ───────────────────────────────────────────────────────────────

class TestNormalise:
    def test_midpoint(self):
        assert _normalise(5000, 10_000) == 50.0

    def test_zero(self):
        assert _normalise(0, 10_000) == 0.0

    def test_at_cap(self):
        assert _normalise(10_000, 10_000) == 100.0

    def test_above_cap_clamps(self):
        assert _normalise(20_000, 10_000) == 100.0

    def test_negative_clamps_to_zero(self):
        assert _normalise(-500, 10_000) == 0.0

    def test_zero_cap_returns_zero(self):
        assert _normalise(50, 0) == 0.0


# ── _was_clamped (Fix #3) ───────────────────────────────────────────────────

class TestWasClamped:
    def test_negative_noted(self):
        assert "negative" in _was_clamped(-10, 100)

    def test_over_cap_noted(self):
        result = _was_clamped(200, 100)
        assert "capped" in result and "100" in result

    def test_normal_value_empty(self):
        assert _was_clamped(50, 100) == ""

    def test_at_boundaries(self):
        assert _was_clamped(0, 100) == ""
        assert _was_clamped(100, 100) == ""


# ── Modifier validation (Fix #2) ────────────────────────────────────────────

class TestModifierValidation:
    def test_positive_modifier_applied(self):
        s = _minimal_system(modifier=1.5)
        bd = score_system(s)
        assert bd.modifier == 1.5
        assert bd.modifier_source == "provided"

    def test_zero_modifier_applied(self):
        """Zero is a valid modifier (silences the weighted sum)."""
        s = _minimal_system(modifier=0.0)
        bd = score_system(s)
        assert bd.modifier == 0.0
        assert bd.modifier_source == "provided"

    def test_negative_modifier_rejected(self):
        s = _minimal_system(modifier=-2.0)
        bd = score_system(s)
        assert bd.modifier == FALLBACK_MODIFIER
        assert "invalid" in bd.modifier_source

    def test_nan_modifier_rejected(self):
        s = _minimal_system(modifier=float("nan"))
        bd = score_system(s)
        assert bd.modifier == FALLBACK_MODIFIER
        assert not math.isnan(bd.final_score)

    def test_inf_modifier_rejected(self):
        s = _minimal_system(modifier=float("inf"))
        bd = score_system(s)
        assert bd.modifier == FALLBACK_MODIFIER
        assert not math.isinf(bd.final_score)

    def test_none_modifier_uses_fallback(self):
        s = _minimal_system()  # no modifier key
        bd = score_system(s)
        assert bd.modifier == FALLBACK_MODIFIER
        assert bd.modifier_source == "fallback"


# ── Criterion clamping annotation (Fix #3) ───────────────────────────────────

class TestCriterionClampingAnnotation:
    def test_negative_brightness_annotated(self):
        s = _minimal_system(criteria={"brightness": -500})
        bd = score_system(s)
        brightness_comp = next(c for c in bd.components if c.criterion == "brightness")
        assert brightness_comp.normalised == 0.0
        assert "clamped from negative" in brightness_comp.reason

    def test_over_cap_brightness_annotated(self):
        s = _minimal_system(criteria={"brightness": 99_999})
        bd = score_system(s)
        brightness_comp = next(c for c in bd.components if c.criterion == "brightness")
        assert brightness_comp.normalised == 100.0
        assert "capped" in brightness_comp.reason

    def test_normal_value_no_annotation(self):
        s = _minimal_system(criteria={"brightness": 5000})
        bd = score_system(s)
        brightness_comp = next(c for c in bd.components if c.criterion == "brightness")
        assert "clamped" not in brightness_comp.reason
        assert "capped" not in brightness_comp.reason


# ── Determinism ──────────────────────────────────────────────────────────────

class TestScoringDeterminism:
    def test_same_input_same_output(self):
        s = _minimal_system(
            criteria={"brightness": 8000, "energy_efficiency": 160},
            features={"dimmable": True},
            modifier=1.05,
        )
        a = score_system(s)
        b = score_system(s)
        assert a.final_score == b.final_score
        assert a.model_dump() == b.model_dump()


# ── Weights invariant ────────────────────────────────────────────────────────

class TestWeightsInvariant:
    def test_base_weights_sum_to_one(self):
        assert sum(BASE_WEIGHTS.values()) == pytest.approx(1.0)


# ── Bonus logic ──────────────────────────────────────────────────────────────

class TestBonusLogic:
    def test_all_bonuses_earned(self):
        feats = {k: True for k in BONUS_RULES}
        s = _minimal_system(features=feats)
        bd = score_system(s)
        assert bd.bonus_total == sum(BONUS_RULES.values())

    def test_no_bonuses(self):
        s = _minimal_system()
        bd = score_system(s)
        assert bd.bonus_total == 0.0

    def test_partial_bonuses(self):
        s = _minimal_system(features={"dimmable": True, "smart_ready": False})
        bd = score_system(s)
        assert bd.bonus_total == BONUS_RULES["dimmable"]


# ── Score formula ────────────────────────────────────────────────────────────

class TestScoreFormula:
    def test_empty_criteria_only_bonuses(self):
        s = _minimal_system(features={"waterproof": True})
        bd = score_system(s)
        assert bd.subtotal == 0.0
        assert bd.final_score == BONUS_RULES["waterproof"]

    def test_perfect_scores_no_modifier(self):
        criteria = {k: v for k, v in NORMALISATION_CAPS.items()}
        s = _minimal_system(criteria=criteria)
        bd = score_system(s)
        # All normalised to 100, weights sum to 1.0 → subtotal = 100
        assert bd.subtotal == pytest.approx(100.0)
        assert bd.final_score == pytest.approx(100.0)


# ── Confidence scoring ───────────────────────────────────────────────────────

class TestConfidence:
    def test_confidence_range(self):
        """Confidence must be 0–100 for any input."""
        s = _minimal_system()
        bd = score_system(s)
        assert 0 <= bd.confidence.score <= 100

    def test_full_system_high_confidence(self):
        """A fully specified system should have high confidence."""
        s = _minimal_system(
            criteria={k: v for k, v in NORMALISATION_CAPS.items()},
            features={k: True for k in BONUS_RULES},
            modifier=1.1,
        )
        bd = score_system(s)
        assert bd.confidence.score >= 80
        assert bd.confidence.criteria_coverage == 100.0
        assert bd.confidence.criteria_quality == 100.0
        assert bd.confidence.feature_match == 100.0
        assert bd.confidence.modifier_provided == 100.0

    def test_empty_system_low_confidence(self):
        """No criteria, no features, no modifier → low confidence."""
        s = _minimal_system()
        bd = score_system(s)
        assert bd.confidence.score <= 15
        assert bd.confidence.criteria_coverage == 0.0
        assert bd.confidence.modifier_provided == 0.0

    def test_partial_criteria_medium_coverage(self):
        """2 of 5 criteria supplied → coverage around 40."""
        s = _minimal_system(criteria={"brightness": 5000, "color_accuracy": 90})
        bd = score_system(s)
        assert bd.confidence.criteria_coverage == pytest.approx(40.0)

    def test_modifier_provided_signal(self):
        """Explicit modifier should flip the modifier_provided signal to 100."""
        s_with = _minimal_system(modifier=1.0)
        s_without = _minimal_system()
        bd_with = score_system(s_with)
        bd_without = score_system(s_without)
        assert bd_with.confidence.modifier_provided == 100.0
        assert bd_without.confidence.modifier_provided == 0.0
        assert bd_with.confidence.score > bd_without.confidence.score

    def test_invalid_modifier_no_confidence_boost(self):
        """NaN modifier falls back — should NOT get modifier_provided credit."""
        s = _minimal_system(modifier=float("nan"))
        bd = score_system(s)
        assert bd.confidence.modifier_provided == 0.0

    def test_confidence_reasons_present(self):
        """Confidence must include human-readable reasons."""
        s = _minimal_system(criteria={"brightness": 5000}, modifier=1.05)
        bd = score_system(s)
        assert len(bd.confidence.reasons) >= 4
        assert any("composite" in r for r in bd.confidence.reasons)

    def test_confidence_deterministic(self):
        """Same input must produce same confidence."""
        s = _minimal_system(
            criteria={"brightness": 8000, "energy_efficiency": 150},
            features={"dimmable": True},
            modifier=1.05,
        )
        a = score_system(s)
        b = score_system(s)
        assert a.confidence.score == b.confidence.score
        assert a.confidence.model_dump() == b.confidence.model_dump()


# ── Context-aware scoring (image intelligence) ─────────────────────────────

def _system_with_taxonomy(**tax_overrides) -> dict:
    tax = {
        "mood": "corporate",
        "modifier_family": "softbox_rect",
        "gear_profile": "strobe_mono",
        "skin_tone": "light",
    }
    tax.update(tax_overrides)
    return _minimal_system(
        criteria={"brightness": 5000, "color_accuracy": 90},
        features={"dimmable": True},
        modifier=1.1,
        taxonomy_refs=tax,
    )


class TestContextBonuses:
    def test_mood_match_boosts_score(self):
        sys = _system_with_taxonomy(mood="cinematic")
        ctx = {"detected_mood": "cinematic", "detected_mood_confidence": 0.8}
        total, bonuses, notes = _compute_context_bonuses(sys, ctx)
        assert total > 0
        expected = CONTEXT_BONUS_WEIGHTS["mood_match"] * 0.8
        assert total == pytest.approx(expected, abs=0.01)
        assert len(bonuses) == 1
        assert bonuses[0].feature == "ctx_mood_match"

    def test_modifier_match_boosts_score(self):
        sys = _system_with_taxonomy(modifier_family="beauty_dish")
        ctx = {"detected_modifier": "beauty_dish", "detected_modifier_confidence": 0.5}
        total, bonuses, _ = _compute_context_bonuses(sys, ctx)
        expected = CONTEXT_BONUS_WEIGHTS["modifier_match"] * 0.5
        assert total == pytest.approx(expected, abs=0.01)

    def test_skin_tone_match_boosts_score(self):
        sys = _system_with_taxonomy(skin_tone="dark")
        ctx = {"detected_skin_tone": "dark", "detected_skin_tone_confidence": 0.8}
        total, bonuses, _ = _compute_context_bonuses(sys, ctx)
        expected = CONTEXT_BONUS_WEIGHTS["skin_tone_match"] * 0.8
        assert total == pytest.approx(expected, abs=0.01)

    def test_no_context_no_bonus(self):
        sys = _system_with_taxonomy()
        total, bonuses, notes = _compute_context_bonuses(sys, {})
        assert total == 0.0
        assert bonuses == []
        assert notes == []

    def test_mismatched_mood_no_bonus(self):
        sys = _system_with_taxonomy(mood="corporate")
        ctx = {"detected_mood": "cinematic", "detected_mood_confidence": 0.9}
        total, bonuses, _ = _compute_context_bonuses(sys, ctx)
        assert total == 0.0

    def test_low_confidence_smaller_bonus(self):
        sys = _system_with_taxonomy(mood="beauty")
        high_ctx = {"detected_mood": "beauty", "detected_mood_confidence": 0.9}
        low_ctx = {"detected_mood": "beauty", "detected_mood_confidence": 0.3}
        high_total, _, _ = _compute_context_bonuses(sys, high_ctx)
        low_total, _, _ = _compute_context_bonuses(sys, low_ctx)
        assert high_total > low_total

    def test_backwards_compat_no_ctx(self):
        """score_system with no input_ctx should work identically to before."""
        sys = _system_with_taxonomy()
        a = score_system(sys, input_ctx=None)
        b = score_system(sys, input_ctx={})
        assert a.final_score == b.final_score

    def test_context_bonus_in_final_score(self):
        """Context bonuses should increase final_score."""
        sys = _system_with_taxonomy(mood="corporate")
        baseline = score_system(sys, input_ctx={})
        with_ctx = score_system(sys, input_ctx={
            "detected_mood": "corporate",
            "detected_mood_confidence": 0.8,
        })
        assert with_ctx.final_score > baseline.final_score
        assert with_ctx.base_score > baseline.base_score
