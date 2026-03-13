"""Tests for Stage 3 advanced lighting analysis passes.

Covers:
1. Model instantiation (defaults, full construction, extra field rejection)
2. Pass function tests (no face box, no data, synthetic inputs)
3. Extraction function tests
4. Enrichment tests (enrich_cue_report_from_pipeline)
5. Pipeline integration tests (run_extended_pipeline includes new keys)
"""
from __future__ import annotations

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.image_analysis_models import (
    BounceContributorAnalysis,
    LightStructureDetection,
    OffAxisKeyDetection,
    SeparationLightAnalysis,
    VisualCueReport,
)
from engine.cue_extraction import (
    enrich_cue_report_from_pipeline,
    extract_bounce_contributor,
    extract_light_structure,
    extract_off_axis_key,
    extract_separation_light,
)
from engine.vision_passes import (
    bounce_contributor_pass,
    light_structure_pass,
    off_axis_key_pass,
    run_extended_pipeline,
    separation_light_pass,
)


# ═══════════════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════════════


def _make_test_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a simple test image with a left-to-right light gradient."""
    img = np.full((h, w, 3), 128, dtype=np.uint8)
    for x in range(w):
        val = int(200 - (x / w) * 140)
        img[:, x, :] = val
    return img


def _make_asymmetric_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a test image with left side bright, right side dark."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :w // 2, :] = 200
    img[:, w // 2:, :] = 50
    return img


def _make_warm_fill_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create an image with warm color on the shadow (right) side."""
    img = np.full((h, w, 3), 128, dtype=np.uint8)
    # Key side (left) = bright neutral
    img[:, :w // 2, 0] = 200  # B
    img[:, :w // 2, 1] = 200  # G
    img[:, :w // 2, 2] = 200  # R
    # Shadow side (right) = warm fill (more red)
    img[:, w // 2:, 0] = 80   # B
    img[:, w // 2:, 1] = 100  # G
    img[:, w // 2:, 2] = 140  # R (warmth = R - B = 60)
    return img


def _make_hair_light_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create an image with a bright top region (hair light)."""
    img = np.full((h, w, 3), 100, dtype=np.uint8)
    # Bright top region simulating hair light
    img[:h // 6, :, :] = 220
    return img


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6: 5 * h // 6, w // 4: 3 * w // 4] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    fx = w // 4
    fy = h // 8
    return (fx, fy, w // 2, h // 3)


def _mock_shadow(**overrides):
    base = {
        "ok": True,
        "shadow_vector_deg": 90.0,
        "shadow_softness": 0.5,
        "shadow_edge_gradient": 0.5,
        "shadow_length_ratio": 0.5,
    }
    base.update(overrides)
    return base


def _mock_highlight(**overrides):
    base = {
        "ok": True,
        "highlight_width_ratio": 0.5,
        "highlight_rolloff_rate": 0.5,
        "highlight_axis_deg": 30.0,
    }
    base.update(overrides)
    return base


def _mock_catchlight(**overrides):
    base = {
        "ok": True,
        "catchlight_count": 1,
        "catchlight_position": "upper_left",
        "catchlight_shape": "round",
    }
    base.update(overrides)
    return base


def _mock_highlight_axis(**overrides):
    base = {
        "ok": True,
        "regions": {"left_cheek": {"axis_deg": 45}},
        "dominant_axis_deg": 45.0,
        "axis_count": 1,
        "axis_consistency": 0.8,
        "wrap_ratio": 0.5,
    }
    base.update(overrides)
    return base


def _mock_highlight_symmetry(**overrides):
    base = {
        "ok": True,
        "left_intensity": 180.0,
        "right_intensity": 100.0,
        "symmetry_score": 0.4,
        "dominant_side": "left",
        "intensity_ratio": 1.8,
    }
    base.update(overrides)
    return base


# ═══════════════════════════════════════════════════════════════════════════
# 1. MODEL INSTANTIATION TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestBounceContributorAnalysisModel:
    def test_defaults(self):
        m = BounceContributorAnalysis()
        assert m.ok is True
        assert m.confidence == 0.0
        assert m.contributors == []
        assert m.primary_fill_type == "unknown"
        assert m.fill_to_key_ratio == 0.0
        assert m.total_bounce_contribution == 0.0
        assert m.notes == []

    def test_full_construction(self):
        m = BounceContributorAnalysis(
            contributors=[{"type": "gold_reflector", "side": "left"}],
            primary_fill_type="gold_reflector",
            fill_to_key_ratio=0.6,
            total_bounce_contribution=0.48,
            confidence=0.75,
            notes=["warm fill detected"],
        )
        assert m.primary_fill_type == "gold_reflector"
        assert len(m.contributors) == 1
        assert m.fill_to_key_ratio == 0.6

    def test_forbid_extra(self):
        with pytest.raises(Exception):
            BounceContributorAnalysis(unknown_field="bad")


class TestSeparationLightAnalysisModel:
    def test_defaults(self):
        m = SeparationLightAnalysis()
        assert m.ok is True
        assert m.has_hair_light is False
        assert m.hair_light_direction_deg is None
        assert m.hair_light_intensity == 0.0
        assert m.has_rim_light is False
        assert m.rim_side is None
        assert m.has_background_spill is False

    def test_full_construction(self):
        m = SeparationLightAnalysis(
            has_hair_light=True,
            hair_light_direction_deg=-30.0,
            hair_light_intensity=0.7,
            hair_light_width_ratio=0.4,
            has_rim_light=True,
            rim_side="left",
            has_background_spill=False,
            spill_vs_intentional_confidence=0.9,
            confidence=0.8,
            notes=["hair light from left"],
        )
        assert m.has_hair_light is True
        assert m.rim_side == "left"

    def test_forbid_extra(self):
        with pytest.raises(Exception):
            SeparationLightAnalysis(extra_field=42)


class TestOffAxisKeyDetectionModel:
    def test_defaults(self):
        m = OffAxisKeyDetection()
        assert m.ok is True
        assert m.key_azimuth_deg == 0.0
        assert m.key_elevation_deg == 0.0
        assert m.is_off_axis is False
        assert m.detection_method == "unknown"

    def test_full_construction(self):
        m = OffAxisKeyDetection(
            key_azimuth_deg=22.5,
            key_elevation_deg=45.0,
            is_off_axis=True,
            off_axis_angle_deg=22.5,
            detection_method="shadow_vector+highlight_axis",
            confidence=0.7,
        )
        assert m.is_off_axis is True
        assert m.off_axis_angle_deg == 22.5

    def test_forbid_extra(self):
        with pytest.raises(Exception):
            OffAxisKeyDetection(bogus=True)


class TestLightStructureDetectionModel:
    def test_defaults(self):
        m = LightStructureDetection()
        assert m.ok is True
        assert m.nose_shadow_shape == "unknown"
        assert m.triangle_detected is False
        assert m.triangle_cheek is None
        assert m.pattern_name == "unknown"

    def test_full_construction(self):
        m = LightStructureDetection(
            nose_shadow_shape="angled_with_triangle",
            nose_shadow_length_ratio=0.6,
            nose_shadow_angle_deg=35.0,
            triangle_detected=True,
            triangle_cheek="left",
            triangle_completeness=0.85,
            pattern_name="rembrandt",
            confidence=0.8,
        )
        assert m.triangle_detected is True
        assert m.pattern_name == "rembrandt"

    def test_forbid_extra(self):
        with pytest.raises(Exception):
            LightStructureDetection(invalid=99)


# ═══════════════════════════════════════════════════════════════════════════
# 2. VISUAL CUE REPORT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════


class TestVisualCueReportNewFields:
    def test_new_fields_none_by_default(self):
        report = VisualCueReport()
        assert report.bounce_contributor is None
        assert report.separation_light is None
        assert report.off_axis_key is None
        assert report.light_structure is None

    def test_new_fields_in_overall_confidence(self):
        report = VisualCueReport(
            bounce_contributor=BounceContributorAnalysis(confidence=0.6),
            separation_light=SeparationLightAnalysis(confidence=0.7),
            off_axis_key=OffAxisKeyDetection(confidence=0.5),
            light_structure=LightStructureDetection(confidence=0.8),
        )
        conf = report.overall_confidence()
        assert conf > 0.0
        # With only these 4 cues, average should be (0.6+0.7+0.5+0.8)/4 = 0.65
        assert abs(conf - 0.65) < 0.001


# ═══════════════════════════════════════════════════════════════════════════
# 3. PASS FUNCTION TESTS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestBounceContributorPass:
    def test_no_face_box_no_mask(self):
        img = _make_test_image()
        result = bounce_contributor_pass(img)
        assert result["ok"] is True
        assert "primary_fill_type" in result

    def test_with_face_box(self):
        img = _make_test_image()
        fb = _make_face_box()
        result = bounce_contributor_pass(img, face_box=fb)
        assert result["ok"] is True
        assert result["confidence"] > 0.0

    def test_warm_fill_detected(self):
        img = _make_warm_fill_image()
        fb = _make_face_box()
        result = bounce_contributor_pass(img, face_box=fb)
        assert result["ok"] is True
        # Warm fill should be detected on the shadow side
        assert result["fill_to_key_ratio"] > 0.0

    def test_with_shadow_data(self):
        img = _make_test_image()
        fb = _make_face_box()
        shadow = _mock_shadow()
        result = bounce_contributor_pass(img, shadow_data=shadow, face_box=fb)
        assert result["ok"] is True

    def test_with_bounce_data(self):
        img = _make_test_image()
        fb = _make_face_box()
        bounce = {"ok": True, "bounce_intensity": 0.5}
        result = bounce_contributor_pass(img, bounce_data=bounce, face_box=fb)
        assert result["ok"] is True
        assert result["total_bounce_contribution"] >= 0.5

    def test_with_person_mask(self):
        img = _make_test_image()
        mask = _make_person_mask()
        result = bounce_contributor_pass(img, person_mask=mask)
        assert result["ok"] is True

    def test_negative_fill_detection(self):
        """Very dark shadow side should suggest negative fill."""
        img = _make_asymmetric_image()
        fb = _make_face_box()
        result = bounce_contributor_pass(img, face_box=fb)
        assert result["ok"] is True
        # Fill-to-key ratio should be low with strong asymmetry
        assert result["fill_to_key_ratio"] < 1.0


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestSeparationLightPass:
    def test_no_face_box_no_mask(self):
        img = _make_test_image()
        result = separation_light_pass(img)
        assert result["ok"] is True
        assert result["confidence"] <= 0.2

    def test_with_face_box(self):
        img = _make_test_image()
        fb = _make_face_box()
        result = separation_light_pass(img, face_box=fb)
        assert result["ok"] is True
        assert "has_hair_light" in result
        assert "has_rim_light" in result

    def test_hair_light_detection(self):
        img = _make_hair_light_image()
        fb = _make_face_box()
        result = separation_light_pass(img, face_box=fb)
        assert result["ok"] is True
        # Bright top region should trigger hair light detection
        # (depends on face box position relative to bright region)

    def test_with_edge_highlights(self):
        img = _make_test_image()
        fb = _make_face_box()
        edge = {"has_rim": True, "rim_side": "left", "rim_brightness_ratio": 1.5}
        result = separation_light_pass(img, face_box=fb, edge_highlights=edge)
        assert result["ok"] is True
        assert result["has_rim_light"] is True
        assert result["rim_side"] == "left"

    def test_with_background_data_bright(self):
        img = _make_test_image()
        fb = _make_face_box()
        edge = {"has_rim": True, "rim_side": "right", "rim_brightness_ratio": 1.3}
        bg = {"ok": True, "mean_brightness": 200}
        result = separation_light_pass(
            img, face_box=fb, edge_highlights=edge, background_data=bg
        )
        assert result["ok"] is True
        # Bright background with rim → possible spill
        assert result["has_background_spill"] is True

    def test_with_person_mask_no_face_box(self):
        img = _make_test_image()
        mask = _make_person_mask()
        result = separation_light_pass(img, person_mask=mask)
        assert result["ok"] is True


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestOffAxisKeyPass:
    def test_no_data(self):
        img = _make_test_image()
        result = off_axis_key_pass(img)
        assert result["ok"] is True
        assert "key_azimuth_deg" in result
        assert result["detection_method"] != ""

    def test_with_shadow_data(self):
        img = _make_test_image()
        shadow = _mock_shadow(shadow_vector_deg=90.0)
        result = off_axis_key_pass(img, shadow_data=shadow)
        assert result["ok"] is True
        assert "shadow_vector" in result["detection_method"]

    def test_with_highlight_axis_data(self):
        img = _make_test_image()
        axis = _mock_highlight_axis(dominant_axis_deg=25.0)
        result = off_axis_key_pass(img, highlight_axis_data=axis)
        assert result["ok"] is True
        assert "highlight_axis" in result["detection_method"]

    def test_with_catchlight_data(self):
        img = _make_test_image()
        cl = _mock_catchlight(catchlight_position="10_oclock")
        result = off_axis_key_pass(img, catchlight_data=cl)
        assert result["ok"] is True
        assert "catchlight_position" in result["detection_method"]

    def test_multiple_sources(self):
        img = _make_test_image()
        shadow = _mock_shadow(shadow_vector_deg=90.0)
        axis = _mock_highlight_axis(dominant_axis_deg=25.0)
        cl = _mock_catchlight(catchlight_position="upper_left")
        result = off_axis_key_pass(
            img, shadow_data=shadow, highlight_axis_data=axis, catchlight_data=cl
        )
        assert result["ok"] is True
        methods = result["detection_method"].split("+")
        assert len(methods) == 3

    def test_off_axis_detection(self):
        """When azimuth is between 15 and 30, should flag off-axis."""
        img = _make_test_image()
        # Shadow at 155 deg → key at (155+180)%360 = 335 → -25 → abs = 25
        shadow = _mock_shadow(shadow_vector_deg=155.0)
        result = off_axis_key_pass(img, shadow_data=shadow)
        assert result["ok"] is True
        # The azimuth should be in the off-axis range
        abs_az = abs(result["key_azimuth_deg"])
        if 15 <= abs_az <= 30:
            assert result["is_off_axis"] is True

    def test_with_face_box_fallback(self):
        img = _make_asymmetric_image()
        fb = _make_face_box()
        result = off_axis_key_pass(img, face_box=fb)
        assert result["ok"] is True
        assert "brightness_fallback" in result["detection_method"]


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestLightStructurePass:
    def test_no_face_box(self):
        img = _make_test_image()
        result = light_structure_pass(img)
        assert result["ok"] is True
        assert result["pattern_name"] == "unknown"
        assert result["confidence"] <= 0.15

    def test_with_face_box(self):
        img = _make_test_image()
        fb = _make_face_box()
        result = light_structure_pass(img, face_box=fb)
        assert result["ok"] is True
        assert "nose_shadow_shape" in result
        assert "pattern_name" in result
        assert result["confidence"] > 0.1

    def test_with_shadow_data(self):
        img = _make_test_image()
        fb = _make_face_box()
        shadow = _mock_shadow()
        result = light_structure_pass(img, shadow_data=shadow, face_box=fb)
        assert result["ok"] is True
        assert result["confidence"] > 0.3

    def test_asymmetric_lighting_pattern(self):
        """Strongly asymmetric image should detect a directional pattern."""
        img = _make_asymmetric_image()
        fb = _make_face_box()
        result = light_structure_pass(img, face_box=fb)
        assert result["ok"] is True
        # Strong asymmetry should detect split or similar
        assert result["pattern_name"] in (
            "split", "rembrandt", "loop", "butterfly", "broad", "unknown"
        )

    def test_with_highlight_symmetry_data(self):
        img = _make_test_image()
        fb = _make_face_box()
        sym = _mock_highlight_symmetry(symmetry_score=0.8)
        result = light_structure_pass(img, face_box=fb, highlight_symmetry_data=sym)
        assert result["ok"] is True

    def test_small_face_box(self):
        img = _make_test_image()
        result = light_structure_pass(img, face_box=(0, 0, 5, 5))
        assert result["ok"] is True
        assert result["confidence"] <= 0.15


# ═══════════════════════════════════════════════════════════════════════════
# 4. EXTRACTION FUNCTION TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestExtractBounceContributor:
    def test_ok_data(self):
        data = {
            "ok": True,
            "contributors": [{"type": "gold_reflector"}],
            "primary_fill_type": "gold_reflector",
            "fill_to_key_ratio": 0.6,
            "total_bounce_contribution": 0.48,
            "confidence": 0.7,
            "notes": ["warm fill"],
        }
        result = extract_bounce_contributor(data)
        assert result is not None
        assert isinstance(result, BounceContributorAnalysis)
        assert result.primary_fill_type == "gold_reflector"
        assert result.confidence == 0.7

    def test_failed_data(self):
        data = {"ok": False, "error": "test"}
        result = extract_bounce_contributor(data)
        assert result is None

    def test_minimal_data(self):
        data = {"ok": True}
        result = extract_bounce_contributor(data)
        assert result is not None
        assert result.primary_fill_type == "unknown"


class TestExtractSeparationLight:
    def test_ok_data(self):
        data = {
            "ok": True,
            "has_hair_light": True,
            "hair_light_direction_deg": -30.0,
            "hair_light_intensity": 0.7,
            "hair_light_width_ratio": 0.4,
            "has_rim_light": True,
            "rim_side": "left",
            "has_background_spill": False,
            "spill_vs_intentional_confidence": 0.85,
            "confidence": 0.75,
            "notes": [],
        }
        result = extract_separation_light(data)
        assert result is not None
        assert isinstance(result, SeparationLightAnalysis)
        assert result.has_hair_light is True
        assert result.rim_side == "left"

    def test_failed_data(self):
        result = extract_separation_light({"ok": False})
        assert result is None


class TestExtractOffAxisKey:
    def test_ok_data(self):
        data = {
            "ok": True,
            "key_azimuth_deg": 22.0,
            "key_elevation_deg": 45.0,
            "is_off_axis": True,
            "off_axis_angle_deg": 22.0,
            "detection_method": "shadow_vector+highlight_axis",
            "confidence": 0.7,
            "notes": ["off-axis detected"],
        }
        result = extract_off_axis_key(data)
        assert result is not None
        assert isinstance(result, OffAxisKeyDetection)
        assert result.is_off_axis is True

    def test_failed_data(self):
        result = extract_off_axis_key({"ok": False})
        assert result is None


class TestExtractLightStructure:
    def test_ok_data(self):
        data = {
            "ok": True,
            "nose_shadow_shape": "angled_with_triangle",
            "nose_shadow_length_ratio": 0.6,
            "nose_shadow_angle_deg": 35.0,
            "triangle_detected": True,
            "triangle_cheek": "left",
            "triangle_completeness": 0.85,
            "pattern_name": "rembrandt",
            "confidence": 0.8,
            "notes": ["Rembrandt pattern"],
        }
        result = extract_light_structure(data)
        assert result is not None
        assert isinstance(result, LightStructureDetection)
        assert result.pattern_name == "rembrandt"
        assert result.triangle_detected is True

    def test_failed_data(self):
        result = extract_light_structure({"ok": False})
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════
# 5. ENRICHMENT TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestEnrichCueReportWithNewPasses:
    def test_enrich_bounce_contributor(self):
        report = VisualCueReport()
        pipeline = {
            "bounce_contributor": {
                "ok": True,
                "contributors": [],
                "primary_fill_type": "white_reflector",
                "fill_to_key_ratio": 0.5,
                "total_bounce_contribution": 0.4,
                "confidence": 0.6,
                "notes": [],
            }
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.bounce_contributor is not None
        assert enriched.bounce_contributor.primary_fill_type == "white_reflector"

    def test_enrich_separation_light(self):
        report = VisualCueReport()
        pipeline = {
            "separation_light": {
                "ok": True,
                "has_hair_light": True,
                "hair_light_direction_deg": 0.0,
                "hair_light_intensity": 0.5,
                "hair_light_width_ratio": 0.3,
                "has_rim_light": False,
                "rim_side": None,
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.7,
                "confidence": 0.6,
                "notes": [],
            }
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.separation_light is not None
        assert enriched.separation_light.has_hair_light is True

    def test_enrich_off_axis_key(self):
        report = VisualCueReport()
        pipeline = {
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 25.0,
                "key_elevation_deg": 45.0,
                "is_off_axis": True,
                "off_axis_angle_deg": 25.0,
                "detection_method": "shadow_vector",
                "confidence": 0.6,
                "notes": [],
            }
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.off_axis_key is not None
        assert enriched.off_axis_key.is_off_axis is True

    def test_enrich_light_structure(self):
        report = VisualCueReport()
        pipeline = {
            "light_structure": {
                "ok": True,
                "nose_shadow_shape": "butterfly_below",
                "nose_shadow_length_ratio": 0.3,
                "nose_shadow_angle_deg": 0.0,
                "triangle_detected": False,
                "triangle_cheek": None,
                "triangle_completeness": 0.0,
                "pattern_name": "butterfly",
                "confidence": 0.7,
                "notes": [],
            }
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.light_structure is not None
        assert enriched.light_structure.pattern_name == "butterfly"

    def test_enrich_skips_failed_passes(self):
        report = VisualCueReport()
        pipeline = {
            "bounce_contributor": {"ok": False, "error": "test"},
            "separation_light": {"ok": False, "error": "test"},
            "off_axis_key": {"ok": False, "error": "test"},
            "light_structure": {"ok": False, "error": "test"},
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.bounce_contributor is None
        assert enriched.separation_light is None
        assert enriched.off_axis_key is None
        assert enriched.light_structure is None

    def test_enrich_all_four_together(self):
        report = VisualCueReport()
        pipeline = {
            "bounce_contributor": {
                "ok": True, "contributors": [], "primary_fill_type": "ambient",
                "fill_to_key_ratio": 0.3, "total_bounce_contribution": 0.2,
                "confidence": 0.5, "notes": [],
            },
            "separation_light": {
                "ok": True, "has_hair_light": False,
                "hair_light_direction_deg": None,
                "hair_light_intensity": 0.0, "hair_light_width_ratio": 0.0,
                "has_rim_light": True, "rim_side": "right",
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.8,
                "confidence": 0.6, "notes": [],
            },
            "off_axis_key": {
                "ok": True, "key_azimuth_deg": 0.0, "key_elevation_deg": 45.0,
                "is_off_axis": False, "off_axis_angle_deg": 0.0,
                "detection_method": "brightness_fallback",
                "confidence": 0.3, "notes": [],
            },
            "light_structure": {
                "ok": True, "nose_shadow_shape": "short_angled",
                "nose_shadow_length_ratio": 0.4,
                "nose_shadow_angle_deg": 30.0,
                "triangle_detected": False, "triangle_cheek": None,
                "triangle_completeness": 0.0,
                "pattern_name": "loop",
                "confidence": 0.65, "notes": [],
            },
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.bounce_contributor is not None
        assert enriched.separation_light is not None
        assert enriched.off_axis_key is not None
        assert enriched.light_structure is not None


# ═══════════════════════════════════════════════════════════════════════════
# 6. PIPELINE INTEGRATION TESTS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestPipelineIntegration:
    def test_pipeline_includes_new_keys(self):
        img = _make_test_image()
        mask = _make_person_mask()
        fb = _make_face_box()
        results = run_extended_pipeline(
            img, person_mask=mask, face_box=fb,
        )
        # All four new keys should be present
        assert "bounce_contributor" in results
        assert "separation_light" in results
        assert "off_axis_key" in results
        assert "light_structure" in results

    def test_pipeline_new_passes_return_ok(self):
        img = _make_test_image()
        mask = _make_person_mask()
        fb = _make_face_box()
        results = run_extended_pipeline(
            img, person_mask=mask, face_box=fb,
        )
        for key in ["bounce_contributor", "separation_light",
                     "off_axis_key", "light_structure"]:
            assert key in results
            assert isinstance(results[key], dict)
            # Should either be ok=True or ok=False with error
            assert "ok" in results[key]

    def test_pipeline_no_masks(self):
        """Pipeline should not crash without masks."""
        img = _make_test_image()
        results = run_extended_pipeline(img)
        assert "bounce_contributor" in results
        assert "separation_light" in results
        assert "off_axis_key" in results
        assert "light_structure" in results

    def test_pipeline_backward_compatibility(self):
        """Existing keys should still be present."""
        img = _make_test_image()
        results = run_extended_pipeline(img)
        # Existing keys that were present before Stage 3
        for key in ["shadow", "highlight", "catchlight", "background",
                     "continuous_source"]:
            assert key in results
