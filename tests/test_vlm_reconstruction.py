"""Tests for engine/vlm_reconstruction.py — VLM reconstruction layer.

Tests cover:
- Signal serialization (pipeline results → JSON)
- Response parsing (VLM JSON → Pydantic models)
- Public API (vlm_reconstruct with mocked VLM calls)
- Edge cases (empty inputs, malformed responses, VLM unavailable)
"""
from __future__ import annotations

import json
from typing import Any, Dict
from unittest import mock

import pytest

from engine.image_analysis_models import (
    VLMReconstruction,
    VLMReconPrimary,
    VLMReconCandidate,
    VLMReconModifierCandidate,
    VLMReconRole,
    VLMReconRoles,
)
from engine.vlm_reconstruction import (
    serialize_pipeline_signals,
    parse_vlm_reconstruction,
    vlm_reconstruct,
    _parse_roles,
    _parse_modifier_candidates,
    _parse_primary,
    _parse_candidate,
    _sanitize_for_json,
)


# ── Test fixtures ─────────────────────────────────────────────────────────

def _make_pipeline_results() -> Dict[str, Any]:
    """Minimal pipeline results with representative data."""
    return {
        "geometry": {"ok": True, "face_detected": True},
        "pose_solver": {
            "ok": True,
            "head_rotation_deg": 15.0,
            "torso_rotation_deg": 5.0,
        },
        "surface_class": {"ok": True, "dominant_surface": "skin"},
        "shadow": {
            "ok": True,
            "shadow_angle_deg": 45.0,
            "shadow_softness": 0.4,
            "shadow_coverage_pct": 35.0,
        },
        "highlight": {
            "ok": True,
            "highlight_centroid_x": 0.4,
            "highlight_axis_deg": 40.0,
        },
        "catchlight": {
            "ok": True,
            "catchlight_count": 1,
            "catchlight_shapes": ["octagonal"],
            "catchlight_position_clock": "1_oclock",
        },
        "background": {"ok": True, "background_brightness": 0.15},
        "specular_surface": {"ok": True, "specular_coverage_pct": 5.0},
        "light_direction_field": {
            "ok": True,
            "dominant_light_vector_deg": 42.0,
            "vector_consistency": 0.85,
        },
        "inverse_square": {
            "ok": True,
            "distance_estimate_ft": 5.5,
            "distance_class": "medium",
        },
        "solar": {"ok": True, "sun_candidate": False},
        "window": {"ok": True, "window_candidate": False},
        "bounce": {"ok": True, "bounce_fill_ratio": 0.1},
        "reflection": {"ok": True, "reflection_count": 1},
        "penumbra": {
            "ok": True,
            "apparent_source_size": "medium",
            "penumbra_width_ratio": 0.12,
        },
        "occlusion": {"ok": True, "occlusion_detected": False},
        "color_temp": {
            "ok": True,
            "dominant_cct_kelvin": 5500,
            "mixed_lighting": False,
        },
        "environment": {
            "ok": True,
            "environment_class": "studio",
            "environment_confidence": 0.88,
        },
        "modifier_shape": {
            "ok": True,
            "primary_modifier": "octa",
            "primary_modifier_confidence": 0.72,
        },
        "hypothesis": {
            "ok": True,
            "likely_light_count": 1,
            "light_count_confidence": 0.8,
            "roles": {"key": True, "fill": False},
            "multi_light_evidence_score": 0.15,
            "false_multi_light_risk": 0.1,
            "light_role_notes": ["Single dominant source"],
        },
        "physics": {
            "ok": True,
            "best_physics_score": 0.78,
            "violation_summary": [],
        },
        "validation": {
            "ok": True,
            "warnings": [],
        },
    }


