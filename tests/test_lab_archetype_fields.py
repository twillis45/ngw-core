"""Tests for Stage 4: LAB Form + Storage Upgrades — archetype metadata fields.

Covers:
  - ReferenceDatasetIngestMeta accepts new archetype fields
  - ReferenceDatasetIngestMeta works without new fields (backward compat)
  - OPTIONAL_FIELDS includes all archetype field names
  - DATASET_EXTRA_FIELDS includes all archetype field names
  - Auto-population of archetype fields from pipeline results
  - User-provided values override auto-populated values
  - Metadata round-trip through validate_dataset_metadata
  - Full ingestion flow stores new fields
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import patch

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.reference_ingestion import OPTIONAL_FIELDS, ALL_FIELDS
from engine.reference_dataset import (
    DATASET_EXTRA_FIELDS,
    _auto_populate_archetype_fields,
    _save_json,
    _load_json,
    validate_dataset_metadata,
)


# ═══════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════

ARCHETYPE_FIELD_NAMES = {
    "style_family",
    "catchlight_pattern",
    "underfill_ev",
    "separation_light_type",
    "source_type_candidates",
    "light_technology",
    "master_profile_id",
}


# ═══════════════════════════════════════════════════════════════════════════
# Pydantic Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestReferenceDatasetIngestMeta:
    """Tests for the enriched ReferenceDatasetIngestMeta model."""

    def test_model_accepts_all_archetype_fields(self):
        """Model should accept all 7 new archetype fields."""
        from api.routes.lab import ReferenceDatasetIngestMeta

        meta = ReferenceDatasetIngestMeta(
            reference_id="test_001",
            pattern_id="rembrandt",
            style_family="dramatic",
            catchlight_pattern="triangular",
            underfill_ev=1.5,
            separation_light_type="hair",
            source_type_candidates=["continuous_led", "strobe"],
            light_technology="continuous_led",
            master_profile_id="hurley",
        )
        assert meta.style_family == "dramatic"
        assert meta.catchlight_pattern == "triangular"
        assert meta.underfill_ev == 1.5
        assert meta.separation_light_type == "hair"
        assert meta.source_type_candidates == ["continuous_led", "strobe"]
        assert meta.light_technology == "continuous_led"
        assert meta.master_profile_id == "hurley"

    def test_model_defaults_archetype_fields_to_none(self):
        """Model should default all archetype fields to None."""
        from api.routes.lab import ReferenceDatasetIngestMeta

        meta = ReferenceDatasetIngestMeta(
            reference_id="test_002",
            pattern_id="loop",
        )
        assert meta.style_family is None
        assert meta.catchlight_pattern is None
        assert meta.underfill_ev is None
        assert meta.separation_light_type is None
        assert meta.source_type_candidates is None
        assert meta.light_technology is None
        assert meta.master_profile_id is None

    def test_model_dump_excludes_none(self):
        """model_dump(exclude_none=True) omits unset archetype fields."""
        from api.routes.lab import ReferenceDatasetIngestMeta

        meta = ReferenceDatasetIngestMeta(
            reference_id="test_003",
            pattern_id="split",
            catchlight_pattern="dual",
        )
        dumped = meta.model_dump(exclude_none=True)
        assert "catchlight_pattern" in dumped
        assert dumped["catchlight_pattern"] == "dual"
        assert "style_family" not in dumped
        assert "underfill_ev" not in dumped

    def test_model_dump_includes_all_when_set(self):
        """model_dump includes all archetype fields when set."""
        from api.routes.lab import ReferenceDatasetIngestMeta

        meta = ReferenceDatasetIngestMeta(
            reference_id="test_004",
            pattern_id="broad",
            style_family="editorial",
            catchlight_pattern="strip",
            underfill_ev=2.0,
            separation_light_type="rim",
            source_type_candidates=["strobe"],
            light_technology="strobe",
            master_profile_id="penn",
        )
        dumped = meta.model_dump()
        for field in ARCHETYPE_FIELD_NAMES:
            assert field in dumped

    def test_backward_compat_existing_fields_unchanged(self):
        """Existing fields still work exactly as before."""
        from api.routes.lab import ReferenceDatasetIngestMeta

        meta = ReferenceDatasetIngestMeta(
            reference_id="compat_001",
            pattern_id="butterfly",
            photographer="Test Photographer",
            dataset_tier="gold",
            entry_trust_score=0.9,
            source_type="original_photo",
            environment="studio",
            light_count=3,
            key_direction_deg=45.0,
            modifier_family="softbox",
            notes="Test note",
        )
        assert meta.photographer == "Test Photographer"
        assert meta.dataset_tier == "gold"
        assert meta.light_count == 3


# ═══════════════════════════════════════════════════════════════════════════
# Field Registry Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestFieldRegistries:
    """Verify archetype fields are registered in both OPTIONAL_FIELDS and DATASET_EXTRA_FIELDS."""

    def test_optional_fields_includes_archetype_fields(self):
        """OPTIONAL_FIELDS set should contain all archetype field names."""
        for field in ARCHETYPE_FIELD_NAMES:
            assert field in OPTIONAL_FIELDS, f"'{field}' missing from OPTIONAL_FIELDS"

    def test_all_fields_includes_archetype_fields(self):
        """ALL_FIELDS (REQUIRED | OPTIONAL) should include archetype fields."""
        for field in ARCHETYPE_FIELD_NAMES:
            assert field in ALL_FIELDS, f"'{field}' missing from ALL_FIELDS"

    def test_dataset_extra_fields_includes_archetype_fields(self):
        """DATASET_EXTRA_FIELDS should contain all archetype field names."""
        for field in ARCHETYPE_FIELD_NAMES:
            assert field in DATASET_EXTRA_FIELDS, f"'{field}' missing from DATASET_EXTRA_FIELDS"

    def test_no_duplicate_fields(self):
        """Archetype fields shouldn't collide with any existing non-archetype fields."""
        from engine.reference_ingestion import REQUIRED_FIELDS
        for field in ARCHETYPE_FIELD_NAMES:
            assert field not in REQUIRED_FIELDS, f"'{field}' conflicts with a required field"


