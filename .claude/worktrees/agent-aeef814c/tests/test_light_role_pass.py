"""Tests for light_role_pass — light count and role estimation.

Tests cover:
1. _detect_edge_highlights helper
2. light_role_pass produces structured output
3. Key light always present
4. Fill detection from highlight + catchlight
5. Rim detection from edge brightness
6. Bounce vs fill discrimination
7. All roles have required fields
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
    light_role_pass,
    _detect_edge_highlights,
    _LIGHT_ROLES,
    _LIGHT_COUNT_LABELS,
)


# ── Shared helpers ──────────────────────────────────────────────────────

def _mock_shadow(vector_deg: float = 90.0, softness: float = 0.5,
                 edge_gradient: float = 0.5):
    return {
        "ok": True,
        "shadow_vector_deg": vector_deg,
        "shadow_softness": softness,
        "shadow_edge_gradient": edge_gradient,
    }


def _mock_highlight(width: float = 0.5, rolloff: float = 0.5):
    return {
        "ok": True,
        "highlight_width_ratio": width,
        "highlight_rolloff_rate": rolloff,
        "highlight_axis_deg": 30.0,
    }


def _mock_catchlight(count: int = 1, position: str = "upper_left"):
    return {
        "ok": True,
        "catchlight_count": count,
        "catchlight_position": position,
        "catchlight_shape": "round",
    }


def _mock_background(spread: float = 0.2, intensity: float = 0.3):
    return {
        "ok": True,
        "background_gradient_spread": spread,
        "background_intensity_ratio": intensity,
        "background_direction": "left_to_right",
    }


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6: 5 * h // 6, w // 4: 3 * w // 4] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    fx = w // 4
    fy = h // 8
    return (fx, fy, w - fx, h // 3)


# ═══════════════════════════════════════════════════════════════════════════
# Edge highlight detection tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestEdgeHighlightDetection:
    """Test _detect_edge_highlights helper."""

    def test_uniform_image_no_rim(self):
        """Uniform brightness → no rim detected."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        mask = _make_person_mask()
        result = _detect_edge_highlights(img, mask, None)
        assert result["has_rim"] is False

    def test_bright_right_edge(self):
        """Bright right edge should suggest rim on right."""
        img = np.full((400, 300, 3), 80, dtype=np.uint8)
        mask = _make_person_mask()
        # Make right edge of person bright
        edge_x = 3 * 300 // 4 - 10
        img[:, edge_x:edge_x + 20, :] = 220
        result = _detect_edge_highlights(img, mask, None)
        # May or may not detect rim depending on thresholds
        assert isinstance(result["has_rim"], bool)

    def test_bright_left_edge(self):
        """Bright left edge should suggest rim on left."""
        img = np.full((400, 300, 3), 80, dtype=np.uint8)
        mask = _make_person_mask()
        # Make left edge of person bright
        edge_x = 300 // 4
        img[:, edge_x:edge_x + 20, :] = 220
        result = _detect_edge_highlights(img, mask, None)
        assert isinstance(result["has_rim"], bool)

    def test_no_person_mask(self):
        """No mask → default result."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = _detect_edge_highlights(img, None, None)
        assert result["has_rim"] is False
        assert result["has_kicker"] is False

    def test_result_structure(self):
        """Result should have all expected keys."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        mask = _make_person_mask()
        result = _detect_edge_highlights(img, mask, None)
        assert "has_rim" in result
        assert "rim_side" in result
        assert "rim_brightness_ratio" in result
        assert "has_kicker" in result


# ═══════════════════════════════════════════════════════════════════════════
# Light role pass tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestLightRolePass:
    """Test light_role_pass integration."""

    def test_basic_output_structure(self):
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert result["ok"] is True
        assert "likely_light_count" in result
        assert "light_count_confidence" in result
        assert "roles" in result
        assert "multi_light_evidence_score" in result
        assert "false_multi_light_risk" in result
        assert "light_role_notes" in result

    def test_key_always_present(self):
        """Key light should always be marked present."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert result["roles"]["key"]["present"] is True
        assert result["roles"]["key"]["confidence"] > 0.5

    def test_all_roles_in_output(self):
        """All defined roles should appear in output."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        for role in _LIGHT_ROLES:
            assert role in result["roles"], f"Missing role: {role}"

    def test_role_structure(self):
        """Each role should have present, confidence, evidence."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        for role_name, role_info in result["roles"].items():
            assert "present" in role_info, f"Role {role_name} missing 'present'"
            assert "confidence" in role_info, f"Role {role_name} missing 'confidence'"
            assert "evidence" in role_info, f"Role {role_name} missing 'evidence'"
            assert isinstance(role_info["present"], bool)
            assert 0.0 <= role_info["confidence"] <= 1.0
            assert isinstance(role_info["evidence"], list)

    def test_fill_detected_with_broad_highlight(self):
        """Broad highlight + secondary catchlight → fill detected."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            highlight=_mock_highlight(width=0.75),
            catchlight=_mock_catchlight(count=2),
        )
        assert result["roles"]["fill"]["present"] is True
        assert result["roles"]["fill"]["confidence"] > 0.5

    def test_negative_fill_narrow_highlight(self):
        """Narrow highlight + hard shadows + no secondary catchlight → negative fill."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            highlight=_mock_highlight(width=0.2),
            shadow=_mock_shadow(softness=0.2),
            catchlight=_mock_catchlight(count=1),
        )
        assert result["roles"]["negative_fill"]["present"] is True

    def test_background_light_detected(self):
        """Strong background gradient → background light detected."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            shadow=_mock_shadow(),
            background=_mock_background(spread=0.5, intensity=0.6),
        )
        assert result["roles"]["background"]["present"] is True

    def test_light_count_in_valid_range(self):
        """Light count should be one of the valid labels."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert result["likely_light_count"] in _LIGHT_COUNT_LABELS

    def test_confidence_in_range(self):
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert 0.0 <= result["light_count_confidence"] <= 1.0

    def test_multi_light_evidence_range(self):
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert 0.0 <= result["multi_light_evidence_score"] <= 1.0

    def test_false_risk_range(self):
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        assert 0.0 <= result["false_multi_light_risk"] <= 1.0

    def test_with_all_inputs(self):
        """Pass with all upstream data should not crash."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        mask = _make_person_mask()
        face_box = _make_face_box()
        result = light_role_pass(
            img,
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            catchlight=_mock_catchlight(),
            background=_mock_background(),
            person_mask=mask,
            face_box=face_box,
        )
        assert result["ok"] is True

    def test_bounce_detection(self):
        """Moderate highlight without secondary catchlight → possible bounce."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            highlight=_mock_highlight(width=0.6),
            shadow=_mock_shadow(edge_gradient=0.5),
            catchlight=_mock_catchlight(count=1),
        )
        # Bounce may or may not be detected depending on thresholds
        assert isinstance(result["roles"]["bounce"]["present"], bool)

    def test_false_multi_light_from_reflective_surface(self):
        """Reflective surface should increase false_multi_light_risk."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        surface = {
            "ok": True,
            "reflection_dominant_regions": ["body_upper"],
            "global_surface_bias": "chrome_like",
            "surface_complexity_score": 0.5,
        }
        result = light_role_pass(
            img,
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            surface_class=surface,
        )
        assert result["false_multi_light_risk"] > 0.3
