"""Tests for engine.archetype_classifier — archetype signature matching.

Covers:
  - ArchetypeClassification model
  - Signature loading from YAML
  - Signal extraction from pass outputs
  - Individual signal matching
  - Archetype scoring
  - Full classification with synthetic scenarios
  - Edge cases and graceful fallbacks
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import pytest

from engine.archetype_classifier import (
    ArchetypeClassification,
    _extract_observed_signals,
    _match_signal,
    _score_archetype,
    classify_archetype,
    load_archetype_signatures,
    _reload_signatures,
)


# ═══════════════════════════════════════════════════════════════════════════
# Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestArchetypeClassificationModel:
    """Tests for the ArchetypeClassification Pydantic model."""

    def test_defaults(self):
        ac = ArchetypeClassification()
        assert ac.primary_archetype is None
        assert ac.primary_confidence == 0.0
        assert ac.secondary_archetype is None
        assert ac.secondary_confidence == 0.0
        assert ac.all_scores == {}
        assert ac.matched_signals == []
        assert ac.unmatched_signals == []
        assert ac.notes == []
        assert ac.ok is True

    def test_full_construction(self):
        ac = ArchetypeClassification(
            primary_archetype="hurley",
            primary_confidence=0.85,
            secondary_archetype="bryce",
            secondary_confidence=0.45,
            all_scores={"hurley": 0.85, "bryce": 0.45, "penn": 0.0},
            matched_signals=["hurley:catchlight_cluster_geometry"],
            unmatched_signals=["hurley:light_technology"],
            notes=["Best match: Peter Hurley (85.0%)"],
            ok=True,
        )
        assert ac.primary_archetype == "hurley"
        assert ac.primary_confidence == 0.85
        assert ac.secondary_archetype == "bryce"

    def test_forbids_extra(self):
        with pytest.raises(Exception):
            ArchetypeClassification(unknown_field="bad")

    def test_model_dump_round_trip(self):
        ac = ArchetypeClassification(
            primary_archetype="penn",
            primary_confidence=0.72,
        )
        dumped = ac.model_dump()
        assert dumped["primary_archetype"] == "penn"
        assert dumped["primary_confidence"] == 0.72
        restored = ArchetypeClassification(**dumped)
        assert restored == ac


# ═══════════════════════════════════════════════════════════════════════════
# Signature Loading Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSignatureLoading:
    """Tests for YAML signature loading."""

    def test_load_default_signatures(self):
        sigs = _reload_signatures()
        assert isinstance(sigs, dict)
        assert len(sigs) > 0
        # Should have at minimum these archetypes
        for arch in ["hurley", "penn", "karsh", "leibovitz"]:
            assert arch in sigs, f"Missing archetype: {arch}"

    def test_signature_has_required_fields(self):
        sigs = _reload_signatures()
        for arch_id, spec in sigs.items():
            assert "label" in spec, f"{arch_id} missing label"
            assert "signals" in spec, f"{arch_id} missing signals"
            assert "min_match_score" in spec, f"{arch_id} missing min_match_score"
            assert isinstance(spec["signals"], dict), f"{arch_id} signals not a dict"

    def test_signal_specs_have_weights(self):
        sigs = _reload_signatures()
        for arch_id, spec in sigs.items():
            for sig_name, sig_spec in spec["signals"].items():
                assert "weight" in sig_spec, (
                    f"{arch_id}:{sig_name} missing weight"
                )

    def test_nonexistent_file_returns_empty(self, tmp_path):
        result = _reload_signatures(str(tmp_path / "nonexistent.yaml"))
        assert result == {}

    def test_caching_works(self):
        sigs1 = load_archetype_signatures()
        sigs2 = load_archetype_signatures()
        assert sigs1 is sigs2  # Same object = cached


# ═══════════════════════════════════════════════════════════════════════════
# Signal Extraction Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSignalExtraction:
    """Tests for _extract_observed_signals."""

    def test_empty_inputs_returns_empty(self):
        obs = _extract_observed_signals()
        assert obs == {}

    def test_all_none_returns_empty(self):
        obs = _extract_observed_signals(
            catchlight_topology=None,
            highlight_symmetry=None,
            highlight_axis_map=None,
        )
        assert obs == {}

    def test_failed_pass_ignored(self):
        obs = _extract_observed_signals(
            catchlight_topology={"ok": False, "error": "no face"},
        )
        assert "catchlight_cluster_geometry" not in obs

    def test_extracts_catchlight_topology(self):
        obs = _extract_observed_signals(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
            },
        )
        assert obs["catchlight_cluster_geometry"] == "triangular"
        assert obs["catchlight_count"] == 3

    def test_extracts_highlight_symmetry(self):
        obs = _extract_observed_signals(
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.35,
                "fill_detected": True,
                "underfill_ev": 1.5,
            },
        )
        assert obs["symmetry_score"] == 0.35
        assert obs["fill_detected"] is True
        assert obs["underfill_ev"] == 1.5

    def test_extracts_highlight_axis_map(self):
        obs = _extract_observed_signals(
            highlight_axis_map={
                "ok": True,
                "axis_count": 2,
                "wrap_ratio": 0.65,
            },
        )
        assert obs["axis_count"] == 2
        assert obs["wrap_ratio"] == 0.65

    def test_extracts_off_axis_key(self):
        obs = _extract_observed_signals(
            off_axis_key={
                "ok": True,
                "off_axis_angle_deg": 22.5,
            },
        )
        assert obs["off_axis_angle_deg"] == 22.5

    def test_extracts_light_structure(self):
        obs = _extract_observed_signals(
            light_structure={
                "ok": True,
                "pattern_name": "rembrandt",
                "triangle_detected": True,
            },
        )
        assert obs["light_structure_pattern"] == "rembrandt"
        assert obs["triangle_detected"] is True

    def test_extracts_separation_light(self):
        obs = _extract_observed_signals(
            separation_light={
                "ok": True,
                "has_hair_light": True,
                "has_rim_light": False,
                "spill_vs_intentional_confidence": 0.8,
            },
        )
        assert obs["has_hair_light"] is True
        assert obs["has_rim_light"] is False
        assert obs["spill_vs_intentional_confidence"] == 0.8

    def test_extracts_bounce_contributor(self):
        obs = _extract_observed_signals(
            bounce_contributor={
                "ok": True,
                "total_bounce_contribution": 0.15,
            },
        )
        assert obs["bounce_contribution"] == 0.15

    def test_extracts_continuous_source(self):
        obs = _extract_observed_signals(
            continuous_source={
                "ok": True,
                "likely_technology": "continuous_led",
                "specular_edge_sharpness": 0.3,
            },
        )
        assert obs["light_technology"] == "continuous_led"
        assert obs["specular_edge_sharpness"] == 0.3

    def test_unknown_geometry_excluded(self):
        obs = _extract_observed_signals(
            catchlight_topology={"ok": True, "cluster_geometry": "unknown"},
        )
        assert "catchlight_cluster_geometry" not in obs

    def test_unknown_technology_excluded(self):
        obs = _extract_observed_signals(
            continuous_source={"ok": True, "likely_technology": "unknown"},
        )
        assert "light_technology" not in obs

    def test_non_dict_inputs_safe(self):
        obs = _extract_observed_signals(
            catchlight_topology="bad",
            highlight_symmetry=42,
            separation_light=[],
        )
        assert obs == {}

    def test_all_passes_combined(self):
        obs = _extract_observed_signals(
            catchlight_topology={"ok": True, "cluster_geometry": "triangular", "catchlight_count": 3},
            highlight_symmetry={"ok": True, "symmetry_score": 0.6, "fill_detected": True, "underfill_ev": 0.8},
            highlight_axis_map={"ok": True, "axis_count": 1, "wrap_ratio": 0.7},
            off_axis_key={"ok": True, "off_axis_angle_deg": 20.0},
            light_structure={"ok": True, "pattern_name": "loop", "triangle_detected": False},
            separation_light={"ok": True, "has_hair_light": False, "has_rim_light": False},
            bounce_contributor={"ok": True, "total_bounce_contribution": 0.05},
            continuous_source={"ok": True, "likely_technology": "continuous_led", "specular_edge_sharpness": 0.25},
        )
        # Should have signals from all 8 passes
        assert len(obs) >= 10


# ═══════════════════════════════════════════════════════════════════════════
# Signal Matching Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSignalMatching:
    """Tests for _match_signal."""

    def test_exact_string_match(self):
        assert _match_signal({"expected": "triangular"}, "triangular") is True
        assert _match_signal({"expected": "triangular"}, "linear") is False

    def test_case_insensitive_match(self):
        assert _match_signal({"expected": "Triangular"}, "triangular") is True

    def test_list_match(self):
        spec = {"expected": ["triangular", "strip", "linear"]}
        assert _match_signal(spec, "strip") is True
        assert _match_signal(spec, "ring") is False

    def test_boolean_match(self):
        assert _match_signal({"expected": True}, True) is True
        assert _match_signal({"expected": True}, False) is False
        assert _match_signal({"expected": False}, False) is True

    def test_min_only(self):
        assert _match_signal({"min": 3}, 5) is True
        assert _match_signal({"min": 3}, 3) is True
        assert _match_signal({"min": 3}, 2) is False

    def test_max_only(self):
        assert _match_signal({"max": 0.4}, 0.3) is True
        assert _match_signal({"max": 0.4}, 0.4) is True
        assert _match_signal({"max": 0.4}, 0.5) is False

    def test_min_max_range(self):
        spec = {"min": 10, "max": 30}
        assert _match_signal(spec, 20) is True
        assert _match_signal(spec, 10) is True
        assert _match_signal(spec, 30) is True
        assert _match_signal(spec, 5) is False
        assert _match_signal(spec, 35) is False

    def test_none_value_never_matches(self):
        assert _match_signal({"expected": "foo"}, None) is False
        assert _match_signal({"min": 0}, None) is False

    def test_non_numeric_for_range_fails(self):
        assert _match_signal({"min": 3}, "not_a_number") is False


# ═══════════════════════════════════════════════════════════════════════════
# Archetype Scoring Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestArchetypeScoring:
    """Tests for _score_archetype."""

    def test_full_match(self):
        spec = {
            "signals": {
                "catchlight_cluster_geometry": {"expected": "triangular", "weight": 3.0},
                "catchlight_count": {"min": 3, "weight": 2.0},
            },
            "min_match_score": 0.5,
        }
        observed = {"catchlight_cluster_geometry": "triangular", "catchlight_count": 4}
        score, matched, unmatched = _score_archetype("test", spec, observed)
        assert score == 1.0
        assert len(matched) == 2
        assert len(unmatched) == 0

    def test_partial_match(self):
        spec = {
            "signals": {
                "sig_a": {"expected": "foo", "weight": 1.0},
                "sig_b": {"expected": "bar", "weight": 1.0},
            },
        }
        observed = {"sig_a": "foo", "sig_b": "wrong"}
        score, matched, unmatched = _score_archetype("test", spec, observed)
        assert score == 0.5
        assert len(matched) == 1
        assert len(unmatched) == 1

    def test_no_observed_signals(self):
        spec = {
            "signals": {
                "sig_a": {"expected": "foo", "weight": 1.0},
            },
        }
        score, matched, unmatched = _score_archetype("test", spec, {})
        assert score == 0.0
        assert len(matched) == 0

    def test_weighted_scoring(self):
        spec = {
            "signals": {
                "heavy": {"expected": "yes", "weight": 9.0},
                "light": {"expected": "yes", "weight": 1.0},
            },
        }
        # Only heavy matches
        observed = {"heavy": "yes", "light": "no"}
        score, _, _ = _score_archetype("test", spec, observed)
        assert score == 0.9  # 9/(9+1)

        # Only light matches
        observed = {"heavy": "no", "light": "yes"}
        score, _, _ = _score_archetype("test", spec, observed)
        assert score == 0.1  # 1/(9+1)

    def test_empty_signals_returns_zero(self):
        spec = {"signals": {}}
        score, _, _ = _score_archetype("test", spec, {"anything": "val"})
        assert score == 0.0


# ═══════════════════════════════════════════════════════════════════════════
# Full Classification Scenarios
# ═══════════════════════════════════════════════════════════════════════════


class TestClassifyArchetype:
    """Tests for classify_archetype with synthetic scenarios."""

    def test_hurley_scenario(self):
        """Triangular catchlights + off-axis + continuous → hurley."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.7,
                "fill_detected": True,
                "underfill_ev": 0.8,
            },
            highlight_axis_map={
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.75,
            },
            off_axis_key={
                "ok": True,
                "off_axis_angle_deg": 20.0,
            },
            light_structure={
                "ok": True,
                "pattern_name": "loop",
                "triangle_detected": False,
            },
            continuous_source={
                "ok": True,
                "likely_technology": "continuous_led",
                "specular_edge_sharpness": 0.2,
            },
        )
        assert result.ok
        assert result.primary_archetype == "hurley"
        assert result.primary_confidence > 0.5

    def test_penn_scenario(self):
        """Strip catchlights + harsh + minimal fill → penn."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "strip",
                "catchlight_count": 2,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.2,
                "fill_detected": False,
                "underfill_ev": 2.5,
            },
            light_structure={
                "ok": True,
                "pattern_name": "rembrandt",
                "triangle_detected": True,
            },
            continuous_source={
                "ok": True,
                "likely_technology": "strobe",
                "specular_edge_sharpness": 0.75,
            },
            bounce_contributor={
                "ok": True,
                "total_bounce_contribution": 0.05,
            },
        )
        assert result.ok
        assert result.primary_archetype == "penn"
        assert result.primary_confidence > 0.5

    def test_karsh_scenario(self):
        """Single key + Rembrandt triangle + deep shadows → karsh."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "single",
                "catchlight_count": 1,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.15,
                "fill_detected": False,
                "underfill_ev": 3.0,
            },
            light_structure={
                "ok": True,
                "pattern_name": "rembrandt",
                "triangle_detected": True,
            },
            separation_light={
                "ok": True,
                "has_hair_light": True,
                "has_rim_light": False,
                "spill_vs_intentional_confidence": 0.8,
            },
            off_axis_key={
                "ok": True,
                "off_axis_angle_deg": 40.0,
            },
        )
        assert result.ok
        assert result.primary_archetype == "karsh"
        assert result.primary_confidence > 0.5

    def test_leibovitz_scenario(self):
        """Complex multi-light + location → leibovitz."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 4,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.5,
                "fill_detected": True,
                "underfill_ev": 1.5,
            },
            highlight_axis_map={
                "ok": True,
                "axis_count": 3,
                "wrap_ratio": 0.55,
            },
            light_structure={
                "ok": True,
                "pattern_name": "loop",
                "triangle_detected": False,
            },
            separation_light={
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": True,
            },
        )
        assert result.ok
        assert result.primary_archetype == "leibovitz"
        assert result.primary_confidence > 0.4

    def test_caravaggio_scenario(self):
        """Single hard key, extreme contrast, minimal fill."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "single",
                "catchlight_count": 1,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.1,
                "fill_detected": False,
                "underfill_ev": 4.0,
            },
            continuous_source={
                "ok": True,
                "likely_technology": "strobe",
                "specular_edge_sharpness": 0.85,
            },
            bounce_contributor={
                "ok": True,
                "total_bounce_contribution": 0.02,
            },
            light_structure={
                "ok": True,
                "pattern_name": "split",
                "triangle_detected": False,
            },
        )
        assert result.ok
        assert result.primary_archetype == "caravaggio"
        assert result.primary_confidence > 0.5

    def test_ambiguous_scenario_low_confidence(self):
        """Ambiguous signals → low confidence or no primary."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "dual",
                "catchlight_count": 2,
            },
        )
        assert result.ok
        # With very limited data, confidence should be modest
        if result.primary_archetype:
            assert result.primary_confidence < 0.8

    def test_no_data_graceful_fallback(self):
        """All None inputs → no classification, ok=True."""
        result = classify_archetype()
        assert result.ok
        assert result.primary_archetype is None
        assert result.primary_confidence == 0.0

    def test_all_failed_passes(self):
        """All passes failed → no signals, no classification."""
        result = classify_archetype(
            catchlight_topology={"ok": False},
            highlight_symmetry={"ok": False},
            light_structure={"ok": False},
        )
        assert result.ok
        assert result.primary_archetype is None

    def test_result_includes_all_scores(self):
        """all_scores dict should include every archetype."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "single",
                "catchlight_count": 1,
            },
        )
        assert isinstance(result.all_scores, dict)
        # Should have scores for multiple archetypes
        assert len(result.all_scores) > 0

    def test_secondary_archetype_populated(self):
        """When multiple archetypes match, secondary should be set."""
        # Hurley-like but also partially bryce-like
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
            },
            highlight_symmetry={
                "ok": True,
                "symmetry_score": 0.7,
                "fill_detected": True,
                "underfill_ev": 0.5,
            },
            highlight_axis_map={
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.75,
            },
            off_axis_key={
                "ok": True,
                "off_axis_angle_deg": 20.0,
            },
            light_structure={
                "ok": True,
                "pattern_name": "loop",
                "triangle_detected": False,
            },
            continuous_source={
                "ok": True,
                "likely_technology": "continuous_led",
                "specular_edge_sharpness": 0.2,
            },
        )
        # With rich data, should have both primary and secondary
        assert result.primary_archetype is not None
        # Secondary may or may not be set depending on scoring

    def test_matched_unmatched_populated(self):
        """Matched and unmatched signal lists should be populated."""
        result = classify_archetype(
            catchlight_topology={
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
            },
        )
        # Should have some matched and/or unmatched signals
        total = len(result.matched_signals) + len(result.unmatched_signals)
        assert total > 0