# ═══════════════════════════════════════════════════════════════════════════
# Validation Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestValidationWithArchetypeFields:
    """Ensure validate_dataset_metadata accepts new fields without errors."""

    def test_validate_with_archetype_fields(self):
        """Metadata with archetype fields should validate successfully."""
        meta = {
            "reference_id": "val_001",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
            "style_family": "dramatic",
            "catchlight_pattern": "triangular",
            "underfill_ev": 1.5,
            "light_technology": "continuous_led",
            "master_profile_id": "hurley",
        }
        valid, errors = validate_dataset_metadata(meta)
        assert valid, f"Validation failed: {errors}"

    def test_validate_without_archetype_fields(self):
        """Metadata without archetype fields should still validate."""
        meta = {
            "reference_id": "val_002",
            "pattern_id": "loop",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
        }
        valid, errors = validate_dataset_metadata(meta)
        assert valid, f"Validation failed: {errors}"

    def test_validate_with_partial_archetype_fields(self):
        """Metadata with some archetype fields should validate."""
        meta = {
            "reference_id": "val_003",
            "pattern_id": "split",
            "photographer": "Test",
            "dataset_tier": "gold",
            "entry_trust_score": 0.8,
            "catchlight_pattern": "single",
        }
        valid, errors = validate_dataset_metadata(meta)
        assert valid, f"Validation failed: {errors}"


