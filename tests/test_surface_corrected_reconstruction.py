"""Tests for surface-corrected reconstruction and validation.

Tests cover:
1. reconstruction_pass with surface_class data
2. Raw vs surface-corrected modifier size
3. Surface corrections shift modifier size
4. Modifier certainty based on complexity
5. No surface = raw equals corrected
6. Light role overrides in reconstruction
7. Validation with surface complexity
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


def _mock_surface_class(
    bias: str = "face_skin",
    complexity: float = 0.1,
    reflection_regions: list = None,
):
    return {
        "ok": True,
        "dominant_surfaces": [
            {"region": "face", "surface_class": bias, "confidence": 0.8},
        ],
        "global_surface_bias": bias,
        "surface_complexity_score": complexity,
        "surface_confidence_adjustment": "normal" if complexity < 0.3 else "moderate_caution",
        "reflection_dominant_regions": reflection_regions or [],
    }


def _mock_light_role(
    count: str = "one",
    fill_present: bool = False,
    fill_conf: float = 0.0,
    bg_present: bool = False,
    bg_conf: float = 0.0,
    false_risk: float = 0.0,
):
    roles = {
        "key": {"present": True, "confidence": 0.9, "evidence": ["shadow_vector"]},
        "fill": {"present": fill_present, "confidence": fill_conf, "evidence": []},
        "negative_fill": {"present": False, "confidence": 0.0, "evidence": []},
        "rim": {"present": False, "confidence": 0.0, "evidence": []},
        "kicker": {"present": False, "confidence": 0.0, "evidence": []},
        "background": {"present": bg_present, "confidence": bg_conf, "evidence": []},
        "bounce": {"present": False, "confidence": 0.0, "evidence": []},
        "unknown_secondary": {"present": False, "confidence": 0.0, "evidence": []},
    }
    return {
        "ok": True,
        "likely_light_count": count,
        "light_count_confidence": 0.7,
        "roles": roles,
        "multi_light_evidence_score": 0.3,
        "false_multi_light_risk": false_risk,
        "light_role_notes": [],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Reconstruction with surface corrections
# ═══════════════════════════════════════════════════════════════════════════

class TestSurfaceCorrectedReconstruction:
    """Test reconstruction_pass with surface_class data."""

    def test_output_has_surface_fields(self):
        """Surface-related fields should be present."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            surface_class=_mock_surface_class(),
        )
        assert "modifier_size_class_raw" in result
        assert "modifier_size_class_surface_corrected" in result
        assert "modifier_certainty" in result
        assert "surface_complexity_score_from_surface" in result

    def test_no_surface_raw_equals_corrected(self):
        """Without surface data, raw should equal corrected."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
        )
        assert result["modifier_size_class_raw"] == result["modifier_size_class_surface_corrected"]

    def test_face_skin_no_correction(self):
        """Face skin has zero corrections → raw == corrected."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            surface_class=_mock_surface_class(bias="face_skin"),
        )
        assert result["modifier_size_class_raw"] == result["modifier_size_class_surface_corrected"]

    def test_satin_may_shift_modifier(self):
        """Satin correction can shift modifier size."""
        # Satin has negative highlight_width correction and positive rolloff
        # This shifts avg_softness, potentially changing the size class
        result = reconstruction_pass(
            shadow=_mock_shadow(softness=0.45, edge_gradient=0.4),
            highlight=_mock_highlight(rolloff=0.5),
            surface_class=_mock_surface_class(bias="satin_silk"),
        )
        assert result["ok"] is True
        # Check that both raw and corrected are present
        assert result["modifier_size_class_raw"] is not None
        assert result["modifier_size_class_surface_corrected"] is not None

    def test_high_complexity_low_certainty(self):
        """High surface complexity → low modifier certainty."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            surface_class=_mock_surface_class(complexity=0.7),
        )
        assert result["modifier_certainty"] == "low"

    def test_moderate_complexity_moderate_certainty(self):
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            surface_class=_mock_surface_class(complexity=0.4),
        )
        assert result["modifier_certainty"] == "moderate"

    def test_low_complexity_high_certainty(self):
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            surface_class=_mock_surface_class(complexity=0.1),
        )
        assert result["modifier_certainty"] == "high"

    def test_no_surface_none_complexity(self):
        """Without surface data, complexity field should be None."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
        )
        assert result["surface_complexity_score_from_surface"] is None

    def test_reflection_dominant_note(self):
        """Reflection-dominant surface should produce a note."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            surface_class=_mock_surface_class(bias="chrome_like"),
        )
        assert any("reflection-dominant" in n for n in result["notes"])

    def test_light_role_fields(self):
        """Light role data should appear in reconstruction output."""
        lr = _mock_light_role(count="two", fill_present=True, fill_conf=0.8)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(),
            light_role=lr,
        )
        assert result["likely_light_count"] == "two"
        assert result["light_roles"] is not None
        assert result["light_role_notes"] is not None

    def test_no_light_role_null_fields(self):
        """Without light role data, fields should be None."""
        result = reconstruction_pass(
            shadow=_mock_shadow(),
        )
        assert result["likely_light_count"] is None
        assert result["light_roles"] is None

    def test_light_role_upgrades_fill(self):
        """Light role with high fill confidence should upgrade fill_present."""
        lr = _mock_light_role(fill_present=True, fill_conf=0.8)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            highlight=_mock_highlight(width=0.4),  # width not high enough for fill alone
            light_role=lr,
        )
        assert result["fill_present"] is True
        assert any("fill upgraded" in n for n in result["notes"])

    def test_light_role_confirms_bg_light(self):
        """Light role with high bg confidence should confirm background light."""
        lr = _mock_light_role(bg_present=True, bg_conf=0.8)
        result = reconstruction_pass(
            shadow=_mock_shadow(),
            light_role=lr,
        )
        assert result["background_light"] is True
        assert any("background_light confirmed" in n for n in result["notes"])


# ═══════════════════════════════════════════════════════════════════════════
# Validation with surface awareness
# ═══════════════════════════════════════════════════════════════════════════

class TestSurfaceAwareValidation:
    """Test ngw_validation_pass with surface_class data."""

    def test_output_has_surface_adjusted(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        result = ngw_validation_pass(recon)
        assert "surface_adjusted" in result
        assert result["surface_adjusted"] is False

    def test_high_complexity_reduces_confidence(self):
        """High surface complexity → lower confidence."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        no_surface = ngw_validation_pass(recon, shadow=_mock_shadow())
        with_surface = ngw_validation_pass(
            recon, shadow=_mock_shadow(),
            surface_class=_mock_surface_class(complexity=0.7),
        )
        assert with_surface["confidence"] < no_surface["confidence"]
        assert with_surface["surface_adjusted"] is True

    def test_moderate_complexity_adjustment(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        result = ngw_validation_pass(
            recon, surface_class=_mock_surface_class(complexity=0.4),
        )
        assert result["surface_adjusted"] is True

    def test_low_complexity_no_adjustment(self):
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        result = ngw_validation_pass(
            recon, surface_class=_mock_surface_class(complexity=0.1),
        )
        assert result["surface_adjusted"] is False

    def test_reflection_dominant_warning(self):
        """Reflection-dominant regions should produce a warning."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        result = ngw_validation_pass(
            recon,
            surface_class=_mock_surface_class(
                bias="chrome_like",
                complexity=0.5,
                reflection_regions=["body_upper"],
            ),
        )
        assert any("reflection-dominant" in w for w in result["warnings"])

    def test_light_role_fill_conflict(self):
        """Fill detected but light count one → conflict warning."""
        recon = {
            "ok": True, "key_light_angle_deg": 45.0,
            "modifier_size_class": "medium", "fill_present": True,
        }
        lr = _mock_light_role(count="one")
        result = ngw_validation_pass(recon, light_role=lr)
        assert any("fill detected but light count is one" in w for w in result["warnings"])

    def test_high_false_risk_warning(self):
        """High false multi-light risk degrades confidence."""
        recon = {"ok": True, "key_light_angle_deg": 45.0, "modifier_size_class": "medium"}
        lr = _mock_light_role(false_risk=0.7)
        result = ngw_validation_pass(recon, light_role=lr)
        assert any("false multi-light risk" in w for w in result["warnings"])
