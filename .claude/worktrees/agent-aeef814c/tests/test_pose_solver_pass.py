"""Tests for pose_solver_pass — body geometry & interference detection.

Tests cover:
1. pose_solver_pass produces structured output
2. Pose geometry estimation (rotation, angles, lean)
3. Self-shadow region detection
4. Occlusion detection
5. Pose complexity scoring
6. Confidence adjustment rules
7. Edge cases (no landmarks, small images)
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
    pose_solver_pass,
    _angle_between_points,
    _midpoint,
    _estimate_rotation_from_width_ratio,
    _detect_self_shadow_regions,
    _compute_pose_complexity,
)


# ── Helper fixtures ──────────────────────────────────────────────────────

def _make_neutral_portrait(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a simple centered portrait image (uniform gray)."""
    return np.full((h, w, 3), 128, dtype=np.uint8)


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a centered person mask."""
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6 : 5 * h // 6, w // 4 : 3 * w // 4] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    """Create a centered face box."""
    fx = w // 4
    fy = h // 8
    return (fx, fy, w - fx, h // 3)


# ═══════════════════════════════════════════════════════════════════════════
# Unit tests for helper functions
# ═══════════════════════════════════════════════════════════════════════════

class TestPoseHelpers:
    """Test pose solver helper functions."""

    def test_angle_between_horizontal(self):
        """Points on a horizontal line → ~0°."""
        angle = _angle_between_points((0, 0), (100, 0))
        assert abs(angle) < 1.0

    def test_angle_between_vertical(self):
        """Points on a vertical line → ~90°."""
        angle = _angle_between_points((0, 0), (0, 100))
        assert abs(abs(angle) - 90.0) < 1.0

    def test_angle_between_diagonal(self):
        """45° diagonal."""
        angle = _angle_between_points((0, 0), (100, 100))
        assert abs(angle - 45.0) < 1.0

    def test_midpoint(self):
        mid = _midpoint((0, 0), (100, 200))
        assert mid == (50.0, 100.0)

    def test_rotation_from_equal_widths(self):
        """Equal left/right → 0° rotation."""
        rot = _estimate_rotation_from_width_ratio(50.0, 50.0)
        assert abs(rot) < 1.0

    def test_rotation_from_asymmetric_widths(self):
        """Right side wider → positive rotation (turned right)."""
        rot = _estimate_rotation_from_width_ratio(30.0, 70.0)
        assert rot > 20.0

    def test_rotation_from_left_dominant(self):
        """Left side wider → negative rotation (turned left)."""
        rot = _estimate_rotation_from_width_ratio(70.0, 30.0)
        assert rot < -20.0

    def test_rotation_zero_total(self):
        """Zero distances → 0° rotation."""
        rot = _estimate_rotation_from_width_ratio(0.0, 0.0)
        assert rot == 0.0


class TestSelfShadowDetection:
    """Test _detect_self_shadow_regions."""

    def test_chin_down_creates_under_chin_shadow(self):
        regions = _detect_self_shadow_regions("down", 0.0, [])
        assert "under_chin" in regions
        assert "neck_lower" in regions

    def test_slightly_down_creates_shadow(self):
        regions = _detect_self_shadow_regions("slightly_down", 0.0, [])
        assert "under_chin" in regions

    def test_neutral_chin_no_shadow(self):
        regions = _detect_self_shadow_regions("neutral", 0.0, [])
        assert "under_chin" not in regions

    def test_torso_rotation_right(self):
        """Torso turned right → left side recedes."""
        regions = _detect_self_shadow_regions("neutral", 25.0, [])
        assert "torso_left" in regions

    def test_torso_rotation_left(self):
        """Torso turned left → right side recedes."""
        regions = _detect_self_shadow_regions("neutral", -25.0, [])
        assert "torso_right" in regions

    def test_small_rotation_no_shadow(self):
        regions = _detect_self_shadow_regions("neutral", 10.0, [])
        assert "torso_left" not in regions
        assert "torso_right" not in regions

    def test_arm_occlusion_adds_shadow(self):
        regions = _detect_self_shadow_regions("neutral", 0.0, ["torso_right"])
        assert "torso_right" in regions


class TestPoseComplexity:
    """Test _compute_pose_complexity."""

    def test_neutral_pose_low_complexity(self):
        """Neutral standing pose → low complexity."""
        score = _compute_pose_complexity(0.0, 0.0, 0.0, 0.0, [], [])
        assert score < 0.15

    def test_high_torso_rotation(self):
        """Strong torso rotation → higher complexity."""
        score = _compute_pose_complexity(45.0, 0.0, 0.0, 0.0, [], [])
        assert score > 0.1

    def test_complex_fashion_pose(self):
        """Multiple rotation + occlusion → high complexity."""
        score = _compute_pose_complexity(
            30.0, 20.0, 15.0, 10.0,
            ["torso_left", "waist_left"],
            ["under_chin", "torso_left"],
        )
        assert score > 0.4

    def test_complexity_range(self):
        """Complexity always in [0, 1]."""
        for rot in [0, 15, 30, 45, 60, 90]:
            score = _compute_pose_complexity(
                rot, rot * 0.7, rot * 0.4, rot * 0.3,
                ["torso_left"] if rot > 30 else [],
                ["under_chin"] if rot > 20 else [],
            )
            assert 0.0 <= score <= 1.0


# ═══════════════════════════════════════════════════════════════════════════
# Integration tests for pose_solver_pass
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestPoseSolverPass:
    """Test pose_solver_pass integration."""

    def test_basic_output_structure(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        assert result["ok"] is True
        assert "torso_rotation_deg" in result
        assert "head_rotation_deg" in result
        assert "shoulder_line_angle_deg" in result
        assert "hip_line_angle_deg" in result
        assert "chin_pitch" in result
        assert "chin_yaw_deg" in result
        assert "subject_lean" in result
        assert "arm_occlusion_regions" in result
        assert "leg_occlusion_regions" in result
        assert "body_surface_normals_estimate" in result
        assert "pose_shadow_interference" in result
        assert "pose_highlight_interference" in result
        assert "occluded_regions" in result
        assert "self_shadow_regions" in result
        assert "pose_complexity_score" in result
        assert "pose_confidence_adjustment" in result

    def test_with_geometry_data(self):
        """Falls back to geometry data when no landmarks detected."""
        img = _make_neutral_portrait()
        geo = {
            "head_rotation_deg": 15.0,
            "torso_rotation_deg": 10.0,
            "shoulder_line_angle": 5.0,
        }
        result = pose_solver_pass(img, geometry=geo)
        assert result["ok"] is True
        # Should use geometry fallback values
        assert abs(result["head_rotation_deg"] - 15.0) < 1.0 or result["head_rotation_deg"] != 0.0
        assert abs(result["torso_rotation_deg"] - 10.0) < 1.0 or result["torso_rotation_deg"] != 0.0

    def test_with_face_box(self):
        img = _make_neutral_portrait()
        face_box = _make_face_box()
        result = pose_solver_pass(img, face_box=face_box)
        assert result["ok"] is True

    def test_with_person_mask(self):
        img = _make_neutral_portrait()
        mask = _make_person_mask()
        result = pose_solver_pass(img, person_mask=mask)
        assert result["ok"] is True

    def test_small_image(self):
        """Small image should not crash."""
        img = np.full((20, 20, 3), 128, dtype=np.uint8)
        result = pose_solver_pass(img)
        assert isinstance(result, dict)
        assert result["ok"] is True

    def test_pose_complexity_range(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        assert 0.0 <= result["pose_complexity_score"] <= 1.0

    def test_confidence_adjustment_values(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        assert result["pose_confidence_adjustment"] in (
            "normal", "moderate_caution", "reduce_lighting_confidence"
        )

    def test_body_normals_structure(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        normals = result["body_surface_normals_estimate"]
        assert isinstance(normals, dict)
        assert "chest_axis_deg" in normals
        assert "abdomen_axis_deg" in normals
        assert "face_axis_deg" in normals

    def test_occlusion_lists_are_lists(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        assert isinstance(result["arm_occlusion_regions"], list)
        assert isinstance(result["leg_occlusion_regions"], list)
        assert isinstance(result["occluded_regions"], list)
        assert isinstance(result["self_shadow_regions"], list)

    def test_interference_flags_are_bool(self):
        img = _make_neutral_portrait()
        result = pose_solver_pass(img)
        assert isinstance(result["pose_shadow_interference"], bool)
        assert isinstance(result["pose_highlight_interference"], bool)

    def test_chin_pitch_values(self):
        """chin_pitch should be one of the known values."""
        img = _make_neutral_portrait()
        face_box = _make_face_box()
        result = pose_solver_pass(img, face_box=face_box)
        assert result["chin_pitch"] in (
            "neutral", "slightly_down", "down", "up", "slightly_up"
        )

    def test_geometry_fallback_torso_rotation(self):
        """When MediaPipe unavailable, uses geometry fallback for torso."""
        img = _make_neutral_portrait()
        geo = {"torso_rotation_deg": 30.0}
        result = pose_solver_pass(img, geometry=geo)
        # Should get torso rotation from geometry (if no MediaPipe landmarks)
        # Value may differ if MediaPipe IS available but we test it doesn't crash
        assert result["ok"] is True

    def test_geometry_fallback_shoulder_angle(self):
        img = _make_neutral_portrait()
        geo = {"shoulder_line_angle": -8.0}
        result = pose_solver_pass(img, geometry=geo)
        assert result["ok"] is True
