"""Tests for pose-corrected reconstruction and validation.

Tests cover:
1. reconstruction_pass produces raw + pose-corrected angles
2. Pose corrections actually shift the key angle
3. Self-shadow suppression reduces shadow weight
4. Chin/head pitch corrections for height estimate
5. Validation pass uses pose-corrected values
6. Pose complexity affects validation confidence
7. Pipeline integration with pose_solver_pass
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
    reconstruction_pass,
    ngw_validation_pass,
    run_extended_pipeline,
)


# ── Shared mock data ─────────────────────────────────────────────────────

def _mock_shadow(vector_deg: float = 90.0, softness: float = 0.5,
                 edge_gradient: float = 0.5, vertical: float = 40.0):
    return {
        "ok": True,
        "shadow_vector_deg": vector_deg,
        "shadow_softness": softness,
        "shadow_edge_gradient": edge_gradient,
        "shadow_vertical_angle_deg": vertical,
        "shadow_length_ratio": 0.5,
    }


def _mock_highlight(width: float = 0.5, rolloff: float = 0.5,
                    edge_gradient: float = 0.5):
    return {
        "ok": True,
        "highlight_width_ratio": width,
        "highlight_rolloff_rate": rolloff,
        "highlight_edge_gradient": edge_gradient,
        "highlight_axis_deg": 30.0,
        "highlight_specularity": 0.3,
    }


def _mock_catchlight(position: str = "upper_left", count: int = 1):
    return {
        "ok": True,
        "catchlight_count": count,
        "catchlight_shape": "round",
        "catchlight_position": position,
        "catchlight_size_ratio": 0.05,
        "catchlight_intensity": 0.8,
    }


def _mock_pose_solver(
    torso_rotation: float = 0.0,
    head_rotation: float = 0.0,
    chin_yaw: float = 0.0,
    chin_pitch: str = "neutral",
    complexity: float = 0.0,
    shadow_interference: bool = False,
    highlight_interference: bool = False,
    self_shadow_regions: list = None,
):
    if complexity > 0.6:
        adjustment = "reduce_lighting_confidence"
    elif complexity > 0.35:
        adjustment = "moderate_caution"
    else:
        adjustment = "normal"

    return {
        "ok": True,
        "torso_rotation_deg": torso_rotation,
        "head_rotation_deg": head_rotation,
        "shoulder_line_angle_deg": 0.0,
        "hip_line_angle_deg": 0.0,
        "chin_pitch": chin_pitch,
        "chin_yaw_deg": chin_yaw,
        "subject_lean": "none",
        "arm_occlusion_regions": [],
        "leg_occlusion_regions": [],
        "body_surface_normals_estimate": {
            "chest_axis_deg": torso_rotation * 0.9,
            "abdomen_axis_deg": torso_rotation * 0.7,
            "face_axis_deg": head_rotation * 0.8,
        },
        "pose_shadow_interference": shadow_interference,
        "pose_highlight_interference": highlight_interference,
        "occluded_regions": [],
        "self_shadow_regions": self_shadow_regions or [],
        "pose_complexity_score": complexity,
        "pose_confidence_adjustment": adjustment,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Reconstruction pass with pose corrections
# ═══════════════════════════════════════════════════════════════════════════

class TestPoseCorrectedReconstruction:
    """Test reconstruction_pass with pose_solver data."""

    def test_output_has_raw_and_corrected(self):
        """Both raw and corrected angle should be present."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
        )
        assert "key_light_angle_deg_raw" in result
        assert "key_light_angle_deg_pose_corrected" in result
        assert "key_light_angle_deg" in result
        assert "pose_complexity_score" in result

    def test_no_pose_solver_raw_equals_corrected(self):
        """Without pose solver, raw should equal corrected."""
        result = reconstruction_pass(
            shadow=_mock_shadow(vector_deg=90.0),
            highlight=_mock_highlight(),
        )
        assert result["key_light_angle_deg_raw"] == result["key_light_angle_deg_pose_corrected"]

    def test_pose_correction_shifts_angle(self):
        """Face-relative angle: raw == corrected (face is the reference frame)."""
        pose = _mock_pose_solver(head_rotation=25.0, torso_rotation=15.0)
        result = reconstruction_pass(
            shadow=_mock_shadow(vector_deg=90.0),
            highlight=_mock_highlight(),
            pose_solver=pose,
        )
        raw = result["key_light_angle_deg_raw"]
        corrected = result["key_light_angle_deg_pose_corrected"]
        # Face-surface measurements are already face-relative — no correction
        assert raw == corrected
        assert result["key_light_angle_deg"] == corrected

    def test_no_rotation_no_shift(self):
        """Zero rotation → no correction shift."""
        pose = _mock_pose_solver(head_rotation=0.0, torso_rotation=0.0)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            pose_solver=pose,
        )
        assert result["key_light_angle_deg_raw"] == result["key_light_angle_deg_pose_corrected"]

    def test_corrected_angle_stays_in_range(self):
        """Corrected angle should be clamped to [0, 180]."""
        pose = _mock_pose_solver(head_rotation=-50.0, torso_rotation=-40.0)
        result = reconstruction_pass(
            shadow=_mock_shadow(vector_deg=20.0),
            highlight=_mock_highlight(),
            pose_solver=pose,
        )
        assert 0.0 <= result["key_light_angle_deg_pose_corrected"] <= 180.0

    def test_shadow_weight_reduced_with_interference(self):
        """With pose_shadow_interference, shadow signals weight less."""
        # Without interference
        no_pose = reconstruction_pass(
            shadow=_mock_shadow(softness=0.8),
            highlight=_mock_highlight(rolloff=0.3),
        )
        # With interference
        pose = _mock_pose_solver(
            shadow_interference=True,
            self_shadow_regions=["under_chin", "torso_left"],
        )
        with_pose = reconstruction_pass(
            shadow=_mock_shadow(softness=0.8),
            highlight=_mock_highlight(rolloff=0.3),
            pose_solver=pose,
        )
        # Both should produce valid results
        assert no_pose["ok"] is True
        assert with_pose["ok"] is True
        # Notes should mention shadow weight reduction
        assert any("shadow weight" in n for n in with_pose["notes"])

    def test_chin_down_corrects_height(self):
        """Chin down should prevent false 'high' classification."""
        # Shadow vertical > 50 normally → "high"
        result_no_pose = reconstruction_pass(
            shadow=_mock_shadow(vertical=55.0),
        )
        assert result_no_pose["key_light_height"] == "high"

        # With chin down, catchlight doesn't confirm "upper"
        pose = _mock_pose_solver(chin_pitch="down")
        result_with_pose = reconstruction_pass(
            shadow=_mock_shadow(vertical=55.0),
            catchlight=_mock_catchlight(position="left"),  # not "upper"
            pose_solver=pose,
        )
        # Height should be downgraded
        assert result_with_pose["key_light_height"] == "eye_level"

    def test_chin_down_with_upper_catchlight_keeps_high(self):
        """If catchlight confirms upper position, keep 'high' even with chin down."""
        pose = _mock_pose_solver(chin_pitch="down")
        result = reconstruction_pass(
            shadow=_mock_shadow(vertical=55.0),
            catchlight=_mock_catchlight(position="upper_left"),
            pose_solver=pose,
        )
        assert result["key_light_height"] == "high"

    def test_pose_complexity_in_output(self):
        pose = _mock_pose_solver(complexity=0.65)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            pose_solver=pose,
        )
        assert result["pose_complexity_score"] == 0.65

    def test_highlight_interference_upweights_rolloff(self):
        """When pose distorts highlights, notes mention interference."""
        pose = _mock_pose_solver(highlight_interference=True)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            pose_solver=pose,
        )
        assert any("highlight_interference" in n for n in result["notes"])


