"""Tests for engine.reference_dataset — image-backed reference storage.

Covers:
  - Dataset metadata validation
  - Full ingestion flow (with mock pipeline)
  - Signal stripping / JSON sanitization
  - Entry listing and filtering
  - Approval / rejection workflow
  - Reprocessing existing entries
  - Version management
  - Signal comparison
  - Manifest export
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from engine.reference_dataset import (
    VALID_APPROVAL_STATUSES,
    _make_thumbnail,
    _now_iso,
    _resize_image,
    _sanitize_for_json,
    _save_json,
    _strip_binary,
    _load_json,
    approve_entry,
    bump_dataset_version,
    compare_signals,
    export_dataset_manifest,
    get_dataset_version,
    get_entry,
    ingest_reference_image,
    list_entries,
    reject_entry,
    reprocess_entry,
    validate_dataset_metadata,
)


# ═══════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def dataset_root(tmp_path):
    """Provide a temporary dataset root directory."""
    root = tmp_path / "reference_dataset"
    root.mkdir()
    return root


@pytest.fixture
def mock_image(tmp_path):
    """Create a tiny test image on disk."""
    if not HAS_CV2:
        pytest.skip("cv2 not available")
    img = np.full((100, 150, 3), 128, dtype=np.uint8)
    path = tmp_path / "test_image.jpg"
    cv2.imwrite(str(path), img)
    return path


@pytest.fixture
def valid_metadata():
    """Return a valid metadata dict for testing."""
    return {
        "reference_id": "test_ref_001",
        "pattern_id": "rembrandt",
        "photographer": "Test Photographer",
        "dataset_tier": "community",
        "entry_trust_score": 0.7,
    }


@pytest.fixture
def mock_pipeline_results():
    """Return mock pipeline results."""
    return {
        "geometry": {"ok": True, "face_detected": True},
        "shadow": {"ok": True, "shadow_angle_deg": 45.0},
        "highlight": {"ok": True, "highlight_intensity": 0.8},
        "reconstruction": {"ok": True, "key_light_angle_deg": 42.0},
        "validation": {"ok": True, "valid": True, "confidence": 0.85},
        "vlm_reconstruction": {
            "primary_reconstruction": {"dominant_source_direction_deg": 40.0},
            "candidates": [],
            "ok": True,
        },
        "_debug_img_bgr": np.zeros((100, 100, 3), dtype=np.uint8),
        "_debug_masks": {"person": np.zeros((100, 100), dtype=np.uint8)},
        "_debug_face_box": (10, 10, 50, 50),
    }


def _create_entry(dataset_root, pattern_id, reference_id, metadata=None, signals=None):
    """Helper to create a minimal entry in the dataset for testing."""
    entry_dir = dataset_root / pattern_id / reference_id
    entry_dir.mkdir(parents=True, exist_ok=True)

    meta = metadata or {
        "reference_id": reference_id,
        "pattern_id": pattern_id,
        "photographer": "Test",
        "dataset_tier": "community",
        "entry_trust_score": 0.5,
        "approval_status": "draft",
        "has_signals": bool(signals),
        "has_vlm_reconstruction": False,
        "has_debug_overlay": False,
    }
    _save_json(entry_dir / "metadata.json", meta)

    if signals:
        _save_json(entry_dir / "signals.json", signals)

    # Create a dummy image
    if HAS_CV2:
        img = np.full((50, 50, 3), 128, dtype=np.uint8)
        cv2.imwrite(str(entry_dir / "image.jpg"), img)
        cv2.imwrite(str(entry_dir / "thumbnail.jpg"), img)

    return entry_dir


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Metadata Validation
# ═══════════════════════════════════════════════════════════════════════════


class TestValidateDatasetMetadata:
    def test_valid_metadata(self, valid_metadata):
        ok, errors = validate_dataset_metadata(valid_metadata)
        assert ok is True
        assert errors == []

    def test_missing_required_field(self):
        meta = {"reference_id": "test", "pattern_id": "rembrandt"}
        ok, errors = validate_dataset_metadata(meta)
        assert ok is False
        assert any("photographer" in e.lower() or "dataset_tier" in e.lower() for e in errors)

    def test_default_trust_score(self):
        """entry_trust_score defaults to 0.5 if missing."""
        meta = {
            "reference_id": "test",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "gold",
        }
        ok, errors = validate_dataset_metadata(meta)
        assert ok is True

    def test_invalid_approval_status(self):
        meta = {
            "reference_id": "test",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "gold",
            "approval_status": "invalid_status",
        }
        ok, errors = validate_dataset_metadata(meta)
        assert ok is False
        assert any("approval_status" in e for e in errors)

    def test_invalid_tier(self):
        meta = {
            "reference_id": "test",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "platinum",
        }
        ok, errors = validate_dataset_metadata(meta)
        assert ok is False
        assert any("dataset_tier" in e for e in errors)


# ═══════════════════════════════════════════════════════════════════════════
# TEST: JSON Sanitization & Binary Stripping
# ═══════════════════════════════════════════════════════════════════════════


class TestSanitizeForJson:
    def test_primitives(self):
        assert _sanitize_for_json(42) == 42
        assert _sanitize_for_json(3.14) == 3.14
        assert _sanitize_for_json("hello") == "hello"
        assert _sanitize_for_json(None) is None
        assert _sanitize_for_json(True) is True

    def test_numpy_integer(self):
        val = np.int64(42)
        result = _sanitize_for_json(val)
        assert result == 42
        assert isinstance(result, int)

    def test_numpy_float(self):
        val = np.float32(3.14)
        result = _sanitize_for_json(val)
        assert isinstance(result, float)

    def test_small_ndarray(self):
        arr = np.array([1, 2, 3])
        result = _sanitize_for_json(arr)
        assert result == [1, 2, 3]

    def test_large_ndarray_placeholder(self):
        arr = np.zeros((100, 100))
        result = _sanitize_for_json(arr)
        assert isinstance(result, str)
        assert "ndarray" in result

    def test_nested_dict(self):
        data = {"a": np.int64(1), "b": {"c": np.float32(2.0)}}
        result = _sanitize_for_json(data)
        assert result == {"a": 1, "b": {"c": pytest.approx(2.0, abs=0.01)}}

    def test_bytes_placeholder(self):
        result = _sanitize_for_json(b"hello")
        assert "bytes" in result


class TestStripBinary:
    def test_strips_debug_keys(self):
        data = {
            "shadow": {"ok": True},
            "_debug_img_bgr": np.zeros((10, 10, 3)),
            "_debug_masks": {"person": np.zeros((10, 10))},
            "_debug_face_box": (1, 2, 3, 4),
        }
        result = _strip_binary(data)
        assert "shadow" in result
        assert "_debug_img_bgr" not in result
        assert "_debug_masks" not in result
        assert "_debug_face_box" not in result

    def test_preserves_pipeline_keys(self):
        data = {
            "geometry": {"ok": True, "score": np.float32(0.9)},
            "reconstruction": {"ok": True, "key_light_angle_deg": 42.0},
        }
        result = _strip_binary(data)
        assert "geometry" in result
        assert "reconstruction" in result
        assert result["geometry"]["score"] == pytest.approx(0.9, abs=0.01)

    def test_json_serializable(self):
        data = {
            "shadow": {"ok": True, "angle": np.float64(45.0)},
            "highlight": {"ok": True, "values": np.array([1, 2, 3])},
        }
        result = _strip_binary(data)
        # Should be JSON serializable
        json_str = json.dumps(result)
        assert isinstance(json_str, str)


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Image Helpers
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestImageHelpers:
    def test_resize_small_image_unchanged(self):
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        result = _resize_image(img, max_edge=2048)
        assert result.shape == (100, 200, 3)

    def test_resize_large_image(self):
        img = np.zeros((3000, 4000, 3), dtype=np.uint8)
        result = _resize_image(img, max_edge=2048)
        assert max(result.shape[:2]) <= 2048

    def test_thumbnail_square(self):
        img = np.zeros((200, 300, 3), dtype=np.uint8)
        thumb = _make_thumbnail(img, size=64)
        assert thumb.shape == (64, 64, 3)


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Ingestion
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestIngest:
    def test_ingest_no_pipeline(self, mock_image, valid_metadata, dataset_root):
        """Ingest with pipeline disabled — should store image + metadata only."""
        result = ingest_reference_image(
            mock_image, valid_metadata,
            run_pipeline=False,
            dataset_root=dataset_root,
        )
        assert result["ok"] is True
        assert result["pipeline_ok"] is False

        entry_dir = dataset_root / "rembrandt" / "test_ref_001"
        assert (entry_dir / "image.jpg").exists()
        assert (entry_dir / "thumbnail.jpg").exists()
        assert (entry_dir / "metadata.json").exists()
        assert not (entry_dir / "signals.json").exists()

    @patch("engine.reference_dataset.ingest_reference_image.__module__")
    def test_ingest_with_mock_pipeline(self, _, mock_image, valid_metadata, dataset_root, mock_pipeline_results):
        """Ingest with mocked pipeline — should store signals + VLM."""
        with patch("engine.vision_passes.run_extended_pipeline", return_value=mock_pipeline_results):
            with patch("engine.image_analysis.analyze_image_regions", return_value={"ok": False}):
                result = ingest_reference_image(
                    mock_image, valid_metadata,
                    run_pipeline=True,
                    run_vlm=True,
                    dataset_root=dataset_root,
                )

        assert result["ok"] is True
        entry_dir = dataset_root / "rembrandt" / "test_ref_001"
        assert (entry_dir / "metadata.json").exists()

    def test_ingest_duplicate_raises(self, mock_image, valid_metadata, dataset_root):
        """Duplicate ingest without overwrite should raise."""
        ingest_reference_image(
            mock_image, valid_metadata,
            run_pipeline=False,
            dataset_root=dataset_root,
        )
        with pytest.raises(FileExistsError):
            ingest_reference_image(
                mock_image, valid_metadata,
                run_pipeline=False,
                dataset_root=dataset_root,
            )

    def test_ingest_overwrite(self, mock_image, valid_metadata, dataset_root):
        """Overwrite should succeed."""
        ingest_reference_image(
            mock_image, valid_metadata,
            run_pipeline=False,
            dataset_root=dataset_root,
        )
        result = ingest_reference_image(
            mock_image, valid_metadata,
            run_pipeline=False,
            overwrite=True,
            dataset_root=dataset_root,
        )
        assert result["ok"] is True

    def test_ingest_invalid_metadata(self, mock_image, dataset_root):
        """Invalid metadata should raise ValueError."""
        bad_meta = {"reference_id": "test"}  # missing required fields
        with pytest.raises(ValueError):
            ingest_reference_image(
                mock_image, bad_meta,
                run_pipeline=False,
                dataset_root=dataset_root,
            )

    def test_ingest_missing_image(self, valid_metadata, dataset_root, tmp_path):
        """Missing image file should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            ingest_reference_image(
                tmp_path / "nonexistent.jpg", valid_metadata,
                run_pipeline=False,
                dataset_root=dataset_root,
            )

    def test_ingest_unsupported_format(self, valid_metadata, dataset_root, tmp_path):
        """Unsupported image format should raise ValueError."""
        bad_file = tmp_path / "test.bmp"
        bad_file.write_bytes(b"not_an_image")
        with pytest.raises(ValueError, match="Unsupported image format"):
            ingest_reference_image(
                bad_file, valid_metadata,
                run_pipeline=False,
                dataset_root=dataset_root,
            )

    def test_ingest_default_trust_score(self, mock_image, dataset_root):
        """Metadata without trust score should default to 0.5."""
        meta = {
            "reference_id": "test_default",
            "pattern_id": "rembrandt",
            "photographer": "Test",
            "dataset_tier": "community",
        }
        result = ingest_reference_image(
            mock_image, meta,
            run_pipeline=False,
            dataset_root=dataset_root,
        )
        assert result["ok"] is True
        stored = _load_json(dataset_root / "rembrandt" / "test_default" / "metadata.json")
        assert stored["entry_trust_score"] == 0.5

    def test_ingest_sets_timestamps(self, mock_image, valid_metadata, dataset_root):
        """Ingestion should set ingested_at timestamp."""
        result = ingest_reference_image(
            mock_image, valid_metadata,
            run_pipeline=False,
            dataset_root=dataset_root,
        )
        stored = _load_json(dataset_root / "rembrandt" / "test_ref_001" / "metadata.json")
        assert "ingested_at" in stored
        assert stored["approval_status"] == "draft"


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Listing & Filtering
# ═══════════════════════════════════════════════════════════════════════════


