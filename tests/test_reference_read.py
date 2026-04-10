"""Tests for the three-layer reference photo analysis pipeline.

Layers:
1. Model tests — ImageRead, LightingRead, RecreationSetup, ReferencePhotoAnalysis
2. Builder tests — individual builder functions with synthetic data
3. Integration tests — build_reference_description with cue_report
"""

import pytest
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional

from engine.image_analysis_models import (
    BackgroundIllumination,
    ContrastRatio,
    ImageRead,
    LightingRead,
    RecreationSetup,
    ReferencePhotoAnalysis,
    ShadowEdgeHardness,
    ShadowInterruptionPattern,
    SpecularHighlightBehavior,
    SubjectBackgroundSeparation,
    TonalProcessingEstimation,
    VisualCueReport,
)

from engine.reference_read import (
    _bg_is_effectively_dark,
    build_image_read,
    build_lighting_read,
    build_recreation_setup,
    build_reference_photo_analysis,
)


# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_cue_report(**overrides) -> VisualCueReport:
    """Build a VisualCueReport with sensible defaults and overrides."""
    defaults = dict(
        shadow_edge_hardness=ShadowEdgeHardness(
            classification="hard", confidence=0.7
        ),
        contrast_ratio=ContrastRatio(label="high", confidence=0.8),
        subject_background_separation=SubjectBackgroundSeparation(
            luminance_delta=0.7, confidence=0.6
        ),
        background_illumination=BackgroundIllumination(
            pattern="dark", brightness_relative="darker", confidence=0.7
        ),
        specular_highlight_behavior=SpecularHighlightBehavior(
            intensity="moderate", spread="tight", confidence=0.5
        ),
        tonal_processing_estimation=TonalProcessingEstimation(
            is_bw=True, estimated_processing="bw", confidence=0.9
        ),
        cues_computed=6,
        ok=True,
    )
    defaults.update(overrides)
    return VisualCueReport(**defaults)


@dataclass
class _FakeGeometry:
    key_light_direction: str = "upper_left"
    key_light_height: str = "high"
    light_count_estimate: int = 1
    has_fill: bool = False
    fill_position: Optional[str] = None
    shadow_pattern: str = "rembrandt"
    confidence: float = 0.6
    notes: List[str] = dc_field(default_factory=list)


@dataclass
class _FakeSourceQuality:
    key_modifier_family: str = "hard_source"
    transition_character: str = "sharp"
    confidence: float = 0.7
    notes: List[str] = dc_field(default_factory=list)


@dataclass
class _FakeEnvironment:
    is_natural_light: bool = False
    environment_type: str = "studio"
    background_treatment: str = "controlled"
    confidence: float = 0.6
    special_cases: List[str] = dc_field(default_factory=list)
    notes: List[str] = dc_field(default_factory=list)


@dataclass
class _FakeSetupFamily:
    primary_hypothesis: str = "dramatic_chiaroscuro"
    primary_confidence: float = 0.65
    alternate_hypotheses: List[Dict[str, Any]] = dc_field(default_factory=list)
    ambiguity_notes: List[str] = dc_field(default_factory=list)
    recommendation_hints: List[str] = dc_field(default_factory=list)
    notes: List[str] = dc_field(default_factory=list)


@dataclass
class _FakeLightingIntel:
    pattern: str = "rembrandt"
    pattern_confidence: float = 0.7
    modifier_family: Optional[str] = "hard_source"
    modifier_confidence: float = 0.6
    light_count: int = 1
    key_position_text: str = "45 degrees left, high"
    key_side: str = "left"
    fill_method_text: str = ""
    background_light_detected: bool = False
    background_light_confidence: float = 0.0
    notes: List[str] = dc_field(default_factory=list)


def _make_cue_inference(**overrides) -> Dict[str, Any]:
    defaults = {
        "geometry": _FakeGeometry(),
        "source_quality": _FakeSourceQuality(),
        "environment": _FakeEnvironment(),
        "setup_family": _FakeSetupFamily(),
    }
    defaults.update(overrides)
    return defaults


