"""Tests for VLM (Vision-Language Model) integration module.

Tests cover:
1. VLMDescription model construction and validation
2. vlm_available() configuration checks
3. VLM enrichment in build_image_read() — merging pose, expression, styling
4. VLM pipeline wiring — vlm_description flows through build_reference_photo_analysis
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from engine.image_analysis_models import (
    ImageRead,
    ReferencePhotoAnalysis,
    VLMDescription,
    VLMSignals,
    VLMGeometrySignals,
    VLMShadowSignals,
    VLMHighlightSignals,
    VLMCatchlightSignals,
    VLMReconstructionEstimates,
    VisualCueReport,
)


# ─── Model Tests ─────────────────────────────────────────────────────────


class TestVLMDescriptionModel:
    """VLMDescription construction and validation."""

    def test_defaults(self):
        desc = VLMDescription()
        assert desc.ok is True
        assert desc.framing == ""
        assert desc.pose == ""
        assert desc.expression == ""
        assert desc.styling_details == []
        assert desc.notable_features == []
        assert desc.background_context == ""
        assert desc.clothing_accessories == ""
        assert desc.overall_mood == ""
        assert desc.notes == []

    def test_full_construction(self):
        desc = VLMDescription(
            framing="extreme close-up, face only",
            pose="head tilted left, chin down",
            expression="intense, confrontational",
            styling_details=["heavy lashes", "glossy lips"],
            notable_features=["strong jawline"],
            background_context="dark, featureless",
            clothing_accessories="not visible",
            overall_mood="dramatic",
            ok=True,
        )
        assert desc.framing == "extreme close-up, face only"
        assert desc.expression == "intense, confrontational"
        assert len(desc.styling_details) == 2
        assert "heavy lashes" in desc.styling_details

    def test_extra_forbid(self):
        with pytest.raises(Exception):
            VLMDescription(unknown_field="bad")

    def test_failed_state(self):
        desc = VLMDescription(ok=False, notes=["API call failed: timeout"])
        assert desc.ok is False
        assert len(desc.notes) == 1

    def test_serialization(self):
        desc = VLMDescription(
            framing="tight",
            pose="direct gaze",
            expression="calm",
        )
        d = desc.model_dump()
        assert d["framing"] == "tight"
        assert d["ok"] is True
        assert isinstance(d["styling_details"], list)


# ─── Signal Sub-Model Tests ──────────────────────────────────────────────


class TestVLMSignalModels:
    """Test VLM signal sub-models and VLMSignals container."""

    def test_signals_default_none(self):
        """Default VLMDescription has signals=None."""
        desc = VLMDescription()
        assert desc.signals is None

    def test_signals_full_construction(self):
        """Build VLMDescription with all 5 signal sub-models."""
        signals = VLMSignals(
            geometry=VLMGeometrySignals(
                camera_height_relative_to_eyes="at_eye_level",
                camera_horizontal_angle="straight_on",
                head_rotation_deg=15.0,
                torso_rotation_deg=10.0,
                shoulder_line_angle=-5.0,
                subject_lean="toward_camera",
                confidence=0.85,
                notes=["clear frontal pose"],
            ),
            shadows=VLMShadowSignals(
                shadow_vector_deg=45.0,
                shadow_softness=0.6,
                shadow_length_ratio=0.4,
                shadow_visible_on=["nose", "cheek_right", "jaw_right"],
                confidence=0.7,
                notes=["clear nose shadow falling right"],
            ),
            highlights=VLMHighlightSignals(
                highlight_width_ratio=0.6,
                highlight_specularity=0.3,
                highlight_axis_deg=10.0,
                confidence=0.65,
                notes=["broad soft highlight on left side"],
            ),
            catchlights=VLMCatchlightSignals(
                catchlight_count=1,
                catchlight_shape="octagonal",
                catchlight_position="10_oclock",
                catchlight_relative_intensity="bright",
                confidence=0.9,
                notes=["single octagonal catchlight upper left"],
            ),
            reconstruction=VLMReconstructionEstimates(
                key_light_angle_deg=45.0,
                key_light_height="high",
                modifier_size_class="medium",
                fill_present=False,
                negative_fill=True,
                background_light_present=False,
                background_distance_category="moderate",
                confidence=0.6,
                notes=["single hard key from upper left"],
            ),
        )
        desc = VLMDescription(ok=True, signals=signals)
        assert desc.signals is not None
        assert desc.signals.geometry.camera_height_relative_to_eyes == "at_eye_level"
        assert desc.signals.shadows.shadow_vector_deg == 45.0
        assert desc.signals.highlights.highlight_width_ratio == 0.6
        assert desc.signals.catchlights.catchlight_count == 1
        assert desc.signals.reconstruction.key_light_angle_deg == 45.0

    def test_signals_partial(self):
        """Only geometry + shadows, rest None."""
        signals = VLMSignals(
            geometry=VLMGeometrySignals(
                camera_height_relative_to_eyes="above",
                confidence=0.5,
            ),
            shadows=VLMShadowSignals(
                shadow_vector_deg=90.0,
                confidence=0.4,
            ),
        )
        desc = VLMDescription(ok=True, signals=signals)
        assert desc.signals.geometry is not None
        assert desc.signals.shadows is not None
        assert desc.signals.highlights is None
        assert desc.signals.catchlights is None
        assert desc.signals.reconstruction is None

    def test_signals_serialization(self):
        """model_dump() includes nested signal structure."""
        signals = VLMSignals(
            geometry=VLMGeometrySignals(
                camera_height_relative_to_eyes="below",
                head_rotation_deg=-30.0,
                confidence=0.7,
                notes=["looking up at subject"],
            ),
        )
        desc = VLMDescription(ok=True, signals=signals)
        d = desc.model_dump()
        assert d["signals"] is not None
        assert d["signals"]["geometry"]["camera_height_relative_to_eyes"] == "below"
        assert d["signals"]["geometry"]["head_rotation_deg"] == -30.0
        assert d["signals"]["geometry"]["confidence"] == 0.7
        assert d["signals"]["shadows"] is None

    def test_backward_compat(self):
        """Existing field access works unchanged when signals is set."""
        signals = VLMSignals(
            catchlights=VLMCatchlightSignals(
                catchlight_count=2, confidence=0.8,
            ),
        )
        desc = VLMDescription(
            framing="head-and-shoulders",
            pose="3/4 turn right",
            expression="serene",
            lighting_style="rembrandt",
            ok=True,
            signals=signals,
        )
        # Legacy fields still work
        assert desc.framing == "head-and-shoulders"
        assert desc.pose == "3/4 turn right"
        assert desc.lighting_style == "rembrandt"
        # Signals also accessible
        assert desc.signals.catchlights.catchlight_count == 2

    def test_geometry_defaults(self):
        """VLMGeometrySignals defaults are all None/0/[]."""
        g = VLMGeometrySignals()
        assert g.camera_height_relative_to_eyes is None
        assert g.camera_horizontal_angle is None
        assert g.head_rotation_deg is None
        assert g.confidence == 0.0
        assert g.notes == []

    def test_shadow_defaults(self):
        s = VLMShadowSignals()
        assert s.shadow_vector_deg is None
        assert s.shadow_softness is None
        assert s.shadow_visible_on == []
        assert s.confidence == 0.0

    def test_highlight_defaults(self):
        h = VLMHighlightSignals()
        assert h.highlight_width_ratio is None
        assert h.highlight_specularity is None
        assert h.confidence == 0.0

    def test_catchlight_defaults(self):
        c = VLMCatchlightSignals()
        assert c.catchlight_count is None
        assert c.catchlight_shape is None
        assert c.confidence == 0.0

    def test_reconstruction_defaults(self):
        r = VLMReconstructionEstimates()
        assert r.key_light_angle_deg is None
        assert r.fill_present is None
        assert r.negative_fill is None
        assert r.confidence == 0.0

    def test_extra_forbid_on_sub_models(self):
        """Sub-models reject unknown fields (extra='forbid')."""
        with pytest.raises(Exception):
            VLMGeometrySignals(unknown_field="bad")
        with pytest.raises(Exception):
            VLMShadowSignals(mystery="bad")
        with pytest.raises(Exception):
            VLMCatchlightSignals(bogus=42)


# ─── Signal Parsing Tests ───────────────────────────────────────────────


class TestSignalParsing:
    """Test _parse_signals and end-to-end signal parsing in describe_reference_image."""

    def test_parse_with_full_signals(self):
        """Mock VLM response with full signals → all sub-models constructed."""
        mock_response = {
            "subject_type": "woman",
            "subject_count": 1,
            "framing": "tight close-up",
            "pose": "head tilted left",
            "expression": "intense",
            "styling_details": [],
            "notable_features": [],
            "background_context": "dark",
            "clothing_accessories": "",
            "overall_mood": "dramatic",
            "lighting_style": "rembrandt",
            "likely_photographer": "unknown",
            "derivation": {},
            "signals": {
                "geometry": {
                    "camera_height_relative_to_eyes": "at_eye_level",
                    "camera_horizontal_angle": "slight_left",
                    "head_rotation_deg": 20.0,
                    "confidence": 0.8,
                    "notes": ["clear view"],
                },
                "shadows": {
                    "shadow_vector_deg": 315.0,
                    "shadow_softness": 0.3,
                    "shadow_length_ratio": 0.7,
                    "shadow_visible_on": ["nose", "cheek_right"],
                    "confidence": 0.75,
                    "notes": ["hard nose shadow"],
                },
                "highlights": {
                    "highlight_width_ratio": 0.55,
                    "highlight_specularity": 0.2,
                    "highlight_axis_deg": 5.0,
                    "confidence": 0.6,
                    "notes": ["broad highlight"],
                },
                "catchlights": {
                    "catchlight_count": 1,
                    "catchlight_shape": "octagonal",
                    "catchlight_position": "10_oclock",
                    "catchlight_relative_intensity": "bright",
                    "confidence": 0.9,
                    "notes": ["single bright catchlight"],
                },
                "reconstruction": {
                    "key_light_angle_deg": 45.0,
                    "key_light_height": "high",
                    "modifier_size_class": "medium",
                    "fill_present": False,
                    "negative_fill": True,
                    "background_light_present": False,
                    "background_distance_category": "moderate",
                    "confidence": 0.65,
                    "notes": ["single key estimate"],
                },
            },
        }
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            with patch.object(vlm_module, "_call_openai", return_value=mock_response):
                result = vlm_module.describe_reference_image(__file__)
                assert result is not None
                assert result.ok is True
                # Legacy fields preserved
                assert result.framing == "tight close-up"
                assert result.lighting_style == "rembrandt"
                # Signals parsed
                assert result.signals is not None
                assert result.signals.geometry.head_rotation_deg == 20.0
                assert result.signals.shadows.shadow_vector_deg == 315.0
                assert result.signals.highlights.highlight_width_ratio == 0.55
                assert result.signals.catchlights.catchlight_count == 1
                assert result.signals.reconstruction.key_light_angle_deg == 45.0

    def test_parse_without_signals(self):
        """Mock response without signals key → signals=None."""
        mock_response = {
            "subject_type": "man",
            "subject_count": 1,
            "framing": "full body",
            "pose": "standing",
            "expression": "neutral",
            "styling_details": [],
            "notable_features": [],
            "background_context": "studio",
            "clothing_accessories": "suit",
            "overall_mood": "corporate",
            "lighting_style": "flat/beauty",
            "likely_photographer": "unknown",
            "derivation": {},
        }
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            with patch.object(vlm_module, "_call_openai", return_value=mock_response):
                result = vlm_module.describe_reference_image(__file__)
                assert result is not None
                assert result.ok is True
                assert result.signals is None

    def test_parse_partial_signals(self):
        """Mock with only geometry → others None."""
        mock_response = {
            "framing": "close-up",
            "pose": "",
            "expression": "",
            "styling_details": [],
            "notable_features": [],
            "background_context": "",
            "clothing_accessories": "",
            "overall_mood": "",
            "lighting_style": "loop",
            "likely_photographer": "unknown",
            "derivation": {},
            "signals": {
                "geometry": {
                    "camera_height_relative_to_eyes": "above",
                    "confidence": 0.5,
                    "notes": ["slight downward angle"],
                },
            },
        }
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            with patch.object(vlm_module, "_call_openai", return_value=mock_response):
                result = vlm_module.describe_reference_image(__file__)
                assert result is not None
                assert result.signals is not None
                assert result.signals.geometry is not None
                assert result.signals.geometry.camera_height_relative_to_eyes == "above"
                assert result.signals.shadows is None
                assert result.signals.highlights is None
                assert result.signals.catchlights is None
                assert result.signals.reconstruction is None

    def test_parse_malformed_signal(self):
        """Invalid data in one sub-model → that model None, others OK."""
        mock_response = {
            "framing": "close-up",
            "pose": "",
            "expression": "",
            "styling_details": [],
            "notable_features": [],
            "background_context": "",
            "clothing_accessories": "",
            "overall_mood": "",
            "lighting_style": "split",
            "likely_photographer": "unknown",
            "derivation": {},
            "signals": {
                "geometry": {
                    "camera_height_relative_to_eyes": "at_eye_level",
                    "confidence": 0.8,
                    "notes": [],
                },
                "shadows": {
                    "bad_field_that_doesnt_exist": True,
                    "confidence": 0.5,
                },
                "catchlights": {
                    "catchlight_count": 2,
                    "catchlight_shape": "round",
                    "confidence": 0.7,
                    "notes": ["two round catchlights"],
                },
            },
        }
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            with patch.object(vlm_module, "_call_openai", return_value=mock_response):
                result = vlm_module.describe_reference_image(__file__)
                assert result is not None
                assert result.ok is True
                assert result.signals is not None
                # Geometry should be fine
                assert result.signals.geometry is not None
                assert result.signals.geometry.camera_height_relative_to_eyes == "at_eye_level"
                # Shadows has invalid field → None (extra=forbid rejects it)
                assert result.signals.shadows is None
                # Catchlights should be fine
                assert result.signals.catchlights is not None
                assert result.signals.catchlights.catchlight_count == 2

    def test_parse_signals_direct(self):
        """Test _parse_signals helper directly."""
        import engine.vlm as vlm_module
        import importlib
        # Force reload to ensure we have latest code
        with patch.dict(os.environ, {"VLM_PROVIDER": "none"}):
            importlib.reload(vlm_module)

        # Empty dict → None
        assert vlm_module._parse_signals({}) is None
        assert vlm_module._parse_signals(None) is None

        # Valid partial
        result = vlm_module._parse_signals({
            "geometry": {
                "camera_height_relative_to_eyes": "below",
                "confidence": 0.6,
            },
        })
        assert result is not None
        assert result.geometry.camera_height_relative_to_eyes == "below"
        assert result.shadows is None

        # All invalid → None
        result = vlm_module._parse_signals({
            "geometry": {"totally_invalid": True},
            "shadows": {"also_invalid": "yes"},
        })
        assert result is None


# ─── vlm_available Tests ─────────────────────────────────────────────────


class TestVLMAvailable:
    """Test vlm_available() configuration detection."""

    def test_available_with_key(self):
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            # Need to reimport to pick up env changes
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            assert vlm_module.vlm_available() is True

    def test_unavailable_without_key(self):
        env = {"VLM_PROVIDER": "openai"}
        # Remove OPENAI_API_KEY if present
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("OPENAI_API_KEY", None)
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            assert vlm_module.vlm_available() is False

    def test_disabled_provider(self):
        with patch.dict(os.environ, {"VLM_PROVIDER": "none"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            assert vlm_module.vlm_available() is False


# ─── VLM Enrichment in build_image_read Tests ────────────────────────────


def _make_cue_report(**overrides):
    """Build a minimal VisualCueReport for testing."""
    from engine.image_analysis_models import (
        ContrastRatio,
        ShadowEdgeHardness,
        BackgroundIllumination,
        SubjectBackgroundSeparation,
        SpecularHighlightBehavior,
        TonalProcessingEstimation,
    )
    defaults = dict(
        ok=True,
        cues_computed=6,
        contrast_ratio=ContrastRatio(label="high", confidence=0.8),
        shadow_edge_hardness=ShadowEdgeHardness(
            classification="hard", confidence=0.85,
        ),
        background_illumination=BackgroundIllumination(
            pattern="dark", brightness_relative="darker", confidence=0.9,
        ),
        subject_background_separation=SubjectBackgroundSeparation(
            luminance_delta=0.7, confidence=0.6,
        ),
        specular_highlight_behavior=SpecularHighlightBehavior(
            intensity="moderate", spread="tight", confidence=0.5,
        ),
        tonal_processing_estimation=TonalProcessingEstimation(
            is_bw=True, estimated_processing="bw", confidence=0.9,
        ),
    )
    defaults.update(overrides)
    return VisualCueReport(**defaults)


def _make_cue_inference():
    """Build a minimal cue_inference dict for testing."""
    from dataclasses import dataclass, field as dc_field

    @dataclass
    class FakeStage:
        key_light_direction: str = "upper_left"
        key_light_height: str = "high"
        has_fill: bool = False
        key_modifier_family: str = "hard_source"
        environment_type: str = "studio"
        special_cases: list = dc_field(default_factory=list)
        primary_hypothesis: str = "dramatic_chiaroscuro"
        primary_confidence: float = 0.75
        alternate_hypotheses: list = dc_field(default_factory=list)
        ambiguity_notes: list = dc_field(default_factory=list)

    stage = FakeStage()
    return {
        "geometry": stage,
        "source_quality": stage,
        "environment": stage,
        "setup_family": stage,
    }


def _make_lighting_intel():
    """Build a minimal lighting intel mock."""
    from dataclasses import dataclass

    @dataclass
    class FakeLighting:
        pattern: str = "rembrandt"
        pattern_confidence: float = 0.7
        modifier_family: str = "hard_source"
        light_count: int = 1
        background_light_detected: bool = False
        background_light_confidence: float = 0.0

    return FakeLighting()


class TestVLMEnrichment:
    """Test VLM data merging in build_image_read()."""

    def _build_with_vlm(self, vlm_desc):
        from engine.reference_read import build_image_read
        return build_image_read(
            vision_data={"pose": {"ok": False}},
            classification={"mood": "cinematic", "brightness": "low"},
            cue_report=_make_cue_report(),
            cue_inference=_make_cue_inference(),
            lighting_intel=_make_lighting_intel(),
            image_analysis={"subject": {"framing": "close-up", "pose": "unknown", "angle": "unknown"}},
            vlm_description=vlm_desc,
        )

    def test_vlm_enriches_empty_pose(self):
        """When CV pose is empty, VLM pose is used."""
        vlm = VLMDescription(
            ok=True,
            pose="head tilted left, chin down, direct gaze",
            expression="intense, brooding",
        )
        result = self._build_with_vlm(vlm)
        assert "head tilted left" in result.pose_notes
        assert "intense, brooding" in result.pose_notes

    def test_vlm_expression_appended(self):
        """VLM expression is appended to existing pose text."""
        vlm = VLMDescription(
            ok=True,
            pose="",
            expression="serene, contemplative",
        )
        result = self._build_with_vlm(vlm)
        # Expression should appear in pose_notes
        assert "serene, contemplative" in result.pose_notes

    def test_vlm_styling_details_added_to_devices(self):
        """VLM styling details are added to notable_visual_devices.

        Photographic technique descriptors pass through; makeup/cosmetic/skin
        descriptors (eyeliner, lash, dewy skin, etc.) are filtered because
        they describe the *subject*, not photographer technique.
        """
        vlm = VLMDescription(
            ok=True,
            styling_details=["heavy dramatic lashes", "glossy lips", "large hat", "dewy skin"],
        )
        result = self._build_with_vlm(vlm)
        devices_text = " ".join(result.notable_visual_devices)
        # Photographic devices pass through
        assert "large hat" in devices_text
        assert "glossy lips" in devices_text
        # Makeup/cosmetic descriptors are filtered
        assert "heavy dramatic lashes" not in devices_text
        assert "dewy skin" not in devices_text

    def test_vlm_none_no_effect(self):
        """When vlm_description is None, output is unchanged."""
        without = self._build_with_vlm(None)
        # Should still produce valid ImageRead
        assert isinstance(without, ImageRead)
        assert without.genre != ""

    def test_vlm_failed_no_effect(self):
        """When VLM failed (ok=False), output is unchanged."""
        vlm = VLMDescription(ok=False, notes=["API error"])
        result = self._build_with_vlm(vlm)
        assert isinstance(result, ImageRead)
        # Styling details from failed VLM should NOT appear
        assert len(result.notable_visual_devices) <= 3  # only CV-derived

    def test_vlm_no_duplicate_expression(self):
        """VLM expression is NOT duplicated if already in pose_text."""
        vlm = VLMDescription(
            ok=True,
            pose="direct gaze to camera",
            expression="direct gaze to camera",  # same as pose
        )
        result = self._build_with_vlm(vlm)
        # "direct gaze to camera" should appear only once
        count = result.pose_notes.lower().count("direct gaze to camera")
        assert count <= 1


# ─── Pipeline Wiring Tests ───────────────────────────────────────────────


class TestVLMPipelineWiring:
    """Test that vlm_description flows through build_reference_photo_analysis."""

    def test_vlm_flows_to_image_read(self):
        vlm = VLMDescription(
            ok=True,
            pose="head turned 3/4 right",
            expression="mysterious",
            styling_details=["smoky eye makeup"],
        )
        from engine.reference_read import build_reference_photo_analysis
        result = build_reference_photo_analysis(
            vision_data={"pose": {"ok": False}},
            classification={"mood": "cinematic", "brightness": "low"},
            cue_report=_make_cue_report(),
            lighting_intel=_make_lighting_intel(),
            image_analysis={"subject": {"framing": "close-up", "pose": "unknown", "angle": "unknown"}},
            vlm_description=vlm,
        )
        assert result.ok is True
        assert result.image_read is not None
        # VLM data should be in image_read
        assert "mysterious" in result.image_read.pose_notes
        # VLM description should be stored on the analysis
        assert result.vlm_description is not None
        assert result.vlm_description.ok is True

    def test_vlm_none_still_works(self):
        """Pipeline works fine without VLM."""
        from engine.reference_read import build_reference_photo_analysis
        result = build_reference_photo_analysis(
            vision_data={"pose": {"ok": False}},
            classification={"mood": "cinematic", "brightness": "low"},
            cue_report=_make_cue_report(),
            lighting_intel=_make_lighting_intel(),
            image_analysis={"subject": {"framing": "close-up", "pose": "unknown", "angle": "unknown"}},
            vlm_description=None,
        )
        assert result.ok is True
        assert result.vlm_description is None
        assert result.image_read is not None


# ─── describe_reference_image Tests ──────────────────────────────────────


class TestDescribeReferenceImage:
    """Test the public describe_reference_image function."""

    def test_returns_none_when_unavailable(self):
        """Returns None when VLM is not configured."""
        with patch.dict(os.environ, {"VLM_PROVIDER": "none"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            result = vlm_module.describe_reference_image("/fake/path.jpg")
            assert result is None

    def test_returns_none_for_missing_file(self):
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            result = vlm_module.describe_reference_image("/nonexistent/path.jpg")
            assert result is None

    @patch("engine.vlm._call_openai")
    def test_successful_call(self, mock_openai):
        mock_openai.return_value = {
            "framing": "tight close-up",
            "pose": "head tilted left",
            "expression": "intense",
            "styling_details": ["bold lashes"],
            "notable_features": ["sharp jawline"],
            "background_context": "dark",
            "clothing_accessories": "not visible",
            "overall_mood": "dramatic",
        }
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            # Need to re-patch after reload
            with patch.object(vlm_module, "_call_openai", mock_openai):
                result = vlm_module.describe_reference_image(__file__)  # use this test file as path
                assert result is not None
                assert result.ok is True
                assert result.framing == "tight close-up"
                assert result.expression == "intense"
                assert "bold lashes" in result.styling_details

    @patch("engine.vlm._call_openai")
    def test_api_failure_returns_failed_desc(self, mock_openai):
        mock_openai.side_effect = RuntimeError("API down")
        with patch.dict(os.environ, {"VLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            import engine.vlm as vlm_module
            import importlib
            importlib.reload(vlm_module)
            with patch.object(vlm_module, "_call_openai", mock_openai):
                result = vlm_module.describe_reference_image(__file__)
                assert result is not None
                assert result.ok is False
                assert len(result.notes) > 0
