"""Integration tests for the upgraded v2 vision pipeline.

Covers:
1. Full pipeline returns all new pass keys
2. Backward compatibility: existing keys still present
3. results["light_role"] aliases results["hypothesis"]
4. Graceful degradation when individual passes fail
5. Reconstruction receives and uses new v2 inputs
6. Validation receives hypothesis/physics/environment
7. Lighting knowledge library integrated into pipeline
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
    run_extended_pipeline,
    reconstruction_pass,
    ngw_validation_pass,
    light_direction_field_pass,
    inverse_square_solver_pass,
    solar_geometry_pass,
    window_geometry_pass,
    bounce_geometry_pass,
    reflection_geometry_pass,
    shadow_penumbra_pass,
    occlusion_shadow_pass,
    color_temperature_pass,
    environment_light_pass,
    modifier_shape_solver_pass,
    lighting_hypothesis_engine,
    physics_consistency_engine,
)


# ── Shared helpers ────────────────────────────────────────────────────

def _make_test_image(w: int = 300, h: int = 400) -> np.ndarray:
    """Create a simple test image with a light gradient."""
    img = np.full((h, w, 3), 128, dtype=np.uint8)
    # Add a gradient from left (bright) to right (dark) to simulate light
    for x in range(w):
        val = int(200 - (x / w) * 140)
        img[:, x, :] = val
    return img


def _make_person_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 6: 5 * h // 6, w // 4: 3 * w // 4] = True
    return mask


def _make_skin_mask(w: int = 300, h: int = 400) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    mask[h // 8: h // 3, w // 3: 2 * w // 3] = True
    return mask


def _make_face_box(w: int = 300, h: int = 400):
    fx = w // 4
    fy = h // 8
    return (fx, fy, w - fx, h // 3)


def _mock_shadow(**overrides):
    base = {
        "ok": True,
        "shadow_vector_deg": 90.0,
        "shadow_softness": 0.5,
        "shadow_edge_gradient": 0.5,
    }
    base.update(overrides)
    return base


def _mock_highlight(**overrides):
    base = {
        "ok": True,
        "highlight_width_ratio": 0.5,
        "highlight_rolloff_rate": 0.5,
        "highlight_axis_deg": 30.0,
    }
    base.update(overrides)
    return base


def _mock_catchlight(**overrides):
    base = {
        "ok": True,
        "catchlight_count": 1,
        "catchlight_position": "upper_left",
        "catchlight_shape": "round",
        "catchlight_size_ratio": 0.03,
    }
    base.update(overrides)
    return base


def _mock_background(**overrides):
    base = {
        "ok": True,
        "background_gradient_spread": 0.2,
        "background_intensity_ratio": 0.3,
        "background_direction": "left_to_right",
    }
    base.update(overrides)
    return base


def _mock_specular(**overrides):
    base = {
        "ok": True,
        "specular_highlight_spread": 0.3,
    }
    base.update(overrides)
    return base


def _mock_reconstruction(**overrides):
    base = {
        "ok": True,
        "key_light_angle_deg_raw": 45.0,
        "key_light_angle_deg_pose_corrected": 42.0,
        "key_light_angle_deg": 42.0,
        "key_light_height": "above_eye_level",
        "modifier_size_class": "medium",
        "modifier_size_class_raw": "medium",
        "modifier_size_class_surface_corrected": "medium",
        "modifier_certainty": "moderate",
        "modifier_distance_ft": 5.0,
        "fill_present": True,
        "negative_fill": False,
        "background_light": False,
        "background_distance_ft": 8.0,
        "camera_height_relative_to_subject": "eye_level",
        "pose_complexity_score": 0.2,
        "likely_light_count": 2,
        "light_roles": None,
        "light_role_notes": None,
        "notes": [],
    }
    base.update(overrides)
    return base


# ══════════════════════════════════════════════════════════════════════
# INDIVIDUAL NEW PASS TESTS
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestLightDirectionFieldPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = light_direction_field_pass(
            img, person_mask=_make_person_mask(), face_box=_make_face_box(),
        )
        assert result["ok"] is True
        assert "dominant_light_vector_deg" in result
        assert "vector_consistency" in result
        assert 0.0 <= result["vector_consistency"] <= 1.0

    def test_without_masks(self):
        img = _make_test_image()
        result = light_direction_field_pass(img)
        assert result["ok"] is True


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestInverseSquareSolverPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = inverse_square_solver_pass(
            img, person_mask=_make_person_mask(), face_box=_make_face_box(),
        )
        assert result["ok"] is True
        assert "distance_estimate_ft" in result
        assert "distance_class" in result
        assert result["distance_class"] in ("near", "medium", "far")


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestSolarGeometryPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = solar_geometry_pass(img, shadow=_mock_shadow())
        assert result["ok"] is True
        assert "sun_candidate" in result
        assert "parallel_shadow_score" in result


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestWindowGeometryPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = window_geometry_pass(img)
        assert result["ok"] is True
        assert "window_candidate" in result
        assert "gradient_directionality" in result


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestBounceGeometryPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = bounce_geometry_pass(img, face_box=_make_face_box())
        assert result["ok"] is True
        assert "bounce_sources" in result
        assert isinstance(result["bounce_sources"], list)


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestReflectionGeometryPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = reflection_geometry_pass(img)
        assert result["ok"] is True
        assert "reflection_count" in result
        assert "dominant_reflection_shape" in result


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestShadowPenumbraPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = shadow_penumbra_pass(
            img, shadow=_mock_shadow(),
            person_mask=_make_person_mask(), face_box=_make_face_box(),
        )
        assert "ok" in result
        # Even if analysis finds no edges, the pass should return structured output
        if result["ok"]:
            assert "apparent_source_size" in result
            assert result["apparent_source_size"] in (
                "point", "small", "medium", "large", "very_large",
            )

    def test_without_mask_returns_error(self):
        """Penumbra pass requires mask or face_box."""
        img = _make_test_image()
        result = shadow_penumbra_pass(img)
        assert result["ok"] is False


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestOcclusionShadowPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = occlusion_shadow_pass(img, shadow=_mock_shadow())
        assert result["ok"] is True
        assert "occlusion_detected" in result
        assert "occlusion_type" in result


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestColorTemperaturePass:
    def test_basic_output(self):
        img = _make_test_image()
        result = color_temperature_pass(img)
        assert result["ok"] is True
        assert "dominant_cct_kelvin" in result
        assert "mixed_lighting" in result


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestEnvironmentLightPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = environment_light_pass(img)
        assert result["ok"] is True
        assert "environment_class" in result
        assert result["environment_class"] in (
            "studio", "window_light", "direct_sun", "overcast",
            "shade", "mixed", "unknown",
        )

    def test_with_upstream_passes(self):
        img = _make_test_image()
        solar = {"ok": True, "sun_candidate": True, "parallel_shadow_score": 0.8, "color_warmth_score": 0.7}
        window = {"ok": True, "window_candidate": False, "gradient_directionality": 0.3}
        bounce = {"ok": True, "bounce_fill_ratio": 0.2}
        ct = {"ok": True, "dominant_cct_kelvin": 5500, "mixed_lighting": False}
        result = environment_light_pass(
            img, solar=solar, window=window, bounce=bounce, color_temp=ct,
        )
        assert result["ok"] is True


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestModifierShapeSolverPass:
    def test_basic_output(self):
        img = _make_test_image()
        result = modifier_shape_solver_pass(img, face_box=_make_face_box())
        assert result["ok"] is True
        assert "primary_modifier" in result
        assert "modifier_candidates" in result


class TestLightingHypothesisEngine:
    def test_basic_output(self):
        result = lighting_hypothesis_engine(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
            catchlight=_mock_catchlight(),
        )
        assert result["ok"] is True
        assert "hypotheses" in result
        assert isinstance(result["hypotheses"], list)
        assert len(result["hypotheses"]) >= 1
        # Backward compat keys
        assert "likely_light_count" in result
        assert "light_count_confidence" in result
        assert "roles" in result
        assert "multi_light_evidence_score" in result
        assert "false_multi_light_risk" in result

    def test_backward_compat_keys_present(self):
        result = lighting_hypothesis_engine(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
        )
        # These keys must exist for backward compat with light_role_pass consumers
        for key in ("likely_light_count", "light_count_confidence",
                     "roles", "multi_light_evidence_score",
                     "false_multi_light_risk", "light_role_notes"):
            assert key in result, f"Missing backward compat key: {key}"


class TestPhysicsConsistencyEngine:
    def test_basic_output(self):
        hyps = [{"lights": [{"role": "key", "direction_deg": 45}], "confidence": 0.8}]
        result = physics_consistency_engine(
            hypotheses=hyps, shadow=_mock_shadow(),
        )
        assert result["ok"] is True
        assert "scored_hypotheses" in result
        assert "best_physics_score" in result
        assert 0.0 <= result["best_physics_score"] <= 1.0

    def test_no_hypotheses(self):
        result = physics_consistency_engine(hypotheses=None)
        assert result["ok"] is True
        assert result["best_physics_score"] == 0.5


# ══════════════════════════════════════════════════════════════════════
# RECONSTRUCTION V2 ENHANCEMENT TESTS
# ══════════════════════════════════════════════════════════════════════

class TestReconstructionV2:
    """Test that reconstruction_pass handles new v2 inputs."""

    def test_new_kwargs_default_none(self):
        """Existing callers that don't supply new kwargs should still work."""
        result = reconstruction_pass(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
            catchlight=_mock_catchlight(),
        )
        assert result["ok"] is True
        # V2 keys present but None/default
        assert "environment_class" in result
        assert "physics_score" in result

    def test_inverse_square_refines_distance(self):
        isq = {"ok": True, "distance_estimate_ft": 3.0, "distance_class": "near"}
        result = reconstruction_pass(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
            inverse_square=isq,
        )
        assert result["ok"] is True
        assert result["distance_class"] == "near"
        assert result["estimated_source_distance_ft"] < 5.0  # should be refined

    def test_environment_upgrades_modifier(self):
        env = {"ok": True, "environment_class": "window_light", "environment_confidence": 0.8}
        result = reconstruction_pass(
            shadow=_mock_shadow(softness=0.5),
            highlight=_mock_highlight(),
            environment=env,
        )
        assert result["ok"] is True
        assert result["environment_class"] == "window_light"

    def test_mixed_cct_flagged(self):
        ct = {"ok": True, "mixed_lighting": True, "dominant_cct_kelvin": 4500, "cct_spread_kelvin": 2000}
        result = reconstruction_pass(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
            color_temp=ct,
        )
        assert result["ok"] is True
        assert result["mixed_lighting"] is True
        assert result["dominant_cct_kelvin"] == 4500

    def test_v2_keys_in_output(self):
        result = reconstruction_pass(
            shadow=_mock_shadow(), highlight=_mock_highlight(),
        )
        v2_keys = [
            "light_direction_consistency", "estimated_source_distance_ft",
            "distance_class", "environment_class", "sun_candidate",
            "window_candidate", "occlusion_detected", "dominant_cct_kelvin",
            "mixed_lighting", "modifier_candidates", "primary_modifier_hypothesis",
            "hypotheses", "best_hypothesis", "physics_score", "physics_violations",
        ]
        for key in v2_keys:
            assert key in result, f"Missing v2 key: {key}"


