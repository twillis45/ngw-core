"""Tests for background_pass — background gradient analysis.

Tests cover:
1. background_pass produces structured output
2. Gradient detection accuracy
3. Direction classification
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

from engine.vision_passes import background_pass


def _make_left_gradient_bg(w: int = 300, h: int = 300) -> np.ndarray:
    """Create image with bright left background, dark right."""
    grad = np.linspace(220, 30, w, dtype=np.uint8)
    img = np.tile(grad, (h, 1))
    return np.stack([img, img, img], axis=-1)


def _make_center_spot_bg(w: int = 300, h: int = 300) -> np.ndarray:
    """Create image with bright center spot (like a background light)."""
    img = np.full((h, w, 3), 30, dtype=np.uint8)
    cv2.circle(img, (w // 2, h // 2), w // 4, (200, 200, 200), -1)
    # Blur to simulate gradient
    img = cv2.GaussianBlur(img, (51, 51), 0)
    return img


def _make_dark_bg(w: int = 300, h: int = 300) -> np.ndarray:
    """Create uniformly dark background."""
    return np.full((h, w, 3), 15, dtype=np.uint8)


def _make_bg_mask(w: int = 300, h: int = 300) -> np.ndarray:
    """Create a background mask (True for background)."""
    mask = np.ones((h, w), dtype=bool)
    # Center person area
    mask[h//4:3*h//4, w//4:3*w//4] = False
    return mask


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestBackgroundPass:
    """Test background_pass signal extraction."""

    def test_basic_output_structure(self):
        img = _make_left_gradient_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert result["ok"] is True
        assert "background_gradient_center_x" in result
        assert "background_gradient_center_y" in result
        assert "background_gradient_spread" in result
        assert "background_intensity_ratio" in result
        assert "background_direction" in result

    def test_gradient_center_range(self):
        img = _make_left_gradient_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert 0.0 <= result["background_gradient_center_x"] <= 1.0
        assert 0.0 <= result["background_gradient_center_y"] <= 1.0

    def test_spread_range(self):
        img = _make_left_gradient_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert 0.0 <= result["background_gradient_spread"] <= 1.0

    def test_intensity_ratio_range(self):
        img = _make_left_gradient_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert 0.0 <= result["background_intensity_ratio"] <= 1.0

    def test_left_gradient_direction(self):
        """Left-bright gradient should detect 'left' direction."""
        img = _make_left_gradient_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert result["background_direction"] == "left"

    def test_center_spot_direction(self):
        """Center spot should detect 'center' direction."""
        img = _make_center_spot_bg()
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        # Center spot → center gradient center
        assert 0.3 <= result["background_gradient_center_x"] <= 0.7

    def test_dark_bg_low_intensity(self):
        """Dark bg with bright subject should have low intensity ratio.

        Note: if both bg and subject are uniformly dark, ratio=1.0 (equal).
        Use a bright subject region to test proper ratio computation.
        """
        img = np.full((300, 300, 3), 15, dtype=np.uint8)
        # Bright subject in center
        img[75:225, 75:225, :] = 180
        mask = _make_bg_mask()
        result = background_pass(img, background_mask=mask)
        assert result["background_intensity_ratio"] < 0.5

    def test_gradient_spread_higher_for_gradient(self):
        """Gradient image should have higher spread than uniform dark."""
        gradient = _make_left_gradient_bg()
        dark = _make_dark_bg()
        mask = _make_bg_mask()
        grad_result = background_pass(gradient, background_mask=mask)
        dark_result = background_pass(dark, background_mask=mask)
        assert grad_result["background_gradient_spread"] > dark_result["background_gradient_spread"]

    def test_without_mask(self):
        """Should work without explicit background mask."""
        img = _make_left_gradient_bg()
        result = background_pass(img)
        assert result["ok"] is True

    def test_small_image(self):
        """Small image should not crash."""
        img = np.full((30, 30, 3), 100, dtype=np.uint8)
        mask = np.ones((30, 30), dtype=bool)
        result = background_pass(img, background_mask=mask)
        assert isinstance(result, dict)
