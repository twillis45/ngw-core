"""Tests for master mode extensions — Penn, Karsh, Leibovitz profiles + archetype affinity.

Covers:
  - New profiles load from master_modes.yaml
  - New profiles have required structure
  - compute_master_mode_bonus works for new modes
  - archetype_mode_affinity scoring
  - Backward compatibility with existing modes
"""

from __future__ import annotations

from typing import Any, Dict

import pytest

from engine.master_mode import (
    archetype_mode_affinity,
    compute_master_mode_bonus,
    get_coaching_overlay,
    get_diagram_overrides,
    get_mode,
    list_modes,
    load_master_modes,
)


# ═══════════════════════════════════════════════════════════════════════════
# Profile Loading Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestNewProfilesExist:
    """Verify Penn, Karsh, Leibovitz profiles load correctly."""

    def test_penn_profile_exists(self):
        mode = get_mode("penn")
        assert mode is not None
        assert mode["label"] == "Penn Mode"

    def test_karsh_profile_exists(self):
        mode = get_mode("karsh")
        assert mode is not None
        assert mode["label"] == "Karsh Mode"

    def test_leibovitz_profile_exists(self):
        mode = get_mode("leibovitz")
        assert mode is not None
        assert mode["label"] == "Leibovitz Mode"

    def test_all_8_modes_present(self):
        modes = load_master_modes()
        expected = {"hurley", "adler", "heisler", "bryce", "caravaggio", "penn", "karsh", "leibovitz"}
        assert expected.issubset(set(modes.keys()))

    def test_list_modes_includes_new(self):
        modes_list = list_modes()
        mode_ids = {m["id"] for m in modes_list}
        assert "penn" in mode_ids
        assert "karsh" in mode_ids
        assert "leibovitz" in mode_ids


class TestNewProfileStructure:
    """Verify new profiles have the required YAML structure."""

    @pytest.fixture(params=["penn", "karsh", "leibovitz"])
    def mode_def(self, request):
        return request.param, get_mode(request.param)

    def test_has_label_and_tagline(self, mode_def):
        mode_id, mode = mode_def
        assert "label" in mode, f"{mode_id} missing label"
        assert "tagline" in mode, f"{mode_id} missing tagline"
        assert "icon" in mode, f"{mode_id} missing icon"

    def test_has_scoring_bias(self, mode_def):
        mode_id, mode = mode_def
        bias = mode.get("scoring_bias")
        assert bias is not None, f"{mode_id} missing scoring_bias"
        assert "mood_affinity" in bias
        assert "modifier_affinity" in bias
        assert "gear_affinity" in bias
        assert "bonus_points" in bias
        assert isinstance(bias["bonus_points"], (int, float))
        assert bias["bonus_points"] > 0

    def test_has_diagram_override(self, mode_def):
        mode_id, mode = mode_def
        diag = mode.get("diagram_override")
        assert diag is not None, f"{mode_id} missing diagram_override"
        assert "key_modifier_pref" in diag
        assert isinstance(diag["key_modifier_pref"], list)

    def test_has_coaching_overlay(self, mode_def):
        mode_id, mode = mode_def
        coaching = mode.get("coaching_overlay")
        assert coaching is not None, f"{mode_id} missing coaching_overlay"
        assert "rationale" in coaching
        assert "camera" in coaching
        assert "good_signs" in coaching
        assert "warnings" in coaching
        assert "quick_fixes" in coaching
        assert "lights_guide" in coaching
        assert isinstance(coaching["lights_guide"], list)
        assert len(coaching["lights_guide"]) > 0


