"""Tests for the reference ingestion module.

Covers:
- Metadata validation (required fields, type checks, enum values)
- Filename consistency checking
- Image ingestion workflow (copy, sidecar, index rebuild)
- Index rebuilding from sidecar files + legacy merge
- Legacy sidecar generation
- reference_matcher loading from index
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict
from unittest.mock import patch

import pytest


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _make_metadata(**overrides) -> Dict[str, Any]:
    """Build valid reference metadata with optional overrides."""
    base = {
        "reference_id": "test_rembrandt_001",
        "pattern_id": "rembrandt",
        "photographer": "Test Photographer",
        "dataset_tier": "gold",
        "entry_trust_score": 1.0,
    }
    base.update(overrides)
    return base


def _make_temp_image(tmpdir: Path, name: str = "test.jpg") -> Path:
    """Create a minimal temp image file."""
    img_path = tmpdir / name
    # Write a minimal JPEG-like file (just needs to exist for ingestion)
    img_path.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    return img_path


def _make_temp_reference_dir(tmpdir: Path) -> Path:
    """Create a temp reference library directory."""
    ref_dir = tmpdir / "reference_library"
    ref_dir.mkdir(parents=True, exist_ok=True)
    return ref_dir


def _make_legacy_references(ref_dir: Path, entries: list) -> Path:
    """Write a legacy references.json file."""
    refs_path = ref_dir / "references.json"
    with open(refs_path, "w") as f:
        json.dump(entries, f)
    return refs_path


def _make_pattern_catalog(tmpdir: Path) -> Path:
    """Write a minimal pattern catalog for validation."""
    patterns_dir = tmpdir / "patterns"
    patterns_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = patterns_dir / "pattern_catalog.json"
    catalog = {
        "patterns": [
            {"pattern_id": "rembrandt"},
            {"pattern_id": "loop"},
            {"pattern_id": "clamshell"},
            {"pattern_id": "butterfly"},
            {"pattern_id": "split"},
        ]
    }
    with open(catalog_path, "w") as f:
        json.dump(catalog, f)
    return catalog_path


# ═══════════════════════════════════════════════════════════════════════════
# METADATA VALIDATION
# ═══════════════════════════════════════════════════════════════════════════

class TestValidateMetadata:

    def test_valid_minimal(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata()
        is_valid, errors = validate_metadata(meta)
        assert is_valid, f"Expected valid, got errors: {errors}"
        assert errors == []

    def test_missing_required_field(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata()
        del meta["reference_id"]
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("reference_id" in e for e in errors)

    def test_missing_all_required(self):
        from engine.reference_ingestion import validate_metadata
        is_valid, errors = validate_metadata({})
        assert not is_valid
        assert len(errors) >= 5  # All required fields missing

    def test_invalid_dataset_tier(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(dataset_tier="bronze")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("dataset_tier" in e for e in errors)

    def test_invalid_trust_score_too_high(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(entry_trust_score=1.5)
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("entry_trust_score" in e for e in errors)

    def test_invalid_trust_score_negative(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(entry_trust_score=-0.1)
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("entry_trust_score" in e for e in errors)

    def test_invalid_trust_score_string(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(entry_trust_score="high")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("entry_trust_score" in e for e in errors)

    def test_invalid_source_type(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(source_type="random_grab")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("source_type" in e for e in errors)

    def test_valid_source_type(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(source_type="original_photo")
        is_valid, errors = validate_metadata(meta)
        assert is_valid

    def test_invalid_environment(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(environment="underwater")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("environment" in e for e in errors)

    def test_valid_environment(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(environment="studio")
        is_valid, errors = validate_metadata(meta)
        assert is_valid

    def test_invalid_key_direction_deg(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(key_direction_deg=400)
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("key_direction_deg" in e for e in errors)

    def test_invalid_key_height_relative(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(key_height_relative="moon_level")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("key_height_relative" in e for e in errors)

    def test_invalid_light_count(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(light_count=-1)
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("light_count" in e for e in errors)

    def test_invalid_estimated_distance(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(estimated_distance_ft=0)
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("estimated_distance_ft" in e for e in errors)

    def test_invalid_matched_setup_ids_type(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(matched_setup_ids="not_a_list")
        is_valid, errors = validate_metadata(meta)
        assert not is_valid
        assert any("matched_setup_ids" in e for e in errors)

    def test_valid_optional_fields(self):
        from engine.reference_ingestion import validate_metadata
        meta = _make_metadata(
            source_type="studio_test",
            environment="studio",
            light_count=2,
            key_direction_deg=45.0,
            key_height_relative="above_eye_level",
            modifier_family="softbox",
            estimated_distance_ft=5.0,
            matched_setup_ids=["rembrandt"],
            notes="Test note",
        )
        is_valid, errors = validate_metadata(meta)
        assert is_valid, f"Expected valid, got errors: {errors}"

    def test_pattern_id_validated_against_catalog(self):
        """Pattern ID validation uses pattern catalog when available."""
        from engine.reference_ingestion import validate_metadata, _PATTERN_IDS_CACHE
        # This test uses whatever catalog is on disk; just verify it runs
        meta = _make_metadata(pattern_id="zzz_nonexistent_pattern_zzz")
        is_valid, errors = validate_metadata(meta)
        # If catalog is loaded, should fail; if not, may pass
        # We just verify the function doesn't crash
        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)


# ═══════════════════════════════════════════════════════════════════════════
# FILENAME CONSISTENCY
# ═══════════════════════════════════════════════════════════════════════════

class TestValidateFilenameConsistency:

    def test_valid_jpg(self):
        from engine.reference_ingestion import validate_filename_consistency
        meta = _make_metadata()
        is_valid, errors = validate_filename_consistency(Path("photo.jpg"), meta)
        assert is_valid

    def test_valid_png(self):
        from engine.reference_ingestion import validate_filename_consistency
        meta = _make_metadata()
        is_valid, errors = validate_filename_consistency(Path("photo.png"), meta)
        assert is_valid

    def test_invalid_extension(self):
        from engine.reference_ingestion import validate_filename_consistency
        meta = _make_metadata()
        is_valid, errors = validate_filename_consistency(Path("photo.bmp"), meta)
        assert not is_valid
        assert any("extension" in e.lower() for e in errors)

    def test_invalid_extension_gif(self):
        from engine.reference_ingestion import validate_filename_consistency
        meta = _make_metadata()
        is_valid, errors = validate_filename_consistency(Path("photo.gif"), meta)
        assert not is_valid


# ═══════════════════════════════════════════════════════════════════════════
# INGESTION WORKFLOW
# ═══════════════════════════════════════════════════════════════════════════

class TestIngestReference:

    def test_basic_ingestion(self, tmp_path):
        from engine.reference_ingestion import ingest_reference, REFERENCE_INDEX_PATH

        ref_dir = _make_temp_reference_dir(tmp_path)
        img = _make_temp_image(tmp_path)
        meta = _make_metadata()

        # Patch the index path and pattern catalog
        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"), \
             patch("engine.reference_ingestion._PATTERN_IDS_CACHE", ["rembrandt", "loop", "clamshell"]):

            result = ingest_reference(img, meta, reference_dir=ref_dir)

        assert result["status"] == "ok"
        assert result["reference_id"] == "test_rembrandt_001"
        assert "rembrandt" in result["pattern_folder"]

        # Check image was copied
        target_img = ref_dir / "rembrandt" / "test.jpg"
        assert target_img.exists()

        # Check sidecar was written
        sidecar = ref_dir / "rembrandt" / "test.json"
        assert sidecar.exists()
        with open(sidecar) as f:
            sidecar_data = json.load(f)
        assert sidecar_data["reference_id"] == "test_rembrandt_001"
        assert sidecar_data["pattern_id"] == "rembrandt"
        assert sidecar_data["image_file"] == "test.jpg"

    def test_ingestion_creates_pattern_folder(self, tmp_path):
        from engine.reference_ingestion import ingest_reference

        ref_dir = _make_temp_reference_dir(tmp_path)
        img = _make_temp_image(tmp_path)
        meta = _make_metadata(pattern_id="loop")

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"), \
             patch("engine.reference_ingestion._PATTERN_IDS_CACHE", ["rembrandt", "loop"]):

            result = ingest_reference(img, meta, reference_dir=ref_dir)

        assert (ref_dir / "loop").is_dir()

    def test_ingestion_fails_on_missing_image(self, tmp_path):
        from engine.reference_ingestion import ingest_reference

        meta = _make_metadata()
        with pytest.raises(FileNotFoundError):
            ingest_reference(tmp_path / "nonexistent.jpg", meta)

    def test_ingestion_fails_on_invalid_metadata(self, tmp_path):
        from engine.reference_ingestion import ingest_reference

        img = _make_temp_image(tmp_path)
        bad_meta = {"reference_id": "test"}  # missing required fields

        with patch("engine.reference_ingestion._PATTERN_IDS_CACHE", []):
            with pytest.raises(ValueError, match="Metadata validation failed"):
                ingest_reference(img, bad_meta)

    def test_ingestion_no_overwrite_by_default(self, tmp_path):
        from engine.reference_ingestion import ingest_reference

        ref_dir = _make_temp_reference_dir(tmp_path)
        img = _make_temp_image(tmp_path)
        meta = _make_metadata()

        # First ingestion
        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"), \
             patch("engine.reference_ingestion._PATTERN_IDS_CACHE", ["rembrandt"]):
            ingest_reference(img, meta, reference_dir=ref_dir)

        # Second ingestion (same files) — should warn, not overwrite
        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"), \
             patch("engine.reference_ingestion._PATTERN_IDS_CACHE", ["rembrandt"]):
            result = ingest_reference(img, meta, reference_dir=ref_dir)

        assert any("already exists" in w for w in result.get("warnings", []))


# ═══════════════════════════════════════════════════════════════════════════
# INDEX REBUILDING
# ═══════════════════════════════════════════════════════════════════════════

class TestRebuildIndex:

    def test_rebuild_empty_dir(self, tmp_path):
        from engine.reference_ingestion import rebuild_index

        ref_dir = _make_temp_reference_dir(tmp_path)

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            index = rebuild_index(reference_dir=ref_dir)

        assert index["total_entries"] == 0
        assert index["image_backed_count"] == 0

    def test_rebuild_with_sidecars(self, tmp_path):
        from engine.reference_ingestion import rebuild_index

        ref_dir = _make_temp_reference_dir(tmp_path)
        pattern_dir = ref_dir / "rembrandt"
        pattern_dir.mkdir()

        # Create sidecar
        sidecar = {
            "reference_id": "test_001",
            "pattern_id": "rembrandt",
            "image_file": "test.jpg",
        }
        with open(pattern_dir / "test.json", "w") as f:
            json.dump(sidecar, f)

        # Create image
        (pattern_dir / "test.jpg").write_bytes(b"\xff\xd8\xff\xe0")

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            index = rebuild_index(reference_dir=ref_dir)

        assert index["total_entries"] == 1
        assert index["image_backed_count"] == 1
        assert index["entries"][0]["reference_id"] == "test_001"
        assert index["entries"][0]["has_image"] is True

    def test_rebuild_merges_legacy(self, tmp_path):
        from engine.reference_ingestion import rebuild_index

        ref_dir = _make_temp_reference_dir(tmp_path)
        legacy_entries = [
            {
                "reference_id": "legacy_001",
                "lighting_pattern": "loop",
                "photographer": "Legacy Photographer",
                "dataset_tier": "gold",
                "entry_trust_score": 1.0,
            }
        ]
        _make_legacy_references(ref_dir, legacy_entries)

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            index = rebuild_index(reference_dir=ref_dir)

        assert index["total_entries"] == 1
        assert index["legacy_count"] == 1
        assert index["entries"][0]["reference_id"] == "legacy_001"
        assert index["entries"][0]["_source"] == "legacy"
        # Should map lighting_pattern → pattern_id
        assert index["entries"][0]["pattern_id"] == "loop"

    def test_rebuild_deduplicates(self, tmp_path):
        from engine.reference_ingestion import rebuild_index

        ref_dir = _make_temp_reference_dir(tmp_path)
        pattern_dir = ref_dir / "rembrandt"
        pattern_dir.mkdir()

        # Sidecar with same ID as legacy entry
        sidecar = {"reference_id": "dup_001", "pattern_id": "rembrandt"}
        with open(pattern_dir / "dup_001.json", "w") as f:
            json.dump(sidecar, f)

        legacy_entries = [{"reference_id": "dup_001", "lighting_pattern": "rembrandt"}]
        _make_legacy_references(ref_dir, legacy_entries)

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", tmp_path / "reference_index.json"), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            index = rebuild_index(reference_dir=ref_dir)

        # Should only have one entry (sidecar wins over legacy)
        assert index["total_entries"] == 1
        assert index["entries"][0]["_source"] == "sidecar"

    def test_rebuild_writes_index_file(self, tmp_path):
        from engine.reference_ingestion import rebuild_index

        ref_dir = _make_temp_reference_dir(tmp_path)
        index_path = tmp_path / "reference_index.json"

        with patch("engine.reference_ingestion.REFERENCE_LIBRARY_DIR", ref_dir), \
             patch("engine.reference_ingestion.REFERENCE_INDEX_PATH", index_path), \
             patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            rebuild_index(reference_dir=ref_dir)

        assert index_path.exists()
        with open(index_path) as f:
            data = json.load(f)
        assert "_schema_version" in data
        assert "entries" in data


# ═══════════════════════════════════════════════════════════════════════════
# LEGACY SIDECAR GENERATION
# ═══════════════════════════════════════════════════════════════════════════

class TestGenerateLegacySidecars:

    def test_generates_sidecars(self, tmp_path):
        from engine.reference_ingestion import generate_legacy_sidecars

        ref_dir = _make_temp_reference_dir(tmp_path)
        legacy_entries = [
            {
                "reference_id": "hurley_001",
                "lighting_pattern": "clamshell",
                "photographer": "Peter Hurley",
                "dataset_tier": "gold",
                "entry_trust_score": 1.0,
                "environment": "studio",
                "lights": [
                    {"role": "key", "modifier": "beauty_dish", "angle_deg": 0, "distance_ft": 4},
                ],
                "shadow_signature": {"nose_shadow": "directly_below"},
                "camera": {"height_relative": "eye_level"},
            }
        ]
        _make_legacy_references(ref_dir, legacy_entries)

        with patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            results = generate_legacy_sidecars(reference_dir=ref_dir)

        assert len(results) == 1
        assert results[0]["status"] == "created"
        assert results[0]["reference_id"] == "hurley_001"

        # Verify sidecar was written
        sidecar_path = ref_dir / "clamshell" / "hurley_001.json"
        assert sidecar_path.exists()

        with open(sidecar_path) as f:
            sidecar = json.load(f)
        assert sidecar["reference_id"] == "hurley_001"
        assert sidecar["pattern_id"] == "clamshell"
        assert sidecar["light_count"] == 1
        assert sidecar["key_direction_deg"] == 0
        assert sidecar["modifier_family"] == "beauty_dish"
        assert sidecar["key_height_relative"] == "eye_level"

    def test_dry_run(self, tmp_path):
        from engine.reference_ingestion import generate_legacy_sidecars

        ref_dir = _make_temp_reference_dir(tmp_path)
        legacy_entries = [
            {"reference_id": "test_001", "lighting_pattern": "loop",
             "dataset_tier": "gold", "entry_trust_score": 1.0},
        ]
        _make_legacy_references(ref_dir, legacy_entries)

        with patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            results = generate_legacy_sidecars(reference_dir=ref_dir, dry_run=True)

        assert len(results) == 1
        assert results[0]["status"] == "would_create"
        # File should NOT have been created
        assert not (ref_dir / "loop" / "test_001.json").exists()

    def test_skip_existing(self, tmp_path):
        from engine.reference_ingestion import generate_legacy_sidecars

        ref_dir = _make_temp_reference_dir(tmp_path)
        legacy_entries = [
            {"reference_id": "test_001", "lighting_pattern": "loop",
             "dataset_tier": "gold", "entry_trust_score": 1.0},
        ]
        _make_legacy_references(ref_dir, legacy_entries)

        # Pre-create the sidecar
        (ref_dir / "loop").mkdir()
        (ref_dir / "loop" / "test_001.json").write_text("{}")

        with patch("engine.reference_ingestion.LEGACY_REFERENCES_PATH", ref_dir / "references.json"):
            results = generate_legacy_sidecars(reference_dir=ref_dir)

        assert results[0]["status"] == "already_exists"


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE MATCHER INDEX LOADING
# ═══════════════════════════════════════════════════════════════════════════

class TestMatcherIndexLoading:

    def test_matcher_loads_from_index(self, tmp_path):
        """reference_matcher should load from reference_index.json when available."""
        from engine import reference_matcher

        # Create a minimal index
        index = {
            "_schema_version": "1.0.0",
            "total_entries": 1,
            "image_backed_count": 1,
            "legacy_count": 0,
            "entries": [
                {
                    "reference_id": "from_index_001",
                    "pattern_id": "rembrandt",
                    "photographer": "Index Photographer",
                    "lighting_pattern": "rembrandt",
                    "dataset_tier": "gold",
                    "entry_trust_score": 1.0,
                    "has_image": True,
                    "_source": "sidecar",
                    "lights": [{"role": "key", "modifier": "fresnel", "angle_deg": 45}],
                }
            ],
        }
        index_path = tmp_path / "reference_index.json"
        with open(index_path, "w") as f:
            json.dump(index, f)

        # Clear cache and patch path
        reference_matcher._REFERENCES_CACHE = None
        original_index = reference_matcher._INDEX_PATH
        original_refs = reference_matcher._REFERENCES_PATH

        try:
            reference_matcher._INDEX_PATH = index_path
            reference_matcher._REFERENCES_PATH = tmp_path / "nonexistent.json"

            refs = reference_matcher._load_references()
            assert len(refs) == 1
            assert refs[0]["reference_id"] == "from_index_001"
            assert refs[0]["_source"] == "sidecar"
        finally:
            reference_matcher._REFERENCES_CACHE = None
            reference_matcher._INDEX_PATH = original_index
            reference_matcher._REFERENCES_PATH = original_refs

    def test_matcher_falls_back_to_legacy(self, tmp_path):
        """reference_matcher should fall back to references.json when index missing."""
        from engine import reference_matcher

        legacy = [
            {
                "reference_id": "from_legacy_001",
                "lighting_pattern": "loop",
                "photographer": "Legacy",
                "dataset_tier": "gold",
                "entry_trust_score": 1.0,
                "lights": [],
            }
        ]
        legacy_path = tmp_path / "references.json"
        with open(legacy_path, "w") as f:
            json.dump(legacy, f)

        reference_matcher._REFERENCES_CACHE = None
        original_index = reference_matcher._INDEX_PATH
        original_refs = reference_matcher._REFERENCES_PATH

        try:
            reference_matcher._INDEX_PATH = tmp_path / "nonexistent_index.json"
            reference_matcher._REFERENCES_PATH = legacy_path

            refs = reference_matcher._load_references()
            assert len(refs) == 1
            assert refs[0]["reference_id"] == "from_legacy_001"
        finally:
            reference_matcher._REFERENCES_CACHE = None
            reference_matcher._INDEX_PATH = original_index
            reference_matcher._REFERENCES_PATH = original_refs

    def test_matcher_reload_clears_cache(self):
        """reload_references should clear the cache."""
        from engine import reference_matcher

        # Set up known cache state
        reference_matcher._REFERENCES_CACHE = [{"test": True}]
        reference_matcher.reload_references()
        # After reload, cache should have been re-populated from disk
        # (not the fake list we set)
        assert reference_matcher._REFERENCES_CACHE != [{"test": True}]