class TestListEntries:
    def test_empty_dataset(self, dataset_root):
        entries = list_entries(dataset_root=dataset_root)
        assert entries == []

    def test_list_all(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        _create_entry(dataset_root, "butterfly", "ref_002")
        entries = list_entries(dataset_root=dataset_root)
        assert len(entries) == 2

    def test_filter_by_pattern(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        _create_entry(dataset_root, "butterfly", "ref_002")
        entries = list_entries(pattern_id="rembrandt", dataset_root=dataset_root)
        assert len(entries) == 1
        assert entries[0]["pattern_id"] == "rembrandt"

    def test_filter_by_status(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001", metadata={
            "reference_id": "ref_001", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "approved",
        })
        _create_entry(dataset_root, "rembrandt", "ref_002", metadata={
            "reference_id": "ref_002", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "draft",
        })
        entries = list_entries(status="approved", dataset_root=dataset_root)
        assert len(entries) == 1
        assert entries[0]["reference_id"] == "ref_001"

    def test_filter_by_tier(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001", metadata={
            "reference_id": "ref_001", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "draft",
        })
        _create_entry(dataset_root, "rembrandt", "ref_002", metadata={
            "reference_id": "ref_002", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "community",
            "entry_trust_score": 0.5, "approval_status": "draft",
        })
        entries = list_entries(tier="gold", dataset_root=dataset_root)
        assert len(entries) == 1

    def test_nonexistent_pattern(self, dataset_root):
        entries = list_entries(pattern_id="nonexistent", dataset_root=dataset_root)
        assert entries == []


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Get Entry
# ═══════════════════════════════════════════════════════════════════════════