# ═══════════════════════════════════════════════════════════════════════════
# 1. Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestModels:

    def test_image_read_defaults(self):
        ir = ImageRead()
        assert ir.genre == "unknown"
        assert ir.notable_visual_devices == []
        assert ir.confidence == 0.0

    def test_lighting_read_defaults(self):
        lr = LightingRead()
        assert lr.source_quality == "unknown"
        assert lr.lighting_family == "unknown"

    def test_recreation_setup_defaults(self):
        rs = RecreationSetup()
        assert rs.setup_family == "unknown"
        assert rs.light_count == 0

    def test_reference_photo_analysis_defaults(self):
        rpa = ReferencePhotoAnalysis()
        assert rpa.ok is True
        assert rpa.image_read is None
        assert rpa.lighting_read is None
        assert rpa.recreation_setup is None

    def test_extra_forbid_image_read(self):
        with pytest.raises(Exception):
            ImageRead(bogus_field="x")

    def test_extra_forbid_lighting_read(self):
        with pytest.raises(Exception):
            LightingRead(bogus_field="x")

    def test_extra_forbid_recreation_setup(self):
        with pytest.raises(Exception):
            RecreationSetup(bogus_field="x")

    def test_extra_forbid_reference_photo_analysis(self):
        with pytest.raises(Exception):
            ReferencePhotoAnalysis(bogus_field="x")

    def test_reference_photo_analysis_populated(self):
        rpa = ReferencePhotoAnalysis(
            image_read=ImageRead(genre="portrait"),
            lighting_read=LightingRead(source_quality="hard"),
            recreation_setup=RecreationSetup(setup_family="dramatic_chiaroscuro"),
        )
        assert rpa.image_read.genre == "portrait"
        assert rpa.lighting_read.source_quality == "hard"
        assert rpa.recreation_setup.setup_family == "dramatic_chiaroscuro"


# ═══════════════════════════════════════════════════════════════════════════
# 1b. Helper Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestBgIsEffectivelyDark:

    def test_dark_pattern(self):
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="dark", brightness_relative="darker", confidence=0.9
            )
        )
        assert _bg_is_effectively_dark(cr) is True

    def test_gradient_with_very_low_mean(self):
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.55, notes=["BG mean: 2, std: 17.3"]
            )
        )
        assert _bg_is_effectively_dark(cr) is True

    def test_gradient_with_moderate_mean(self):
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.7, notes=["BG mean: 120, std: 40.0"]
            )
        )
        assert _bg_is_effectively_dark(cr) is False

    def test_gradient_with_no_notes(self):
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.7, notes=[]
            )
        )
        assert _bg_is_effectively_dark(cr) is False

    def test_no_background_data(self):
        cr = _make_cue_report(background_illumination=None)
        assert _bg_is_effectively_dark(cr) is False

    def test_spot_with_low_mean(self):
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="spot", brightness_relative="similar",
                confidence=0.6, notes=["BG mean: 15, std: 30.0"]
            )
        )
        assert _bg_is_effectively_dark(cr) is True

    def test_threshold_boundary(self):
        # Exactly at 30 — should NOT be dark
        cr = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", confidence=0.5,
                notes=["BG mean: 30, std: 20.0"]
            )
        )
        assert _bg_is_effectively_dark(cr) is False

        # Just below 30 — should be dark
        cr2 = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", confidence=0.5,
                notes=["BG mean: 29, std: 20.0"]
            )
        )
        assert _bg_is_effectively_dark(cr2) is True


