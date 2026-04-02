"""Tests for occluder analysis module."""

import pytest

from engine.occluder_analysis import analyze_occluders
from engine.solver_models import (
    CanonicalDirection,
    OccluderEstimate,
    OccluderImpact,
    SceneGeometryModel,
)


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _scene_with_occluders(*occluders):
    return SceneGeometryModel(occluders=list(occluders))


def _occluder(**kwargs):
    defaults = {
        "occluder_id": "occ_1",
        "occluder_type": "unknown",
        "severity": "partial",
        "confidence": 0.7,
    }
    defaults.update(kwargs)
    return OccluderEstimate(**defaults)


# ═══════════════════════════════════════════════════════════════════════════
# Empty / None inputs
# ═══════════════════════════════════════════════════════════════════════════

class TestNoOccluders:

    def test_none_geometry_returns_empty(self):
        assert analyze_occluders(None) == []

    def test_empty_occluders_returns_empty(self):
        scene = SceneGeometryModel()
        assert analyze_occluders(scene) == []


# ═══════════════════════════════════════════════════════════════════════════
# Single occluder scenarios
# ═══════════════════════════════════════════════════════════════════════════

class TestSingleOccluder:

    def test_partial_body_part_affects_face_passes(self):
        scene = _scene_with_occluders(
            _occluder(occluder_type="body_part", severity="partial")
        )
        impacts = analyze_occluders(scene)
        assert len(impacts) == 1
        assert "catchlight_pass" in impacts[0].passes_downgraded
        assert "highlight_pass" in impacts[0].passes_downgraded

    def test_full_architecture_affects_shadow_and_direction(self):
        scene = _scene_with_occluders(
            _occluder(occluder_type="architecture", severity="full")
        )
        impacts = analyze_occluders(scene)
        assert "shadow_pass" in impacts[0].passes_downgraded
        assert "light_direction_field_pass" in impacts[0].passes_downgraded

    def test_full_severity_higher_weight_reduction(self):
        partial = _scene_with_occluders(
            _occluder(severity="partial", confidence=0.8)
        )
        full = _scene_with_occluders(
            _occluder(severity="full", confidence=0.8)
        )
        partial_impact = analyze_occluders(partial)[0]
        full_impact = analyze_occluders(full)[0]
        assert full_impact.weight_reduction > partial_impact.weight_reduction

    def test_explicit_affected_passes_used(self):
        scene = _scene_with_occluders(
            _occluder(affected_passes=["catchlight_pass"])
        )
        impacts = analyze_occluders(scene)
        assert impacts[0].passes_downgraded == ["catchlight_pass"]

    def test_region_based_inference(self):
        scene = _scene_with_occluders(
            _occluder(affected_region="face")
        )
        impacts = analyze_occluders(scene)
        assert "catchlight_pass" in impacts[0].passes_downgraded
        assert "highlight_pass" in impacts[0].passes_downgraded

    def test_background_region_inference(self):
        scene = _scene_with_occluders(
            _occluder(affected_region="background")
        )
        impacts = analyze_occluders(scene)
        assert "shadow_pass" in impacts[0].passes_downgraded
        assert "light_direction_field_pass" in impacts[0].passes_downgraded


# ═══════════════════════════════════════════════════════════════════════════
# Shadow direction compromise
# ═══════════════════════════════════════════════════════════════════════════

class TestShadowCompromise:

    def test_full_occluder_high_confidence_compromises_shadow(self):
        scene = _scene_with_occluders(
            _occluder(
                severity="full", confidence=0.9,
                affected_passes=["shadow_pass"],
            )
        )
        impacts = analyze_occluders(scene)
        assert impacts[0].shadow_direction_compromised is True

    def test_partial_occluder_does_not_compromise_shadow(self):
        scene = _scene_with_occluders(
            _occluder(
                severity="partial", confidence=0.9,
                affected_passes=["shadow_pass"],
            )
        )
        impacts = analyze_occluders(scene)
        assert impacts[0].shadow_direction_compromised is False

    def test_low_confidence_does_not_compromise_shadow(self):
        scene = _scene_with_occluders(
            _occluder(
                severity="full", confidence=0.3,
                affected_passes=["shadow_pass"],
            )
        )
        impacts = analyze_occluders(scene)
        assert impacts[0].shadow_direction_compromised is False


# ═══════════════════════════════════════════════════════════════════════════
# Multiple occluders
# ═══════════════════════════════════════════════════════════════════════════

class TestMultipleOccluders:

    def test_multiple_occluders_produce_multiple_impacts(self):
        scene = _scene_with_occluders(
            _occluder(occluder_id="occ_1", occluder_type="body_part"),
            _occluder(occluder_id="occ_2", occluder_type="architecture"),
        )
        impacts = analyze_occluders(scene)
        assert len(impacts) == 2
        assert impacts[0].occluder_id == "occ_1"
        assert impacts[1].occluder_id == "occ_2"


# ═══════════════════════════════════════════════════════════════════════════
# Notes generation
# ═══════════════════════════════════════════════════════════════════════════

class TestNotes:

    def test_full_shadow_block_generates_note(self):
        scene = _scene_with_occluders(
            _occluder(
                severity="full", confidence=0.9,
                affected_passes=["shadow_pass"],
            )
        )
        impacts = analyze_occluders(scene)
        assert any("blocks shadow" in n for n in impacts[0].notes)

    def test_full_catchlight_block_generates_note(self):
        scene = _scene_with_occluders(
            _occluder(
                severity="full", confidence=0.9,
                affected_passes=["catchlight_pass"],
            )
        )
        impacts = analyze_occluders(scene)
        assert any("catchlight" in n.lower() for n in impacts[0].notes)

    def test_impact_is_correct_type(self):
        scene = _scene_with_occluders(_occluder())
        impacts = analyze_occluders(scene)
        assert all(isinstance(i, OccluderImpact) for i in impacts)
