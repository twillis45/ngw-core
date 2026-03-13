"""Tests for engine.master_mode — the enrichment/bias layer."""

import pytest

from engine.master_mode import (
    compute_master_mode_bonus,
    get_coaching_overlay,
    get_diagram_overrides,
    get_mode,
    list_modes,
    load_master_modes,
)


# ── Loading ──

def test_load_master_modes_returns_dict():
    modes = load_master_modes()
    assert isinstance(modes, dict)
    assert len(modes) >= 5


def test_list_modes_returns_summary():
    modes = list_modes()
    assert isinstance(modes, list)
    ids = {m["id"] for m in modes}
    assert {"hurley", "adler", "heisler", "bryce", "caravaggio"} <= ids
    for m in modes:
        assert "label" in m
        assert "tagline" in m


def test_get_mode_none_returns_none():
    assert get_mode(None) is None
    assert get_mode("") is None


def test_get_mode_valid():
    mode = get_mode("hurley")
    assert mode is not None
    assert mode["label"] == "Hurley Mode"


def test_get_mode_unknown_returns_none():
    assert get_mode("nonexistent_mode") is None


# ── Scoring bias ──

class TestMasterModeBonus:

    def _system(self, mood="beauty", modifier="softbox", gear="continuous_led"):
        return {
            "id": "test-sys",
            "taxonomy_refs": {
                "mood": mood,
                "modifier_family": modifier,
                "gear_profile": gear,
            },
        }

    def test_none_mode_returns_zero(self):
        assert compute_master_mode_bonus(self._system(), None) == 0.0

    def test_empty_mode_returns_zero(self):
        assert compute_master_mode_bonus(self._system(), "") == 0.0

    def test_unknown_mode_returns_zero(self):
        assert compute_master_mode_bonus(self._system(), "nonexistent") == 0.0

    def test_hurley_full_match(self):
        """System with beauty + softbox + continuous_led should get full hurley bonus."""
        bonus = compute_master_mode_bonus(self._system(), "hurley")
        assert bonus == 12.0  # full 3/3 match

    def test_hurley_partial_match(self):
        """System with beauty mood but non-matching modifier/gear gets partial bonus."""
        bonus = compute_master_mode_bonus(
            self._system(mood="beauty", modifier="grid_spot", gear="strobe_pack"),
            "hurley",
        )
        # 1/3 match (mood only)
        assert bonus == pytest.approx(4.0, abs=0.01)

    def test_hurley_no_match(self):
        """System with cinematic + grid_spot + strobe_pack gets zero bonus from hurley."""
        bonus = compute_master_mode_bonus(
            self._system(mood="cinematic", modifier="grid_spot", gear="strobe_pack"),
            "hurley",
        )
        assert bonus == 0.0

    def test_caravaggio_full_match(self):
        bonus = compute_master_mode_bonus(
            self._system(mood="cinematic", modifier="grid_spot", gear="strobe_mono"),
            "caravaggio",
        )
        assert bonus == pytest.approx(14.0, abs=0.01)

    def test_caravaggio_partial_match(self):
        bonus = compute_master_mode_bonus(
            self._system(mood="cinematic", modifier="softbox", gear="continuous_led"),
            "caravaggio",
        )
        # 1/3 match (mood only)
        assert bonus == pytest.approx(14.0 / 3, abs=0.1)


# ── Diagram overrides ──

class TestDiagramOverrides:

    def test_none_mode_returns_none(self):
        assert get_diagram_overrides(None) is None

    def test_hurley_force_pattern(self):
        ov = get_diagram_overrides("hurley")
        assert ov is not None
        assert ov["force_pattern"] == "triangle"

    def test_caravaggio_no_fill(self):
        ov = get_diagram_overrides("caravaggio")
        assert ov is not None
        assert ov["fill_enable"] is False
        assert ov["rim_enable"] is False

    def test_adler_has_rim(self):
        ov = get_diagram_overrides("adler")
        assert ov is not None
        assert ov["rim_enable"] is True

    def test_bryce_no_rim(self):
        ov = get_diagram_overrides("bryce")
        assert ov is not None
        assert ov["rim_enable"] is False


# ── Coaching overlay ──

class TestCoachingOverlay:

    def test_none_returns_none(self):
        assert get_coaching_overlay(None) is None

    def test_hurley_has_rationale(self):
        overlay = get_coaching_overlay("hurley")
        assert overlay is not None
        assert "rationale" in overlay
        assert "triangle" in overlay["rationale"].lower()

    def test_overlay_includes_mode_metadata(self):
        overlay = get_coaching_overlay("hurley")
        assert overlay["masterModeId"] == "hurley"
        assert overlay["masterModeLabel"] == "Hurley Mode"

    def test_caravaggio_has_warnings(self):
        overlay = get_coaching_overlay("caravaggio")
        assert overlay is not None
        assert len(overlay.get("warnings", [])) > 0

    def test_all_modes_have_coaching(self):
        for mode_id in ["hurley", "adler", "heisler", "bryce", "caravaggio"]:
            overlay = get_coaching_overlay(mode_id)
            assert overlay is not None, f"{mode_id} missing coaching overlay"
            assert "rationale" in overlay
            assert "camera" in overlay
            assert "good_signs" in overlay