# ═══════════════════════════════════════════════════════════════════════════
# 2. Builder Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildImageRead:

    def test_basic_image_read(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data={"pose": {"ok": True, "pose": "three_quarter", "angle": "eye_level"}},
            classification={"mood": "dramatic", "brightness": "dark"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis={"subject": {"framing": "tight close-up"}},
        )
        assert ir.genre in ("headshot", "editorial", "portrait", "fine art")
        assert "dramatic" in ir.mood
        assert ir.contrast_shadow_feel  # should be non-empty
        assert ir.confidence > 0

    def test_bw_detection_in_devices(self):
        cue_report = _make_cue_report(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, confidence=0.9
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification=None,
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        assert "black & white conversion" in ir.notable_visual_devices

    def test_gobo_detected_genre(self):
        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="patterned_projection",
                line_count=5, confidence=0.7,
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification=None,
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        assert "editorial" in ir.genre or "portrait" in ir.genre or "fine art" in ir.genre
        assert any("gobo" in d or "projection" in d for d in ir.notable_visual_devices)


class TestBuildLightingRead:

    def test_basic_lighting_read(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert lr.source_quality == "hard"
        assert lr.shadow_pattern == "rembrandt"
        assert lr.fill_presence == "none"
        assert lr.rim_presence in ("subtle", "strong", "none")
        assert "key" in lr.lighting_family
        assert lr.confidence > 0

    def test_soft_modifier_mapping(self):
        cue_report = _make_cue_report(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.8
            )
        )
        cue_inference = _make_cue_inference(
            source_quality=_FakeSourceQuality(key_modifier_family="softbox")
        )
        intel = _FakeLightingIntel(modifier_family="softbox")

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert lr.source_quality == "soft"

    def test_ambiguity_notes_forwarded(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference(
            setup_family=_FakeSetupFamily(
                ambiguity_notes=["Shadow pattern ambiguous"]
            ),
            environment=_FakeEnvironment(
                special_cases=["bw_processing"]
            ),
        )
        intel = _FakeLightingIntel()

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert any("ambiguous" in n.lower() for n in lr.ambiguity_notes)
        assert any("bw_processing" in n for n in lr.ambiguity_notes)

    def test_tonal_processing_notes(self):
        cue_report = _make_cue_report(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, is_high_contrast_grade=True, confidence=0.9
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert "B&W" in lr.tonal_processing_notes


class TestBuildRecreationSetup:

    def test_basic_recreation(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()
        ir = ImageRead(genre="portrait")
        lr = LightingRead(source_quality="hard", fill_presence="none", light_count=1)

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert rs.setup_family == "dramatic_chiaroscuro"
        assert "reflector" in rs.modifier_suggestion.lower() or "fresnel" in rs.modifier_suggestion.lower()
        assert rs.light_count == 1
        assert rs.confidence > 0

    def test_modifier_mapping_softbox(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel(modifier_family="softbox")
        ir = ImageRead()
        lr = LightingRead(source_quality="soft")

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert "softbox" in rs.modifier_suggestion.lower()

    def test_fill_strategy_none_high_contrast(self):
        cue_report = _make_cue_report(
            contrast_ratio=ContrastRatio(label="high", confidence=0.8)
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()
        ir = ImageRead()
        lr = LightingRead(fill_presence="none")

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert "negative fill" in rs.fill_strategy.lower() or "v-flat" in rs.fill_strategy.lower()

    def test_alternates_forwarded(self):
        alternates = [
            {"hypothesis": "classic_rembrandt", "confidence": 0.4, "reason": "test"}
        ]
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference(
            setup_family=_FakeSetupFamily(alternate_hypotheses=alternates)
        )
        intel = _FakeLightingIntel()
        ir = ImageRead()
        lr = LightingRead()

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert len(rs.alternate_hypotheses) == 1
        assert rs.alternate_hypotheses[0]["hypothesis"] == "classic_rembrandt"

    def test_bw_setup_note(self):
        cue_report = _make_cue_report(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, confidence=0.9
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()
        ir = ImageRead()
        lr = LightingRead()

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert any("B&W" in n for n in rs.setup_notes)

    def test_gobo_setup_note(self):
        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="geometric_bar",
                line_count=4, confidence=0.7,
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()
        ir = ImageRead()
        lr = LightingRead()

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert any("flag" in n.lower() or "venetian" in n.lower() for n in rs.setup_notes)

    def test_gobo_dark_bg_single_light(self):
        """Gobo/cross image with dark background must show 1 light, not 2.

        Even if upstream background_light_detected fires erroneously,
        the gobo path should trust the background pattern analysis.
        """
        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="patterned_projection",
                line_count=3, confidence=0.8,
            ),
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="hard", confidence=0.8
            ),
            background_illumination=BackgroundIllumination(
                pattern="dark", brightness_relative="darker", confidence=0.9
            ),
        )
        cue_inference = _make_cue_inference()
        # Upstream incorrectly reports background light and 2 lights
        intel = _FakeLightingIntel(
            light_count=2,
            background_light_detected=True,
            background_light_confidence=0.5,
        )
        ir = ImageRead(genre="editorial")
        lr = build_lighting_read(cue_report, cue_inference, intel)

        # Lighting read must correct to 1 light
        assert lr.light_count == 1
        assert "projected" in lr.lighting_family
        assert "single" in lr.lighting_family

        # Recreation setup must also show 1 light with projected/gobo family
        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert rs.light_count == 1
        assert rs.setup_family == "gobo_projection"
        assert "gobo" in rs.modifier_suggestion.lower() or "mask" in rs.modifier_suggestion.lower()

    def test_gobo_with_lit_background_gets_two_lights(self):
        """Gobo image with actually lit background should count 2 lights."""
        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="geometric_bar",
                line_count=3, confidence=0.7,
            ),
            background_illumination=BackgroundIllumination(
                pattern="spot", brightness_relative="brighter", confidence=0.7
            ),
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel(light_count=2, background_light_detected=True)
        lr = build_lighting_read(cue_report, cue_inference, intel)

        assert lr.light_count == 2

    def test_dark_gradient_bg_single_light(self):
        """Background classified as 'gradient' but with BG mean < 30 is
        effectively dark.  Should produce 1 light (not 2) and correct
        background strategy."""
        cue_report = _make_cue_report(
            shadow_interruption_pattern=None,
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.5
            ),
            contrast_ratio=ContrastRatio(label="extreme", confidence=0.8),
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.55,
                notes=["BG mean: 2, std: 17.3"],
            ),
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, is_high_contrast_grade=True,
                estimated_processing="bw", confidence=0.9,
            ),
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel(
            pattern="unknown", light_count=0,
            modifier_family="softbox_rect", modifier_confidence=0.3,
        )

        lr = build_lighting_read(
            cue_report, cue_inference, intel,
            classification={"lightQuality": "hard", "brightness": "low", "mood": "cinematic"},
            vision_data={"region_attribution": {"masks": {"background_ratio": 0.85}}},
        )

        # Should be 1 light, not 2 — background is effectively dark
        assert lr.light_count == 1, f"Expected 1 light, got {lr.light_count}"
        assert "single" in lr.lighting_family

        # Background strategy should say "unlit dark background", not "gradient wash"
        ir = ImageRead(genre="cinematic fine art")
        rs = build_recreation_setup(
            ir, lr, cue_inference, intel,
            classification={"lightQuality": "hard", "brightness": "low", "mood": "cinematic"},
            cue_report=cue_report,
            vision_data={"region_attribution": {"masks": {"background_ratio": 0.85}}},
        )
        assert rs.light_count == 1
        assert "dark" in rs.background_strategy.lower() or "unlit" in rs.background_strategy.lower()
        assert "gradient wash" not in rs.background_strategy.lower()

    def test_dark_gradient_bg_no_false_gradient_device(self):
        """Background classified as 'gradient' with BG mean < 30 should NOT
        produce a 'background gradient' visual device."""
        from engine.reference_read import _collect_visual_devices

        cue_report = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.55,
                notes=["BG mean: 5, std: 10.0"],
            ),
        )
        intel = _FakeLightingIntel(background_light_detected=False)
        devices = _collect_visual_devices(cue_report, intel)
        assert "background gradient" not in devices

    def test_truly_lit_gradient_bg_keeps_device(self):
        """A genuinely lit gradient background (BG mean > 100) should still
        produce the 'background gradient' device."""
        from engine.reference_read import _collect_visual_devices

        cue_report = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.7,
                notes=["BG mean: 120, std: 40.0"],
            ),
        )
        intel = _FakeLightingIntel(background_light_detected=False)
        devices = _collect_visual_devices(cue_report, intel)
        assert "background gradient" in devices

    def test_gobo_setup_family_is_descriptive(self):
        """Gobo setup_family should describe the actual setup, not force a
        database match.  geometric_bar -> slit_flag_projection,
        patterned_projection -> gobo_projection."""
        for sip_class, expected_family in [
            ("geometric_bar", "slit_flag_projection"),
            ("patterned_projection", "gobo_projection"),
        ]:
            cue_report = _make_cue_report(
                shadow_interruption_pattern=ShadowInterruptionPattern(
                    detected=True, classification=sip_class,
                    line_count=3, confidence=0.7,
                ),
            )
            cue_inference = _make_cue_inference()
            intel = _FakeLightingIntel()
            ir = ImageRead(genre="editorial")
            lr = LightingRead(source_quality="hard", fill_presence="none", light_count=1)

            rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
            assert rs.setup_family == expected_family, (
                f"sip_class={sip_class}: expected {expected_family}, got {rs.setup_family}"
            )


