"""Tests for engine.services.shoot_match_service.

Validates:
  - Service returns a ShootMatchResult
  - Pattern candidate structure is preserved (not collapsed)
  - Backward-compatible fields (authoritative_pattern, cards) are populated
  - Filter tiers work correctly
  - Build-from-scratch (no reference image) graceful fallback
"""

from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock

from engine.services.shoot_match_service import (
    ShootMatchResult,
    FilterResult,
    filter_systems,
    build_modifiers,
    _reliability_label,
    _confidence_tier,
    _build_setup_summary,
    MOOD_MAP,
    ENVIRONMENT_MAP,
    GEAR_MAP,
)
from engine.orchestrator import (
    PatternCandidate,
    PatternCandidates,
    resolve_pattern_candidates,
    AnalysisResult,
)


# ── FilterResult tests ──────────────────────────────────────────────────

class TestFilterSystems:
    @pytest.fixture
    def sample_systems(self):
        return [
            {"id": "s1", "name": "Beauty Key", "criteria": {}, "features": {},
             "taxonomy_refs": {"mood": "beauty", "environment": "studio_small", "gear_profile": "strobe_mono"}},
            {"id": "s2", "name": "Corporate Two", "criteria": {}, "features": {},
             "taxonomy_refs": {"mood": "corporate", "environment": "studio_small", "gear_profile": "speedlight"}},
            {"id": "s3", "name": "Beauty Large", "criteria": {}, "features": {},
             "taxonomy_refs": {"mood": "beauty", "environment": "studio_large", "gear_profile": "strobe_pack"}},
        ]

    def test_mood_filter(self, sample_systems):
        fr = filter_systems(sample_systems, mood="beauty", environment="studio_small",
                            gear=[], gear_mode="anyGear")
        assert all(s["taxonomy_refs"]["mood"] == "beauty" for s in fr.systems)
        assert fr.match_tier == "exact"

    def test_exact_gear_match(self, sample_systems):
        fr = filter_systems(sample_systems, mood="beauty", environment="studio_small",
                            gear=["strobe"], gear_mode="myGear")
        assert any(s["id"] == "s1" for s in fr.systems)
        assert fr.match_tier == "exact"

    def test_gear_group_fallback(self, sample_systems):
        """When exact gear doesn't match, fall back to same gear group."""
        fr = filter_systems(sample_systems, mood="beauty", environment="studio_small",
                            gear=["strobe pack"], gear_mode="myGear")
        # strobe_pack is in the same group as strobe_mono
        assert fr.match_tier in ("exact", "gear_group")

    def test_mood_only_fallback(self, sample_systems):
        """When no gear matches at all, fall back to mood-only."""
        fr = filter_systems(sample_systems, mood="beauty", environment="studio_small",
                            gear=["ring light"], gear_mode="myGear")
        # ring_light is in "specialty" group, no beauty systems use it
        assert fr.match_tier in ("gear_group", "mood_only", "any_gear")

    def test_any_gear_mode_ignores_gear(self, sample_systems):
        fr = filter_systems(sample_systems, mood="beauty", environment="studio_small",
                            gear=["ring light"], gear_mode="anyGear")
        assert fr.match_tier == "exact"  # no gear filter applied


# ── Pattern candidate tests ─────────────────────────────────────────────

