"""Tests for Phase 6–9 services: Blueprint, Live Feedback, Style DNA, Environment Intel.

These tests use mocked/stub AnalysisResult objects to avoid image I/O.
All 2186 existing tests must still pass after these additions.
"""

from __future__ import annotations

import pytest
from typing import Any, Dict, Optional
from unittest.mock import MagicMock


# ═══════════════════════════════════════════════════════════════════════════
# Stub helpers
# ═══════════════════════════════════════════════════════════════════════════

class _StubClassification:
    def __init__(self, brightness="normal"):
        self.brightness = brightness


class _StubLightingIntel:
    def __init__(
        self,
        pattern="rembrandt",
        pattern_confidence=0.8,
        modifier_family="softbox_rect",
        modifier_confidence=0.7,
        light_count=2,
        key_side="left",
        key_position_text="45 off-axis",
        fill_method_text="reflector fill",
        background_light_detected=False,
        background_light_confidence=0.0,
        detected_cct_kelvin=5500,
        detected_environment="studio",
        detected_distance_class="medium",
        detected_mood="corporate",
        mood_confidence=0.6,
        detected_skin_tone=None,
        skin_tone_confidence=0.0,
        data_quality="full",
        notes=None,
    ):
        self.pattern = pattern
        self.pattern_confidence = pattern_confidence
        self.modifier_family = modifier_family
        self.modifier_confidence = modifier_confidence
        self.light_count = light_count
        self.key_side = key_side
        self.key_position_text = key_position_text
        self.fill_method_text = fill_method_text
        self.background_light_detected = background_light_detected
        self.background_light_confidence = background_light_confidence
        self.detected_cct_kelvin = detected_cct_kelvin
        self.detected_environment = detected_environment
        self.detected_distance_class = detected_distance_class
        self.detected_mood = detected_mood
        self.mood_confidence = mood_confidence
        self.detected_skin_tone = detected_skin_tone
        self.skin_tone_confidence = skin_tone_confidence
        self.data_quality = data_quality
        self.notes = notes or []


class _StubContrastRatio:
    def __init__(self, ratio=4.0):
        self.ratio = ratio


class _StubTonalProcessing:
    def __init__(self, is_bw=False):
        self.is_bw = is_bw


class _StubCueReport:
    def __init__(self, contrast_ratio=4.0, is_bw=False):
        self.contrast_ratio = _StubContrastRatio(contrast_ratio)
        self.tonal_processing_estimation = _StubTonalProcessing(is_bw)

    def overall_confidence(self):
        return 0.6


class _StubAnalysisResult:
    def __init__(
        self,
        pattern="rembrandt",
        lighting_intel=None,
        cue_report=None,
        classification=None,
        face_validation=None,
        edge_case_flags=None,
        cue_inference_result=None,
        ok=True,
    ):
        self.authoritative_pattern = pattern
        self.authoritative_pattern_source = "lighting_inference"
        self.lighting_intel = lighting_intel or _StubLightingIntel(pattern=pattern)
        self.cue_report = cue_report or _StubCueReport()
        self.classification = classification or _StubClassification()
        self.face_validation = face_validation
        self.edge_case_flags = edge_case_flags
        self.cue_inference_result = cue_inference_result
        self.ok = ok


# ═══════════════════════════════════════════════════════════════════════════
# Phase 6: Blueprint service tests
# ═══════════════════════════════════════════════════════════════════════════

from engine.services.blueprint_service import build_lighting_blueprint