# ═══════════════════════════════════════════════════════════════════════════
# 2b. P1 Fix Tests — Narrative, Observations, Direction, Placement, etc.
# ═══════════════════════════════════════════════════════════════════════════


class TestNarrativeQuality:
    """P1a: Narrative should be natural photographer-language prose."""

    def test_narrative_reads_naturally(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification={"mood": "dramatic", "brightness": "dark"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        # Narrative is an "At a Glance" one-liner: genre + mood + framing.
        # Pose, scene, and lighting details live in their respective cards.
        assert len(ir.narrative) > 10
        assert "fine art" in ir.narrative.lower() or "dramatic" in ir.narrative.lower()
        # Should be a single sentence (one period)
        assert ir.narrative.count(".") <= 2

    def test_narrative_is_short_summary(self):
        """Narrative should be a single 'At a Glance' sentence — genre/mood/framing only.

        Pose, scene, lighting, and all detail live in their respective cards.
        """
        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="patterned_projection",
                line_count=5, confidence=0.7,
            )
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification=None,
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        # Narrative should be concise — no more than ~3 sentences
        sentence_count = ir.narrative.count(". ") + ir.narrative.count(".")
        assert sentence_count <= 6  # generous upper bound for 2-3 sentences
        # Shadow pattern details should NOT be in the narrative (they're in cards)
        assert "projected shadow pattern" not in ir.narrative.lower()
        assert "cutting hard lines" not in ir.narrative.lower()

    def test_low_confidence_narrative_stays_concise(self):
        """Low-confidence narrative should remain a short summary.

        The confidence hedge is now pushed to lighting_read.ambiguity_notes
        (rendered in RefLightingCard) rather than embedded in the narrative.
        """
        cue_report = _make_cue_report(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="unknown", confidence=0.1
            ),
            contrast_ratio=ContrastRatio(label="unknown", confidence=0.1),
        )
        cue_inference = _make_cue_inference(
            setup_family=_FakeSetupFamily(primary_confidence=0.1)
        )
        intel = _FakeLightingIntel(pattern_confidence=0.0)

        ir = build_image_read(
            vision_data=None,
            classification=None,
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        # Narrative should still be short even at low confidence
        assert len(ir.narrative) > 10
        # The confidence hedge text should NOT be in the narrative
        assert "confidence in this read is low" not in ir.narrative.lower()


class TestKeyObservationFiltering:
    """P1b + P1h: Contradictory and stale notes should be filtered."""

    def test_multi_light_notes_filtered_when_single_light(self):
        cue_report = _make_cue_report()
        geo = _FakeGeometry(
            notes=["Multi-shadow suggests 2 lights, catchlights show 0 — using higher estimate."]
        )
        cue_inference = _make_cue_inference(geometry=geo)
        # Force dramatic hard light so light_count = 1
        intel = _FakeLightingIntel(light_count=0, modifier_confidence=0.1)

        lr = build_lighting_read(
            cue_report, cue_inference, intel,
            classification={"lightQuality": "hard", "brightness": "low", "mood": "cinematic"},
        )
        assert lr.light_count == 1
        for note in lr.key_observations:
            assert "2 light" not in note.lower()
            assert "multi-shadow" not in note.lower()

    def test_fill_present_notes_filtered_when_no_fill(self):
        cue_report = _make_cue_report()
        sq = _FakeSourceQuality(notes=["Multiple lights detected — fill likely present."])
        cue_inference = _make_cue_inference(source_quality=sq)
        intel = _FakeLightingIntel(light_count=0, modifier_confidence=0.1)

        lr = build_lighting_read(
            cue_report, cue_inference, intel,
            classification={"lightQuality": "hard", "brightness": "low", "mood": "cinematic"},
        )
        assert lr.fill_presence == "none"
        for note in lr.key_observations:
            assert "fill likely" not in note.lower()

    def test_bg_gradient_notes_filtered_when_dark(self):
        """P1h: Background gradient notes filtered when bg is effectively dark."""
        cue_report = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="gradient", brightness_relative="similar",
                confidence=0.55, notes=["BG mean: 2, std: 17.3"],
            ),
        )
        env = _FakeEnvironment(notes=["Background gradient — possibly background light or natural falloff."])
        cue_inference = _make_cue_inference(environment=env)
        intel = _FakeLightingIntel(light_count=0, modifier_confidence=0.1)

        lr = build_lighting_read(
            cue_report, cue_inference, intel,
            classification={"lightQuality": "hard", "brightness": "low", "mood": "cinematic"},
        )
        for note in lr.key_observations:
            assert "background gradient" not in note.lower()


