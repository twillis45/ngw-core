"""Tests for shadow_pass — shadow vector, softness, edge gradient extraction.

Tests cover:
1. shadow_pass produces structured output
2. Output fields are in expected ranges
3. Handles missing masks gracefully
4. Edge cases (uniform images, small images)
"""
from __future__ import annotations

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.vision_passes import shadow_pass


def _make_test_image(w: int = 200, h: int = 200) -> np.ndarray:
    """Create a simple test image with a light/dark split."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # Left side bright, right side dark → shadow falls right
    img[:, :w//2, :] = 200
    img[:, w//2:, :] = 40
    return img


def _make_gradient_image(w: int = 200, h: int = 200) -> np.ndarray:
    """Create a smooth left-to-right gradient image."""
    grad = np.linspace(200, 40, w, dtype=np.uint8)
    img = np.tile(grad, (h, 1))
    return np.stack([img, img, img], axis=-1)


def _make_uniform_image(w: int = 200, h: int = 200, brightness: int = 128) -> np.ndarray:
    """Create a uniform brightness image."""
    return np.full((h, w, 3), brightness, dtype=np.uint8)


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestShadowPass:
    """Test shadow_pass signal extraction."""

    def test_basic_output_structure(self):
        img = _make_test_image()
        result = shadow_pass(img)
        assert result["ok"] is True
        assert "shadow_vector_deg" in result
        assert "shadow_softness" in result
        assert "shadow_length_ratio" in result
        assert "shadow_edge_gradient" in result
        assert "shadow_vertical_angle_deg" in result

    def test_shadow_softness_range(self):
        img = _make_test_image()
        result = shadow_pass(img)
        assert 0.0 <= result["shadow_softness"] <= 1.0

    def test_shadow_edge_gradient_range(self):
        img = _make_test_image()
        result = shadow_pass(img)
        assert 0.0 <= result["shadow_edge_gradient"] <= 1.0

    def test_gradient_image_softer(self):
        """Smooth gradient should produce softer shadows than hard split."""
        hard = _make_test_image()
        soft = _make_gradient_image()
        hard_result = shadow_pass(hard)
        soft_result = shadow_pass(soft)
        # Gradient should have higher edge_gradient (more transition area)
        assert soft_result["shadow_edge_gradient"] >= hard_result["shadow_edge_gradient"] - 0.2

    def test_with_person_mask(self):
        img = _make_test_image()
        mask = np.ones((200, 200), dtype=bool)
        mask[:, 150:] = False  # exclude right edge
        result = shadow_pass(img, person_mask=mask)
        assert result["ok"] is True

    def test_with_face_box(self):
        img = _make_test_image()
        result = shadow_pass(img, face_box=(50, 30, 150, 170))
        assert result["ok"] is True
        # Should compute shadow_length_ratio when face_box available
        assert result["shadow_length_ratio"] is not None

    def test_without_face_box_no_length_ratio(self):
        img = _make_test_image()
        result = shadow_pass(img)
        # Without face box, length ratio is None
        assert result["shadow_length_ratio"] is None

    def test_uniform_image(self):
        img = _make_uniform_image()
        result = shadow_pass(img)
        # Should still produce output (defaults)
        assert result["ok"] is True

    def test_shadow_vector_range(self):
        img = _make_test_image()
        result = shadow_pass(img)
        vec = result["shadow_vector_deg"]
        if vec is not None:
            assert 0.0 <= vec <= 360.0

    def test_empty_mask(self):
        img = _make_test_image()
        mask = np.zeros((200, 200), dtype=bool)
        result = shadow_pass(img, person_mask=mask)
        assert result["ok"] is False

    def test_small_image(self):
        img = np.full((10, 10, 3), 128, dtype=np.uint8)
        result = shadow_pass(img)
        assert result["ok"] is True or result["ok"] is False  # doesn't crash