# ═══════════════════════════════════════════════════════════════════════════
# Scoring Bias Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestMasterModeBonusNewModes:
    """Tests for compute_master_mode_bonus with new modes."""

    def _make_system(self, mood: str, modifier: str, gear: str) -> Dict[str, Any]:
        return {
            "taxonomy_refs": {
                "mood": mood,
                "modifier_family": modifier,
                "gear_profile": gear,
            }
        }

    def test_penn_full_match(self):
        system = self._make_system("editorial", "stripbox", "strobe_mono")
        bonus = compute_master_mode_bonus(system, "penn")
        assert bonus > 0
        # Full 3/3 match → full bonus (12 points)
        assert bonus == 12.0

    def test_penn_partial_match(self):
        system = self._make_system("editorial", "softbox", "continuous_led")
        bonus = compute_master_mode_bonus(system, "penn")
        # Only mood matches → 1/3 of 12 = 4.0
        assert bonus == pytest.approx(4.0, abs=0.1)

    def test_penn_no_match(self):
        system = self._make_system("beauty", "umbrella", "continuous_panel")
        bonus = compute_master_mode_bonus(system, "penn")
        assert bonus == 0.0

    def test_karsh_full_match(self):
        system = self._make_system("dramatic", "grid_spot", "strobe_pack")
        bonus = compute_master_mode_bonus(system, "karsh")
        assert bonus > 0
        # Full 3/3 → bonus_points (13)
        assert bonus == 13.0

    def test_leibovitz_full_match(self):
        system = self._make_system("cinematic", "softbox", "strobe_mono")
        bonus = compute_master_mode_bonus(system, "leibovitz")
        assert bonus > 0
        # Full 3/3 → bonus_points (11)
        assert bonus == 11.0

    def test_leibovitz_mixed_gear(self):
        # continuous_led is also in leibovitz gear_affinity
        system = self._make_system("editorial", "umbrella", "continuous_led")
        bonus = compute_master_mode_bonus(system, "leibovitz")
        assert bonus > 0  # All 3 match


# ═══════════════════════════════════════════════════════════════════════════
# Diagram Override Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestDiagramOverridesNewModes:
    """Verify diagram overrides return correctly for new modes."""

    def test_penn_diagram_overrides(self):
        overrides = get_diagram_overrides("penn")
        assert overrides is not None
        assert overrides.get("fill_enable") is False
        assert overrides.get("rim_enable") is False

    def test_karsh_diagram_overrides(self):
        overrides = get_diagram_overrides("karsh")
        assert overrides is not None
        assert overrides.get("force_pattern") == "rembrandt"
        assert overrides.get("rim_enable") is True

    def test_leibovitz_diagram_overrides(self):
        overrides = get_diagram_overrides("leibovitz")
        assert overrides is not None
        assert overrides.get("fill_enable") is True
        assert overrides.get("rim_enable") is True
        assert overrides.get("background_light") is True


# ═══════════════════════════════════════════════════════════════════════════
# Coaching Overlay Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestCoachingOverlayNewModes:
    """Verify coaching overlays for new modes."""

    @pytest.fixture(params=["penn", "karsh", "leibovitz"])
    def mode_id(self, request):
        return request.param

    def test_coaching_overlay_returns_data(self, mode_id):
        overlay = get_coaching_overlay(mode_id)
        assert overlay is not None
        assert "masterModeId" in overlay
        assert overlay["masterModeId"] == mode_id
        assert "masterModeLabel" in overlay
        assert "rationale" in overlay

    def test_coaching_has_lights_guide(self, mode_id):
        overlay = get_coaching_overlay(mode_id)
        assert "lights_guide" in overlay
        for guide in overlay["lights_guide"]:
            assert "role" in guide
            assert "label" in guide
            assert "purpose" in guide