# ══════════════════════════════════════════════════════════════════════
# VALIDATION V2 ENHANCEMENT TESTS
# ══════════════════════════════════════════════════════════════════════

class TestValidationV2:
    def test_new_kwargs_default_none(self):
        """Existing callers without v2 kwargs still work."""
        result = ngw_validation_pass(
            reconstruction=_mock_reconstruction(),
            shadow=_mock_shadow(),
        )
        assert result["ok"] is True
        assert "confidence" in result

    def test_physics_high_boosts_confidence(self):
        physics = {"ok": True, "best_physics_score": 0.85, "violation_summary": []}
        result = ngw_validation_pass(
            reconstruction=_mock_reconstruction(),
            physics=physics,
        )
        assert result["ok"] is True
        # Should have higher confidence from physics
        assert result["confidence"] > 0.4

    def test_physics_low_warns(self):
        physics = {"ok": True, "best_physics_score": 0.2, "violation_summary": ["shadow_mismatch"]}
        result = ngw_validation_pass(
            reconstruction=_mock_reconstruction(),
            physics=physics,
        )
        assert any("physics" in w for w in result["warnings"])

    def test_environment_unknown_warns(self):
        env = {"ok": True, "environment_class": "unknown", "environment_confidence": 0.3}
        result = ngw_validation_pass(
            reconstruction=_mock_reconstruction(),
            environment=env,
        )
        assert any("environment" in w for w in result["warnings"])

    def test_hypothesis_count_disagreement(self):
        hyp = {"ok": True, "likely_light_count": 3}
        recon = _mock_reconstruction(likely_light_count=1)
        result = ngw_validation_pass(
            reconstruction=recon,
            hypothesis=hyp,
        )
        assert any("light count disagreement" in w for w in result["warnings"])


