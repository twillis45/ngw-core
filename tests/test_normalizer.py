"""Tests for engine/normalizer.py

Covers:
  Exact matches     — canonical IDs, full alias strings, labels
  Case insensitivity — mixed case, ALL CAPS, lowercase
  Brand + model     — "Profoto B10", "godox ad600pro", "Aputure 300d"
  Prefix matching   — partial brand strings, model number prefixes
  Synonyms          — taxonomy synonym strings
  Edge cases        — empty string, whitespace, unknown gear, very short input
  Batch             — normalize_many
  Determinism       — same input → same output
"""

import pytest

from engine.normalizer import (
    NormalizationResult,
    normalize_gear_name,
    normalize_many,
)


# ── Exact matches ────────────────────────────────────────────────────────────

class TestExactMatch:
    def test_canonical_id_direct(self):
        r = normalize_gear_name("strobe_mono")
        assert r.canonical_id == "strobe_mono"
        assert r.confident is True

    def test_canonical_id_every_profile(self):
        """Every canonical ID should resolve to itself."""
        ids = [
            "strobe_mono", "strobe_pack", "speedlight", "led_panel",
            "led_cob", "led_tube", "fresnel", "ring_light",
            "natural_window", "reflector_only",
        ]
        for cid in ids:
            r = normalize_gear_name(cid)
            assert r.canonical_id == cid, f"{cid} did not self-resolve"

    def test_full_alias_string(self):
        r = normalize_gear_name("studio strobe")
        assert r.canonical_id == "strobe_mono"
        assert r.confident is True

    def test_label_match(self):
        r = normalize_gear_name("monolight strobe")
        assert r.canonical_id == "strobe_mono"


# ── Case insensitivity ───────────────────────────────────────────────────────

class TestCaseInsensitivity:
    def test_mixed_case(self):
        r = normalize_gear_name("Profoto B10")
        assert r.canonical_id == "strobe_mono"

    def test_all_caps(self):
        r = normalize_gear_name("SPEEDLIGHT")
        assert r.canonical_id == "speedlight"
        assert r.confident is True

    def test_lowercase(self):
        r = normalize_gear_name("ring light")
        assert r.canonical_id == "ring_light"

    def test_weird_spacing(self):
        r = normalize_gear_name("  led   panel  ")
        assert r.canonical_id == "led_panel"


# ── Brand + model combos ────────────────────────────────────────────────────

class TestBrandModel:
    def test_profoto_b10(self):
        for variant in ["b10", "B10", "profoto b10", "Profoto B10"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "strobe_mono", f"Failed for {variant!r}"

    def test_godox_ad600(self):
        for variant in ["ad600", "AD600", "godox ad600", "Godox AD600Pro"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "strobe_mono", f"Failed for {variant!r}"

    def test_godox_v1(self):
        for variant in ["v1", "godox v1", "Godox V1"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "speedlight", f"Failed for {variant!r}"

    def test_aputure_300d(self):
        for variant in ["aputure 300d", "Aputure 300d", "300d", "aputure"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "led_cob", f"Failed for {variant!r}"

    def test_nanlite_forza(self):
        for variant in ["nanlite", "nanlite forza", "forza 300", "forza"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "led_cob", f"Failed for {variant!r}"

    def test_pavotube(self):
        for variant in ["pavotube", "Pavotube", "pavotube 30c", "nanlite pavotube"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "led_tube", f"Failed for {variant!r}"

    def test_neewer_panel(self):
        for variant in ["neewer", "neewer 660", "Neewer"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "led_panel", f"Failed for {variant!r}"

    def test_broncolor_pack(self):
        for variant in ["broncolor", "broncolor siros", "siros"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "strobe_pack", f"Failed for {variant!r}"

    def test_dedolight_fresnel(self):
        for variant in ["dedolight", "dedo"]:
            r = normalize_gear_name(variant)
            assert r.canonical_id == "fresnel", f"Failed for {variant!r}"


# ── Prefix matching ──────────────────────────────────────────────────────────

class TestPrefixMatch:
    def test_input_starts_with_alias(self):
        """User types more than the alias — longest alias should win."""
        r = normalize_gear_name("godox ad600pro mk2")
        assert r.canonical_id == "strobe_mono"
        assert r.confident is False

    def test_alias_starts_with_input(self):
        """User types a prefix of a known alias."""
        r = normalize_gear_name("aputure 600")
        assert r.canonical_id == "led_cob"
        assert r.confident is False

    def test_short_prefix_no_match(self):
        """Inputs shorter than 3 chars should not prefix-match."""
        r = normalize_gear_name("ad")
        assert r.canonical_id is None


# ── Taxonomy synonyms ────────────────────────────────────────────────────────

class TestSynonyms:
    def test_cobra_flash(self):
        r = normalize_gear_name("cobra flash")
        assert r.canonical_id == "speedlight"

    def test_ice_light(self):
        r = normalize_gear_name("ice light")
        assert r.canonical_id == "led_tube"

    def test_v_flat(self):
        r = normalize_gear_name("v-flat")
        assert r.canonical_id == "reflector_only"

    def test_5_in_1(self):
        r = normalize_gear_name("5-in-1")
        assert r.canonical_id == "reflector_only"

    def test_available_light(self):
        r = normalize_gear_name("available light")
        assert r.canonical_id == "natural_window"

    def test_beauty_ring(self):
        r = normalize_gear_name("beauty ring")
        assert r.canonical_id == "ring_light"

    def test_bounce_board(self):
        r = normalize_gear_name("bounce board")
        assert r.canonical_id == "reflector_only"


# ── Edge cases ───────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_string(self):
        r = normalize_gear_name("")
        assert r.canonical_id is None
        assert r.confident is False

    def test_whitespace_only(self):
        r = normalize_gear_name("   ")
        assert r.canonical_id is None

    def test_unknown_gear(self):
        r = normalize_gear_name("quantum flux capacitor")
        assert r.canonical_id is None
        assert r.matched_alias is None

    def test_original_preserved(self):
        r = normalize_gear_name("  Profoto B10  ")
        assert r.original == "  Profoto B10  "

    def test_result_is_model(self):
        r = normalize_gear_name("led panel")
        assert isinstance(r, NormalizationResult)
        d = r.model_dump()
        assert "canonical_id" in d
        assert "original" in d


# ── Batch ────────────────────────────────────────────────────────────────────

class TestBatch:
    def test_normalize_many(self):
        results = normalize_many(["B10", "unknown", "pavotube"])
        assert len(results) == 3
        assert results[0].canonical_id == "strobe_mono"
        assert results[1].canonical_id is None
        assert results[2].canonical_id == "led_tube"

    def test_empty_list(self):
        assert normalize_many([]) == []


# ── Determinism ──────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_input_same_output(self):
        a = normalize_gear_name("Godox AD600Pro")
        b = normalize_gear_name("Godox AD600Pro")
        assert a.model_dump() == b.model_dump()

    def test_order_independent_batch(self):
        fwd = normalize_many(["b10", "pavotube", "dedo"])
        rev = normalize_many(["dedo", "pavotube", "b10"])
        assert fwd[0].canonical_id == rev[2].canonical_id
        assert fwd[1].canonical_id == rev[1].canonical_id
        assert fwd[2].canonical_id == rev[0].canonical_id
