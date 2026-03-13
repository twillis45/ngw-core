"""Tests for the debug overlay system.

Tests cover:
1. generate_analysis_overlay produces a valid image file
2. Overlay with empty/minimal pipeline results
3. Overlay with full pipeline results
4. Custom output path
5. describe_image debug flag preserves internal data
6. describe_image without debug strips internal data
7. _generate_debug_overlay helper (lab API)
8. Overlay file is written to static/debug/
9. Missing cv2 gracefully returns None
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import patch

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


# ── Shared helpers ────────────────────────────────────────────────────────

def _make_test_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a simple test image (BGR)."""
    img = np.full((h, w, 3), 128, dtype=np.uint8)
    # Add some variation for more realistic signals
    img[0:h//3, :, :] = 100   # darker top (sky/background)
    img[h//3:, :, 1] = 160    # greenish body area
    return img


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6: 5 * h // 6, w // 4: 3 * w // 4] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    return (w // 4, h // 8, w - w // 4, h // 3)


def _minimal_pipeline_results() -> Dict[str, Any]:
    """Pipeline results with all passes returning ok=False."""
    return {
        "geometry": {},
        "pose_solver": {"ok": False, "error": "test"},
        "surface_class": {"ok": False, "error": "test"},
        "shadow": {"ok": False, "error": "test"},
        "highlight": {"ok": False, "error": "test"},
        "catchlight": {"ok": False, "error": "test"},
        "background": {"ok": False, "error": "test"},
        "specular_surface": {"ok": False, "error": "test"},
        "light_role": {"ok": False, "error": "test"},
        "reconstruction": {"ok": False, "error": "test"},
        "validation": {"ok": False, "error": "test"},
    }


def _full_pipeline_results() -> Dict[str, Any]:
    """Pipeline results with realistic ok=True data for all passes."""
    return {
        "geometry": {"head_rotation_deg": 5.0, "shoulder_line_angle": 2.0},
        "pose_solver": {
            "ok": True,
            "shoulder_line_angle_deg": 3.0,
            "hip_line_angle_deg": 1.0,
            "head_rotation_deg": 5.0,
            "chin_yaw_deg": 8.0,
            "pose_complexity_score": 0.2,
            "pose_confidence_adjustment": "normal",
            "self_shadow_regions": ["under_chin"],
            "occluded_regions": [],
            "pose_shadow_interference": False,
        },
        "surface_class": {
            "ok": True,
            "dominant_surfaces": [
                {"region": "face", "surface_class": "face_skin", "confidence": 0.85},
                {"region": "body_upper", "surface_class": "matte_fabric", "confidence": 0.7},
            ],
            "global_surface_bias": "face_skin",
            "surface_complexity_score": 0.15,
            "surface_confidence_adjustment": "normal",
            "reflection_dominant_regions": [],
        },
        "shadow": {
            "ok": True,
            "shadow_vector_deg": 45.0,
            "shadow_softness": 0.6,
            "shadow_edge_gradient": 0.5,
            "shadow_vertical_angle_deg": 35.0,
            "shadow_length_ratio": 0.4,
        },
        "highlight": {
            "ok": True,
            "highlight_width_ratio": 0.55,
            "highlight_rolloff_rate": 0.45,
            "highlight_edge_gradient": 0.5,
            "highlight_axis_deg": 50.0,
            "highlight_specularity": 0.3,
        },
        "catchlight": {
            "ok": True,
            "catchlight_count": 1,
            "catchlight_shape": "round",
            "catchlight_position": "upper_left",
            "catchlight_size_ratio": 0.04,
            "catchlight_intensity": 0.8,
        },
        "background": {
            "ok": True,
            "background_gradient_spread": 0.2,
            "background_intensity_ratio": 0.3,
            "background_direction": "left_to_right",
            "background_gradient_center_x": 0.3,
            "background_gradient_center_y": 0.5,
        },
        "specular_surface": {
            "ok": True,
            "specular_highlight_count": 2,
            "specular_spread": 0.3,
        },
        "light_role": {
            "ok": True,
            "likely_light_count": "one",
            "light_count_confidence": 0.75,
            "roles": {
                "key": {"present": True, "confidence": 0.9, "evidence": ["shadow_vector"]},
                "fill": {"present": False, "confidence": 0.1, "evidence": []},
                "negative_fill": {"present": False, "confidence": 0.0, "evidence": []},
                "rim": {"present": False, "confidence": 0.0, "evidence": []},
                "kicker": {"present": False, "confidence": 0.0, "evidence": []},
                "background": {"present": False, "confidence": 0.0, "evidence": []},
                "bounce": {"present": False, "confidence": 0.0, "evidence": []},
                "unknown_secondary": {"present": False, "confidence": 0.0, "evidence": []},
            },
            "multi_light_evidence_score": 0.1,
            "false_multi_light_risk": 0.05,
            "light_role_notes": [],
        },
        "reconstruction": {
            "ok": True,
            "key_light_angle_deg": 45.0,
            "key_light_angle_deg_raw": 47.0,
            "key_light_angle_deg_pose_corrected": 45.0,
            "key_light_height": "above",
            "modifier_size_class": "medium",
            "modifier_size_class_raw": "medium",
            "modifier_certainty": "high",
            "pose_complexity_score": 0.2,
            "likely_light_count": "one",
            "fill_present": False,
            "background_light": False,
            "notes": [],
        },
        "validation": {
            "ok": True,
            "valid": True,
            "confidence": 0.82,
            "pose_adjusted": False,
            "surface_adjusted": False,
            "warnings": [],
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# generate_analysis_overlay tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestGenerateAnalysisOverlay:
    """Test generate_analysis_overlay from vision_debug.py."""

    def test_returns_path_on_success(self, tmp_path):
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _full_pipeline_results()
        out = str(tmp_path / "test_overlay.jpg")

        path = generate_analysis_overlay(img, results, output_path=out)

        assert path is not None
        assert Path(path).exists()
        assert path == out

    def test_overlay_is_valid_image(self, tmp_path):
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _full_pipeline_results()
        out = str(tmp_path / "test_overlay.jpg")

        generate_analysis_overlay(img, results, output_path=out)

        # Read it back — should be a valid image
        loaded = cv2.imread(out)
        assert loaded is not None
        assert loaded.shape[:2] == img.shape[:2]

    def test_overlay_with_face_box(self, tmp_path):
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _full_pipeline_results()
        face_box = _make_face_box()
        out = str(tmp_path / "test_overlay_fb.jpg")

        path = generate_analysis_overlay(
            img, results, face_box=face_box, output_path=out,
        )
        assert path is not None
        assert Path(path).exists()

    def test_overlay_with_person_mask(self, tmp_path):
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _full_pipeline_results()
        mask = _make_person_mask()
        out = str(tmp_path / "test_overlay_pm.jpg")

        path = generate_analysis_overlay(
            img, results, person_mask=mask, output_path=out,
        )
        assert path is not None
        assert Path(path).exists()

    def test_overlay_with_all_inputs(self, tmp_path):
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _full_pipeline_results()
        face_box = _make_face_box()
        mask = _make_person_mask()
        out = str(tmp_path / "test_overlay_all.jpg")

        path = generate_analysis_overlay(
            img, results,
            face_box=face_box,
            person_mask=mask,
            output_path=out,
        )
        assert path is not None
        assert Path(path).exists()

    def test_minimal_results_no_crash(self, tmp_path):
        """Overlay with all passes failed should not crash."""
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        results = _minimal_pipeline_results()
        out = str(tmp_path / "test_overlay_min.jpg")

        path = generate_analysis_overlay(img, results, output_path=out)
        assert path is not None
        assert Path(path).exists()

    def test_empty_results_no_crash(self, tmp_path):
        """Completely empty results dict should not crash."""
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        out = str(tmp_path / "test_overlay_empty.jpg")

        path = generate_analysis_overlay(img, {}, output_path=out)
        assert path is not None
        assert Path(path).exists()

    def test_default_output_path(self):
        """Without explicit output_path, should use default."""
        from engine.vision_debug import generate_analysis_overlay, DEBUG_OUTPUT_DIR

        img = _make_test_image()
        results = _minimal_pipeline_results()

        path = generate_analysis_overlay(img, results)
        assert path is not None

        expected = str(DEBUG_OUTPUT_DIR / "analysis_overlay.jpg")
        assert path == expected
        assert Path(path).exists()

        # Cleanup
        try:
            os.remove(path)
        except OSError:
            pass

    def test_overlay_same_dimensions_as_input(self, tmp_path):
        """Output image should have same dimensions as input."""
        from engine.vision_debug import generate_analysis_overlay

        for h, w in [(200, 300), (400, 300), (600, 800)]:
            img = np.full((h, w, 3), 128, dtype=np.uint8)
            out = str(tmp_path / f"test_{h}x{w}.jpg")
            generate_analysis_overlay(img, _full_pipeline_results(), output_path=out)
            loaded = cv2.imread(out)
            assert loaded.shape[:2] == (h, w)


# ═══════════════════════════════════════════════════════════════════════════
# describe_image debug flag tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestDescribeImageDebugFlag:
    """Test that describe_image preserves/strips debug data correctly."""

    def _get_test_image_path(self, tmp_path):
        """Create a test image file and return its path."""
        img = _make_test_image()
        path = str(tmp_path / "test_input.jpg")
        cv2.imwrite(path, img)
        return path

    def test_debug_true_preserves_img_bgr(self, tmp_path):
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "vision", debug=True)

        assert "_debug_img_bgr" in result
        assert result["_debug_img_bgr"] is not None
        assert isinstance(result["_debug_img_bgr"], np.ndarray)

    def test_debug_true_preserves_masks(self, tmp_path):
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "vision", debug=True)

        assert "_debug_masks" in result
        masks = result["_debug_masks"]
        assert isinstance(masks, dict)
        assert "person" in masks

    def test_debug_true_preserves_face_box(self, tmp_path):
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "vision", debug=True)

        assert "_debug_face_box" in result
        # face_box can be None if no face detected, but key must exist
        fb = result["_debug_face_box"]
        assert fb is None or (isinstance(fb, tuple) and len(fb) == 4)

    def test_debug_false_preserves_internal_debug_data(self, tmp_path):
        """Internal _debug_* keys are always present for the extended pipeline,
        even when debug=False. They are stripped at the API layer, not here."""
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "vision", debug=False)

        # _debug_* keys are now always preserved for extended pipeline use
        assert "_debug_img_bgr" in result
        assert "_debug_masks" in result
        assert "_debug_face_box" in result

    def test_debug_default_preserves_internal_debug_data(self, tmp_path):
        """Internal _debug_* keys are always present for the extended pipeline."""
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "vision")

        assert "_debug_img_bgr" in result
        assert "_debug_masks" in result
        assert "_debug_face_box" in result

    def test_basic_mode_no_debug_data(self, tmp_path):
        """Basic mode doesn't run vision pipeline, so no debug data."""
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result = describe_image(path, "basic", debug=True)

        assert "_debug_img_bgr" not in result
        assert "_debug_masks" not in result

    def test_debug_data_does_not_affect_output(self, tmp_path):
        """Debug flag should not change the main analysis output."""
        from engine.image_analysis import describe_image

        path = self._get_test_image_path(tmp_path)
        result_normal = describe_image(path, "vision", debug=False)
        result_debug = describe_image(path, "vision", debug=True)

        # Strip all underscore-prefixed keys for comparison
        def clean(d):
            return {k: v for k, v in d.items() if not k.startswith("_")}

        normal_clean = clean(result_normal)
        debug_clean = clean(result_debug)

        # Same keys
        assert set(normal_clean.keys()) == set(debug_clean.keys())
        # ok status should match
        assert normal_clean["ok"] == debug_clean["ok"]


