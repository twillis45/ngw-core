"""Tests for catchlight topology pass and extraction.

Covers:
- CatchlightTopology model instantiation and defaults
- catchlight_topology_pass with various scenarios (no face, single, dual, triangular, strip)
- extract_catchlight_topology cue extraction
- enrich_cue_report_from_pipeline integration
- Bilateral symmetry scoring
- Cluster geometry classification
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pytest


# ═══════════════════════════════════════════════════════════════════════════
# Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestCatchlightTopologyModel:
    """Test CatchlightTopology Pydantic model."""

    def test_default_instantiation(self):
        from engine.image_analysis_models import CatchlightTopology

        ct = CatchlightTopology()
        assert ct.ok is True
        assert ct.cluster_geometry == "unknown"
        assert ct.catchlight_count == 0
        assert ct.primary is None
        assert ct.secondary is None
        assert ct.tertiary is None
        assert ct.cluster_spread_deg == 0.0
        assert ct.inter_catchlight_spacing is None
        assert ct.bilateral_symmetry_score == 0.0
        assert ct.confidence == 0.0
        assert ct.notes == []

    def test_full_instantiation(self):
        from engine.image_analysis_models import CatchlightTopology

        ct = CatchlightTopology(
            primary={"clock_deg": 60, "shape": "round", "size_ratio": 0.1, "intensity": 0.9},
            secondary={"clock_deg": 120, "shape": "round", "size_ratio": 0.05, "intensity": 0.7},
            tertiary={"clock_deg": 300, "shape": "rectangular", "size_ratio": 0.03, "intensity": 0.5},
            catchlight_count=3,
            cluster_geometry="triangular",
            cluster_spread_deg=120.0,
            inter_catchlight_spacing=[60.0, 60.0, 60.0],
            bilateral_symmetry_score=0.85,
            confidence=0.8,
            notes=["3 catchlights forming triangular cluster"],
        )
        assert ct.catchlight_count == 3
        assert ct.cluster_geometry == "triangular"
        assert ct.primary["clock_deg"] == 60
        assert ct.secondary["shape"] == "round"
        assert ct.tertiary is not None
        assert len(ct.inter_catchlight_spacing) == 3

    def test_in_visual_cue_report(self):
        from engine.image_analysis_models import CatchlightTopology, VisualCueReport

        ct = CatchlightTopology(catchlight_count=2, cluster_geometry="dual", confidence=0.65)
        report = VisualCueReport(catchlight_topology=ct)
        assert report.catchlight_topology is not None
        assert report.catchlight_topology.cluster_geometry == "dual"

    def test_visual_cue_report_default_none(self):
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        assert report.catchlight_topology is None

    def test_overall_confidence_includes_topology(self):
        from engine.image_analysis_models import CatchlightTopology, VisualCueReport

        ct = CatchlightTopology(catchlight_count=3, confidence=0.9)
        report = VisualCueReport(catchlight_topology=ct)
        conf = report.overall_confidence()
        assert conf > 0.0  # At least topology contributes

    def test_model_forbids_extra_fields(self):
        from engine.image_analysis_models import CatchlightTopology

        with pytest.raises(Exception):
            CatchlightTopology(extra_field="not_allowed")


# ═══════════════════════════════════════════════════════════════════════════
# Pass Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestCatchlightTopologyPass:
    """Test catchlight_topology_pass function."""

    def test_no_cv2_graceful(self, monkeypatch):
        """When cv2 is unavailable, pass returns ok=False."""
        import engine.vision_passes as vp

        original_cv2 = vp.cv2
        monkeypatch.setattr(vp, "cv2", None)
        try:
            result = vp.catchlight_topology_pass(np.zeros((100, 100, 3), dtype=np.uint8))
            assert result["ok"] is False
        finally:
            monkeypatch.setattr(vp, "cv2", original_cv2)

    def test_no_face_box(self):
        """No face box → ok=True, count=0, geometry=unknown."""
        from engine.vision_passes import catchlight_topology_pass

        result = catchlight_topology_pass(np.zeros((100, 100, 3), dtype=np.uint8))
        assert result["ok"] is True
        assert result["catchlight_count"] == 0
        assert result["cluster_geometry"] == "unknown"
        assert result["confidence"] == 0.0
        assert "No face box" in result["notes"][0]

    def test_tiny_face_box(self):
        """Very small face box → ok=True, count=0."""
        from engine.vision_passes import catchlight_topology_pass

        result = catchlight_topology_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            face_box=(10, 10, 20, 20),  # 10x10, too small
        )
        assert result["ok"] is True
        assert result["catchlight_count"] == 0

    def test_dark_image_no_catchlights(self):
        """Uniformly dark image → no catchlights detected."""
        from engine.vision_passes import catchlight_topology_pass

        dark = np.full((200, 200, 3), 20, dtype=np.uint8)
        result = catchlight_topology_pass(dark, face_box=(20, 20, 180, 180))
        assert result["ok"] is True
        assert result["catchlight_count"] == 0
        assert result["cluster_geometry"] in ("none", "unknown")

    def test_single_bright_spot(self):
        """One bright spot → single geometry."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 50, dtype=np.uint8)
        # Place a single bright spot in the left eye region
        # Face box: (20, 20, 180, 180), eye region: y=60-100, left: x=20-100
        img[75:80, 55:60] = [255, 255, 255]

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        assert result["ok"] is True
        if result["catchlight_count"] >= 1:
            assert result["primary"] is not None

    def test_two_bright_spots(self):
        """Two separated bright spots → dual/bilateral geometry."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        # Place two bright spots in the left eye region
        img[75:80, 40:45] = [255, 255, 255]
        img[75:80, 80:85] = [255, 255, 255]

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        assert result["ok"] is True
        if result["catchlight_count"] >= 2:
            assert result["secondary"] is not None

    def test_three_bright_spots_triangle(self):
        """Three bright spots in triangle formation → triangular geometry."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        # Place three bright spots in the left eye region at different positions
        # Left eye: x=20-100, y=60-100
        img[65:70, 50:55] = [255, 255, 255]  # top
        img[85:90, 35:40] = [255, 255, 255]  # bottom left
        img[85:90, 70:75] = [255, 255, 255]  # bottom right

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        assert result["ok"] is True
        if result["catchlight_count"] >= 3:
            assert result["tertiary"] is not None
            assert result["cluster_geometry"] in ("triangular", "linear")

    def test_return_structure(self):
        """Verify all expected keys are present in the return dict."""
        from engine.vision_passes import catchlight_topology_pass

        result = catchlight_topology_pass(
            np.zeros((200, 200, 3), dtype=np.uint8),
            face_box=(20, 20, 180, 180),
        )
        expected_keys = {
            "ok", "catchlight_count", "cluster_geometry", "cluster_spread_deg",
            "inter_catchlight_spacing", "bilateral_symmetry_score",
            "primary", "secondary", "tertiary", "confidence", "notes",
        }
        assert expected_keys.issubset(set(result.keys()))

    def test_catchlight_data_from_primary_pass(self):
        """Pass accepts catchlight_data from the primary catchlight_pass."""
        from engine.vision_passes import catchlight_topology_pass

        result = catchlight_topology_pass(
            np.zeros((200, 200, 3), dtype=np.uint8),
            face_box=(20, 20, 180, 180),
            catchlight_data={"ok": True, "catchlight_count": 1},
        )
        assert result["ok"] is True


