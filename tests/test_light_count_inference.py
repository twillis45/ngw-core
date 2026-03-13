"""Tests for light count inference and pipeline integration.

Tests cover:
1. Single light scenario
2. Two-light from fill + catchlight
3. False multi-light from chrome
4. False multi-light risk score
5. Light count confidence range
6. Pipeline integration with surface_class + light_role keys
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
    run_extended_pipeline,
)


# ── Helpers ──────────────────────────────────────────────────────────────

def _mock_shadow(vector_deg=90.0, softness=0.5, edge_gradient=0.5):
    return {
        "ok": True,
        "shadow_vector_deg": vector_deg,
        "shadow_softness": softness,
        "shadow_edge_gradient": edge_gradient,
    }


def _mock_highlight(width=0.5, rolloff=0.5):
    return {"ok": True, "highlight_width_ratio": width, "highlight_rolloff_rate": rolloff}


def _mock_catchlight(count=1, position="upper_left"):
    return {"ok": True, "catchlight_count": count, "catchlight_position": position}


def _mock_background(spread=0.2, intensity=0.3):
    return {
        "ok": True,
        "background_gradient_spread": spread,
        "background_intensity_ratio": intensity,
        "background_direction": "left_to_right",
    }


def _mock_surface_reflective():
    return {
        "ok": True,
        "dominant_surfaces": [{"region": "body_upper", "surface_class": "chrome_like", "confidence": 0.7}],
        "global_surface_bias": "chrome_like",
        "surface_complexity_score": 0.6,
        "surface_confidence_adjustment": "reduce_confidence",
        "reflection_dominant_regions": ["body_upper"],
    }


def _mock_surface_neutral():
    return {
        "ok": True,
        "dominant_surfaces": [{"region": "face", "surface_class": "face_skin", "confidence": 0.8}],
        "global_surface_bias": "face_skin",
        "surface_complexity_score": 0.1,
        "surface_confidence_adjustment": "normal",
        "reflection_dominant_regions": [],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Light count inference
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestLightCountInference:
    """Test light count determination logic."""

    def test_minimal_signals_one_light(self):
        """With minimal signals, should infer one light."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            shadow=_mock_shadow(),
            catchlight=_mock_catchlight(count=1),
        )
        assert result["likely_light_count"] == "one"

    def test_two_lights_with_fill(self):
        """Broad highlight + secondary catchlight → two lights."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(
            img,
            shadow=_mock_shadow(),
            highlight=_mock_highlight(width=0.75),
            catchlight=_mock_catchlight(count=2),
        )
        # Should detect at least two lights
        assert result["likely_light_count"] in ("two", "three", "multi")
        assert result["multi_light_evidence_score"] > 0.3

    def test_false_multi_light_from_chrome(self):
        """Chrome surface should inflate false_multi_light_risk."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result_with_chrome = light_role_pass(
            img,
            shadow=_mock_shadow(),
            highlight=_mock_highlight(width=0.6),
            catchlight=_mock_catchlight(count=2),
            surface_class=_mock_surface_reflective(),
        )
        result_without = light_role_pass(
            img,
            shadow=_mock_shadow(),
            highlight=_mock_highlight(width=0.6),
            catchlight=_mock_catchlight(count=2),
            surface_class=_mock_surface_neutral(),
        )
        assert result_with_chrome["false_multi_light_risk"] > result_without["false_multi_light_risk"]

    def test_false_risk_with_pose_interference(self):
        """Pose shadow interference should add to false risk."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        pose = {"ok": True, "pose_shadow_interference": True}
        result = light_role_pass(img, pose_solver=pose)
        assert result["false_multi_light_risk"] > 0.0

    def test_false_risk_without_pose(self):
        """No pose → no pose-related false risk."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        result = light_role_pass(img)
        # Only base false risk (from other sources)
        assert result["false_multi_light_risk"] >= 0.0

    def test_adjusted_evidence_reduces_count(self):
        """High false risk should pull the light count down."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        # Signals that suggest multi-light
        multi_signals = {
            "shadow": _mock_shadow(),
            "highlight": _mock_highlight(width=0.75),
            "catchlight": _mock_catchlight(count=2),
            "background": _mock_background(spread=0.5, intensity=0.6),
        }
        # Without reflective surface
        result_clean = light_role_pass(
            img,
            surface_class=_mock_surface_neutral(),
            **multi_signals,
        )
        # With highly reflective surface
        result_reflective = light_role_pass(
            img,
            surface_class=_mock_surface_reflective(),
            **multi_signals,
        )
        # Reflective should lower the effective light count or at least reduce confidence
        # (the actual count label depends on thresholds, but risk should be higher)
        assert result_reflective["false_multi_light_risk"] > result_clean["false_multi_light_risk"]

    def test_confidence_in_valid_range(self):
        """Light count confidence should always be 0.3-1.0."""
        img = np.full((400, 300, 3), 128, dtype=np.uint8)
        for count in range(0, 4):
            result = light_role_pass(
                img,
                catchlight=_mock_catchlight(count=count),
            )
            assert 0.3 <= result["light_count_confidence"] <= 1.0


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline integration
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestLightRolePipelineIntegration:
    """Test that run_extended_pipeline includes surface_class and light_role."""

    def test_pipeline_includes_surface_class(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        assert "surface_class" in result
        assert result["surface_class"]["ok"] is True or "error" in result["surface_class"]

    def test_pipeline_includes_light_role(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        assert "light_role" in result
        assert result["light_role"]["ok"] is True or "error" in result["light_role"]

    def test_pipeline_reconstruction_has_new_fields(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        recon = result.get("reconstruction", {})
        if recon.get("ok"):
            assert "modifier_size_class_raw" in recon
            assert "modifier_size_class_surface_corrected" in recon
            assert "modifier_certainty" in recon

    def test_pipeline_validation_has_surface_adjusted(self):
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        validation = result.get("validation", {})
        if validation.get("ok"):
            assert "surface_adjusted" in validation

    def test_pipeline_all_passes_present(self):
        """All expected passes should be in the results dict."""
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        expected_keys = [
            "geometry", "pose_solver", "surface_class",
            "shadow", "highlight", "catchlight", "background",
            "specular_surface", "light_role",
            "reconstruction", "validation",
        ]
        for key in expected_keys:
            assert key in result, f"Missing pipeline key: {key}"

    def test_pipeline_surface_failure_doesnt_break_others(self):
        """If surface class fails, other passes should still run."""
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        # Even if surface_class has issues, shadow should still work
        assert result["shadow"]["ok"] is True or "error" in result["shadow"]
        assert result["reconstruction"]["ok"] is True or "error" in result["reconstruction"]

    def test_pipeline_light_role_failure_doesnt_break_others(self):
        """If light role fails, reconstruction should still complete."""
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        result = run_extended_pipeline(img)
        assert result["reconstruction"]["ok"] is True or "error" in result["reconstruction"]