class TestPatternCandidates:
    def test_empty_result(self):
        ar = AnalysisResult()
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"
        assert pc.authoritative_source == "none"
        assert len(pc.alternates) == 0

    def test_single_source(self):
        ar = AnalysisResult()
        # Mock lighting_intel with a pattern
        intel = MagicMock()
        intel.pattern = "rembrandt"
        intel.pattern_confidence = 0.82
        ar.lighting_intel = intel
        ar.reference_analysis = None

        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"
        assert pc.authoritative_source == "lighting_inference"
        assert pc.primary.confidence == 0.82

    def test_reference_read_takes_priority(self):
        ar = AnalysisResult()
        # Mock both classifiers
        intel = MagicMock()
        intel.pattern = "loop"
        intel.pattern_confidence = 0.9
        ar.lighting_intel = intel

        ref_analysis = MagicMock()
        lr = MagicMock()
        lr.shadow_pattern = "rembrandt"
        lr.pattern_confidence = 0.85
        ref_analysis.lighting_read = lr
        ar.reference_analysis = ref_analysis

        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"
        assert pc.authoritative_source == "reference_read"
        # Loop should be an alternate
        assert any(c.pattern == "loop" for c in pc.alternates)

    def test_contradiction_detected(self):
        ar = AnalysisResult()
        intel = MagicMock()
        intel.pattern = "loop"
        intel.pattern_confidence = 0.9
        ar.lighting_intel = intel

        ref_analysis = MagicMock()
        lr = MagicMock()
        lr.shadow_pattern = "rembrandt"
        lr.pattern_confidence = 0.85
        ref_analysis.lighting_read = lr
        ar.reference_analysis = ref_analysis

        pc = resolve_pattern_candidates(ar)
        assert pc.needs_review is True
        assert len(pc.contradictions) > 0
        assert "rembrandt" in pc.contradictions[0]
        assert "loop" in pc.contradictions[0]

    def test_cue_inference_source_with_real_confidence(self):
        """Source 3 (cue_inference) uses GeometryInference confidence, not hardcoded 0.5."""
        ar = AnalysisResult()
        ar.reference_analysis = None
        ar.lighting_intel = None

        # Mock GeometryInference with shadow_pattern and real confidence
        geo = MagicMock()
        geo.shadow_pattern = "split"
        geo.confidence = 0.72
        ar.cue_inference_result = {"geometry": geo}

        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "split"
        assert pc.authoritative_source == "cue_inference"
        assert pc.primary.confidence == 0.72  # real confidence, not 0.5

    def test_cue_inference_as_alternate(self):
        """cue_inference is lower priority than lighting_inference."""
        ar = AnalysisResult()
        ar.reference_analysis = None

        intel = MagicMock()
        intel.pattern = "rembrandt"
        intel.pattern_confidence = 0.8
        ar.lighting_intel = intel

        geo = MagicMock()
        geo.shadow_pattern = "loop"
        geo.confidence = 0.65
        ar.cue_inference_result = {"geometry": geo}

        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"
        assert pc.authoritative_source == "lighting_inference"
        assert any(c.pattern == "loop" and c.source == "cue_inference" for c in pc.alternates)

    def test_to_dict(self):
        pc = PatternCandidates(
            primary=PatternCandidate(pattern="rembrandt", source="reference_read", confidence=0.85, rank=1),
            alternates=[PatternCandidate(pattern="loop", source="lighting_inference", confidence=0.7, rank=2)],
            needs_review=True,
            contradictions=["disagreement"],
        )
        d = pc.to_dict()
        assert d["primary_candidate"]["pattern"] == "rembrandt"
        assert len(d["alternate_candidates"]) == 1
        assert d["alternate_candidates"][0]["pattern"] == "loop"
        assert d["needs_review"] is True


# ── Helper tests ────────────────────────────────────────────────────────

class TestHelpers:
    def test_build_modifiers_any_gear(self):
        assert build_modifiers(["strobe"], "anyGear") == []

    def test_build_modifiers_my_gear(self):
        mods = build_modifiers(["strobe"], "myGear")
        assert "softbox" in mods or "octabox" in mods

    def test_reliability_labels(self):
        assert _reliability_label(95) == "Very Reliable"
        assert _reliability_label(80) == "Reliable"
        assert _reliability_label(65) == "Good Option"
        assert _reliability_label(45) == "Experimental"
        assert _reliability_label(20) == "Not Ideal"

    def test_mood_map_identity(self):
        """Internal codes should map to themselves."""
        for code in ("beauty", "cinematic", "corporate", "editorial", "natural"):
            assert MOOD_MAP[code] == code

    def test_environment_map_identity(self):
        for code in ("studio_small", "studio_large", "on_location_indoor", "on_location_outdoor"):
            assert ENVIRONMENT_MAP[code] == code