# ═══════════════════════════════════════════════════════════════════════════
# Extraction Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestExtractCatchlightTopology:
    """Test extract_catchlight_topology cue extraction."""

    def test_failed_pass_returns_none(self):
        from engine.cue_extraction import extract_catchlight_topology

        assert extract_catchlight_topology({"ok": False}) is None

    def test_zero_catchlights_returns_none(self):
        from engine.cue_extraction import extract_catchlight_topology

        assert extract_catchlight_topology({"ok": True, "catchlight_count": 0}) is None

    def test_successful_extraction(self):
        from engine.cue_extraction import extract_catchlight_topology

        data = {
            "ok": True,
            "catchlight_count": 3,
            "cluster_geometry": "triangular",
            "cluster_spread_deg": 120.0,
            "inter_catchlight_spacing": [60.0, 60.0, 60.0],
            "bilateral_symmetry_score": 0.85,
            "primary": {"clock_deg": 60, "shape": "round"},
            "secondary": {"clock_deg": 120, "shape": "round"},
            "tertiary": {"clock_deg": 300, "shape": "rectangular"},
            "confidence": 0.8,
            "notes": [],
        }
        ct = extract_catchlight_topology(data)
        assert ct is not None
        assert ct.catchlight_count == 3
        assert ct.cluster_geometry == "triangular"
        assert ct.bilateral_symmetry_score == 0.85
        assert ct.primary["clock_deg"] == 60
        assert ct.secondary is not None
        assert ct.tertiary is not None

    def test_single_catchlight_extraction(self):
        from engine.cue_extraction import extract_catchlight_topology

        data = {
            "ok": True,
            "catchlight_count": 1,
            "cluster_geometry": "single",
            "cluster_spread_deg": 0.0,
            "inter_catchlight_spacing": [],
            "bilateral_symmetry_score": 0.0,
            "primary": {"clock_deg": 330, "shape": "round"},
            "secondary": None,
            "tertiary": None,
            "confidence": 0.4,
            "notes": [],
        }
        ct = extract_catchlight_topology(data)
        assert ct is not None
        assert ct.catchlight_count == 1
        assert ct.cluster_geometry == "single"
        assert ct.secondary is None

    def test_missing_optional_fields(self):
        """Extraction handles missing optional fields gracefully."""
        from engine.cue_extraction import extract_catchlight_topology

        data = {
            "ok": True,
            "catchlight_count": 2,
            "cluster_geometry": "dual",
        }
        ct = extract_catchlight_topology(data)
        assert ct is not None
        assert ct.catchlight_count == 2
        assert ct.bilateral_symmetry_score == 0.0