# ═══════════════════════════════════════════════════════════════════════════
# Auto-Population Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestAutoPopulateArchetypeFields:
    """Tests for _auto_populate_archetype_fields helper."""

    def test_populates_catchlight_pattern_from_topology(self):
        """Should auto-populate catchlight_pattern from catchlight_topology."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "triangular",
                "confidence": 0.8,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["catchlight_pattern"] == "triangular"

    def test_populates_underfill_ev_from_symmetry(self):
        """Should auto-populate underfill_ev from highlight_symmetry."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "highlight_symmetry": {
                "ok": True,
                "underfill_ev": 1.7321,
                "symmetry_score": 0.3,
                "confidence": 0.7,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["underfill_ev"] == 1.73  # rounded to 2 decimal places

    def test_populates_separation_light_type_hair(self):
        """Should detect hair light type."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "separation_light": {
                "ok": True,
                "has_hair_light": True,
                "has_rim_light": False,
                "confidence": 0.6,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["separation_light_type"] == "hair"

    def test_populates_separation_light_type_rim(self):
        """Should detect rim light type when no hair light."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "separation_light": {
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": True,
                "confidence": 0.6,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["separation_light_type"] == "rim"

    def test_populates_separation_light_type_none(self):
        """Should set 'none' when no separation light detected."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "separation_light": {
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": False,
                "confidence": 0.5,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["separation_light_type"] == "none"

    def test_populates_light_technology(self):
        """Should auto-populate light_technology from continuous_source."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "continuous_source": {
                "ok": True,
                "likely_technology": "continuous_led",
                "evidence": ["strip_catchlight", "soft_specular"],
                "confidence": 0.7,
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["light_technology"] == "continuous_led"
        assert meta["source_type_candidates"] == ["strip_catchlight", "soft_specular"]

    def test_user_values_override_auto_population(self):
        """User-provided values should not be overwritten."""
        meta: Dict[str, Any] = {
            "catchlight_pattern": "dual",
            "underfill_ev": 3.0,
            "separation_light_type": "kicker",
            "light_technology": "strobe",
            "source_type_candidates": ["user_provided"],
        }
        pipeline = {
            "catchlight_topology": {"ok": True, "cluster_geometry": "triangular"},
            "highlight_symmetry": {"ok": True, "underfill_ev": 1.5},
            "separation_light": {"ok": True, "has_hair_light": True, "has_rim_light": False},
            "continuous_source": {
                "ok": True,
                "likely_technology": "continuous_led",
                "evidence": ["auto_evidence"],
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        # All user values should be preserved
        assert meta["catchlight_pattern"] == "dual"
        assert meta["underfill_ev"] == 3.0
        assert meta["separation_light_type"] == "kicker"
        assert meta["light_technology"] == "strobe"
        assert meta["source_type_candidates"] == ["user_provided"]

    def test_no_pipeline_data_leaves_meta_unchanged(self):
        """Empty pipeline results should not add any fields."""
        meta: Dict[str, Any] = {"reference_id": "test"}
        _auto_populate_archetype_fields(meta, {})
        assert "catchlight_pattern" not in meta
        assert "underfill_ev" not in meta
        assert "separation_light_type" not in meta
        assert "light_technology" not in meta
        assert "source_type_candidates" not in meta

    def test_failed_passes_are_skipped(self):
        """Passes with ok=False should not contribute to auto-population."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "catchlight_topology": {"ok": False, "error": "no face detected"},
            "highlight_symmetry": {"ok": False, "error": "computation failed"},
            "separation_light": {"ok": False, "error": "no edges"},
            "continuous_source": {"ok": False, "error": "insufficient data"},
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert "catchlight_pattern" not in meta
        assert "underfill_ev" not in meta
        assert "separation_light_type" not in meta
        assert "light_technology" not in meta

    def test_unknown_geometry_not_stored(self):
        """cluster_geometry='unknown' should not be stored."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "catchlight_topology": {"ok": True, "cluster_geometry": "unknown"},
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert "catchlight_pattern" not in meta

    def test_unknown_technology_not_stored(self):
        """likely_technology='unknown' should not be stored."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "continuous_source": {"ok": True, "likely_technology": "unknown", "evidence": []},
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert "light_technology" not in meta

    def test_none_underfill_ev_not_stored(self):
        """underfill_ev=None from pipeline should not be stored."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "highlight_symmetry": {"ok": True, "underfill_ev": None, "symmetry_score": 0.9},
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert "underfill_ev" not in meta

    def test_non_dict_pass_data_is_safe(self):
        """Non-dict pass data (e.g., None, str) should be handled gracefully."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "catchlight_topology": None,
            "highlight_symmetry": "error string",
            "separation_light": 42,
            "continuous_source": [],
        }
        _auto_populate_archetype_fields(meta, pipeline)
        # Nothing should be set
        assert len(meta) == 0

    def test_all_fields_populated_at_once(self):
        """Should populate all fields from a complete pipeline result set."""
        meta: Dict[str, Any] = {}
        pipeline = {
            "catchlight_topology": {"ok": True, "cluster_geometry": "strip"},
            "highlight_symmetry": {"ok": True, "underfill_ev": 2.5},
            "separation_light": {"ok": True, "has_hair_light": True, "has_rim_light": True},
            "continuous_source": {
                "ok": True,
                "likely_technology": "strobe",
                "evidence": ["sharp_specular"],
            },
        }
        _auto_populate_archetype_fields(meta, pipeline)
        assert meta["catchlight_pattern"] == "strip"
        assert meta["underfill_ev"] == 2.5
        assert meta["separation_light_type"] == "hair"  # hair takes priority over rim
        assert meta["light_technology"] == "strobe"
        assert meta["source_type_candidates"] == ["sharp_specular"]


# ═══════════════════════════════════════════════════════════════════════════
# Metadata Persistence Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestMetadataPersistence:
    """Verify archetype fields survive JSON round-trip."""

    def test_archetype_fields_survive_json_round_trip(self, tmp_path):
        """Archetype fields should be stored and loaded from JSON correctly."""
        meta = {
            "reference_id": "persist_001",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
            "style_family": "dramatic",
            "catchlight_pattern": "triangular",
            "underfill_ev": 1.5,
            "separation_light_type": "hair",
            "source_type_candidates": ["continuous_led", "strobe"],
            "light_technology": "continuous_led",
            "master_profile_id": "hurley",
        }
        path = tmp_path / "metadata.json"
        _save_json(path, meta)
        loaded = _load_json(path)

        assert loaded is not None
        for field in ARCHETYPE_FIELD_NAMES:
            assert field in loaded, f"'{field}' not found in loaded metadata"
            assert loaded[field] == meta[field]

    def test_metadata_without_archetype_fields_loads_cleanly(self, tmp_path):
        """Legacy metadata without archetype fields should load without errors."""
        meta = {
            "reference_id": "legacy_001",
            "pattern_id": "loop",
            "photographer": "Legacy User",
            "dataset_tier": "gold",
            "entry_trust_score": 0.9,
        }
        path = tmp_path / "metadata.json"
        _save_json(path, meta)
        loaded = _load_json(path)

        assert loaded is not None
        assert loaded["reference_id"] == "legacy_001"
        # Archetype fields should simply not exist
        for field in ARCHETYPE_FIELD_NAMES:
            assert field not in loaded


# ═══════════════════════════════════════════════════════════════════════════
# Integration: Full Ingestion Flow
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 required")
class TestIngestionWithArchetypeFields:
    """Test that archetype fields flow through full ingestion correctly."""

    @pytest.fixture
    def dataset_root(self, tmp_path):
        root = tmp_path / "reference_dataset"
        root.mkdir()
        return root

    @pytest.fixture
    def mock_image(self, tmp_path):
        img = np.full((100, 150, 3), 128, dtype=np.uint8)
        path = tmp_path / "test_image.jpg"
        cv2.imwrite(str(path), img)
        return path

    def _mock_pipeline(self):
        """Return mock pipeline results with archetype pass outputs."""
        return {
            "geometry": {"ok": True},
            "shadow": {"ok": True},
            "highlight": {"ok": True},
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
                "confidence": 0.75,
            },
            "highlight_symmetry": {
                "ok": True,
                "underfill_ev": 1.8,
                "symmetry_score": 0.35,
                "confidence": 0.7,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": True,
                "has_rim_light": False,
                "confidence": 0.6,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "continuous_led",
                "evidence": ["strip_catchlight", "soft_specular"],
                "confidence": 0.65,
            },
        }

    def test_ingestion_stores_user_archetype_fields(self, dataset_root, mock_image):
        """User-provided archetype fields should be stored in metadata.json."""
        metadata = {
            "reference_id": "ingest_001",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.7,
            "style_family": "dramatic",
            "catchlight_pattern": "single",
            "master_profile_id": "karsh",
        }

        from engine.reference_dataset import ingest_reference_image

        with patch("engine.vision_passes.run_extended_pipeline", return_value=self._mock_pipeline()):
            with patch("engine.image_analysis.analyze_image_regions", return_value={"ok": False}):
                result = ingest_reference_image(
                    mock_image, metadata,
                    run_pipeline=True, run_vlm=False,
                    generate_debug_overlay=False,
                    dataset_root=dataset_root,
                )

        assert result["ok"]

        # Load metadata and verify archetype fields
        entry_path = Path(result["entry_path"])
        stored = _load_json(entry_path / "metadata.json")
        assert stored["style_family"] == "dramatic"
        assert stored["catchlight_pattern"] == "single"  # user value preserved
        assert stored["master_profile_id"] == "karsh"

    def test_ingestion_auto_populates_archetype_fields(self, dataset_root, mock_image):
        """Auto-populated fields should appear when user doesn't provide them."""
        metadata = {
            "reference_id": "ingest_002",
            "pattern_id": "loop",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
        }

        from engine.reference_dataset import ingest_reference_image

        with patch("engine.vision_passes.run_extended_pipeline", return_value=self._mock_pipeline()):
            with patch("engine.image_analysis.analyze_image_regions", return_value={"ok": False}):
                result = ingest_reference_image(
                    mock_image, metadata,
                    run_pipeline=True, run_vlm=False,
                    generate_debug_overlay=False,
                    dataset_root=dataset_root,
                )

        assert result["ok"]

        entry_path = Path(result["entry_path"])
        stored = _load_json(entry_path / "metadata.json")
        assert stored["catchlight_pattern"] == "triangular"
        assert stored["underfill_ev"] == 1.8
        assert stored["separation_light_type"] == "hair"
        assert stored["light_technology"] == "continuous_led"

    def test_ingestion_without_pipeline_skips_auto_populate(self, dataset_root, mock_image):
        """No auto-population when pipeline is not run."""
        metadata = {
            "reference_id": "ingest_003",
            "pattern_id": "split",
            "photographer": "Test",
            "dataset_tier": "community",
            "entry_trust_score": 0.5,
        }

        from engine.reference_dataset import ingest_reference_image

        result = ingest_reference_image(
            mock_image, metadata,
            run_pipeline=False, run_vlm=False,
            generate_debug_overlay=False,
            dataset_root=dataset_root,
        )

        assert result["ok"]

        entry_path = Path(result["entry_path"])
        stored = _load_json(entry_path / "metadata.json")
        # No auto-populated fields
        for field in ARCHETYPE_FIELD_NAMES:
            assert field not in stored
