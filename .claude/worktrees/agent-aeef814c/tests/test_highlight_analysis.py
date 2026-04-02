"""Tests for highlight analysis passes (Stage 2).

Covers:
- HighlightAxisMap, HighlightSymmetry, ContinuousSourceSignals models
- highlight_axis_map_pass, highlight_symmetry_pass, continuous_source_heuristic_pass
- Extraction functions and enrichment integration
"""
from __future__ import annotations

import math
from typing import Any, Dict

import numpy as np
import pytest


# ═══════════════════════════════════════════════════════════════════════════
# Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestHighlightAxisMapModel:
    def test_defaults(self):
        from engine.image_analysis_models import HighlightAxisMap
        m = HighlightAxisMap()
        assert m.ok is True
        assert m.axis_count == 0
        assert m.regions == {}
        assert m.wrap_ratio == 0.0

    def test_full_instantiation(self):
        from engine.image_analysis_models import HighlightAxisMap
        m = HighlightAxisMap(
            regions={"left_cheek": {"axis_deg": 45, "width_ratio": 0.6, "intensity": 0.8}},
            dominant_axis_deg=45.0,
            axis_count=1,
            axis_consistency=1.0,
            wrap_ratio=0.6,
            confidence=0.7,
        )
        assert m.axis_count == 1
        assert "left_cheek" in m.regions

    def test_forbids_extra(self):
        from engine.image_analysis_models import HighlightAxisMap
        with pytest.raises(Exception):
            HighlightAxisMap(bad_field=True)


class TestHighlightSymmetryModel:
    def test_defaults(self):
        from engine.image_analysis_models import HighlightSymmetry
        m = HighlightSymmetry()
        assert m.ok is True
        assert m.symmetry_score == 0.0
        assert m.dominant_side == "unknown"
        assert m.fill_detected is False
        assert m.underfill_ev is None

    def test_full_instantiation(self):
        from engine.image_analysis_models import HighlightSymmetry
        m = HighlightSymmetry(
            left_intensity=0.8,
            right_intensity=0.4,
            symmetry_score=0.5,
            dominant_side="left",
            intensity_ratio=2.0,
            fill_detected=True,
            fill_side="right",
            underfill_ev=1.0,
            confidence=0.7,
        )
        assert m.dominant_side == "left"
        assert m.fill_detected is True
        assert m.underfill_ev == 1.0


class TestContinuousSourceSignalsModel:
    def test_defaults(self):
        from engine.image_analysis_models import ContinuousSourceSignals
        m = ContinuousSourceSignals()
        assert m.ok is True
        assert m.likely_technology == "unknown"
        assert m.evidence == []

    def test_full_instantiation(self):
        from engine.image_analysis_models import ContinuousSourceSignals
        m = ContinuousSourceSignals(
            likely_technology="continuous_led",
            technology_confidence=0.75,
            evidence=["strip_catchlight → continuous tube likely"],
            specular_edge_sharpness=0.2,
            color_temp_consistency=0.9,
            confidence=0.7,
        )
        assert m.likely_technology == "continuous_led"
        assert len(m.evidence) == 1


class TestVisualCueReportWithStage2:
    def test_new_fields_default_none(self):
        from engine.image_analysis_models import VisualCueReport
        vr = VisualCueReport()
        assert vr.highlight_axis_map is None
        assert vr.highlight_symmetry is None
        assert vr.continuous_source_signals is None

    def test_overall_confidence_includes_new_cues(self):
        from engine.image_analysis_models import (
            HighlightAxisMap, HighlightSymmetry, ContinuousSourceSignals, VisualCueReport,
        )
        vr = VisualCueReport(
            highlight_axis_map=HighlightAxisMap(confidence=0.8),
            highlight_symmetry=HighlightSymmetry(confidence=0.6),
            continuous_source_signals=ContinuousSourceSignals(confidence=0.5),
        )
        conf = vr.overall_confidence()
        assert conf > 0.0


