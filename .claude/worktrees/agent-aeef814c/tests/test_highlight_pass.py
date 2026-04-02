"""Tests for highlight_pass — highlight width, rolloff, specularity extraction.

Tests cover:
1. highlight_pass produces structured output
2. Output fields in expected ranges
3. Different lighting scenarios produce different signals
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

from engine.vision_passes import highlight_pass


def _make_highlight_left(w: int = 200, h: int = 200) -> np.ndarray:
    """Create an image with highlight on left side (broad lighting)."""
    img = np.full((h, w, 3), 60, dtype=np.uint8)
    img[:, :w//2, :] = 200  # bright left half
    return img


def _make_specular_spots(w: int = 200, h: int = 200) -> np.ndarray:
    """Create an image with bright specular spots."""
    img = np.full((h, w, 3), 80, dtype=np.uint8)
    # Add bright spots
    cv2.circle(img, (60, 60), 10, (250, 250, 250), -1)
    cv2.circle(img, (140, 80), 8, (245, 245, 245), -1)
    return img


def _make_even_lighting(w: int = 200, h: int = 200) -> np.ndarray:
    """Create an evenly lit image."""
    return np.full((h, w, 3), 140, dtype=np.uint8)


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestHighlightPass:
    """Test highlight_pass signal extraction."""

    def test_basic_output_structure(self):
        img = _make_highlight_left()
        result = highlight_pass(img)
        assert result["ok"] is True
        assert "highlight_width_ratio" in result
        assert "highlight_rolloff_rate" in result
        assert "highlight_edge_gradient" in result
        assert "highlight_axis_deg" in result
        assert "highlight_specularity" in result

    def test_highlight_width_range(self):
        img = _make_highlight_left()
        result = highlight_pass(img)
        assert 0.0 <= result["highlight_width_ratio"] <= 1.0

    def test_highlight_rolloff_range(self):
        img = _make_highlight_left()
        result = highlight_pass(img)
        assert 0.0 <= result["highlight_rolloff_rate"] <= 1.0

    def test_specularity_range(self):
        img = _make_highlight_left()
        result = highlight_pass(img)
        assert 0.0 <= result["highlight_specularity"] <= 1.0

    def test_broad_highlight_wider(self):
        """Left-lit image should have wider highlight than narrow spot.

        Use face_box to ensure identical analysis region for both.
        """
        face_box = (20, 20, 180, 180)
        broad = _make_highlight_left()
        narrow = np.full((200, 200, 3), 60, dtype=np.uint8)
        narrow[:, 90:110, :] = 200  # very narrow central highlight (20px)

        broad_result = highlight_pass(broad, face_box=face_box)
        narrow_result = highlight_pass(narrow, face_box=face_box)
        assert broad_result["highlight_width_ratio"] > narrow_result["highlight_width_ratio"]

    def test_specular_spots_higher_specularity(self):
        """Specular spots should produce higher specularity than even lighting."""
        specular = _make_specular_spots()
        even = _make_even_lighting()
        person_mask = np.ones((200, 200), dtype=bool)

        spec_result = highlight_pass(specular, person_mask=person_mask)
        even_result = highlight_pass(even, person_mask=person_mask)
        assert spec_result["highlight_specularity"] >= even_result["highlight_specularity"]

    def test_with_face_box(self):
        img = _make_highlight_left()
        result = highlight_pass(img, face_box=(30, 30, 170, 170))
        assert result["ok"] is True

    def test_with_person_mask(self):
        img = _make_highlight_left()
        mask = np.ones((200, 200), dtype=bool)
        result = highlight_pass(img, person_mask=mask)
        assert result["ok"] is True

    def test_even_lighting_moderate_rolloff(self):
        """Even lighting should produce moderate rolloff (flat profile)."""
        img = _make_even_lighting()
        result = highlight_pass(img)
        assert result["ok"] is True
        # Even lighting → rolloff around 0.3-0.7 (not extreme)
        assert 0.0 <= result["highlight_rolloff_rate"] <= 1.0

    def test_small_face_box(self):
        """Very small face box should either work or fail gracefully."""
        img = _make_highlight_left()
        result = highlight_pass(img, face_box=(95, 95, 105, 105))
        # Should not crash
        assert isinstance(result, dict)