# ── ShootMatchResult structure tests ────────────────────────────────────

class TestShootMatchResult:
    def test_default_values(self):
        r = ShootMatchResult()
        assert r.authoritative_pattern == "unknown"
        assert r.confidence == 0.0
        assert r.needs_review is False
        assert r.cards == {}
        assert r.contradictions == []

    def test_pattern_candidates_preserved(self):
        pc = PatternCandidates(
            primary=PatternCandidate(pattern="clamshell", source="reference_read", confidence=0.9),
            alternates=[PatternCandidate(pattern="loop", source="cue_inference", confidence=0.4)],
        )
        r = ShootMatchResult(
            authoritative_pattern="clamshell",
            pattern_candidates=pc,
        )
        assert r.pattern_candidates.primary.pattern == "clamshell"
        assert len(r.pattern_candidates.alternates) == 1
        assert r.pattern_candidates.alternates[0].pattern == "loop"


class TestConfidenceTier:
    """Phase 3: Photographer-centric confidence tiers."""

    def test_locked_tier(self):
        t = _confidence_tier(85)
        assert t["tier"] == "Locked"
        assert t["icon"] == "lock"

    def test_strong_tier(self):
        t = _confidence_tier(75)
        assert t["tier"] == "Strong"

    def test_usable_tier(self):
        t = _confidence_tier(60)
        assert t["tier"] == "Usable"

    def test_needs_adjustment_tier(self):
        t = _confidence_tier(40)
        assert t["tier"] == "Needs adjustment"

    def test_boundary_locked(self):
        assert _confidence_tier(85)["tier"] == "Locked"
        assert _confidence_tier(84.9)["tier"] == "Strong"

    def test_boundary_strong(self):
        assert _confidence_tier(70)["tier"] == "Strong"
        assert _confidence_tier(69.9)["tier"] == "Usable"

    def test_boundary_usable(self):
        assert _confidence_tier(55)["tier"] == "Usable"
        assert _confidence_tier(54.9)["tier"] == "Needs adjustment"

    def test_zero_score(self):
        assert _confidence_tier(0)["tier"] == "Needs adjustment"

    def test_perfect_score(self):
        assert _confidence_tier(100)["tier"] == "Locked"


class TestSetupSummary:
    """Phase 3: Human-readable setup summary builder."""

    def test_rembrandt_single(self):
        summary = _build_setup_summary(
            source={"name": "Test"},
            pattern="rembrandt",
            light_count=1,
            modifier_family="hard",
            key_direction="upper_left",
        )
        assert "Rembrandt" in summary
        assert "single source" in summary
        assert "hard light" in summary

    def test_clamshell_two_lights(self):
        summary = _build_setup_summary(
            source={"name": "Test"},
            pattern="clamshell",
            light_count=2,
            modifier_family="soft",
            key_direction="center",
        )
        assert "Clamshell" in summary
        assert "key + fill" in summary
        assert "soft modifiers" in summary

    def test_unknown_pattern(self):
        summary = _build_setup_summary(
            source={"name": "Test"},
            pattern="bare_bulb_editorial",
            light_count=3,
            modifier_family="",
            key_direction="unknown",
        )
        assert "3-light setup" in summary


class TestShootLoop:
    """Phase 3: ShootMatchResult includes shoot_loop field."""

    def test_shoot_loop_field_exists(self):
        r = ShootMatchResult()
        assert r.shoot_loop is None  # default

    def test_shoot_loop_with_data(self):
        r = ShootMatchResult(
            shoot_loop={
                "lookName": "Test Look",
                "setupSummary": "Rembrandt lighting · single source",
                "detectedPattern": "rembrandt",
                "confidenceTier": {"tier": "Locked", "label": "...", "icon": "lock"},
            },
        )
        assert r.shoot_loop["lookName"] == "Test Look"
        assert r.shoot_loop["confidenceTier"]["tier"] == "Locked"