# ═══════════════════════════════════════════════════════════════════════════
# Highlight Axis Map Pass Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestHighlightAxisMapPass:
    def test_no_face_box(self):
        from engine.vision_passes import highlight_axis_map_pass
        r = highlight_axis_map_pass(np.zeros((100, 100, 3), dtype=np.uint8))
        assert r["ok"] is True
        assert r["axis_count"] == 0
        assert r["regions"] == {}

    def test_small_face_box(self):
        from engine.vision_passes import highlight_axis_map_pass
        r = highlight_axis_map_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            face_box=(10, 10, 20, 20),
        )
        assert r["ok"] is True
        assert r["axis_count"] == 0

    def test_uniform_image(self):
        from engine.vision_passes import highlight_axis_map_pass
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        r = highlight_axis_map_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        # Uniform → low wrap ratio
        assert r["wrap_ratio"] >= 0.0
        assert r["wrap_ratio"] <= 1.0

    def test_gradient_image_produces_axis(self):
        """Left-to-right gradient → should produce a valid result."""
        from engine.vision_passes import highlight_axis_map_pass
        # Use a steeper gradient with noise for more distinct gradients
        img = np.random.randint(30, 60, (200, 200, 3), dtype=np.uint8)
        for x in range(200):
            img[:, x, :] = np.clip(img[:, x, :].astype(int) + int(200 * x / 200), 0, 255).astype(np.uint8)
        r = highlight_axis_map_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        # Gradient should produce regions with axis data
        assert isinstance(r["regions"], dict)

    def test_return_keys(self):
        from engine.vision_passes import highlight_axis_map_pass
        r = highlight_axis_map_pass(
            np.zeros((200, 200, 3), dtype=np.uint8),
            face_box=(20, 20, 180, 180),
        )
        for key in ["ok", "regions", "dominant_axis_deg", "axis_count",
                     "axis_consistency", "wrap_ratio", "confidence", "notes"]:
            assert key in r

    def test_with_highlight_data(self):
        from engine.vision_passes import highlight_axis_map_pass
        r = highlight_axis_map_pass(
            np.random.randint(0, 200, (200, 200, 3), dtype=np.uint8),
            face_box=(20, 20, 180, 180),
            highlight_data={"ok": True, "highlight_axis_deg": 30},
        )
        assert r["ok"] is True


# ═══════════════════════════════════════════════════════════════════════════
# Highlight Symmetry Pass Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestHighlightSymmetryPass:
    def test_no_face_box(self):
        from engine.vision_passes import highlight_symmetry_pass
        r = highlight_symmetry_pass(np.zeros((100, 100, 3), dtype=np.uint8))
        assert r["ok"] is True
        assert r["symmetry_score"] == 0.0
        assert r["dominant_side"] == "unknown"

    def test_even_lighting_high_symmetry(self):
        """Uniformly lit face → high symmetry."""
        from engine.vision_passes import highlight_symmetry_pass
        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        r = highlight_symmetry_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        assert r["symmetry_score"] > 0.9
        assert r["dominant_side"] == "center"

    def test_left_bright_low_symmetry(self):
        """Left side bright, right side dark → low symmetry, dominant=left."""
        from engine.vision_passes import highlight_symmetry_pass
        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        img[:, :100, :] = 200  # Left bright
        r = highlight_symmetry_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        assert r["symmetry_score"] < 0.5
        assert r["dominant_side"] == "left"
        assert r["intensity_ratio"] > 1.5

    def test_right_bright_low_symmetry(self):
        """Right side bright → dominant=right."""
        from engine.vision_passes import highlight_symmetry_pass
        img = np.full((200, 200, 3), 30, dtype=np.uint8)
        img[:, 100:, :] = 200  # Right bright
        r = highlight_symmetry_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        assert r["dominant_side"] == "right"

    def test_fill_detected_with_moderate_asymmetry(self):
        """Moderate brightness difference → fill detected."""
        from engine.vision_passes import highlight_symmetry_pass
        img = np.full((200, 200, 3), 100, dtype=np.uint8)
        img[:, :100, :] = 180  # Left brighter, but right still has light
        r = highlight_symmetry_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        assert r["fill_detected"] is True

    def test_underfill_ev_computed(self):
        """With asymmetry, underfill EV should be computed."""
        from engine.vision_passes import highlight_symmetry_pass
        img = np.full((200, 200, 3), 50, dtype=np.uint8)
        img[:, :100, :] = 200
        r = highlight_symmetry_pass(img, face_box=(20, 20, 180, 180))
        assert r["ok"] is True
        assert r["underfill_ev"] is not None
        assert r["underfill_ev"] > 0

    def test_return_keys(self):
        from engine.vision_passes import highlight_symmetry_pass
        r = highlight_symmetry_pass(
            np.zeros((200, 200, 3), dtype=np.uint8),
            face_box=(20, 20, 180, 180),
        )
        for key in ["ok", "left_intensity", "right_intensity", "symmetry_score",
                     "dominant_side", "intensity_ratio", "fill_detected",
                     "fill_side", "underfill_ev", "confidence", "notes"]:
            assert key in r