def _make_vlm_response() -> Dict[str, Any]:
    """Typical VLM reconstruction response."""
    return {
        "primary_reconstruction": {
            "dominant_source_direction_deg": 42.0,
            "dominant_source_height_class": "slightly_above_eye",
            "dominant_source_height_deg_estimate": 25.0,
            "dominant_source_distance_class": "medium",
            "dominant_source_distance_ft": 5.5,
            "source_size_class": "medium",
            "modifier_family_candidates": [
                {"type": "octa", "confidence": 0.72},
                {"type": "beauty_dish", "confidence": 0.45},
            ],
            "environment": "studio",
            "likely_light_count": 1,
            "roles": {
                "key": {"present": True, "confidence": 0.95},
                "fill": {"present": False, "confidence": 0.70},
                "negative_fill": {"present": True, "confidence": 0.60},
                "rim": {"present": False, "confidence": 0.30},
                "kicker": {"present": False, "confidence": 0.20},
                "background": {"present": False, "confidence": 0.55},
                "bounce": {"present": False, "confidence": 0.40},
            },
            "reconstruction_confidence": 0.82,
            "ambiguity_notes": [],
            "contradiction_notes": [],
        },
        "candidates": [
            {
                "candidate_id": "candidate_1",
                "key_light_angle_deg": 42.0,
                "key_light_height_class": "slightly_above_eye",
                "key_light_height_deg_estimate": 25.0,
                "key_light_distance_class": "medium",
                "key_light_distance_ft_estimate": 5.5,
                "source_size_class": "medium",
                "modifier_family_candidates": [
                    {"type": "octa", "confidence": 0.72},
                ],
                "environment": "studio",
                "likely_light_count": 1,
                "roles": {
                    "key": {"present": True, "confidence": 0.95},
                    "fill": {"present": False, "confidence": 0.70},
                    "negative_fill": {"present": True, "confidence": 0.60},
                    "rim": {"present": False, "confidence": 0.30},
                    "kicker": {"present": False, "confidence": 0.20},
                    "background": {"present": False, "confidence": 0.55},
                    "bounce": {"present": False, "confidence": 0.40},
                },
                "confidence_score": 0.82,
                "ambiguity_notes": [],
            }
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSerializePipelineSignals:
    """Tests for serialize_pipeline_signals()."""

    def test_includes_pipeline_keys(self):
        results = _make_pipeline_results()
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        assert "shadow_pass" in parsed
        assert "catchlight_pass" in parsed
        assert "environment_pass" in parsed
        assert "modifier_shape_pass" in parsed

    def test_includes_light_role_support(self):
        results = _make_pipeline_results()
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        assert "light_role_support_signals" in parsed
        support = parsed["light_role_support_signals"]
        assert support["likely_light_count"] == 1

    def test_includes_global_uncertainty(self):
        results = _make_pipeline_results()
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        assert "global_uncertainty_notes" in parsed
        assert isinstance(parsed["global_uncertainty_notes"], list)

    def test_physics_low_score_adds_uncertainty(self):
        results = _make_pipeline_results()
        results["physics"]["best_physics_score"] = 0.3
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        notes = parsed["global_uncertainty_notes"]
        assert any("Physics consistency" in n for n in notes)

    def test_validation_warnings_included(self):
        results = _make_pipeline_results()
        results["validation"]["warnings"] = ["Shadow/highlight mismatch"]
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        assert "Shadow/highlight mismatch" in parsed["global_uncertainty_notes"]

    def test_empty_results(self):
        output = serialize_pipeline_signals({})
        parsed = json.loads(output)
        assert "global_uncertainty_notes" in parsed
        assert isinstance(parsed, dict)

    def test_strips_non_serializable(self):
        results = _make_pipeline_results()
        # Add a numpy-like value
        results["shadow"]["_internal_array"] = "should_be_stripped"
        output = serialize_pipeline_signals(results)
        # Should not raise
        parsed = json.loads(output)
        assert parsed is not None

    def test_strips_ldf_vectors(self):
        results = _make_pipeline_results()
        results["light_direction_field"]["ldf_vectors"] = [[1, 2], [3, 4]]
        output = serialize_pipeline_signals(results)
        parsed = json.loads(output)
        ldf = parsed["light_direction_field_pass"]
        assert "ldf_vectors" not in ldf

    def test_output_is_valid_json(self):
        results = _make_pipeline_results()
        output = serialize_pipeline_signals(results)
        # Should not raise
        parsed = json.loads(output)
        assert isinstance(parsed, dict)


class TestSanitizeForJson:
    """Tests for _sanitize_for_json()."""

    def test_primitives(self):
        assert _sanitize_for_json(None) is None
        assert _sanitize_for_json(42) == 42
        assert _sanitize_for_json(3.14) == 3.14
        assert _sanitize_for_json("hello") == "hello"
        assert _sanitize_for_json(True) is True

    def test_dict(self):
        result = _sanitize_for_json({"a": 1, "b": "two"})
        assert result == {"a": 1, "b": "two"}

    def test_list(self):
        result = _sanitize_for_json([1, "two", None])
        assert result == [1, "two", None]

    def test_strips_blacklisted_keys(self):
        result = _sanitize_for_json({"ok": True, "ldf_vectors": [[1, 2]]})
        assert "ldf_vectors" not in result

    def test_non_serializable_falls_back_to_str(self):
        class Custom:
            def __str__(self):
                return "custom_value"
        result = _sanitize_for_json(Custom())
        assert result == "custom_value"


# ═══════════════════════════════════════════════════════════════════════════
# Parsing Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestParseRoles:
    """Tests for _parse_roles()."""

    def test_full_roles(self):
        raw = {
            "key": {"present": True, "confidence": 0.95},
            "fill": {"present": False, "confidence": 0.70},
            "negative_fill": {"present": True, "confidence": 0.60},
            "rim": {"present": False, "confidence": 0.30},
            "kicker": {"present": False, "confidence": 0.20},
            "background": {"present": True, "confidence": 0.55},
            "bounce": {"present": False, "confidence": 0.40},
        }
        roles = _parse_roles(raw)
        assert roles is not None
        assert roles.key.present is True
        assert roles.key.confidence == 0.95
        assert roles.fill.present is False
        assert roles.background.present is True

    def test_partial_roles(self):
        raw = {"key": {"present": True, "confidence": 0.9}}
        roles = _parse_roles(raw)
        assert roles is not None
        assert roles.key.present is True
        assert roles.fill.present is None  # default

    def test_none_input(self):
        assert _parse_roles(None) is None

    def test_empty_dict(self):
        # Empty dict is falsy → returns None (no role data to parse)
        assert _parse_roles({}) is None


class TestParseModifierCandidates:
    """Tests for _parse_modifier_candidates()."""

    def test_normal(self):
        raw = [
            {"type": "octa", "confidence": 0.72},
            {"type": "beauty_dish", "confidence": 0.45},
        ]
        result = _parse_modifier_candidates(raw)
        assert len(result) == 2
        assert result[0].type == "octa"
        assert result[1].confidence == 0.45

    def test_empty_list(self):
        assert _parse_modifier_candidates([]) == []

    def test_none(self):
        assert _parse_modifier_candidates(None) == []

    def test_malformed_items_skipped(self):
        result = _parse_modifier_candidates([{"type": "octa"}, "bad", 123])
        assert len(result) == 1


class TestParseVlmReconstruction:
    """Tests for parse_vlm_reconstruction()."""

    def test_full_response(self):
        raw = _make_vlm_response()
        result = parse_vlm_reconstruction(raw)
        assert result.ok is True
        assert result.primary_reconstruction.dominant_source_direction_deg == 42.0
        assert result.primary_reconstruction.environment == "studio"
        assert result.primary_reconstruction.reconstruction_confidence == 0.82
        assert len(result.candidates) == 1
        assert result.candidates[0].candidate_id == "candidate_1"

    def test_primary_roles(self):
        raw = _make_vlm_response()
        result = parse_vlm_reconstruction(raw)
        roles = result.primary_reconstruction.roles
        assert roles is not None
        assert roles.key.present is True
        assert roles.negative_fill.present is True
        assert roles.rim.present is False

    def test_modifier_candidates(self):
        raw = _make_vlm_response()
        result = parse_vlm_reconstruction(raw)
        mods = result.primary_reconstruction.modifier_family_candidates
        assert len(mods) == 2
        assert mods[0].type == "octa"

    def test_empty_response(self):
        result = parse_vlm_reconstruction({})
        assert result.ok is True
        assert result.primary_reconstruction.dominant_source_direction_deg is None
        assert len(result.candidates) == 0

    def test_missing_primary(self):
        raw = {"candidates": []}
        result = parse_vlm_reconstruction(raw)
        assert result.ok is True
        assert result.primary_reconstruction.environment == "unknown"

    def test_missing_candidates(self):
        raw = {"primary_reconstruction": {"environment": "studio"}}
        result = parse_vlm_reconstruction(raw)
        assert result.primary_reconstruction.environment == "studio"
        assert len(result.candidates) == 0

    def test_malformed_candidate_skipped(self):
        raw = {
            "primary_reconstruction": {},
            "candidates": [
                {"candidate_id": "c1", "confidence_score": 0.8},
                "not_a_dict",  # Should be skipped
            ],
        }
        result = parse_vlm_reconstruction(raw)
        assert len(result.candidates) == 1

    def test_multiple_candidates(self):
        raw = _make_vlm_response()
        raw["candidates"].append({
            "candidate_id": "candidate_2",
            "key_light_angle_deg": 90.0,
            "environment": "window",
            "confidence_score": 0.45,
        })
        result = parse_vlm_reconstruction(raw)
        assert len(result.candidates) == 2
        assert result.candidates[1].environment == "window"


# ═══════════════════════════════════════════════════════════════════════════
# Public API Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestVlmReconstruct:
    """Tests for vlm_reconstruct()."""

    @mock.patch("engine.vlm_reconstruction._call_openai_recon")
    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "openai")
    def test_success_openai(self, mock_avail, mock_call):
        mock_call.return_value = _make_vlm_response()
        results = _make_pipeline_results()
        recon = vlm_reconstruct(results)
        assert recon is not None
        assert recon.ok is True
        assert recon.primary_reconstruction.dominant_source_direction_deg == 42.0
        mock_call.assert_called_once()

    @mock.patch("engine.vlm_reconstruction._call_anthropic_recon")
    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "anthropic")
    def test_success_anthropic(self, mock_avail, mock_call):
        mock_call.return_value = _make_vlm_response()
        results = _make_pipeline_results()
        recon = vlm_reconstruct(results)
        assert recon is not None
        assert recon.ok is True
        mock_call.assert_called_once()

    @mock.patch("engine.vlm.vlm_available", return_value=False)
    def test_vlm_unavailable(self, mock_avail):
        results = _make_pipeline_results()
        recon = vlm_reconstruct(results)
        assert recon is None

    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "openai")
    def test_empty_pipeline_results(self, mock_avail):
        recon = vlm_reconstruct({})
        assert recon is None

    @mock.patch("engine.vlm_reconstruction._call_openai_recon")
    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "openai")
    def test_api_error_returns_failed(self, mock_avail, mock_call):
        mock_call.side_effect = RuntimeError("API error")
        results = _make_pipeline_results()
        recon = vlm_reconstruct(results)
        assert recon is not None
        assert recon.ok is False
        assert any("API error" in n for n in recon.notes)

    @mock.patch("engine.vlm_reconstruction._call_openai_recon")
    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "openai")
    def test_malformed_response_still_parses(self, mock_avail, mock_call):
        mock_call.return_value = {"primary_reconstruction": {"environment": "window"}}
        results = _make_pipeline_results()
        recon = vlm_reconstruct(results)
        assert recon is not None
        assert recon.ok is True
        assert recon.primary_reconstruction.environment == "window"

    @mock.patch("engine.vlm_reconstruction._call_openai_recon")
    @mock.patch("engine.vlm.vlm_available", return_value=True)
    @mock.patch("engine.vlm._VLM_PROVIDER", "openai")
    def test_serializes_all_pipeline_keys(self, mock_avail, mock_call):
        """Verify the serialized JSON sent to the VLM includes expected keys."""
        captured_input = {}

        def capture_call(signal_json):
            captured_input["json"] = signal_json
            return _make_vlm_response()

        mock_call.side_effect = capture_call
        results = _make_pipeline_results()
        vlm_reconstruct(results)

        parsed = json.loads(captured_input["json"])
        assert "shadow_pass" in parsed
        assert "catchlight_pass" in parsed
        assert "light_role_support_signals" in parsed
        assert "global_uncertainty_notes" in parsed


