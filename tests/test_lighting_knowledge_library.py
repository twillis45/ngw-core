"""Tests for engine/lighting_knowledge_library.py

Covers:
1. Pattern loading from JSON (delegated to pattern_matcher)
2. Pattern matching with reconstruction data
3. Photographer references in output
4. Physics score boost/penalty
5. Edge cases: empty reconstruction, missing keys
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import pytest

from engine.pattern_matcher import (
    _load_patterns,
    _score_key_direction,
    _score_key_height,
    _score_shadow_signature,
    _score_modifier_match,
    _score_environment,
    _score_fill_strategy,
    _score_light_count,
    _score_distance,
)
from engine.lighting_knowledge_library import (
    lighting_knowledge_library_pass,
)


# ── Pattern loading ──────────────────────────────────────────────────

class TestPatternLoading:
    def test_patterns_load(self):
        patterns = _load_patterns()
        assert isinstance(patterns, list)
        assert len(patterns) >= 18

    def test_pattern_structure(self):
        patterns = _load_patterns()
        for pat in patterns:
            assert "pattern_id" in pat
            assert "name" in pat
            assert "geometry" in pat
            assert "key_direction_range_deg" in pat["geometry"]
            assert "scoring_weights" in pat
            assert isinstance(pat["geometry"]["key_direction_range_deg"], list)
            assert len(pat["geometry"]["key_direction_range_deg"]) == 2

    def test_known_patterns_present(self):
        patterns = _load_patterns()
        ids = {p["pattern_id"] for p in patterns}
        expected = {
            "rembrandt", "clamshell", "loop", "split", "butterfly",
            "broad", "short", "rim", "high_key", "low_key",
            "flat", "window_portrait", "ring_light",
            "bare_bulb_editorial", "strip_dramatic", "short_fashion_key",
            # NOTE: golden_hour and overcast_natural removed — they are
            # source_context values, not geometric patterns. rim_only → rim,
            # flat_fashion → flat (migration aliases, see engine/enums.py).
        }
        for pid in expected:
            assert pid in ids, f"Missing pattern: {pid}"

    def test_json_file_valid(self):
        path = Path(__file__).resolve().parent.parent / "data" / "lighting_patterns.json"
        with open(path) as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) >= 18


# ── Sub-score functions (now in pattern_matcher) ─────────────────────

class TestScoreKeyDirection:
    def test_in_range_center(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        score = _score_key_direction(pattern, 45.0)
        assert score >= 0.7

    def test_in_range_edge(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        score = _score_key_direction(pattern, 30.0)
        assert score >= 0.7

    def test_outside_range(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        score = _score_key_direction(pattern, 100.0)
        assert score < 0.5

    def test_none_angle(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        score = _score_key_direction(pattern, None)
        assert score == 0.5


class TestScoreKeyHeight:
    def test_exact_match(self):
        pattern = {"geometry": {"key_height": "above_eye_level"}}
        assert _score_key_height(pattern, "above_eye_level") == 1.0

    def test_adjacent(self):
        pattern = {"geometry": {"key_height": "above_eye_level"}}
        assert _score_key_height(pattern, "eye_level") == 0.6


class TestScoreShadowSignature:
    def test_softness_in_range(self):
        pattern = {"shadow_signature": {"softness_range": [0.3, 0.7], "contrast": "medium"}}
        score = _score_shadow_signature(pattern, 0.5, "medium")
        assert score >= 0.8

    def test_softness_out_of_range(self):
        pattern = {"shadow_signature": {"softness_range": [0.3, 0.7], "contrast": "medium"}}
        score = _score_shadow_signature(pattern, 0.1, "very_high")
        assert score < 0.8


class TestScoreModifierMatch:
    def test_matching_modifier(self):
        pattern = {"modifiers": ["beauty_dish", "softbox_octa"]}
        score = _score_modifier_match(pattern, "beauty_dish", None)
        assert score == 1.0

    def test_no_match(self):
        pattern = {"modifiers": ["beauty_dish", "softbox_octa"]}
        score = _score_modifier_match(pattern, "stripbox", None)
        assert score < 0.5


class TestScoreEnvironment:
    def test_matching_environment(self):
        pattern = {"environment": ["studio", "window_light"]}
        score = _score_environment(pattern, "studio")
        assert score == 1.0

    def test_no_match(self):
        pattern = {"environment": ["studio"]}
        score = _score_environment(pattern, "direct_sun")
        assert score < 0.5

    def test_mixed_environment(self):
        pattern = {"environment": ["studio"]}
        score = _score_environment(pattern, "mixed")
        assert score == 0.5


class TestScoreFillStrategy:
    def test_high_key_with_fill(self):
        pattern = {"pattern_id": "high_key", "lights": {"typical_roles": ["key", "fill", "background"]}}
        score = _score_fill_strategy(pattern, fill_present=True, negative_fill=False)
        assert score >= 0.8

    def test_low_key_no_fill(self):
        pattern = {"pattern_id": "low_key", "lights": {"typical_roles": ["key", "negative_fill"]}}
        score = _score_fill_strategy(pattern, fill_present=False, negative_fill=True)
        assert score >= 0.8


# ── Full pass ────────────────────────────────────────────────────────

def _mock_reconstruction(**overrides) -> Dict[str, Any]:
    base = {
        "ok": True,
        "key_light_angle_deg_pose_corrected": 45.0,
        "key_light_angle_deg": 45.0,
        "key_light_height": "above_eye_level",
        "shadow_softness": 0.4,
        "fill_present": True,
        "negative_fill": False,
        "modifier_size_class": "medium",
        "likely_light_count": 2,
        "environment_class": "studio",
        "primary_modifier_hypothesis": "softbox_octa",
        "modifier_candidates": None,
        "modifier_distance_ft": 5.0,
        "estimated_source_distance_ft": 5.0,
        "notes": [],
    }
    base.update(overrides)
    return base


class TestLightingKnowledgeLibraryPass:
    def test_basic_output(self):
        result = lighting_knowledge_library_pass(
            reconstruction=_mock_reconstruction(),
        )
        assert result["ok"] is True
        assert "pattern_matches" in result
        assert "top_pattern" in result
        assert "top_pattern_confidence" in result
        assert "master_reference" in result
        assert isinstance(result["pattern_matches"], list)
        assert len(result["pattern_matches"]) > 0
        assert len(result["pattern_matches"]) <= 5

    def test_top_pattern_is_string(self):
        result = lighting_knowledge_library_pass(
            reconstruction=_mock_reconstruction(),
        )
        assert isinstance(result["top_pattern"], str)
        assert result["top_pattern"] != "unknown"

    def test_confidence_range(self):
        result = lighting_knowledge_library_pass(
            reconstruction=_mock_reconstruction(),
        )
        assert 0.0 <= result["top_pattern_confidence"] <= 1.0
        for match in result["pattern_matches"]:
            assert 0.0 <= match["confidence"] <= 1.0

    def test_rembrandt_match(self):
        """45-degree key with moderate softness should match Rembrandt well."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=45.0,
            shadow_softness=0.4,
            environment_class="studio",
        )
        result = lighting_knowledge_library_pass(reconstruction=recon)
        pattern_ids = [m["pattern"] for m in result["pattern_matches"]]
        # Rembrandt or loop should be in top matches for 45-degree key
        assert "rembrandt" in pattern_ids or "loop" in pattern_ids or "short_fashion_key" in pattern_ids

    def test_ring_light_match(self):
        """On-axis light with ring modifier should match ring_light."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=5.0,
            shadow_softness=0.6,
            primary_modifier_hypothesis="ring_light",
            environment_class="studio",
        )
        result = lighting_knowledge_library_pass(reconstruction=recon)
        pattern_ids = [m["pattern"] for m in result["pattern_matches"]]
        assert "ring_light" in pattern_ids

    def test_physics_boost(self):
        recon = _mock_reconstruction()
        physics_high = {"ok": True, "best_physics_score": 0.9}
        physics_low = {"ok": True, "best_physics_score": 0.2}

        result_high = lighting_knowledge_library_pass(reconstruction=recon, physics=physics_high)
        result_low = lighting_knowledge_library_pass(reconstruction=recon, physics=physics_low)

        # High physics should boost top confidence
        assert result_high["top_pattern_confidence"] >= result_low["top_pattern_confidence"]

    def test_master_references(self):
        result = lighting_knowledge_library_pass(
            reconstruction=_mock_reconstruction(),
        )
        assert isinstance(result["master_reference"], list)
        # Should have at least some photographer names from top matches
        # (not all patterns have them, but top patterns likely do)

    def test_empty_reconstruction(self):
        result = lighting_knowledge_library_pass(reconstruction={})
        assert result["ok"] is True
        # Should still return results, just with neutral scores

    def test_sorted_by_confidence(self):
        result = lighting_knowledge_library_pass(
            reconstruction=_mock_reconstruction(),
        )
        matches = result["pattern_matches"]
        for i in range(len(matches) - 1):
            assert matches[i]["confidence"] >= matches[i + 1]["confidence"]