# ══════════════════════════════════════════════════════════════════════
# FULL PIPELINE INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestRunExtendedPipelineV2:
    def test_all_pass_keys_present(self):
        img = _make_test_image()
        results = run_extended_pipeline(
            img, person_mask=_make_person_mask(),
            skin_mask=_make_skin_mask(),
            face_box=_make_face_box(),
        )
        expected_keys = [
            # Existing passes
            "geometry", "pose_solver", "surface_class", "shadow",
            "highlight", "catchlight", "background", "specular_surface",
            # New signal passes
            "light_direction_field", "inverse_square", "solar", "window",
            "bounce", "reflection", "penumbra", "occlusion",
            "color_temp", "environment",
            # New synthesis passes
            "modifier_shape", "hypothesis", "physics",
            # Enhanced existing
            "reconstruction", "lighting_knowledge", "validation",
            # Backward compat alias
            "light_role",
        ]
        for key in expected_keys:
            assert key in results, f"Missing pipeline key: {key}"

    def test_light_role_aliases_hypothesis(self):
        img = _make_test_image()
        results = run_extended_pipeline(img, face_box=_make_face_box())
        assert results["light_role"] is results["hypothesis"]

    def test_existing_keys_unchanged(self):
        """Reconstruction output retains all original keys."""
        img = _make_test_image()
        results = run_extended_pipeline(img, face_box=_make_face_box())
        recon = results.get("reconstruction", {})
        if recon.get("ok"):
            original_keys = [
                "key_light_angle_deg_raw", "key_light_angle_deg_pose_corrected",
                "key_light_angle_deg", "key_light_height",
                "modifier_size_class", "modifier_distance_ft",
                "fill_present", "negative_fill", "background_light",
            ]
            for key in original_keys:
                assert key in recon, f"Missing original recon key: {key}"

    def test_graceful_degradation(self):
        """Pipeline completes even with minimal input (no masks)."""
        img = _make_test_image()
        results = run_extended_pipeline(img)
        assert "reconstruction" in results
        assert "validation" in results

    def test_lighting_knowledge_in_pipeline(self):
        img = _make_test_image()
        results = run_extended_pipeline(img, face_box=_make_face_box())
        lk = results.get("lighting_knowledge", {})
        if lk.get("ok"):
            assert "pattern_matches" in lk
            assert "top_pattern" in lk
            assert "master_reference" in lk