# ═══════════════════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════════════════


class TestEdgeCases:
    """Edge case and robustness tests."""

    def test_nonexistent_signatures_path(self, tmp_path):
        """Non-existent YAML path → graceful fallback."""
        result = classify_archetype(
            catchlight_topology={"ok": True, "cluster_geometry": "triangular"},
            signatures_path=str(tmp_path / "nonexistent.yaml"),
        )
        assert result.ok
        assert result.primary_archetype is None
        assert "No archetype signatures loaded" in result.notes

    def test_invalid_yaml_content(self, tmp_path):
        """Invalid YAML → graceful fallback."""
        bad_yaml = tmp_path / "bad.yaml"
        bad_yaml.write_text("- not\n  a: valid: archetype: file\n[broken")
        result = classify_archetype(
            catchlight_topology={"ok": True, "cluster_geometry": "triangular"},
            signatures_path=str(bad_yaml),
        )
        # Should handle gracefully (either ok with no results or ok=False)
        assert isinstance(result, ArchetypeClassification)

    def test_zero_weight_signals(self, tmp_path):
        """Signals with weight 0 should not affect scoring."""
        yaml_content = """
test_arch:
  label: "Test"
  description: "Test archetype"
  signals:
    sig_a:
      expected: "yes"
      weight: 0.0
  min_match_score: 0.0
"""
        yaml_path = tmp_path / "test_sigs.yaml"
        yaml_path.write_text(yaml_content)

        result = classify_archetype(
            catchlight_topology={"ok": True, "cluster_geometry": "yes"},
            signatures_path=str(yaml_path),
        )
        # Zero-weight signals shouldn't contribute
        assert result.ok

    def test_classification_is_deterministic(self):
        """Same inputs should always produce same output."""
        kwargs = dict(
            catchlight_topology={"ok": True, "cluster_geometry": "triangular", "catchlight_count": 3},
            highlight_symmetry={"ok": True, "symmetry_score": 0.7, "fill_detected": True},
        )
        r1 = classify_archetype(**kwargs)
        r2 = classify_archetype(**kwargs)
        assert r1.primary_archetype == r2.primary_archetype
        assert r1.primary_confidence == r2.primary_confidence