class TestSourceDirectionFallback:
    """P1c: source_direction should have fallbacks beyond geometry."""

    def test_direction_from_geometry(self):
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="upper_left", key_light_height="high")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel()

        lr = build_lighting_read(cue_report, cue_inference, intel)
        # key_light_direction="upper_left" → key IS at camera-left
        assert "camera-left" in lr.source_direction

    def test_direction_fallback_from_lighting_intel(self):
        """When geometry is undetermined, fall back to lighting_intel."""
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="unknown", key_light_height="unknown")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel(
            key_position_text="45 degrees left, high",
            key_side="left",
        )

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert lr.source_direction != "unknown"
        assert "left" in lr.source_direction.lower() or "45" in lr.source_direction

    def test_direction_fallback_from_key_side(self):
        """When key_position_text is empty, fall back to key_side."""
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="unknown", key_light_height="unknown")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel(
            key_position_text="",
            key_side="right",
        )

        lr = build_lighting_read(cue_report, cue_inference, intel)
        assert lr.source_direction != "unknown"
        assert "right" in lr.source_direction.lower()


class TestKeyPlacementFallback:
    """P1d: key_placement should chain fallbacks."""

    def test_placement_from_geometry(self):
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="upper_left", key_light_height="high")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel()
        ir = ImageRead()
        lr = LightingRead(source_direction="camera-right, ~45 degrees, elevated")

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert rs.key_placement  # should not be empty

    def test_placement_fallback_from_lighting_intel(self):
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="unknown", key_light_height="unknown")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel(key_position_text="45 degrees left, high")
        ir = ImageRead()
        lr = LightingRead(source_direction="unknown")

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert rs.key_placement == "45 degrees left, high"

    def test_placement_fallback_from_lighting_read_direction(self):
        cue_report = _make_cue_report()
        geo = _FakeGeometry(key_light_direction="unknown", key_light_height="unknown")
        cue_inference = _make_cue_inference(geometry=geo)
        intel = _FakeLightingIntel(key_position_text="", key_side="")
        ir = ImageRead()
        lr = LightingRead(source_direction="camera-left")

        rs = build_recreation_setup(ir, lr, cue_inference, intel, None, cue_report)
        assert rs.key_placement == "camera-left"