class TestGetEntry:
    def test_get_existing(self, dataset_root):
        signals = {"shadow": {"ok": True}, "highlight": {"ok": True}}
        _create_entry(dataset_root, "rembrandt", "ref_001", signals=signals)
        entry = get_entry("rembrandt", "ref_001", dataset_root=dataset_root)
        assert entry is not None
        assert entry["metadata"]["reference_id"] == "ref_001"
        assert entry["signals"] is not None
        assert entry["signals"]["shadow"]["ok"] is True

    def test_get_nonexistent(self, dataset_root):
        entry = get_entry("rembrandt", "nonexistent", dataset_root=dataset_root)
        assert entry is None

    def test_get_without_signals(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        entry = get_entry("rembrandt", "ref_001", include_signals=False, dataset_root=dataset_root)
        assert "signals" not in entry

    def test_get_without_vlm(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        entry = get_entry("rembrandt", "ref_001", include_vlm=False, dataset_root=dataset_root)
        assert "vlm_reconstruction" not in entry


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Approval Workflow
# ═══════════════════════════════════════════════════════════════════════════


class TestApproval:
    def test_approve(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        meta = approve_entry("rembrandt", "ref_001", "admin@test.com", dataset_root=dataset_root)
        assert meta["approval_status"] == "approved"
        assert meta["approved_by"] == "admin@test.com"
        assert "approved_at" in meta

    def test_reject(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        meta = reject_entry("rembrandt", "ref_001", "Not good enough", dataset_root=dataset_root)
        assert meta["approval_status"] == "rejected"
        assert meta["rejection_reason"] == "Not good enough"

    def test_approve_nonexistent(self, dataset_root):
        with pytest.raises(FileNotFoundError):
            approve_entry("rembrandt", "nonexistent", "admin", dataset_root=dataset_root)

    def test_reject_nonexistent(self, dataset_root):
        with pytest.raises(FileNotFoundError):
            reject_entry("rembrandt", "nonexistent", dataset_root=dataset_root)

    def test_approve_clears_rejection(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        reject_entry("rembrandt", "ref_001", "Bad", dataset_root=dataset_root)
        meta = approve_entry("rembrandt", "ref_001", "admin", dataset_root=dataset_root)
        assert meta["approval_status"] == "approved"
        assert "rejection_reason" not in meta


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Versioning
# ═══════════════════════════════════════════════════════════════════════════


class TestVersioning:
    def test_get_version_missing(self, dataset_root):
        version = get_dataset_version(dataset_root=dataset_root)
        assert version["schema_version"] == "1.0.0"
        assert version["entry_count"] == 0

    def test_bump_version(self, dataset_root):
        # Init version
        _save_json(dataset_root / "_version.json", {
            "schema_version": "1.0.0",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "entry_count": 0,
        })
        version = bump_dataset_version("Test bump", dataset_root=dataset_root)
        assert version["schema_version"] == "1.0.1"
        assert len(version.get("history", [])) == 1
        assert version["history"][0]["note"] == "Test bump"

    def test_bump_increments(self, dataset_root):
        _save_json(dataset_root / "_version.json", {
            "schema_version": "1.2.3",
            "created_at": _now_iso(),
        })
        version = bump_dataset_version(dataset_root=dataset_root)
        assert version["schema_version"] == "1.2.4"

    def test_version_counts_entries(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001")
        _create_entry(dataset_root, "butterfly", "ref_002")
        _save_json(dataset_root / "_version.json", {
            "schema_version": "1.0.0",
            "created_at": _now_iso(),
        })
        version = bump_dataset_version(dataset_root=dataset_root)
        assert version["entry_count"] == 2


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Signal Comparison
# ═══════════════════════════════════════════════════════════════════════════


class TestCompareSignals:
    def test_identical_signals(self):
        a = {"shadow": {"ok": True, "angle": 45.0}}
        b = {"shadow": {"ok": True, "angle": 45.0}}
        result = compare_signals(a, b)
        assert result["passes_compared"] == 1
        shadow = result["comparison"]["shadow"]
        assert shadow["in_a"] is True
        assert shadow["in_b"] is True

    def test_different_values(self):
        a = {"shadow": {"ok": True, "angle": 45.0}}
        b = {"shadow": {"ok": True, "angle": 90.0}}
        result = compare_signals(a, b)
        deltas = result["comparison"]["shadow"]["deltas"]
        assert deltas["angle"]["delta"] == 45.0

    def test_missing_pass(self):
        a = {"shadow": {"ok": True}}
        b = {"highlight": {"ok": True}}
        result = compare_signals(a, b)
        assert result["passes_compared"] == 2
        assert result["comparison"]["shadow"]["in_a"] is True
        assert result["comparison"]["shadow"]["in_b"] is False

    def test_empty_signals(self):
        result = compare_signals({}, {})
        assert result["passes_compared"] == 0


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Manifest Export
# ═══════════════════════════════════════════════════════════════════════════


class TestManifest:
    def test_empty_manifest(self, dataset_root):
        manifest = export_dataset_manifest(dataset_root=dataset_root)
        assert manifest["total_entries"] == 0
        assert manifest["pattern_distribution"] == {}

    def test_manifest_with_entries(self, dataset_root):
        _create_entry(dataset_root, "rembrandt", "ref_001", metadata={
            "reference_id": "ref_001", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "approved",
        })
        _create_entry(dataset_root, "butterfly", "ref_002", metadata={
            "reference_id": "ref_002", "pattern_id": "butterfly",
            "photographer": "T", "dataset_tier": "community",
            "entry_trust_score": 0.5, "approval_status": "draft",
        })
        manifest = export_dataset_manifest(dataset_root=dataset_root)
        assert manifest["total_entries"] == 2
        assert manifest["pattern_distribution"]["rembrandt"] == 1
        assert manifest["pattern_distribution"]["butterfly"] == 1
        assert manifest["status_counts"]["approved"] == 1
        assert manifest["status_counts"]["draft"] == 1
        assert manifest["tier_counts"]["gold"] == 1
        assert manifest["tier_counts"]["community"] == 1


# ═══════════════════════════════════════════════════════════════════════════
# TEST: Reprocess
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_CV2, reason="cv2 not available")
class TestReprocess:
    def test_reprocess_nonexistent(self, dataset_root):
        with pytest.raises(FileNotFoundError):
            reprocess_entry("rembrandt", "nonexistent", dataset_root=dataset_root)

    def test_reprocess_no_image(self, dataset_root):
        """Entry exists but image is missing."""
        entry_dir = dataset_root / "rembrandt" / "ref_001"
        entry_dir.mkdir(parents=True)
        _save_json(entry_dir / "metadata.json", {
            "reference_id": "ref_001", "pattern_id": "rembrandt",
            "photographer": "T", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "draft",
        })
        with pytest.raises(FileNotFoundError, match="Image not found"):
            reprocess_entry("rembrandt", "ref_001", dataset_root=dataset_root)

    def test_reprocess_preserves_metadata(self, dataset_root, mock_pipeline_results):
        """Reprocess should preserve existing metadata fields."""
        _create_entry(dataset_root, "rembrandt", "ref_001", metadata={
            "reference_id": "ref_001", "pattern_id": "rembrandt",
            "photographer": "Special Name", "dataset_tier": "gold",
            "entry_trust_score": 1.0, "approval_status": "approved",
            "approved_by": "admin",
            "notes": "Keep this note",
        })

        with patch("engine.vision_passes.run_extended_pipeline", return_value=mock_pipeline_results):
            with patch("engine.image_analysis.analyze_image_regions", return_value={"ok": False}):
                result = reprocess_entry("rembrandt", "ref_001", dataset_root=dataset_root)

        stored = _load_json(dataset_root / "rembrandt" / "ref_001" / "metadata.json")
        assert stored["photographer"] == "Special Name"
        assert stored["notes"] == "Keep this note"
        assert "reprocessed_at" in stored