# ═══════════════════════════════════════════════════════════════════════════
# _generate_debug_overlay helper (lab API)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestLabDebugOverlayHelper:
    """Test _generate_debug_overlay from lab.py."""

    def test_generates_overlay_url(self, tmp_path):
        from api.routes.lab import _generate_debug_overlay

        img = _make_test_image()
        raw = {
            "_debug_img_bgr": img,
            "_debug_masks": {
                "person": _make_person_mask(),
                "skin": np.zeros((400, 300), dtype=bool),
                "background": ~_make_person_mask(),
            },
            "_debug_face_box": _make_face_box(),
            "vision": {
                "catchlights": {"ok": True, "catchlight_count": 1},
                "pose": {"ok": True, "pose": "standing"},
            },
        }
        image_path = tmp_path / "test_input.jpg"
        cv2.imwrite(str(image_path), img)

        url = _generate_debug_overlay(raw, image_path)

        assert url is not None
        assert url.startswith("/static/debug/")
        assert url.endswith(".jpg")

        # Verify the file actually exists
        file_path = Path(url.lstrip("/"))
        assert file_path.exists()

        # Cleanup
        try:
            os.remove(str(file_path))
        except OSError:
            pass

    def test_returns_none_without_img(self):
        from api.routes.lab import _generate_debug_overlay

        raw = {
            "_debug_img_bgr": None,
            "_debug_masks": {},
        }
        url = _generate_debug_overlay(raw, Path("test.jpg"))
        assert url is None

    def test_returns_none_on_missing_debug_fields(self):
        from api.routes.lab import _generate_debug_overlay

        raw = {}  # No debug fields at all
        url = _generate_debug_overlay(raw, Path("test.jpg"))
        assert url is None

    def test_overlay_contains_unique_filename(self, tmp_path):
        from api.routes.lab import _generate_debug_overlay

        img = _make_test_image()
        raw = {
            "_debug_img_bgr": img,
            "_debug_masks": {},
            "_debug_face_box": None,
            "vision": {},
        }
        image_path = tmp_path / "my_photo.jpg"
        cv2.imwrite(str(image_path), img)

        url = _generate_debug_overlay(raw, image_path)

        assert url is not None
        # Should contain the original image stem
        assert "my_photo" in url

        # Cleanup
        try:
            file_path = Path(url.lstrip("/"))
            os.remove(str(file_path))
        except OSError:
            pass