class TestPoseNotesFallback:
    """P1e: pose_notes should derive from upstream when primary source fails."""

    def test_pose_from_vision_data(self):
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data={"pose": {"ok": True, "pose": "three_quarter", "angle": "eye_level"}},
            classification={"mood": "dramatic"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis={"subject": {"framing": "tight close-up"}},
        )
        assert "three quarter" in ir.pose_notes

    def test_pose_fallback_from_subject_data(self):
        """When vision_data.pose is missing, use upstream subject if specific."""
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification={"mood": "dramatic"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis={
                "subject": {
                    "pose": "seated",
                    "angle": "three-quarter left",
                    "framing": "medium shot",
                }
            },
        )
        assert ir.pose_notes  # should not be empty
        assert "seated" in ir.pose_notes.lower() or "three-quarter" in ir.pose_notes.lower()

    def test_standing_not_used_as_fallback(self):
        """Generic 'standing' should be filtered out as unreliable."""
        cue_report = _make_cue_report()
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification={"mood": "dramatic"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis={
                "subject": {
                    "pose": "standing",
                    "angle": "front-ish",
                    "framing": "medium shot",
                }
            },
        )
        # "standing" and "front-ish" should be filtered
        assert "standing" not in ir.pose_notes.lower()


class TestVisualIntentEnriched:
    """P1f: visual_intent should be richer than just the genre."""

    def test_intent_has_chiaroscuro_qualifier(self):
        cue_report = _make_cue_report(
            contrast_ratio=ContrastRatio(label="extreme", confidence=0.8)
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel()

        ir = build_image_read(
            vision_data=None,
            classification={"mood": "dramatic", "brightness": "dark"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        assert "chiaroscuro" in ir.visual_intent.lower()
        assert ir.visual_intent != ir.genre  # should be richer

    def test_bw_intent_has_monochrome(self):
        cue_report = _make_cue_report(
            contrast_ratio=ContrastRatio(label="medium", confidence=0.7),
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, confidence=0.9
            ),
        )
        cue_inference = _make_cue_inference()
        intel = _FakeLightingIntel(pattern="rembrandt")

        ir = build_image_read(
            vision_data=None,
            classification={"mood": "natural", "brightness": "medium"},
            cue_report=cue_report,
            cue_inference=cue_inference,
            lighting_intel=intel,
            image_analysis=None,
        )
        # fine art genre already contains "fine art", so monochrome qualifier
        # should be added if it's a B&W that's NOT "fine art" in genre
        # OR the qualifier check is different — but intent should differ from genre
        assert len(ir.visual_intent) > len(ir.genre)


class TestGoboShapeInDevices:
    """P1g: Gobo devices should describe the shape when possible."""

    def test_patterned_projection_cross(self):
        from engine.reference_read import _collect_visual_devices

        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="patterned_projection",
                line_count=2, confidence=0.7,
            )
        )
        intel = _FakeLightingIntel()
        devices = _collect_visual_devices(cue_report, intel)
        gobo_devices = [d for d in devices if "gobo" in d.lower()]
        assert len(gobo_devices) == 1
        assert "cross" in gobo_devices[0].lower()

    def test_patterned_projection_grid(self):
        from engine.reference_read import _collect_visual_devices

        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="patterned_projection",
                line_count=6, confidence=0.7,
            )
        )
        intel = _FakeLightingIntel()
        devices = _collect_visual_devices(cue_report, intel)
        gobo_devices = [d for d in devices if "gobo" in d.lower()]
        assert len(gobo_devices) == 1
        assert "grid" in gobo_devices[0].lower() or "window" in gobo_devices[0].lower()

    def test_geometric_bar_with_count(self):
        from engine.reference_read import _collect_visual_devices

        cue_report = _make_cue_report(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="geometric_bar",
                line_count=4, confidence=0.7,
            )
        )
        intel = _FakeLightingIntel()
        devices = _collect_visual_devices(cue_report, intel)
        slit_devices = [d for d in devices if "slit" in d.lower() or "flag" in d.lower()]
        assert len(slit_devices) == 1
        assert "4-line" in slit_devices[0].lower()


