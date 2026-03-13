"""Tests for surface-aware highlight interpretation.

Tests cover:
1. Surface response profile lookup and structure
2. All surface classes have profiles
3. Correction value ranges
4. Satin/chrome/leather surface corrections
"""
from __future__ import annotations

import pytest

from engine.vision_passes import (
    _SURFACE_RESPONSE_PROFILES,
    _SURFACE_CLASSES,
)


# ═══════════════════════════════════════════════════════════════════════════
# Surface Response Profile tests
# ═══════════════════════════════════════════════════════════════════════════

class TestSurfaceResponseProfiles:
    """Test _SURFACE_RESPONSE_PROFILES structure and values."""

    def test_all_classes_have_profiles(self):
        """Every surface class should have a response profile."""
        for cls in _SURFACE_CLASSES:
            assert cls in _SURFACE_RESPONSE_PROFILES, f"Missing profile for {cls}"

    def test_unknown_profile_exists(self):
        assert "unknown" in _SURFACE_RESPONSE_PROFILES

    def test_profile_has_required_keys(self):
        """Each profile should have all expected keys."""
        required_keys = [
            "highlight_width_correction",
            "rolloff_correction",
            "specularity_correction",
            "specular_spread_correction",
            "shadow_reliability",
            "highlight_reliability",
            "preferred_signals",
            "reflection_dominant",
        ]
        for cls, profile in _SURFACE_RESPONSE_PROFILES.items():
            for key in required_keys:
                assert key in profile, f"Profile {cls} missing key {key}"

    def test_reliability_range(self):
        """Shadow and highlight reliability should be in [0, 1]."""
        for cls, profile in _SURFACE_RESPONSE_PROFILES.items():
            assert 0.0 <= profile["shadow_reliability"] <= 1.0, f"{cls} shadow_reliability out of range"
            assert 0.0 <= profile["highlight_reliability"] <= 1.0, f"{cls} highlight_reliability out of range"

    def test_correction_ranges(self):
        """Corrections should be reasonable (abs < 1.0)."""
        for cls, profile in _SURFACE_RESPONSE_PROFILES.items():
            assert abs(profile["highlight_width_correction"]) < 1.0, f"{cls} hlw correction too large"
            assert abs(profile["rolloff_correction"]) < 1.0, f"{cls} rolloff correction too large"
            assert abs(profile["specularity_correction"]) < 1.0, f"{cls} specularity correction too large"
            assert abs(profile["specular_spread_correction"]) < 1.0, f"{cls} specular_spread correction too large"

    def test_reflection_dominant_is_bool(self):
        for cls, profile in _SURFACE_RESPONSE_PROFILES.items():
            assert isinstance(profile["reflection_dominant"], bool), f"{cls} reflection_dominant not bool"

    def test_preferred_signals_is_list(self):
        for cls, profile in _SURFACE_RESPONSE_PROFILES.items():
            assert isinstance(profile["preferred_signals"], list), f"{cls} preferred_signals not list"
            assert len(profile["preferred_signals"]) > 0, f"{cls} has empty preferred_signals"


class TestSurfaceAwareHighlightCorrection:
    """Test surface correction values for specific materials."""

    def test_face_skin_no_correction(self):
        """Face skin should have zero corrections."""
        p = _SURFACE_RESPONSE_PROFILES["face_skin"]
        assert p["highlight_width_correction"] == 0.0
        assert p["rolloff_correction"] == 0.0
        assert p["reflection_dominant"] is False

    def test_satin_silk_negative_highlight_width(self):
        """Satin creates wider apparent highlights → negative correction."""
        p = _SURFACE_RESPONSE_PROFILES["satin_silk"]
        assert p["highlight_width_correction"] < 0
        assert p["rolloff_correction"] > 0

    def test_chrome_high_specularity_correction(self):
        """Chrome should have largest specularity correction."""
        p = _SURFACE_RESPONSE_PROFILES["chrome_like"]
        assert p["specularity_correction"] <= -0.3
        assert p["reflection_dominant"] is True

    def test_chrome_low_reliability(self):
        """Chrome should have very low shadow and highlight reliability."""
        p = _SURFACE_RESPONSE_PROFILES["chrome_like"]
        assert p["shadow_reliability"] <= 0.4
        assert p["highlight_reliability"] <= 0.3

    def test_matte_fabric_shadow_reliable(self):
        """Matte fabric should have high shadow reliability."""
        p = _SURFACE_RESPONSE_PROFILES["matte_fabric"]
        assert p["shadow_reliability"] >= 0.9

    def test_leather_specularity_correction(self):
        """Leather tight specular should get negative correction."""
        p = _SURFACE_RESPONSE_PROFILES["leather"]
        assert p["specularity_correction"] < 0

    def test_glass_is_reflective(self):
        p = _SURFACE_RESPONSE_PROFILES["glass"]
        assert p["reflection_dominant"] is True
        assert p["shadow_reliability"] < 0.5

    def test_metallic_is_reflective(self):
        p = _SURFACE_RESPONSE_PROFILES["metallic"]
        assert p["reflection_dominant"] is True

    def test_hair_low_highlight_reliability(self):
        p = _SURFACE_RESPONSE_PROFILES["hair"]
        assert p["highlight_reliability"] <= 0.6

    def test_unknown_has_moderate_reliability(self):
        p = _SURFACE_RESPONSE_PROFILES["unknown"]
        assert 0.5 <= p["shadow_reliability"] <= 0.8
        assert 0.5 <= p["highlight_reliability"] <= 0.8