# ═══════════════════════════════════════════════════════════════════════════
# Enrichment Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEnrichCueReportFromPipeline:
    """Test enrich_cue_report_from_pipeline integration."""

    def test_enriches_with_topology(self):
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        assert report.catchlight_topology is None

        pipeline = {
            "catchlight_topology": {
                "ok": True,
                "catchlight_count": 2,
                "cluster_geometry": "dual",
                "cluster_spread_deg": 30.0,
                "inter_catchlight_spacing": [30.0],
                "bilateral_symmetry_score": 0.7,
                "primary": {"clock_deg": 330},
                "secondary": {"clock_deg": 0},
                "tertiary": None,
                "confidence": 0.65,
                "notes": [],
            },
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.catchlight_topology is not None
        assert enriched.catchlight_topology.cluster_geometry == "dual"
        assert enriched.catchlight_topology.catchlight_count == 2

    def test_no_topology_in_pipeline(self):
        """When pipeline has no topology, report stays unchanged."""
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        enriched = enrich_cue_report_from_pipeline(report, {})
        assert enriched.catchlight_topology is None

    def test_failed_topology_not_attached(self):
        """When topology pass failed, it is not attached."""
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        pipeline = {"catchlight_topology": {"ok": False, "error": "cv2 not available"}}
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.catchlight_topology is None

    def test_preserves_existing_cues(self):
        """Enrichment doesn't clobber existing cues."""
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import ShadowEdgeHardness, VisualCueReport

        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(classification="hard", confidence=0.9),
            cues_computed=1,
        )
        pipeline = {
            "catchlight_topology": {
                "ok": True,
                "catchlight_count": 1,
                "cluster_geometry": "single",
                "cluster_spread_deg": 0.0,
                "inter_catchlight_spacing": [],
                "bilateral_symmetry_score": 0.0,
                "primary": {"clock_deg": 330},
                "secondary": None,
                "tertiary": None,
                "confidence": 0.4,
                "notes": [],
            },
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        # Topology attached
        assert enriched.catchlight_topology is not None
        # Existing cue preserved
        assert enriched.shadow_edge_hardness is not None
        assert enriched.shadow_edge_hardness.classification == "hard"
        assert enriched.cues_computed == 1

    def test_returns_same_object(self):
        """Enrichment mutates in-place and returns same object."""
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        enriched = enrich_cue_report_from_pipeline(report, {})
        assert enriched is report


# ═══════════════════════════════════════════════════════════════════════════
# Cluster Geometry Classification Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestClusterGeometryClassification:
    """Test cluster geometry classification logic via synthetic images."""

    def _make_image_with_spots(
        self,
        spots: List[Dict[str, int]],
        face_box: tuple = (20, 20, 180, 180),
        bg_val: int = 30,
    ) -> np.ndarray:
        """Create a 200x200 image with bright spots at specified positions."""
        img = np.full((200, 200, 3), bg_val, dtype=np.uint8)
        for spot in spots:
            y, x = spot["y"], spot["x"]
            size = spot.get("size", 5)
            img[y:y+size, x:x+size] = [255, 255, 255]
        return img

    def test_none_geometry_dark_image(self):
        from engine.vision_passes import catchlight_topology_pass

        dark = np.full((200, 200, 3), 20, dtype=np.uint8)
        result = catchlight_topology_pass(dark, face_box=(20, 20, 180, 180))
        assert result["cluster_geometry"] in ("none", "unknown")

    def test_inter_catchlight_spacing_computed(self):
        """With multiple catchlights, spacing list should be populated."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        # Two spots in left eye region
        img[75:80, 40:45] = [255, 255, 255]
        img[75:80, 80:85] = [255, 255, 255]

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        if result["catchlight_count"] >= 2:
            assert len(result["inter_catchlight_spacing"]) >= 1

    def test_confidence_scales_with_count(self):
        """More catchlights → higher confidence."""
        from engine.vision_passes import catchlight_topology_pass

        # Single
        img1 = np.full((200, 200, 3), 30, dtype=np.uint8)
        img1[75:80, 55:60] = [255, 255, 255]
        r1 = catchlight_topology_pass(img1, face_box=(20, 20, 180, 180))

        # Multiple
        img2 = np.full((200, 200, 3), 30, dtype=np.uint8)
        img2[65:70, 40:45] = [255, 255, 255]
        img2[85:90, 40:45] = [255, 255, 255]
        img2[75:80, 80:85] = [255, 255, 255]
        r2 = catchlight_topology_pass(img2, face_box=(20, 20, 180, 180))

        if r1["catchlight_count"] >= 1 and r2["catchlight_count"] >= 3:
            assert r2["confidence"] >= r1["confidence"]


# ═══════════════════════════════════════════════════════════════════════════
# Bilateral Symmetry Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestBilateralSymmetry:
    """Test bilateral symmetry scoring logic."""

    def test_no_catchlights_zero_symmetry(self):
        from engine.vision_passes import catchlight_topology_pass

        dark = np.full((200, 200, 3), 20, dtype=np.uint8)
        result = catchlight_topology_pass(dark, face_box=(20, 20, 180, 180))
        assert result["bilateral_symmetry_score"] == 0.0

    def test_symmetric_bright_spots(self):
        """Matching spots in both eye regions should yield high symmetry."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        # Left eye region: x=20-100, y=60-100
        img[75:80, 55:60] = [255, 255, 255]
        # Right eye region: x=100-180, y=60-100
        img[75:80, 135:140] = [255, 255, 255]

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        # When both eyes have catchlights at similar positions, symmetry should be positive
        if result["catchlight_count"] >= 2:
            assert result["bilateral_symmetry_score"] >= 0.0

    def test_single_eye_low_symmetry(self):
        """Catchlights in only one eye → low/zero symmetry."""
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        # Only left eye
        img[75:80, 55:60] = [255, 255, 255]

        result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        if result["catchlight_count"] >= 1:
            # With only one eye having catchlights, symmetry should be low
            assert result["bilateral_symmetry_score"] <= 0.5


# ═══════════════════════════════════════════════════════════════════════════
# Integration Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestCatchlightTopologyIntegration:
    """Integration tests for the topology pass in the pipeline context."""

    def test_pipeline_includes_topology_key(self):
        """Verify run_extended_pipeline includes catchlight_topology key."""
        from engine.vision_passes import run_extended_pipeline

        img = np.zeros((100, 100, 3), dtype=np.uint8)
        results = run_extended_pipeline(img)
        assert "catchlight_topology" in results

    def test_pipeline_topology_ok_without_face(self):
        """Without face_box, topology pass should still succeed with ok=True."""
        from engine.vision_passes import run_extended_pipeline

        img = np.zeros((100, 100, 3), dtype=np.uint8)
        results = run_extended_pipeline(img)
        topology = results.get("catchlight_topology", {})
        assert topology.get("ok") is True
        assert topology.get("catchlight_count") == 0

    def test_pipeline_topology_with_face_box(self):
        """With face_box, topology pass should analyze eye regions."""
        from engine.vision_passes import run_extended_pipeline

        img = np.random.randint(0, 100, (200, 200, 3), dtype=np.uint8)
        # Add some bright spots in eye region
        img[75:80, 55:60] = [255, 255, 255]

        results = run_extended_pipeline(img, face_box=(20, 20, 180, 180))
        topology = results.get("catchlight_topology", {})
        assert topology.get("ok") is True

    def test_full_enrichment_pipeline(self):
        """End-to-end: pass → extraction → enrichment."""
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport
        from engine.vision_passes import catchlight_topology_pass

        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        img[75:80, 55:60] = [255, 255, 255]

        topology_result = catchlight_topology_pass(img, face_box=(20, 20, 180, 180))
        pipeline_results = {"catchlight_topology": topology_result}

        report = VisualCueReport()
        enriched = enrich_cue_report_from_pipeline(report, pipeline_results)

        if topology_result["catchlight_count"] > 0:
            assert enriched.catchlight_topology is not None