# ═══════════════════════════════════════════════════════════════════════════
# Integration test: run_extended_pipeline + overlay
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestOverlayPipelineIntegration:
    """Test that run_extended_pipeline output feeds correctly into overlay."""

    def test_pipeline_to_overlay(self, tmp_path):
        from engine.vision_passes import run_extended_pipeline
        from engine.vision_debug import generate_analysis_overlay

        img = _make_test_image()
        mask = _make_person_mask()
        face_box = _make_face_box()

        # Run real pipeline
        results = run_extended_pipeline(
            img,
            person_mask=mask,
            face_box=face_box,
        )

        # Generate overlay from real results
        out = str(tmp_path / "integration_overlay.jpg")
        path = generate_analysis_overlay(
            img, results,
            face_box=face_box,
            person_mask=mask,
            output_path=out,
        )

        assert path is not None
        assert Path(path).exists()

        # Overlay should be a valid image with same dimensions
        loaded = cv2.imread(out)
        assert loaded is not None
        assert loaded.shape[:2] == img.shape[:2]

    def test_pipeline_results_have_expected_keys(self):
        from engine.vision_passes import run_extended_pipeline

        img = _make_test_image()
        results = run_extended_pipeline(img)

        # All 11 passes should be present
        expected_keys = [
            "geometry", "pose_solver", "surface_class",
            "shadow", "highlight", "catchlight", "background",
            "specular_surface", "light_role",
            "reconstruction", "validation",
        ]
        for key in expected_keys:
            assert key in results, f"Missing pipeline key: {key}"
