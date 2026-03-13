"""Tests for Lighting DNA module — model construction, catalog parsing, analysis building.

Tests cover:
1. LightingDNA model construction and validation
2. DNA generation from catalog YAML files
3. DNA generation from analysis outputs
4. Catalog loading
"""

import os
from pathlib import Path

import pytest

from engine.lighting_dna import (
    LightingDNA,
    build_dna_from_catalog,
    build_dna_from_analysis,
    load_all_catalog_dna,
    _parse_distance_range,
    _best_match_key,
    _HEIGHT_MAP,
    CATALOG_DIR,
)


# ─── Model Tests ─────────────────────────────────────────────────────────


class TestLightingDNAModel:
    """LightingDNA construction and validation."""

    def test_defaults(self):
        dna = LightingDNA()
        assert dna.key_angle_deg == 0.0
        assert dna.key_height_ratio == 0.5
        assert dna.modifier_type == "unknown"
        assert dna.modifier_size == 0.5
        assert dna.shadow_softness == 0.5
        assert dna.highlight_specularity == 0.5
        assert dna.fill_ratio == 0.0
        assert dna.negative_fill is False
        assert dna.background_gradient == 0.0
        assert dna.catchlight_shape == "unknown"
        assert dna.subject_distance_ft == 5.0
        assert dna.camera_height == 0.5
        assert dna.source_id == ""
        assert dna.source_name == ""

    def test_full_construction(self):
        dna = LightingDNA(
            key_angle_deg=45.0,
            key_height_ratio=0.65,
            modifier_type="beauty_dish",
            modifier_size=0.35,
            shadow_softness=0.35,
            highlight_specularity=0.6,
            fill_ratio=0.3,
            negative_fill=True,
            background_gradient=0.2,
            catchlight_shape="round",
            subject_distance_ft=6.5,
            camera_height=0.5,
            source_id="dramatic-rembrandt-rim",
            source_name="Dramatic Rembrandt (Key + Rim)",
        )
        assert dna.key_angle_deg == 45.0
        assert dna.modifier_type == "beauty_dish"
        assert dna.negative_fill is True
        assert dna.source_id == "dramatic-rembrandt-rim"

    def test_extra_forbid(self):
        with pytest.raises(Exception):
            LightingDNA(bogus_field="bad")

    def test_serialization(self):
        dna = LightingDNA(
            key_angle_deg=90.0,
            modifier_type="softbox_octa",
            source_id="test-system",
        )
        d = dna.model_dump()
        assert d["key_angle_deg"] == 90.0
        assert d["modifier_type"] == "softbox_octa"
        assert d["source_id"] == "test-system"
        assert isinstance(d["fill_ratio"], float)

    def test_numeric_ranges(self):
        """DNA allows full range of values."""
        dna = LightingDNA(
            key_angle_deg=180.0,
            key_height_ratio=1.0,
            modifier_size=0.0,
            shadow_softness=0.0,
            highlight_specularity=1.0,
            fill_ratio=1.0,
            background_gradient=1.0,
            subject_distance_ft=20.0,
            camera_height=0.0,
        )
        assert dna.key_angle_deg == 180.0
        assert dna.modifier_size == 0.0
        assert dna.highlight_specularity == 1.0


# ─── Utility Tests ───────────────────────────────────────────────────────


class TestUtilities:
    """Test helper functions."""

    def test_parse_distance_simple(self):
        assert _parse_distance_range("5") == 5.0
        assert _parse_distance_range("10") == 10.0

    def test_parse_distance_range_hyphen(self):
        assert _parse_distance_range("3-5") == 4.0
        assert _parse_distance_range("6-10") == 8.0

    def test_parse_distance_range_endash(self):
        assert _parse_distance_range("3–5") == 4.0

    def test_parse_distance_empty(self):
        assert _parse_distance_range("") == 5.0

    def test_parse_distance_invalid(self):
        assert _parse_distance_range("close") == 5.0

    def test_best_match_exact(self):
        assert _best_match_key("eye level", _HEIGHT_MAP) == "eye level"

    def test_best_match_substring(self):
        result = _best_match_key("slightly above eye level", _HEIGHT_MAP)
        assert result is not None
        assert result in _HEIGHT_MAP

    def test_best_match_none(self):
        assert _best_match_key("nonexistent", _HEIGHT_MAP) is None


# ─── Catalog DNA Tests ───────────────────────────────────────────────────


