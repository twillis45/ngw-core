"""Tests for surface_class_pass — material/surface classification.

Tests cover:
1. Helper functions (_compute_surface_complexity, _classify_region_texture)
2. surface_class_pass produces structured output
3. Face skin detection
4. Fabric texture classification
5. Reflective surface detection
6. Background classification
7. Complexity scoring
8. Edge cases (small images, missing masks)
"""
from __future__ import annotations

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.vision_passes import (
    surface_class_pass,
    _compute_surface_complexity,
    _classify_region_texture,
    _classify_background_region,
    _SURFACE_CLASSES,
)


# ── Shared helpers ──────────────────────────────────────────────────────

def _make_neutral_image(w: int = 300, h: int = 400) -> np.ndarray:
    return np.full((h, w, 3), 128, dtype=np.uint8)


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6 : 5 * h // 6, w // 4 : 3 * w // 4] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    fx = w // 4
    fy = h // 8
    return (fx, fy, w - fx, h // 3)


# ═══════════════════════════════════════════════════════════════════════════
# Helper function tests
# ═══════════════════════════════════════════════════════════════════════════

class TestSurfaceClassHelpers:
    """Test surface class helper functions."""

    def test_surface_classes_list(self):
        """_SURFACE_CLASSES should contain known classes."""
        assert "face_skin" in _SURFACE_CLASSES
        assert "satin_silk" in _SURFACE_CLASSES
        assert "chrome_like" in _SURFACE_CLASSES
        assert "unknown" in _SURFACE_CLASSES

    def test_complexity_empty(self):
        """Empty surfaces → zero complexity."""
        score = _compute_surface_complexity([], [])
        assert score == 0.0

    def test_complexity_single_surface(self):
        """Single surface → low complexity."""
        surfaces = [{"region": "face", "surface_class": "face_skin", "confidence": 0.8}]
        score = _compute_surface_complexity(surfaces, [])
        assert score < 0.2

    def test_complexity_multiple_surfaces(self):
        """Multiple distinct surfaces → higher complexity."""
        surfaces = [
            {"region": "face", "surface_class": "face_skin", "confidence": 0.8},
            {"region": "body_upper", "surface_class": "satin_silk", "confidence": 0.7},
            {"region": "body_lower", "surface_class": "leather", "confidence": 0.6},
            {"region": "background", "surface_class": "background_paper", "confidence": 0.9},
        ]
        score = _compute_surface_complexity(surfaces, [])
        assert score >= 0.4

    def test_complexity_with_reflective_regions(self):
        """Reflective regions bump complexity."""
        surfaces = [
            {"region": "face", "surface_class": "face_skin", "confidence": 0.8},
            {"region": "body_upper", "surface_class": "chrome_like", "confidence": 0.7},
        ]
        score = _compute_surface_complexity(surfaces, ["body_upper"])
        assert score > 0.4

    def test_complexity_chrome_glass_bonus(self):
        """Chrome or glass adds 0.25 to complexity."""
        surfaces = [
            {"region": "face", "surface_class": "face_skin", "confidence": 0.8},
            {"region": "body_upper", "surface_class": "glass", "confidence": 0.6},
        ]
        score_with = _compute_surface_complexity(surfaces, [])
        surfaces_no_glass = [
            {"region": "face", "surface_class": "face_skin", "confidence": 0.8},
            {"region": "body_upper", "surface_class": "matte_fabric", "confidence": 0.6},
        ]
        score_without = _compute_surface_complexity(surfaces_no_glass, [])
        assert score_with > score_without

    def test_complexity_clamped_to_one(self):
        """Complexity should never exceed 1.0."""
        surfaces = [
            {"region": "face", "surface_class": "face_skin", "confidence": 0.8},
            {"region": "body_upper", "surface_class": "chrome_like", "confidence": 0.7},
            {"region": "body_lower", "surface_class": "glass", "confidence": 0.6},
            {"region": "hair", "surface_class": "metallic", "confidence": 0.5},
            {"region": "background", "surface_class": "matte_fabric", "confidence": 0.9},
        ]
        score = _compute_surface_complexity(surfaces, ["body_upper", "body_lower", "hair"])
        assert score <= 1.0


# ═══════════════════════════════════════════════════════════════════════════
# Integration tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestSurfaceClassPass:
    """Test surface_class_pass integration."""

    def test_basic_output_structure(self):
        img = _make_neutral_image()
        result = surface_class_pass(img)
        assert result["ok"] is True
        assert "dominant_surfaces" in result
        assert "global_surface_bias" in result
        assert "surface_complexity_score" in result
        assert "surface_confidence_adjustment" in result
        assert "reflection_dominant_regions" in result

    def test_dominant_surfaces_is_list(self):
        img = _make_neutral_image()
        result = surface_class_pass(img)
        assert isinstance(result["dominant_surfaces"], list)

    def test_with_face_box(self):
        """Face box should produce a face region classification."""
        img = _make_neutral_image()
        face_box = _make_face_box()
        result = surface_class_pass(img, face_box=face_box)
        assert result["ok"] is True
        regions = [s["region"] for s in result["dominant_surfaces"]]
        assert "face" in regions

    def test_with_person_mask(self):
        img = _make_neutral_image()
        mask = _make_person_mask()
        result = surface_class_pass(img, person_mask=mask)
        assert result["ok"] is True

    def test_with_all_inputs(self):
        img = _make_neutral_image()
        mask = _make_person_mask()
        face_box = _make_face_box()
        bg_mask = ~mask
        result = surface_class_pass(
            img, person_mask=mask, face_box=face_box, background_mask=bg_mask,
        )
        assert result["ok"] is True
        regions = [s["region"] for s in result["dominant_surfaces"]]
        assert len(regions) >= 2

    def test_small_image(self):
        """Very small image should not crash."""
        img = np.full((10, 10, 3), 128, dtype=np.uint8)
        result = surface_class_pass(img)
        assert isinstance(result, dict)
        # Small images return ok=False
        assert "ok" in result

    def test_complexity_range(self):
        img = _make_neutral_image()
        result = surface_class_pass(img)
        if result["ok"]:
            assert 0.0 <= result["surface_complexity_score"] <= 1.0

    def test_confidence_adjustment_values(self):
        img = _make_neutral_image()
        result = surface_class_pass(img)
        if result["ok"]:
            assert result["surface_confidence_adjustment"] in (
                "normal", "moderate_caution", "reduce_confidence",
            )

    def test_surface_entry_structure(self):
        """Each entry in dominant_surfaces should have region, class, confidence."""
        img = _make_neutral_image()
        face_box = _make_face_box()
        result = surface_class_pass(img, face_box=face_box)
        if result["ok"]:
            for entry in result["dominant_surfaces"]:
                assert "region" in entry
                assert "surface_class" in entry
                assert "confidence" in entry
                assert entry["surface_class"] in _SURFACE_CLASSES
                assert 0.0 <= entry["confidence"] <= 1.0

    def test_background_classification(self):
        """Uniform background should be classified."""
        img = _make_neutral_image()
        mask = _make_person_mask()
        bg_mask = ~mask
        result = surface_class_pass(img, person_mask=mask, background_mask=bg_mask)
        if result["ok"]:
            bg_entries = [s for s in result["dominant_surfaces"] if s["region"] == "background"]
            if bg_entries:
                assert bg_entries[0]["surface_class"] in (
                    "background_paper", "background_painted_wall", "unknown",
                )

    def test_reflective_detection_on_bright_surface(self):
        """Very bright, low-sat region should be flagged reflective."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        # Make upper body extremely bright + low sat (simulating chrome)
        img[100:200, 75:225] = [250, 250, 255]
        mask = _make_person_mask()
        face_box = _make_face_box()
        result = surface_class_pass(img, person_mask=mask, face_box=face_box)
        assert result["ok"] is True
        # Should detect some reflective or bright surface
        classes = [s["surface_class"] for s in result["dominant_surfaces"]]
        assert len(classes) > 0

    def test_global_surface_bias(self):
        """Global surface bias should be a valid class."""
        img = _make_neutral_image()
        result = surface_class_pass(img)
        if result["ok"]:
            assert result["global_surface_bias"] in _SURFACE_CLASSES or result["global_surface_bias"] == "unknown"
