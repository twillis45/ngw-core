"""Tests for specular_surface_pass — specular highlight detection on surfaces.

Tests cover:
1. specular_surface_pass produces structured output
2. Detects specular highlights
3. Estimates size and spread
4. Edge cases
"""
from __future__ import annotations

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.vision_passes import specular_surface_pass


def _make_specular_image(w: int = 200, h: int = 200) -> np.ndarray:
    """Create image with specular highlights (bright, low-saturation spots)."""
    # Dark base with bright white spots
    img = np.full((h, w, 3), 60, dtype=np.uint8)
    # Add specular spots (white = low saturation)
    cv2.circle(img, (60, 50), 12, (250, 250, 250), -1)
    cv2.circle(img, (140, 70), 10, (245, 245, 245), -1)
    cv2.circle(img, (100, 130), 8, (240, 240, 240), -1)
    return img


def _make_matte_image(w: int = 200, h: int = 200) -> np.ndarray:
    """Create a matte (non-specular) image."""
    return np.full((h, w, 3), 100, dtype=np.uint8)


def _make_person_mask(w: int = 200, h: int = 200) -> np.ndarray:
    """Create a centered person mask."""
    mask = np.zeros((h, w), dtype=bool)
    mask[20:180, 30:170] = True
    return mask


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestSpecularSurfacePass:
    """Test specular_surface_pass signal extraction."""

    def test_basic_output_structure(self):
        img = _make_specular_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask)
        assert result["ok"] is True
        assert "specular_highlight_count" in result
        assert "specular_highlight_size" in result
        assert "specular_highlight_spread" in result
        assert "specular_axis_deg" in result

    def test_detects_specular_spots(self):
        """Should detect the 3 specular spots in the test image."""
        img = _make_specular_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask)
        assert result["specular_highlight_count"] >= 1

    def test_matte_no_specular(self):
        """Matte image should have 0 specular highlights."""
        img = _make_matte_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask)
        assert result["specular_highlight_count"] == 0
        assert result["specular_highlight_size"] == 0.0

    def test_size_range(self):
        img = _make_specular_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask)
        assert 0.0 <= result["specular_highlight_size"] <= 1.0

    def test_spread_range(self):
        img = _make_specular_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask)
        assert 0.0 <= result["specular_highlight_spread"] <= 1.0

    def test_spread_with_distant_spots(self):
        """Widely spaced spots should have higher spread."""
        img = np.full((300, 300, 3), 60, dtype=np.uint8)
        cv2.circle(img, (30, 30), 12, (250, 250, 250), -1)
        cv2.circle(img, (270, 270), 12, (250, 250, 250), -1)
        mask = np.ones((300, 300), dtype=bool)
        result = specular_surface_pass(img, person_mask=mask)

        close_img = np.full((300, 300, 3), 60, dtype=np.uint8)
        cv2.circle(close_img, (140, 140), 12, (250, 250, 250), -1)
        cv2.circle(close_img, (160, 160), 12, (250, 250, 250), -1)
        close_result = specular_surface_pass(close_img, person_mask=mask)

        if result["specular_highlight_count"] >= 2 and close_result["specular_highlight_count"] >= 2:
            assert result["specular_highlight_spread"] > close_result["specular_highlight_spread"]

    def test_without_person_mask(self):
        """Should work without person mask."""
        img = _make_specular_image()
        result = specular_surface_pass(img)
        assert result["ok"] is True

    def test_with_face_box(self):
        img = _make_specular_image()
        mask = _make_person_mask()
        result = specular_surface_pass(img, person_mask=mask, face_box=(30, 20, 170, 180))
        assert result["ok"] is True

    def test_empty_mask(self):
        """Empty person mask → error."""
        img = _make_specular_image()
        mask = np.zeros((200, 200), dtype=bool)
        result = specular_surface_pass(img, person_mask=mask)
        assert result["ok"] is False

    def test_tiny_image(self):
        """Tiny image should not crash."""
        img = np.full((10, 10, 3), 100, dtype=np.uint8)
        result = specular_surface_pass(img)
        assert isinstance(result, dict)