# ═══════════════════════════════════════════════════════════════════════════
# Archetype Mode Affinity Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestArchetypeModeAffinity:
    """Tests for archetype_mode_affinity scoring."""

    def test_matching_archetype_and_mode(self):
        """When archetype matches mode, bonus should be positive."""
        arch_result = {
            "primary_archetype": "hurley",
            "primary_confidence": 0.8,
        }
        bonus = archetype_mode_affinity(arch_result, "hurley")
        assert bonus > 0
        # hurley bonus_points = 12, confidence = 0.8, scale = 0.5
        # expected: 12 * 0.8 * 0.5 = 4.8
        assert bonus == pytest.approx(4.8, abs=0.01)

    def test_mismatched_archetype_and_mode(self):
        """When archetype doesn't match mode, bonus should be 0."""
        arch_result = {
            "primary_archetype": "hurley",
            "primary_confidence": 0.9,
        }
        bonus = archetype_mode_affinity(arch_result, "penn")
        assert bonus == 0.0

    def test_no_master_mode_returns_zero(self):
        arch_result = {
            "primary_archetype": "hurley",
            "primary_confidence": 0.9,
        }
        assert archetype_mode_affinity(arch_result, None) == 0.0
        assert archetype_mode_affinity(arch_result, "") == 0.0

    def test_no_archetype_result_returns_zero(self):
        assert archetype_mode_affinity(None, "hurley") == 0.0
        assert archetype_mode_affinity({}, "hurley") == 0.0

    def test_no_primary_archetype_returns_zero(self):
        arch_result = {
            "primary_archetype": None,
            "primary_confidence": 0.0,
        }
        assert archetype_mode_affinity(arch_result, "hurley") == 0.0

    def test_penn_affinity(self):
        arch_result = {"primary_archetype": "penn", "primary_confidence": 0.7}
        bonus = archetype_mode_affinity(arch_result, "penn")
        # penn bonus_points = 12, confidence = 0.7, scale = 0.5
        assert bonus == pytest.approx(4.2, abs=0.01)

    def test_karsh_affinity(self):
        arch_result = {"primary_archetype": "karsh", "primary_confidence": 0.6}
        bonus = archetype_mode_affinity(arch_result, "karsh")
        # karsh bonus_points = 13, confidence = 0.6, scale = 0.5
        assert bonus == pytest.approx(3.9, abs=0.01)

    def test_leibovitz_affinity(self):
        arch_result = {"primary_archetype": "leibovitz", "primary_confidence": 0.5}
        bonus = archetype_mode_affinity(arch_result, "leibovitz")
        # leibovitz bonus_points = 11, confidence = 0.5, scale = 0.5
        assert bonus == pytest.approx(2.75, abs=0.01)

    def test_low_confidence_reduces_bonus(self):
        arch_result = {"primary_archetype": "hurley", "primary_confidence": 0.1}
        bonus = archetype_mode_affinity(arch_result, "hurley")
        # 12 * 0.1 * 0.5 = 0.6
        assert bonus == pytest.approx(0.6, abs=0.01)

    def test_non_dict_archetype_result(self):
        """Non-dict archetype result should return 0."""
        assert archetype_mode_affinity("not_a_dict", "hurley") == 0.0
        assert archetype_mode_affinity(42, "hurley") == 0.0

    def test_unknown_mode_returns_zero(self):
        arch_result = {"primary_archetype": "unknown_mode", "primary_confidence": 0.9}
        assert archetype_mode_affinity(arch_result, "unknown_mode") == 0.0


# ═══════════════════════════════════════════════════════════════════════════
# Backward Compatibility
# ═══════════════════════════════════════════════════════════════════════════


class TestBackwardCompatibility:
    """Ensure existing modes are unaffected."""

    @pytest.fixture(params=["hurley", "adler", "heisler", "bryce", "caravaggio"])
    def existing_mode(self, request):
        return request.param

    def test_existing_mode_still_loads(self, existing_mode):
        mode = get_mode(existing_mode)
        assert mode is not None

    def test_existing_mode_bonus_unchanged(self, existing_mode):
        """Existing modes should compute bonus identically."""
        mode = get_mode(existing_mode)
        bias = mode["scoring_bias"]

        # Full match system
        system = {
            "taxonomy_refs": {
                "mood": bias["mood_affinity"][0],
                "modifier_family": bias["modifier_affinity"][0],
                "gear_profile": bias["gear_affinity"][0],
            }
        }
        bonus = compute_master_mode_bonus(system, existing_mode)
        # Should equal full bonus_points
        assert bonus == float(bias["bonus_points"])

    def test_existing_mode_diagram_returns(self, existing_mode):
        overrides = get_diagram_overrides(existing_mode)
        assert overrides is not None

    def test_existing_mode_coaching_returns(self, existing_mode):
        overlay = get_coaching_overlay(existing_mode)
        assert overlay is not None
        assert overlay["masterModeId"] == existing_mode