class TestBuildDNAFromCatalog:
    """Test DNA generation from catalog YAML files."""

    def test_beauty_clamshell(self):
        path = CATALOG_DIR / "01-beauty-clamshell.yml"
        if not path.exists():
            pytest.skip("Catalog file not available")

        dna = build_dna_from_catalog(str(path))
        assert dna is not None
        assert dna.source_id == "beauty-clamshell"
        assert dna.source_name == "Beauty Clamshell (Dish + Fill)"
        # Key at 0° (centered)
        assert dna.key_angle_deg == 0.0
        # Has fill
        assert dna.fill_ratio > 0.0
        # Beauty dish → round catchlight
        assert dna.catchlight_shape == "round"
        assert dna.modifier_type == "beauty_dish"

    def test_dramatic_rembrandt(self):
        path = CATALOG_DIR / "03-dramatic-rembrandt-rim.yml"
        if not path.exists():
            pytest.skip("Catalog file not available")

        dna = build_dna_from_catalog(str(path))
        assert dna is not None
        assert dna.source_id == "dramatic-rembrandt-rim"
        # Key at 55° (wider angle)
        assert dna.key_angle_deg == 55.0
        # Above eye line
        assert dna.key_height_ratio > 0.5

    def test_all_catalog_files_parse(self):
        """Every catalog YAML should produce a valid DNA."""
        if not CATALOG_DIR.exists():
            pytest.skip("Catalog directory not available")

        for yml_path in CATALOG_DIR.glob("*.yml"):
            dna = build_dna_from_catalog(str(yml_path))
            assert dna is not None, f"Failed to parse {yml_path.name}"
            assert dna.source_id != "", f"Missing source_id for {yml_path.name}"

    def test_invalid_path_returns_none(self):
        dna = build_dna_from_catalog("/nonexistent/path.yml")
        assert dna is None

    def test_load_all_catalog_dna(self):
        """load_all_catalog_dna returns a non-empty list."""
        if not CATALOG_DIR.exists():
            pytest.skip("Catalog directory not available")

        results = load_all_catalog_dna()
        assert len(results) > 0
        for dna in results:
            assert isinstance(dna, LightingDNA)
            assert dna.source_id != ""


# ─── Analysis DNA Tests ──────────────────────────────────────────────────


class TestBuildDNAFromAnalysis:
    """Test DNA generation from photo analysis outputs."""

    def test_empty_analysis(self):
        """Empty inputs produce valid default DNA."""
        dna = build_dna_from_analysis()
        assert isinstance(dna, LightingDNA)
        assert dna.source_id == "analysis"

    def test_vlm_signals_reconstruction(self):
        """VLM reconstruction estimates are used for key angle/height."""
        dna = build_dna_from_analysis(
            vlm_signals={
                "reconstruction": {
                    "key_light_angle_deg": 60.0,
                    "key_light_height": "high",
                    "modifier_size_class": "large",
                    "fill_present": True,
                    "negative_fill": False,
                    "background_light_present": True,
                },
                "shadows": {
                    "shadow_softness": 0.7,
                },
                "highlights": {
                    "highlight_specularity": 0.3,
                },
                "catchlights": {
                    "catchlight_shape": "octagonal",
                },
            },
            lighting_read={
                "fill_presence": "moderate",
            },
        )
        assert dna.key_angle_deg == 60.0
        assert dna.key_height_ratio == 0.75  # "high"
        assert dna.modifier_size == 0.7  # "large"
        assert dna.shadow_softness == 0.7
        assert dna.highlight_specularity == 0.3
        assert dna.catchlight_shape == "octagonal"
        assert dna.fill_ratio > 0.0

    def test_cue_report_fallback(self):
        """When VLM signals missing, cue_report data is used."""
        dna = build_dna_from_analysis(
            cue_report={
                "shadow_edge_hardness": {
                    "classification": "hard",
                    "confidence": 0.8,
                },
                "specular_highlight_behavior": {
                    "intensity": "high",
                    "spread": "tight",
                },
                "background_illumination": {
                    "pattern": "gradient",
                },
            },
        )
        assert dna.shadow_softness == 0.15  # "hard"
        assert dna.highlight_specularity == 0.8  # "high"
        assert dna.background_gradient == 0.6  # "gradient"

    def test_recreation_setup_modifier(self):
        """Modifier suggestion from recreation_setup is mapped to type."""
        dna = build_dna_from_analysis(
            recreation_setup={
                "modifier_suggestion": "beauty dish with grid",
                "key_placement": "45 degrees camera-left",
                "camera_subject_guidance": "eye level",
            },
        )
        assert dna.modifier_type == "beauty_dish"
        assert dna.key_angle_deg == 45.0
        assert dna.camera_height == 0.5  # eye level

    def test_negative_fill(self):
        dna = build_dna_from_analysis(
            vlm_signals={
                "reconstruction": {
                    "negative_fill": True,
                },
            },
        )
        assert dna.negative_fill is True