# ═══════════════════════════════════════════════════════════════════════════
# Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestVLMReconstructionModels:
    """Tests for the Pydantic models."""

    def test_default_reconstruction(self):
        recon = VLMReconstruction()
        assert recon.ok is True
        assert recon.primary_reconstruction.environment == "unknown"
        assert len(recon.candidates) == 0

    def test_primary_defaults(self):
        primary = VLMReconPrimary()
        assert primary.dominant_source_direction_deg is None
        assert primary.environment == "unknown"
        assert primary.reconstruction_confidence == 0.0

    def test_candidate_defaults(self):
        cand = VLMReconCandidate()
        assert cand.candidate_id == "candidate_1"
        assert cand.confidence_score == 0.0

    def test_modifier_candidate(self):
        mod = VLMReconModifierCandidate(type="octa", confidence=0.72)
        assert mod.type == "octa"
        assert mod.confidence == 0.72

    def test_role(self):
        role = VLMReconRole(present=True, confidence=0.95)
        assert role.present is True
        assert role.confidence == 0.95

    def test_roles_container(self):
        roles = VLMReconRoles()
        assert roles.key.present is None
        assert roles.fill.confidence == 0.0

    def test_model_dump_roundtrip(self):
        """Primary reconstruction should survive model_dump → from dict."""
        recon = parse_vlm_reconstruction(_make_vlm_response())
        dumped = recon.model_dump()
        assert isinstance(dumped, dict)
        assert dumped["primary_reconstruction"]["environment"] == "studio"
        assert len(dumped["candidates"]) == 1
