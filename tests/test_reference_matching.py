"""Tests for engine/reference_matcher.py

Covers:
1. Reference loading and schema validation
2. match_reference_images returns expected references
3. Gold tier entries outrank community entries
4. Distance, direction, modifier similarity scoring
5. Known reference matching
6. Edge cases: empty reconstruction, missing keys
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import pytest

from engine.reference_matcher import (
    _load_references,
    _angle_similarity,
    _score_light_direction,
    _score_modifier_similarity,
    _score_shadow_similarity,
    _score_environment_match,
    _score_light_count,
    _score_distance,
    match_reference_images,
    get_all_references,
    reload_references,
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
        "modifier_distance_ft": 5.0,
        "estimated_source_distance_ft": 5.0,
    }
    base.update(overrides)
    return base


# ══════════════════════════════════════════════════════════════════════
# REFERENCE LOADING
# ══════════════════════════════════════════════════════════════════════

class TestReferenceLoading:
    def test_references_load(self):
        refs = _load_references()
        assert isinstance(refs, list)
        assert len(refs) >= 10

    def test_reference_structure(self):
        refs = _load_references()
        for ref in refs:
            assert "reference_id" in ref
            assert "photographer" in ref
            # All entries must have either lighting_pattern or pattern_id
            assert "lighting_pattern" in ref or "pattern_id" in ref, (
                f"Entry {ref.get('reference_id')} missing both lighting_pattern and pattern_id"
            )
            assert "dataset_tier" in ref
            assert "entry_trust_score" in ref

    def test_core_entries_gold_tier(self):
        """Core legacy entries (from references.json) should be gold tier."""
        refs = _load_references()
        core_ids = {
            "hurley_clamshell_001", "avedon_butterfly_001",
            "karsh_rembrandt_001", "demarchelier_editorial_001",
            "watson_split_001", "bryce_window_001",
        }
        for ref in refs:
            if ref["reference_id"] in core_ids:
                assert ref["dataset_tier"] == "gold", (
                    f"Core entry {ref['reference_id']} should be gold tier"
                )
                assert ref["entry_trust_score"] == 1.0

    def test_known_references_present(self):
        refs = _load_references()
        ids = {r["reference_id"] for r in refs}
        expected = {
            "hurley_clamshell_001",
            "avedon_butterfly_001",
            "karsh_rembrandt_001",
            "demarchelier_editorial_001",
            "watson_split_001",
            "bryce_window_001",
        }
        for rid in expected:
            assert rid in ids, f"Missing reference: {rid}"

    def test_json_file_valid(self):
        path = Path(__file__).resolve().parent.parent / "data" / "reference_library" / "references.json"
        with open(path) as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) >= 10

    def test_get_all_references(self):
        refs = get_all_references()
        assert isinstance(refs, list)
        assert len(refs) >= 10

    def test_reload_references(self):
        reload_references()
        refs = _load_references()
        assert len(refs) >= 10


# ══════════════════════════════════════════════════════════════════════
# SUB-SCORERS
# ══════════════════════════════════════════════════════════════════════

class TestAngleSimilarity:
    def test_same_angle(self):
        assert _angle_similarity(45.0, 45.0) == 1.0

    def test_opposite_angle(self):
        assert _angle_similarity(0.0, 90.0) == 0.0

    def test_close_angle(self):
        assert _angle_similarity(45.0, 50.0) > 0.9

    def test_none_angle(self):
        assert _angle_similarity(None, 45.0) == 0.5
        assert _angle_similarity(45.0, None) == 0.5


class TestScoreLightDirection:
    def test_matching_key_angle(self):
        ref = {"lights": [{"role": "key", "angle_deg": 45, "height_deg": 25}]}
        recon = _mock_reconstruction(key_light_angle_deg_pose_corrected=45.0, key_light_height="above_eye_level")
        assert _score_light_direction(ref, recon) > 0.7

    def test_different_key_angle(self):
        ref = {"lights": [{"role": "key", "angle_deg": 0, "height_deg": 30}]}
        recon = _mock_reconstruction(key_light_angle_deg_pose_corrected=90.0)
        assert _score_light_direction(ref, recon) < 0.5


class TestScoreModifierSimilarity:
    def test_exact_match(self):
        ref = {"lights": [{"role": "key", "modifier": "beauty_dish"}]}
        recon = _mock_reconstruction(primary_modifier_hypothesis="beauty_dish")
        assert _score_modifier_similarity(ref, recon) == 1.0

    def test_family_match(self):
        ref = {"lights": [{"role": "key", "modifier": "softbox_rect"}]}
        recon = _mock_reconstruction(primary_modifier_hypothesis="softbox_octa")
        assert _score_modifier_similarity(ref, recon) >= 0.7

    def test_no_match(self):
        ref = {"lights": [{"role": "key", "modifier": "ring_light"}]}
        recon = _mock_reconstruction(primary_modifier_hypothesis="bare_bulb")
        assert _score_modifier_similarity(ref, recon) < 0.5


class TestScoreEnvironmentMatch:
    def test_exact_match(self):
        ref = {"environment": "studio"}
        recon = _mock_reconstruction(environment_class="studio")
        assert _score_environment_match(ref, recon) == 1.0

    def test_different(self):
        ref = {"environment": "studio"}
        recon = _mock_reconstruction(environment_class="direct_sun")
        assert _score_environment_match(ref, recon) < 0.5

    def test_studio_window_crossover(self):
        ref = {"environment": "studio"}
        recon = _mock_reconstruction(environment_class="window_light")
        assert _score_environment_match(ref, recon) == 0.5


class TestScoreLightCount:
    def test_matching(self):
        ref = {"lights": [{"role": "key"}, {"role": "fill"}]}
        recon = _mock_reconstruction(likely_light_count=2)
        assert _score_light_count(ref, recon) == 1.0

    def test_different(self):
        ref = {"lights": [{"role": "key"}]}
        recon = _mock_reconstruction(likely_light_count=3)
        assert _score_light_count(ref, recon) < 1.0


class TestScoreDistance:
    def test_same_distance(self):
        ref = {"lights": [{"role": "key", "distance_ft": 5}]}
        recon = _mock_reconstruction(estimated_source_distance_ft=5.0)
        assert _score_distance(ref, recon) == 1.0

    def test_different_distance(self):
        ref = {"lights": [{"role": "key", "distance_ft": 5}]}
        recon = _mock_reconstruction(estimated_source_distance_ft=10.0)
        assert _score_distance(ref, recon) < 1.0


# ══════════════════════════════════════════════════════════════════════
# FULL MATCHER
# ══════════════════════════════════════════════════════════════════════

class TestMatchReferenceImages:
    def test_basic_output_structure(self):
        result = match_reference_images(_mock_reconstruction())
        assert "closest_references" in result
        assert "top_reference" in result
        assert "top_similarity" in result
        assert isinstance(result["closest_references"], list)
        assert len(result["closest_references"]) <= 5

    def test_similarity_range(self):
        result = match_reference_images(_mock_reconstruction())
        for ref in result["closest_references"]:
            assert 0.0 <= ref["similarity"] <= 1.0

    def test_sorted_by_similarity(self):
        result = match_reference_images(_mock_reconstruction())
        refs = result["closest_references"]
        for i in range(len(refs) - 1):
            assert refs[i]["similarity"] >= refs[i + 1]["similarity"]

    def test_reference_entry_structure(self):
        result = match_reference_images(_mock_reconstruction())
        for ref in result["closest_references"]:
            assert "reference_id" in ref
            assert "photographer" in ref
            assert "lighting_pattern" in ref
            assert "similarity" in ref
            assert "dataset_tier" in ref

    def test_rembrandt_matches_karsh(self):
        """45-degree key with fresnel and moderate softness should match Karsh Rembrandt."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=45.0,
            shadow_softness=0.3,
            environment_class="studio",
            likely_light_count=2,
            primary_modifier_hypothesis="fresnel",
        )
        result = match_reference_images(recon)
        ref_ids = [r["reference_id"] for r in result["closest_references"]]
        assert "karsh_rembrandt_001" in ref_ids

    def test_clamshell_matches_hurley(self):
        """On-axis key with fill should match Hurley clamshell."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=0.0,
            key_light_height="above_eye_level",
            shadow_softness=0.7,
            fill_present=True,
            likely_light_count=2,
            environment_class="studio",
            primary_modifier_hypothesis="octa",
        )
        result = match_reference_images(recon)
        ref_ids = [r["reference_id"] for r in result["closest_references"]]
        assert "hurley_clamshell_001" in ref_ids

    def test_split_matches_watson(self):
        """90-degree key should match Watson split."""
        recon = _mock_reconstruction(
            key_light_angle_deg_pose_corrected=90.0,
            shadow_softness=0.2,
            fill_present=False,
            likely_light_count=1,
            environment_class="studio",
            primary_modifier_hypothesis="bare_bulb",
        )
        result = match_reference_images(recon)
        ref_ids = [r["reference_id"] for r in result["closest_references"]]
        assert "watson_split_001" in ref_ids

    def test_gold_outranks_community(self):
        """Gold entries should score higher than equivalent community entries.

        This is enforced by the trust_score scaling in _match_single_reference.
        All initial entries are gold, so we verify the mechanism works by
        checking that the trust score formula applies correctly.
        """
        from engine.reference_matcher import _match_single_reference

        gold_ref = {
            "reference_id": "test_gold",
            "lights": [{"role": "key", "angle_deg": 45, "height_deg": 20, "distance_ft": 5, "modifier": "softbox_octa"}],
            "shadow_signature": {"nose_shadow": "opposite_key", "cheek_shadow": "moderate"},
            "environment": "studio",
            "dataset_tier": "gold",
            "entry_trust_score": 1.0,
        }
        community_ref = {
            "reference_id": "test_community",
            "lights": [{"role": "key", "angle_deg": 45, "height_deg": 20, "distance_ft": 5, "modifier": "softbox_octa"}],
            "shadow_signature": {"nose_shadow": "opposite_key", "cheek_shadow": "moderate"},
            "environment": "studio",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
        }
        recon = _mock_reconstruction()
        gold_score = _match_single_reference(gold_ref, recon)
        community_score = _match_single_reference(community_ref, recon)
        assert gold_score > community_score

    def test_empty_reconstruction(self):
        result = match_reference_images({})
        assert "closest_references" in result
        assert isinstance(result["closest_references"], list)

    def test_top_reference_exists(self):
        result = match_reference_images(_mock_reconstruction())
        assert result["top_reference"] is not None
        assert result["top_similarity"] > 0.0