# ═══════════════════════════════════════════════════════════════════════════
# 3. Orchestrator Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildReferencePhotoAnalysis:

    def test_none_cue_report_returns_not_ok(self):
        result = build_reference_photo_analysis(
            vision_data=None,
            classification=None,
            cue_report=None,
            lighting_intel=None,
            image_analysis=None,
        )
        assert result.ok is False
        assert result.image_read is None

    def test_empty_cue_report_returns_not_ok(self):
        result = build_reference_photo_analysis(
            vision_data=None,
            classification=None,
            cue_report=VisualCueReport(cues_computed=0),
            lighting_intel=None,
            image_analysis=None,
        )
        assert result.ok is False

    def test_full_pipeline(self):
        cue_report = _make_cue_report()
        intel = _FakeLightingIntel()

        result = build_reference_photo_analysis(
            vision_data={"pose": {"ok": True, "pose": "frontal", "angle": "eye_level"}},
            classification={"mood": "dramatic", "brightness": "dark"},
            cue_report=cue_report,
            lighting_intel=intel,
            image_analysis={"subject": {"framing": "medium shot"}},
        )
        assert result.ok is True
        assert result.image_read is not None
        assert result.lighting_read is not None
        assert result.recreation_setup is not None

        # Verify fields are populated
        assert result.image_read.genre != "unknown"
        # Mock has high contrast + dark background → low_key detection
        assert result.lighting_read.shadow_pattern in ("rembrandt", "low_key")
        assert result.recreation_setup.light_count == 1


# ═══════════════════════════════════════════════════════════════════════════
# 4. Integration with build_reference_description
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildReferenceDescriptionIntegration:

    def test_no_cue_report_no_reference_analysis(self):
        from engine.lighting_inference import (
            LightingInference,
            build_reference_description,
        )

        result = build_reference_description(
            vision_data={},
            classification=None,
            image_analysis={},
            inference=LightingInference(),
            cue_report=None,
        )
        assert "catchlights" in result
        assert "lightQuality" in result
        assert "referenceAnalysis" not in result

    def test_with_cue_report_has_reference_analysis(self):
        from engine.lighting_inference import (
            LightingInference,
            build_reference_description,
        )

        cue_report = _make_cue_report()
        result = build_reference_description(
            vision_data={},
            classification={"mood": "dramatic"},
            image_analysis={},
            inference=LightingInference(),
            cue_report=cue_report,
        )
        assert "catchlights" in result
        assert "referenceAnalysis" in result
        ra = result["referenceAnalysis"]
        assert ra["ok"] is True
        assert ra["image_read"] is not None
        assert ra["lighting_read"] is not None
        assert ra["recreation_setup"] is not None
