"""Tests for engine/pattern_matcher.py

Covers:
1. Pattern loading and schema validation
2. match_lighting_patterns returns expected patterns
3. Sub-scorer accuracy (direction, shadow, modifier, environment, fill)
4. Pattern ranking order
5. Known pattern matching (Rembrandt at 45°, clamshell at 0°, etc.)
6. Edge cases: empty reconstruction, missing keys
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
    _score_light_count,
    _score_distance,
    _score_fill_strategy,
    match_lighting_patterns,
    get_all_patterns,
    reload_patterns,
)


# ── Helpers ──────────────────────────────────────────────────────────

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


# ══════════════════════════════════════════════════════════════════════
# PATTERN LOADING
# ══════════════════════════════════════════════════════════════════════

class TestPatternLoading:
    def test_patterns_load(self):
        patterns = _load_patterns()
        assert isinstance(patterns, list)
        assert len(patterns) >= 18

    def test_new_schema_structure(self):
        """Verify patterns use the new schema with pattern_id, category, geometry, lights."""
        patterns = _load_patterns()
        for pat in patterns:
            assert "pattern_id" in pat, f"Missing pattern_id in {pat.get('name', 'unknown')}"
            assert "category" in pat
            assert "geometry" in pat
            assert "key_direction_range_deg" in pat["geometry"]
            assert "lights" in pat
            assert "min_lights" in pat["lights"]
            assert "max_lights" in pat["lights"]
            assert "typical_roles" in pat["lights"]
            assert "modifiers" in pat
            assert isinstance(pat["modifiers"], list)
            assert "shadow_signature" in pat
            assert "contrast" in pat["shadow_signature"]
            assert "softness_range" in pat["shadow_signature"]
            assert "environment" in pat
            assert "distance_range_ft" in pat
            assert "scoring_weights" in pat

    def test_known_pattern_ids(self):
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

    def test_get_all_patterns(self):
        pats = get_all_patterns()
        assert isinstance(pats, list)
        assert len(pats) >= 18

    def test_reload_patterns(self):
        reload_patterns()
        patterns = _load_patterns()
        assert len(patterns) >= 18


# ══════════════════════════════════════════════════════════════════════
# SUB-SCORERS
# ══════════════════════════════════════════════════════════════════════

class TestScoreKeyDirection:
    def test_in_range_center(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        assert _score_key_direction(pattern, 45.0) >= 0.7

    def test_in_range_edge(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        assert _score_key_direction(pattern, 30.0) >= 0.7

    def test_outside_range(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        assert _score_key_direction(pattern, 100.0) < 0.5

    def test_none_angle(self):
        pattern = {"geometry": {"key_direction_range_deg": [30, 60]}}
        assert _score_key_direction(pattern, None) == 0.5


class TestScoreKeyHeight:
    def test_exact_match(self):
        pattern = {"geometry": {"key_height": "above_eye_level"}}
        assert _score_key_height(pattern, "above_eye_level") == 1.0

    def test_adjacent(self):
        pattern = {"geometry": {"key_height": "above_eye_level"}}
        assert _score_key_height(pattern, "eye_level") == 0.6

    def test_far_off(self):
        pattern = {"geometry": {"key_height": "high"}}
        assert _score_key_height(pattern, "below_eye_level") < 0.5

    def test_none(self):
        pattern = {"geometry": {"key_height": "above_eye_level"}}
        assert _score_key_height(pattern, None) == 0.5


class TestScoreShadowSignature:
    def test_softness_in_range(self):
        pattern = {"shadow_signature": {"softness_range": [0.3, 0.7], "contrast": "medium"}}
        assert _score_shadow_signature(pattern, 0.5, "medium") >= 0.8

    def test_softness_out_of_range(self):
        pattern = {"shadow_signature": {"softness_range": [0.3, 0.7], "contrast": "medium"}}
        assert _score_shadow_signature(pattern, 0.1, "very_high") < 0.8


class TestScoreModifierMatch:
    def test_direct_match(self):
        pattern = {"modifiers": ["beauty_dish", "softbox_octa"]}
        assert _score_modifier_match(pattern, "beauty_dish", None) == 1.0

    def test_no_match(self):
        pattern = {"modifiers": ["beauty_dish", "softbox_octa"]}
        assert _score_modifier_match(pattern, "stripbox", None) < 0.5


class TestScoreEnvironment:
    def test_match(self):
        pattern = {"environment": ["studio", "window_light"]}
        assert _score_environment(pattern, "studio") == 1.0

    def test_no_match(self):
        pattern = {"environment": ["studio"]}
        assert _score_environment(pattern, "direct_sun") < 0.5

    def test_mixed(self):
        pattern = {"environment": ["studio"]}
        assert _score_environment(pattern, "mixed") == 0.5


class TestScoreLightCount:
    def test_in_range(self):
        pattern = {"lights": {"min_lights": 1, "max_lights": 3}}
        assert _score_light_count(pattern, 2) == 1.0

    def test_below_range(self):
        pattern = {"lights": {"min_lights": 2, "max_lights": 4}}
        assert _score_light_count(pattern, 1) < 1.0

    def test_none(self):
        pattern = {"lights": {"min_lights": 1, "max_lights": 3}}
        assert _score_light_count(pattern, None) == 0.5


class TestScoreDistance:
    def test_in_range(self):
        pattern = {"distance_range_ft": [3, 8]}
        assert _score_distance(pattern, 5.0) == 1.0

    def test_outside_range(self):
        pattern = {"distance_range_ft": [3, 8]}
        assert _score_distance(pattern, 15.0) < 1.0

    def test_zero_range(self):
        """Natural light has distance [0,0] — should return neutral."""
        pattern = {"distance_range_ft": [0, 0]}
        assert _score_distance(pattern, 5.0) == 0.5


class TestScoreFillStrategy:
    def test_fill_pattern_with_fill(self):
        pattern = {"pattern_id": "clamshell", "lights": {"typical_roles": ["key", "fill"]}}
        assert _score_fill_strategy(pattern, fill_present=True, negative_fill=False) >= 0.8

    def test_low_key_no_fill(self):
        pattern = {"pattern_id": "low_key", "lights": {"typical_roles": ["key", "negative_fill"]}}
        assert _score_fill_strategy(pattern, fill_present=False, negative_fill=True) >= 0.8


# ══════════════════════════════════════════════════════════════════════
# FULL MATCHER
# ══════════════════════════════════════════════════════════════════════

class TestMatchLightingPatterns:
    def test_basic_output_structure(self):
        result = match_lighting_patterns(_mock_reconstruction())
        assert "pattern_matches" in result
        assert "top_pattern" in result
        assert "top_confidence" in result
        assert "category" in result
        assert isinstance(result["pattern_matches"], list)
        assert len(result["pattern_matches"]) <= 5

    def test_confidence_range(self):
        result = match_lighting_patterns(_mock_reconstruction())
        for match in result["pattern_matches"]:
            assert 0.0 <= match["confidence"] <= 1.0
        assert 0.0 <= result["top_confidence"] <= 1.0

    def test_sorted_by_confidence(self):
        result = match_lighting_patterns(_mock_reconstruction())
        matches = result["pattern_matches"]
        for i in range(len(matches) - 1):
            assert matches[i]["confidence"] >= matches[i + 1]["confidence"]

    def test_match_entry_structure(self):
        result = match_lighting_patterns(_mock_reconstruction())
        for match in result["pattern_matches"]:
            assert "pattern" in match
            assert "name" in match
            assert "confidence" in match
            assert "category" in match
            assert "description" in match
            assert "use_cases" in match
            assert "example_photographers" in match

    def test_rembrandt_at_45(self):
        """45-degree key with moderate softness in studio should match Rembrandt/loop."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=45.0,
            shadow_softness=0.4,
            environment_class="studio",
        )
        result = match_lighting_patterns(recon)
        top_ids = [m["pattern"] for m in result["pattern_matches"]]
        assert "rembrandt" in top_ids or "loop" in top_ids or "short_fashion_key" in top_ids

    def test_clamshell_at_zero(self):
        """On-axis key with soft shadows and fill should match clamshell/butterfly."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=5.0,
            shadow_softness=0.7,
            fill_present=True,
            likely_light_count=2,
            environment_class="studio",
        )
        result = match_lighting_patterns(recon)
        top_ids = [m["pattern"] for m in result["pattern_matches"]]
        assert any(p in top_ids for p in ("clamshell", "butterfly", "ring_light", "flat"))

    def test_split_at_90(self):
        """90-degree key with hard shadows should match split."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=90.0,
            shadow_softness=0.2,
            fill_present=False,
            likely_light_count=1,
            environment_class="studio",
        )
        result = match_lighting_patterns(recon)
        top_ids = [m["pattern"] for m in result["pattern_matches"]]
        assert "split" in top_ids

    def test_window_portrait(self):
        """60-degree key with window environment should match window portrait."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=60.0,
            shadow_softness=0.6,
            environment_class="window_light",
            primary_modifier_hypothesis="window",
            likely_light_count=1,
        )
        result = match_lighting_patterns(recon)
        top_ids = [m["pattern"] for m in result["pattern_matches"]]
        assert "window_portrait" in top_ids

    def test_empty_reconstruction(self):
        """Empty reconstruction should return results with neutral scores."""
        result = match_lighting_patterns({})
        assert "pattern_matches" in result
        assert len(result["pattern_matches"]) > 0

    def test_top_pattern_not_unknown(self):
        result = match_lighting_patterns(_mock_reconstruction())
        assert result["top_pattern"] != "unknown"
        assert result["top_confidence"] > 0.0