class TestBlueprintService:

    def test_rembrandt_blueprint_basic(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "rembrandt"
        assert result["patternLabel"] == "Rembrandt"
        assert len(result["lights"]) >= 1
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["position"]["angleDeg"] == 45
        assert key["position"]["heightDeg"] == 45

    def test_loop_blueprint(self):
        ar = _StubAnalysisResult(pattern="loop")
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "loop"
        assert result["patternLabel"] == "Loop"
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["position"]["angleDeg"] == 30

    def test_clamshell_blueprint(self):
        ar = _StubAnalysisResult(pattern="clamshell")
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "clamshell"
        lights = result["lights"]
        roles = [l["role"] for l in lights]
        assert "key" in roles
        assert "fill" in roles

    def test_high_key_blueprint_has_background_light(self):
        ar = _StubAnalysisResult(pattern="high_key")
        result = build_lighting_blueprint(ar)
        roles = [l["role"] for l in result["lights"]]
        assert "background" in roles

    def test_key_side_mirror_right(self):
        """When key_side is 'right', clock positions should mirror left defaults."""
        li = _StubLightingIntel(pattern="rembrandt", key_side="right")
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["position"]["clock"] == "2:00"

    def test_key_side_left_keeps_default(self):
        li = _StubLightingIntel(pattern="rembrandt", key_side="left")
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["position"]["clock"] == "10:00"

    def test_modifier_override_when_confident(self):
        """Inferred modifier with confidence ≥ 0.6 should override template default."""
        li = _StubLightingIntel(
            pattern="rembrandt",
            modifier_family="beauty_dish",
            modifier_confidence=0.75,
        )
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["modifier"] == "beauty_dish"

    def test_modifier_not_overridden_when_low_confidence(self):
        li = _StubLightingIntel(
            pattern="rembrandt",
            modifier_family="beauty_dish",
            modifier_confidence=0.3,  # below 0.6 threshold
        )
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        key = next(l for l in result["lights"] if l["role"] == "key")
        # Should keep template default (softbox_rect for rembrandt)
        assert key["modifier"] == "softbox_rect"

    def test_background_light_added_when_detected(self):
        li = _StubLightingIntel(
            pattern="rembrandt",
            background_light_detected=True,
            background_light_confidence=0.7,
        )
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        roles = [l["role"] for l in result["lights"]]
        assert "background" in roles

    def test_background_light_not_added_when_low_confidence(self):
        li = _StubLightingIntel(
            pattern="rembrandt",
            background_light_detected=True,
            background_light_confidence=0.3,  # below threshold
        )
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        roles = [l["role"] for l in result["lights"]]
        # background only added for high_key template by default
        assert "background" not in roles

    def test_cct_in_camera_settings(self):
        li = _StubLightingIntel(detected_cct_kelvin=5600)
        ar = _StubAnalysisResult(pattern="loop", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        assert "5600" in result["cameraSettings"].get("detectedColorTemp", "")

    def test_subject_type_adjusts_distance(self):
        ar = _StubAnalysisResult(pattern="split")
        headshot = build_lighting_blueprint(ar, subject_type="headshot")
        full_body = build_lighting_blueprint(ar, subject_type="full_body")
        hs_dist = headshot["lights"][0]["position"]["distanceFt"]
        fb_dist = full_body["lights"][0]["position"]["distanceFt"]
        assert fb_dist > hs_dist

    def test_unknown_pattern_returns_valid_blueprint(self):
        ar = _StubAnalysisResult(pattern="unknown")
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "unknown"
        assert len(result["lights"]) >= 1

    def test_alias_pattern_butterfly(self):
        ar = _StubAnalysisResult(pattern="paramount")
        result = build_lighting_blueprint(ar)
        assert result["patternLabel"] == "Butterfly (Paramount)"

    def test_alias_pattern_flat_fashion(self):
        ar = _StubAnalysisResult(pattern="flat_fashion")
        result = build_lighting_blueprint(ar)
        assert result["patternLabel"] == "Flat / Catalog"

    def test_recommended_kits_present(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = build_lighting_blueprint(ar)
        kits = result["recommendedKits"]
        assert "good" in kits
        assert "better" in kits
        assert "best" in kits

    def test_recommended_kits_have_items(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = build_lighting_blueprint(ar)
        for tier in ("good", "better", "best"):
            assert len(result["recommendedKits"][tier]["items"]) >= 1

    def test_no_face_warning_when_not_detected(self):
        ar = _StubAnalysisResult(
            pattern="rembrandt",
            face_validation={"faceDetected": False, "faceConfidence": 0.0},
        )
        result = build_lighting_blueprint(ar)
        assert any("face" in w.lower() for w in result["warnings"])

    def test_low_confidence_warning(self):
        li = _StubLightingIntel(pattern_confidence=0.3)
        ar = _StubAnalysisResult(pattern="rembrandt", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        assert any("confidence" in w.lower() for w in result["warnings"])

    def test_all_keys_present(self):
        ar = _StubAnalysisResult(pattern="loop")
        result = build_lighting_blueprint(ar)
        for key in ("pattern", "patternLabel", "lights", "subjectNotes",
                    "backgroundNotes", "cameraSettings", "coaching",
                    "fallbackOptions", "recommendedKits", "signalConfidence",
                    "dataQuality", "warnings"):
            assert key in result, f"Missing key: {key}"

    def test_json_serializable(self):
        import json
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = build_lighting_blueprint(ar)
        serialized = json.dumps(result)
        assert isinstance(serialized, str)

    def test_error_fallback_on_bad_input(self):
        """Service should not raise — returns minimal fallback on corrupt input."""
        result = build_lighting_blueprint(None)
        assert "error" in result or "lights" in result  # either error or valid

    def test_ring_light_blueprint(self):
        # No inferred modifier — template default (ring_light) should be used
        li = _StubLightingIntel(pattern="ring", modifier_family=None, modifier_confidence=0.0)
        ar = _StubAnalysisResult(pattern="ring", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "ring"
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert key["modifier"] == "ring_light"

    def test_window_portrait_blueprint(self):
        # No inferred modifier — template default (window_natural) should be used
        li = _StubLightingIntel(
            pattern="window_portrait", modifier_family=None, modifier_confidence=0.0
        )
        ar = _StubAnalysisResult(pattern="window_portrait", lighting_intel=li)
        result = build_lighting_blueprint(ar)
        assert result["pattern"] == "window_portrait"
        key = next(l for l in result["lights"] if l["role"] == "key")
        assert "window" in key["modifier"].lower() or "window" in key["modifierLabel"].lower()


# ═══════════════════════════════════════════════════════════════════════════
# Phase 7: Live Feedback service tests
# ═══════════════════════════════════════════════════════════════════════════

from engine.services.live_feedback_service import analyze_shoot_deviation


class TestLiveFeedbackService:

    def test_perfect_match(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = analyze_shoot_deviation(ar, ar)
        assert result["matchScore"] >= 0.95
        assert result["matchLabel"] == "excellent"
        assert len(result["deviations"]) == 0

    def test_pattern_mismatch_detected(self):
        ref = _StubAnalysisResult(pattern="rembrandt")
        test = _StubAnalysisResult(
            pattern="loop",
            lighting_intel=_StubLightingIntel(pattern="loop"),
        )
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "pattern_mismatch" in types

    def test_pattern_mismatch_is_critical(self):
        ref = _StubAnalysisResult(pattern="rembrandt")
        test = _StubAnalysisResult(
            pattern="loop",
            lighting_intel=_StubLightingIntel(pattern="loop"),
        )
        result = analyze_shoot_deviation(ref, test)
        mismatch = next(d for d in result["deviations"] if d["type"] == "pattern_mismatch")
        assert mismatch["severity"] == "critical"

    def test_key_side_mismatch_detected(self):
        ref_li = _StubLightingIntel(pattern="rembrandt", key_side="left")
        test_li = _StubLightingIntel(pattern="rembrandt", key_side="right")
        ref = _StubAnalysisResult(pattern="rembrandt", lighting_intel=ref_li)
        test = _StubAnalysisResult(pattern="rembrandt", lighting_intel=test_li)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "key_side_mismatch" in types

    def test_light_count_change_detected(self):
        ref_li = _StubLightingIntel(light_count=3)
        test_li = _StubLightingIntel(light_count=1)
        ref = _StubAnalysisResult(lighting_intel=ref_li)
        test = _StubAnalysisResult(lighting_intel=test_li)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "light_count_change" in types

    def test_modifier_change_detected(self):
        ref_li = _StubLightingIntel(
            pattern="rembrandt", modifier_family="softbox_rect", modifier_confidence=0.8
        )
        test_li = _StubLightingIntel(
            pattern="rembrandt", modifier_family="beauty_dish", modifier_confidence=0.8
        )
        ref = _StubAnalysisResult(pattern="rembrandt", lighting_intel=ref_li)
        test = _StubAnalysisResult(pattern="rembrandt", lighting_intel=test_li)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "modifier_change" in types

    def test_background_light_change_detected(self):
        ref_li = _StubLightingIntel(
            background_light_detected=True, background_light_confidence=0.8
        )
        test_li = _StubLightingIntel(
            background_light_detected=False, background_light_confidence=0.0
        )
        ref = _StubAnalysisResult(lighting_intel=ref_li)
        test = _StubAnalysisResult(lighting_intel=test_li)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "background_light_change" in types

    def test_color_temp_shift_detected(self):
        ref_li = _StubLightingIntel(detected_cct_kelvin=5500)
        test_li = _StubLightingIntel(detected_cct_kelvin=3200)  # > 500K diff
        ref = _StubAnalysisResult(lighting_intel=ref_li)
        test = _StubAnalysisResult(lighting_intel=test_li)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "color_temp_shift" in types

    def test_deviations_sorted_by_severity(self):
        """Critical deviations should appear first."""
        ref_li = _StubLightingIntel(pattern="rembrandt", light_count=3)
        test_li = _StubLightingIntel(pattern="loop", light_count=1)
        ref = _StubAnalysisResult(pattern="rembrandt", lighting_intel=ref_li)
        test = _StubAnalysisResult(
            pattern="loop", lighting_intel=test_li
        )
        result = analyze_shoot_deviation(ref, test)
        if len(result["deviations"]) > 1:
            assert result["deviations"][0]["severity"] in ("critical", "major")

    def test_priority_action_set(self):
        ref = _StubAnalysisResult(pattern="rembrandt")
        test = _StubAnalysisResult(
            pattern="loop", lighting_intel=_StubLightingIntel(pattern="loop")
        )
        result = analyze_shoot_deviation(ref, test)
        assert result["priorityAction"] != ""

    def test_summary_present(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = analyze_shoot_deviation(ar, ar)
        assert isinstance(result["summary"], str)
        assert len(result["summary"]) > 5

    def test_match_score_range(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = analyze_shoot_deviation(ar, ar)
        assert 0.0 <= result["matchScore"] <= 1.0

    def test_result_keys(self):
        ar = _StubAnalysisResult(pattern="rembrandt")
        result = analyze_shoot_deviation(ar, ar)
        for k in ("matchScore", "matchLabel", "deviations", "priorityAction", "summary"):
            assert k in result

    def test_error_fallback(self):
        """Service should not raise on corrupt input."""
        result = analyze_shoot_deviation(None, None)
        assert "matchScore" in result or "error" in result

    def test_bw_mismatch_detected(self):
        ref_cr = _StubCueReport(is_bw=True)
        test_cr = _StubCueReport(is_bw=False)
        ref = _StubAnalysisResult(cue_report=ref_cr)
        test = _StubAnalysisResult(cue_report=test_cr)
        result = analyze_shoot_deviation(ref, test)
        types = [d["type"] for d in result["deviations"]]
        assert "bw_color_mismatch" in types


# ═══════════════════════════════════════════════════════════════════════════
# Phase 8: Style DNA service tests
# ═══════════════════════════════════════════════════════════════════════════

from engine.services.style_dna_service import analyze_user_portfolio


class TestStyleDNAService:

    def _make_ar(self, pattern="rembrandt", modifier="softbox_rect",
                 key_side="left", light_count=2, brightness="normal",
                 contrast_ratio=4.0, is_bw=False, cct=5500):
        li = _StubLightingIntel(
            pattern=pattern,
            modifier_family=modifier,
            key_side=key_side,
            light_count=light_count,
            detected_cct_kelvin=cct,
        )
        cr = _StubCueReport(contrast_ratio=contrast_ratio, is_bw=is_bw)
        cl = _StubClassification(brightness=brightness)
        return _StubAnalysisResult(
            pattern=pattern,
            lighting_intel=li,
            cue_report=cr,
            classification=cl,
        )

    def test_empty_returns_error(self):
        result = analyze_user_portfolio([])
        assert result["imageCount"] == 0
        assert "error" in result or "suggestions" in result

    def test_single_image(self):
        ar = self._make_ar(pattern="rembrandt")
        result = analyze_user_portfolio([ar])
        assert result["imageCount"] == 1
        assert result["signaturePattern"]["pattern"] == "rembrandt"

    def test_pattern_distribution(self):
        ars = [
            self._make_ar(pattern="rembrandt"),
            self._make_ar(pattern="rembrandt"),
            self._make_ar(pattern="loop"),
        ]
        result = analyze_user_portfolio(ars)
        dist = result["patternDistribution"]
        assert dist[0]["pattern"] == "rembrandt"  # most common
        assert dist[0]["count"] == 2
        assert dist[0]["pct"] == pytest.approx(66.7, abs=0.2)

    def test_contrast_profile_computed(self):
        ars = [self._make_ar(contrast_ratio=r) for r in [3.0, 5.0, 7.0]]
        result = analyze_user_portfolio(ars)
        cp = result["contrastProfile"]
        assert cp["available"] is True
        assert "averageRatio" in cp

    def test_modifier_usage(self):
        ars = [
            self._make_ar(modifier="softbox_rect"),
            self._make_ar(modifier="softbox_rect"),
            self._make_ar(modifier="beauty_dish"),
        ]
        result = analyze_user_portfolio(ars)
        mods = result["modifierUsage"]
        assert mods[0]["modifier"] == "softbox_rect"
        assert mods[0]["count"] == 2

    def test_tone_profile_bw(self):
        ars = [
            self._make_ar(is_bw=True),
            self._make_ar(is_bw=True),
            self._make_ar(is_bw=False),
        ]
        result = analyze_user_portfolio(ars)
        tp = result["toneProfile"]
        assert tp["bwImages"] == 2
        assert tp["bwPct"] == pytest.approx(66.7, abs=0.2)

    def test_key_side_preference(self):
        ars = [
            self._make_ar(key_side="left"),
            self._make_ar(key_side="left"),
            self._make_ar(key_side="right"),
        ]
        result = analyze_user_portfolio(ars)
        ksp = result["keySidePreference"]
        assert ksp["preference"] == "left"

    def test_light_count_profile(self):
        ars = [self._make_ar(light_count=lc) for lc in [1, 2, 3]]
        result = analyze_user_portfolio(ars)
        lcp = result["lightCountProfile"]
        assert lcp["available"] is True
        assert lcp["average"] == pytest.approx(2.0, abs=0.1)

    def test_suggestions_generated(self):
        ars = [self._make_ar(pattern="rembrandt") for _ in range(5)]
        result = analyze_user_portfolio(ars)
        assert isinstance(result["suggestions"], list)

    def test_diversity_suggestion_when_single_pattern(self):
        ars = [self._make_ar(pattern="loop") for _ in range(10)]
        result = analyze_user_portfolio(ars)
        combined = " ".join(result["suggestions"])
        assert "loop" in combined.lower() or "pattern" in combined.lower()

    def test_small_portfolio_suggestion(self):
        ars = [self._make_ar() for _ in range(3)]
        result = analyze_user_portfolio(ars)
        combined = " ".join(result["suggestions"])
        # Should suggest adding more images
        assert "3" in combined or "image" in combined.lower()

    def test_json_serializable(self):
        import json
        ars = [self._make_ar(pattern=p) for p in ("rembrandt", "loop", "butterfly")]
        result = analyze_user_portfolio(ars)
        json.dumps(result)  # Should not raise

    def test_signature_pattern_is_dominant(self):
        ars = [
            self._make_ar(pattern="split"),
            self._make_ar(pattern="split"),
            self._make_ar(pattern="split"),
            self._make_ar(pattern="loop"),
        ]
        result = analyze_user_portfolio(ars)
        assert result["signaturePattern"]["pattern"] == "split"

    def test_all_result_keys_present(self):
        ars = [self._make_ar()]
        result = analyze_user_portfolio(ars)
        for k in ("imageCount", "signaturePattern", "patternDistribution",
                  "contrastProfile", "modifierUsage", "lightCountProfile",
                  "toneProfile", "keySidePreference", "suggestions"):
            assert k in result, f"Missing key: {k}"


# ═══════════════════════════════════════════════════════════════════════════
# Phase 9: Environment Intelligence in shoot_match_service
# ═══════════════════════════════════════════════════════════════════════════

from engine.services.shoot_match_service import _build_lighting_intelligence


class _StubEnvInference:
    def __init__(
        self,
        is_natural=False,
        environment_type="studio",
        background_treatment="controlled",
        confidence=0.8,
        special_cases=None,
    ):
        self.is_natural_light = is_natural
        self.environment_type = environment_type
        self.background_treatment = background_treatment
        self.confidence = confidence
        self.special_cases = special_cases or []


class TestEnvironmentIntelligence:

    def _li(self, **kwargs):
        return _StubLightingIntel(**kwargs)

    def test_no_cue_inference_result(self):
        """No cue_inference_result → function should still work, just no env fields."""
        li = self._li()
        result = _build_lighting_intelligence(li, "rembrandt", "corporate", None)
        assert "detectedPattern" in result
        assert "lightSourceType" not in result or result.get("lightSourceType") is None

    def test_artificial_light_detected(self):
        li = self._li()
        env = _StubEnvInference(is_natural=False, background_treatment="controlled")
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "rembrandt", "corporate", cue_inf)
        assert result["lightSourceType"] == "artificial"

    def test_natural_light_detected(self):
        li = self._li(detected_environment="outdoor_shade")
        env = _StubEnvInference(
            is_natural=True,
            environment_type="outdoor_shade",
            background_treatment="environmental",
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "window_portrait", "natural", cue_inf)
        assert result["lightSourceType"] == "natural"

    def test_ambient_conditions_studio(self):
        li = self._li()
        env = _StubEnvInference(
            is_natural=False,
            environment_type="studio",
            background_treatment="controlled",
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "rembrandt", "corporate", cue_inf)
        assert "ambientConditions" in result
        assert "studio" in result["ambientConditions"].lower()

    def test_ambient_conditions_outdoor_shade(self):
        li = self._li()
        env = _StubEnvInference(
            is_natural=True,
            environment_type="outdoor_shade",
            background_treatment="environmental",
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "loop", "natural", cue_inf)
        assert "ambientConditions" in result
        assert "shade" in result["ambientConditions"].lower()

    def test_ambient_conditions_direct_sun(self):
        li = self._li()
        env = _StubEnvInference(
            is_natural=True,
            environment_type="outdoor_sun",
            special_cases=["direct_sunlight"],
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "split", "natural", cue_inf)
        assert "Direct sunlight" in result.get("ambientConditions", "")

    def test_environment_confidence_surfaced(self):
        li = self._li()
        env = _StubEnvInference(confidence=0.75)
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "rembrandt", "corporate", cue_inf)
        assert result["environmentConfidence"] == pytest.approx(0.75, abs=0.001)

    def test_environment_type_surfaced(self):
        li = self._li()
        env = _StubEnvInference(environment_type="indoor_ambient")
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "loop", "natural", cue_inf)
        assert result.get("environmentType") == "indoor_ambient"

    def test_special_cases_surfaced(self):
        li = self._li()
        env = _StubEnvInference(
            environment_type="outdoor_shade",
            special_cases=["dappled_foliage"],
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "loop", "natural", cue_inf)
        assert "dappled_foliage" in result.get("environmentSpecialCases", [])

    def test_window_light_ambient_conditions(self):
        li = self._li()
        env = _StubEnvInference(
            is_natural=True,
            environment_type="indoor_ambient",
            special_cases=["window_light"],
        )
        cue_inf = {"environment": env}
        result = _build_lighting_intelligence(li, "window_portrait", "natural", cue_inf)
        assert "Window light" in result.get("ambientConditions", "")

    def test_existing_fields_unaffected(self):
        """Phase 9 additions must not remove or alter existing response fields."""
        li = self._li(
            pattern="rembrandt",
            pattern_confidence=0.85,
            modifier_family="softbox_rect",
            light_count=2,
        )
        env = _StubEnvInference()
        result = _build_lighting_intelligence(li, "rembrandt", "corporate", {"environment": env})
        assert result["detectedPattern"] == "rembrandt"
        assert result["patternConfidence"] == 0.85
        assert result["detectedModifier"] == "softbox_rect"
        assert result["lightCount"] == 2