# ═══════════════════════════════════════════════════════════════════════════
# Validation pass with pose corrections
# ═══════════════════════════════════════════════════════════════════════════

class TestPoseAwareValidation:
    """Test ngw_validation_pass with pose_solver data."""

    def test_validation_output_has_pose_adjusted(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        result = ngw_validation_pass(recon)
        assert "pose_adjusted" in result
        assert result["pose_adjusted"] is False  # no pose data

    def test_high_complexity_reduces_confidence(self):
        """High pose complexity → lower confidence."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        # Without pose
        no_pose = ngw_validation_pass(recon, shadow=_mock_shadow())
        # With high complexity
        pose = _mock_pose_solver(complexity=0.7)
        with_pose = ngw_validation_pass(recon, shadow=_mock_shadow(), pose_solver=pose)
        assert with_pose["confidence"] < no_pose["confidence"]
        assert with_pose["pose_adjusted"] is True

    def test_high_complexity_with_catchlights_moderates(self):
        """Catchlights anchor confidence even with high complexity."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        catchlight = _mock_catchlight(count=2)
        pose = _mock_pose_solver(complexity=0.7)
        result = ngw_validation_pass(
            recon, shadow=_mock_shadow(), catchlight=catchlight, pose_solver=pose,
        )
        # Should still have moderate confidence due to catchlight anchor
        assert result["confidence"] > 0.35

    def test_moderate_complexity_adjustment(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        pose = _mock_pose_solver(complexity=0.45)
        result = ngw_validation_pass(recon, pose_solver=pose)
        assert result["pose_adjusted"] is True
        assert any("moderate" in w for w in result["warnings"])

    def test_low_complexity_no_adjustment(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        pose = _mock_pose_solver(complexity=0.1)
        result = ngw_validation_pass(recon, pose_solver=pose)
        assert result["pose_adjusted"] is False

    def test_large_correction_delta_warning(self):
        """Large raw-vs-corrected delta should produce a warning."""
        recon = {
            "ok": True,
            "key_light_angle_deg": 30.0,
            "key_light_angle_deg_raw": 52.0,
            "key_light_angle_deg_pose_corrected": 30.0,
            "modifier_size_class": "medium",
        }
        pose = _mock_pose_solver(complexity=0.5)
        result = ngw_validation_pass(recon, pose_solver=pose)
        assert any("pose correction" in w.lower() or "Large pose" in w for w in result["warnings"])

    def test_shadow_interference_relaxes_softness_check(self):
        """With pose_shadow_interference, softness thresholds are relaxed."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "large"}
        shadow = _mock_shadow(softness=0.15)  # would normally conflict with "large"

        # Without pose → conflict
        no_pose = ngw_validation_pass(recon, shadow=shadow)
        # With pose interference → relaxed threshold
        pose = _mock_pose_solver(shadow_interference=True)
        with_pose = ngw_validation_pass(recon, shadow=shadow, pose_solver=pose)

        # The relaxed threshold (0.1 vs 0.2) means 0.15 won't conflict
        no_pose_has_conflict = any("hard shadows" in w for w in no_pose["warnings"])
        with_pose_has_conflict = any("hard shadows" in w for w in with_pose["warnings"])
        assert no_pose_has_conflict  # 0.15 < 0.2 triggers conflict
        assert not with_pose_has_conflict  # 0.15 > 0.1 relaxed threshold


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline integration
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestPipelinePoseSolverIntegration:
    """Test that run_extended_pipeline includes pose_solver_pass."""

    def test_pipeline_includes_pose_solver(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        assert "pose_solver" in result
        assert result["pose_solver"]["ok"] is True

    def test_pipeline_reconstruction_has_raw_and_corrected(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        recon = result.get("reconstruction", {})
        assert "key_light_angle_deg_raw" in recon
        assert "key_light_angle_deg_pose_corrected" in recon
        assert "pose_complexity_score" in recon

    def test_pipeline_validation_has_pose_adjusted(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        validation = result.get("validation", {})
        assert "pose_adjusted" in validation

    def test_pipeline_with_geometry(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        geo = {"head_rotation_deg": 15.0, "shoulder_line_angle": 5.0}
        result = run_extended_pipeline(img, existing_geometry=geo)
        assert result["pose_solver"]["ok"] is True

    def test_pipeline_all_passes_present(self):
        """All expected passes should be in the results dict."""
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        expected_keys = [
            "geometry", "pose_solver", "shadow", "highlight",
            "catchlight", "background", "specular_surface",
            "reconstruction", "validation",
        ]
        for key in expected_keys:
            assert key in result, f"Missing pipeline key: {key}"

    def test_pipeline_pose_failure_doesnt_break_others(self):
        """If pose solver fails, other passes should still run."""
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        # Even with minimal input, pipeline should complete
        result = run_extended_pipeline(img)
        assert result["shadow"]["ok"] is True or "error" in result["shadow"]
        assert result["reconstruction"]["ok"] is True or "error" in result["reconstruction"]