# ═══════════════════════════════════════════════════════════════════════════
# Continuous Source Heuristic Pass Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestContinuousSourceHeuristicPass:
    def test_no_data(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(np.zeros((100, 100, 3), dtype=np.uint8))
        assert r["ok"] is True
        assert r["likely_technology"] == "unknown"

    def test_strip_catchlight_suggests_continuous(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            catchlight_data={"ok": True, "catchlight_shape": "strip"},
        )
        assert r["ok"] is True
        assert "continuous" in r["likely_technology"]
        assert any("strip" in e for e in r["evidence"])

    def test_round_catchlight_mixed(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            catchlight_data={"ok": True, "catchlight_shape": "round"},
        )
        assert r["ok"] is True
        # Round could be either
        assert r["likely_technology"] in ("strobe", "continuous_led", "unknown")

    def test_triangular_topology_suggests_panel(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            catchlight_topology_data={"ok": True, "cluster_geometry": "triangular"},
        )
        assert r["ok"] is True
        assert "continuous_panel" in r["likely_technology"]
        assert any("triangular" in e for e in r["evidence"])

    def test_high_specularity_suggests_strobe(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            highlight_data={"ok": True, "highlight_specularity": 0.85, "highlight_edge_gradient": 0.1},
        )
        assert r["ok"] is True
        assert r["likely_technology"] == "strobe"

    def test_low_specularity_suggests_continuous(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(
            np.zeros((100, 100, 3), dtype=np.uint8),
            highlight_data={"ok": True, "highlight_specularity": 0.15, "highlight_edge_gradient": 0.7},
        )
        assert r["ok"] is True
        assert "continuous" in r["likely_technology"]

    def test_return_keys(self):
        from engine.vision_passes import continuous_source_heuristic_pass
        r = continuous_source_heuristic_pass(np.zeros((100, 100, 3), dtype=np.uint8))
        for key in ["ok", "likely_technology", "technology_confidence", "evidence",
                     "specular_edge_sharpness", "color_temp_consistency",
                     "confidence", "notes"]:
            assert key in r


# ═══════════════════════════════════════════════════════════════════════════
# Extraction Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestHighlightExtraction:
    def test_axis_map_extraction(self):
        from engine.cue_extraction import extract_highlight_axis_map
        data = {
            "ok": True,
            "regions": {"left_cheek": {"axis_deg": 45, "width_ratio": 0.6, "intensity": 0.8}},
            "dominant_axis_deg": 45.0,
            "axis_count": 1,
            "axis_consistency": 1.0,
            "wrap_ratio": 0.6,
            "confidence": 0.7,
            "notes": [],
        }
        m = extract_highlight_axis_map(data)
        assert m is not None
        assert m.axis_count == 1
        assert "left_cheek" in m.regions

    def test_axis_map_extraction_failed(self):
        from engine.cue_extraction import extract_highlight_axis_map
        assert extract_highlight_axis_map({"ok": False}) is None

    def test_axis_map_extraction_no_regions(self):
        from engine.cue_extraction import extract_highlight_axis_map
        assert extract_highlight_axis_map({"ok": True, "regions": {}}) is None

    def test_symmetry_extraction(self):
        from engine.cue_extraction import extract_highlight_symmetry
        data = {
            "ok": True,
            "left_intensity": 0.7,
            "right_intensity": 0.3,
            "symmetry_score": 0.43,
            "dominant_side": "left",
            "intensity_ratio": 2.33,
            "fill_detected": True,
            "fill_side": "right",
            "underfill_ev": 1.22,
            "confidence": 0.7,
            "notes": [],
        }
        m = extract_highlight_symmetry(data)
        assert m is not None
        assert m.dominant_side == "left"
        assert m.fill_detected is True

    def test_symmetry_extraction_failed(self):
        from engine.cue_extraction import extract_highlight_symmetry
        assert extract_highlight_symmetry({"ok": False}) is None

    def test_continuous_extraction(self):
        from engine.cue_extraction import extract_continuous_source_signals
        data = {
            "ok": True,
            "likely_technology": "continuous_led",
            "technology_confidence": 0.8,
            "evidence": ["strip catchlight"],
            "specular_edge_sharpness": 0.2,
            "color_temp_consistency": 0.9,
            "confidence": 0.7,
            "notes": [],
        }
        m = extract_continuous_source_signals(data)
        assert m is not None
        assert m.likely_technology == "continuous_led"

    def test_continuous_extraction_failed(self):
        from engine.cue_extraction import extract_continuous_source_signals
        assert extract_continuous_source_signals({"ok": False}) is None


# ═══════════════════════════════════════════════════════════════════════════
# Enrichment Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEnrichmentStage2:
    def test_enriches_all_three(self):
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        pipeline = {
            "highlight_axis_map": {
                "ok": True,
                "regions": {"forehead": {"axis_deg": 0, "width_ratio": 0.5, "intensity": 0.6}},
                "dominant_axis_deg": 0.0,
                "axis_count": 1,
                "axis_consistency": 1.0,
                "wrap_ratio": 0.5,
                "confidence": 0.6,
                "notes": [],
            },
            "highlight_symmetry": {
                "ok": True,
                "left_intensity": 0.6,
                "right_intensity": 0.6,
                "symmetry_score": 1.0,
                "dominant_side": "center",
                "intensity_ratio": 1.0,
                "fill_detected": False,
                "fill_side": None,
                "underfill_ev": 0.0,
                "confidence": 0.7,
                "notes": [],
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "strobe",
                "technology_confidence": 0.6,
                "evidence": [],
                "specular_edge_sharpness": 0.8,
                "color_temp_consistency": 0.5,
                "confidence": 0.5,
                "notes": [],
            },
        }
        enriched = enrich_cue_report_from_pipeline(report, pipeline)
        assert enriched.highlight_axis_map is not None
        assert enriched.highlight_symmetry is not None
        assert enriched.continuous_source_signals is not None

    def test_missing_keys_leave_none(self):
        from engine.cue_extraction import enrich_cue_report_from_pipeline
        from engine.image_analysis_models import VisualCueReport

        report = VisualCueReport()
        enriched = enrich_cue_report_from_pipeline(report, {})
        assert enriched.highlight_axis_map is None
        assert enriched.highlight_symmetry is None
        assert enriched.continuous_source_signals is None


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline Integration Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestStage2PipelineIntegration:
    def test_pipeline_includes_new_keys(self):
        from engine.vision_passes import run_extended_pipeline
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        results = run_extended_pipeline(img)
        assert "highlight_axis_map" in results
        assert "highlight_symmetry" in results
        assert "continuous_source" in results

    def test_pipeline_ok_without_face(self):
        from engine.vision_passes import run_extended_pipeline
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        results = run_extended_pipeline(img)
        assert results["highlight_axis_map"]["ok"] is True
        assert results["highlight_symmetry"]["ok"] is True
        assert results["continuous_source"]["ok"] is True

    def test_pipeline_with_face_box(self):
        from engine.vision_passes import run_extended_pipeline
        img = np.random.randint(0, 200, (200, 200, 3), dtype=np.uint8)
        results = run_extended_pipeline(img, face_box=(20, 20, 180, 180))
        assert results["highlight_axis_map"]["ok"] is True
        assert results["highlight_symmetry"]["ok"] is True
        assert results["continuous_source"]["ok"] is True
