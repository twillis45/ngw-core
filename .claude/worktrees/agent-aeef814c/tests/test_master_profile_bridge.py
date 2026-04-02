"""Tests for the master profile bridge module."""

import pytest

from engine.master_profile_bridge import (
    build_master_profile_summary,
    apply_master_profile_to_vlm,
)
from engine.solver_models import MasterProfileSummary


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════

def _hurley_classification():
    return {
        "primary_archetype": "hurley",
        "primary_confidence": 0.82,
        "secondary_archetype": "adler",
        "secondary_confidence": 0.35,
        "all_scores": {"hurley": 0.82, "adler": 0.35, "penn": 0.10},
        "matched_signals": ["catchlight_cluster_geometry", "off_axis_angle_deg", "wrap_ratio"],
        "unmatched_signals": ["fill_detected"],
        "notes": ["Strong triangular catchlight match"],
        "ok": True,
    }


def _karsh_classification():
    return {
        "primary_archetype": "karsh",
        "primary_confidence": 0.71,
        "secondary_archetype": "heisler",
        "secondary_confidence": 0.42,
        "all_scores": {"karsh": 0.71, "heisler": 0.42},
        "matched_signals": ["shadow_depth_ratio", "single_catchlight"],
        "unmatched_signals": [],
        "notes": [],
        "ok": True,
    }


# ═══════════════════════════════════════════════════════════════════════════
# build_master_profile_summary
# ═══════════════════════════════════════════════════════════════════════════

class TestBuildMasterProfileSummary:

    def test_returns_none_for_none(self):
        assert build_master_profile_summary(None) is None

    def test_returns_none_for_empty_dict(self):
        assert build_master_profile_summary({}) is None

    def test_hurley_maps_to_commercial_headshot(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert summary is not None
        assert summary.primary_profile == "hurley"
        assert summary.primary_confidence == 0.82
        assert summary.style_family == "commercial_headshot"

    def test_secondary_archetype_preserved(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert summary.secondary_profile == "adler"
        assert summary.secondary_confidence == 0.35

    def test_karsh_maps_to_dramatic_portrait(self):
        summary = build_master_profile_summary(_karsh_classification())
        assert summary.primary_profile == "karsh"
        assert summary.style_family == "dramatic_portrait"

    def test_matched_signals_preserved(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert "catchlight_cluster_geometry" in summary.matched_signals
        assert "off_axis_angle_deg" in summary.matched_signals

    def test_unmatched_signals_preserved(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert "fill_detected" in summary.unmatched_signals

    def test_notes_preserved(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert "Strong triangular catchlight match" in summary.notes

    def test_unknown_archetype_returns_summary(self):
        data = {
            "primary_archetype": "unknown",
            "primary_confidence": 0.2,
            "ok": True,
        }
        summary = build_master_profile_summary(data)
        assert summary is not None
        assert summary.primary_profile == "unknown"
        assert summary.style_family == "unknown"

    def test_failed_classification_with_no_confidence_returns_none(self):
        data = {
            "primary_archetype": "unknown",
            "primary_confidence": 0.0,
            "ok": False,
        }
        assert build_master_profile_summary(data) is None

    @pytest.mark.parametrize("archetype,expected_family", [
        ("hurley", "commercial_headshot"),
        ("penn", "editorial_portrait"),
        ("karsh", "dramatic_portrait"),
        ("leibovitz", "editorial_portrait"),
        ("adler", "beauty"),
        ("heisler", "dramatic_portrait"),
        ("caravaggio", "dramatic_portrait"),
        ("bryce", "natural_light"),
    ])
    def test_style_family_mapping(self, archetype, expected_family):
        data = {
            "primary_archetype": archetype,
            "primary_confidence": 0.7,
            "ok": True,
        }
        summary = build_master_profile_summary(data)
        assert summary.style_family == expected_family

    def test_result_is_master_profile_summary_type(self):
        summary = build_master_profile_summary(_hurley_classification())
        assert isinstance(summary, MasterProfileSummary)


# ═══════════════════════════════════════════════════════════════════════════
# apply_master_profile_to_vlm
# ═══════════════════════════════════════════════════════════════════════════

class TestApplyMasterProfileToVlm:

    def test_populates_flat_fields(self):
        vlm = {}
        apply_master_profile_to_vlm(vlm, _hurley_classification())
        assert vlm["master_profile"] == "hurley"
        assert vlm["master_profile_confidence"] == 0.82
        assert vlm["style_family"] == "commercial_headshot"

    def test_noop_for_none(self):
        vlm = {}
        apply_master_profile_to_vlm(vlm, None)
        assert "master_profile" not in vlm

    def test_noop_for_empty_dict(self):
        vlm = {}
        apply_master_profile_to_vlm(vlm, {})
        assert "master_profile" not in vlm

    def test_karsh_style_family(self):
        vlm = {}
        apply_master_profile_to_vlm(vlm, _karsh_classification())
        assert vlm["style_family"] == "dramatic_portrait"
