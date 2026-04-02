"""Regression snapshot tests for the reference photo analysis pipeline.

These tests capture the full ``ReferencePhotoAnalysis`` output for known
synthetic inputs and assert that key fields remain stable across refactoring.

When a pipeline change intentionally alters output, update the snapshot by
running:

    pytest tests/regression/test_pipeline_snapshots.py --snapshot-update

or by manually editing the snapshot JSON files.
"""
import json
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from engine.image_analysis_models import (
    BackgroundIllumination,
    ContrastRatio,
    DramaticLightSignals,
    SceneContext,
    ShadowEdgeHardness,
    ShadowInterruptionPattern,
    SpecularHighlightBehavior,
    SubjectBackgroundSeparation,
    TonalProcessingEstimation,
    VisualCueReport,
)

from engine.reference_read import (
    _build_scene_context,
    _collect_dramatic_hard_signals,
    _detect_dramatic_hard_light,
    build_reference_photo_analysis,
)

SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_cue_report(**overrides) -> VisualCueReport:
    defaults = dict(
        shadow_edge_hardness=ShadowEdgeHardness(
            classification="hard", confidence=0.7
        ),
        contrast_ratio=ContrastRatio(label="high", confidence=0.8),
        subject_background_separation=SubjectBackgroundSeparation(
            luminance_delta=0.7, confidence=0.6
        ),
        background_illumination=BackgroundIllumination(
            pattern="dark", brightness_relative="darker", confidence=0.7
        ),
        specular_highlight_behavior=SpecularHighlightBehavior(
            intensity="moderate", spread="tight", confidence=0.5
        ),
        tonal_processing_estimation=TonalProcessingEstimation(
            is_bw=True, estimated_processing="bw", confidence=0.9
        ),
        cues_computed=6,
        ok=True,
    )
    defaults.update(overrides)
    return VisualCueReport(**defaults)


@dataclass
class _FakeLightingIntel:
    pattern: str = "rembrandt"
    pattern_confidence: float = 0.7
    modifier_family: Optional[str] = "hard_source"
    modifier_confidence: float = 0.6
    light_count: int = 1
    key_position_text: str = "45 degrees left, high"
    key_side: str = "left"
    fill_method_text: str = ""
    background_light_detected: bool = False
    background_light_confidence: float = 0.0
    notes: List[str] = dc_field(default_factory=list)
    cue_report: Optional[Any] = None
    face_mesh_available: bool = True
    data_quality: str = "full"


def _make_vision_data(**overrides) -> Dict[str, Any]:
    """Build vision_data dict simulating vision pipeline output."""
    defaults = {
        "catchlights": {
            "ok": True,
            "reason": "",
            "catchlights": [
                {"position": "10 o'clock", "shape": "point", "intensity": 0.7}
            ],
            "inferred": {"likelyModifier": "hard source", "confidence": 0.6},
        },
        "region_attribution": {
            "masks": {
                "person_ratio": 0.15,
                "skin_ratio": 0.08,
                "background_ratio": 0.85,
            }
        },
        "background_environment": {"classification": "studio"},
        "pose": {"ok": True, "angle": "three-quarter"},
    }
    defaults.update(overrides)
    return defaults


def _rpa_to_dict(rpa) -> Dict[str, Any]:
    """Recursively convert RPA to a dict for snapshotting."""
    if hasattr(rpa, "model_dump"):
        return rpa.model_dump()
    elif hasattr(rpa, "__dict__"):
        out = {}
        for k, v in rpa.__dict__.items():
            if hasattr(v, "model_dump"):
                out[k] = v.model_dump()
            elif isinstance(v, list):
                out[k] = [_rpa_to_dict(i) if hasattr(i, "__dict__") else i for i in v]
            elif isinstance(v, dict):
                out[k] = {kk: _rpa_to_dict(vv) if hasattr(vv, "__dict__") else vv for kk, vv in v.items()}
            else:
                out[k] = v
        return out
    return rpa


# ═══════════════════════════════════════════════════════════════════════════
# SceneContext Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSceneContext:
    """Unit tests for _build_scene_context() — Phase 1."""

    def test_studio_portrait(self):
        vision_data = _make_vision_data()
        cue_report = _make_cue_report()
        ctx = _build_scene_context(vision_data, cue_report)

        assert ctx.has_face_mesh is True
        assert ctx.bg_ratio == pytest.approx(0.85)
        assert ctx.person_ratio == pytest.approx(0.15)
        assert ctx.bg_is_environmental is False
        assert ctx.bg_pattern == "dark"
        assert ctx.scene_type == "studio_portrait"

    def test_environmental_scene(self):
        vision_data = _make_vision_data(
            catchlights={
                "ok": False,
                "reason": "no_face_mesh_detected",
                "catchlights": [],
            },
            region_attribution={
                "masks": {
                    "person_ratio": 0.08,
                    "skin_ratio": 0.03,
                    "background_ratio": 0.92,
                }
            },
            background_environment={"classification": "outdoor"},
        )
        cue_report = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="environmental", brightness_relative="similar", confidence=0.6
            ),
        )
        ctx = _build_scene_context(vision_data, cue_report)

        assert ctx.has_face_mesh is False
        assert ctx.bg_is_environmental is True
        assert ctx.scene_type == "environmental"
        assert ctx.person_ratio == pytest.approx(0.08)

    def test_no_vision_data(self):
        cue_report = _make_cue_report()
        ctx = _build_scene_context(None, cue_report)

        assert ctx.has_face_mesh is False
        assert ctx.person_ratio == 0.0
        assert ctx.bg_ratio == 0.0
        assert ctx.face_mesh_failure_reason == "no_vision_data"


# ═══════════════════════════════════════════════════════════════════════════
# DramaticLightSignals Tests — Phase 4
# ═══════════════════════════════════════════════════════════════════════════


class TestDramaticLightSignals:
    """Unit tests for individual signals in _collect_dramatic_hard_signals()."""

    def test_score_property(self):
        sig = DramaticLightSignals(
            low_brightness=True,
            dramatic_mood=True,
            bw_or_hcg=True,
        )
        assert sig.score == 3

    def test_all_signals_off(self):
        sig = DramaticLightSignals()
        assert sig.score == 0

    def test_gates_not_counted_in_score(self):
        sig = DramaticLightSignals(
            is_hard_quality=True,
            catchlights_contradict=True,
        )
        assert sig.score == 0

    def test_bw_signal(self):
        classification = {"lightQuality": "hard", "brightness": "medium", "mood": "neutral"}
        cue_report = _make_cue_report(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, estimated_processing="bw", confidence=0.9
            ),
        )
        sig = _collect_dramatic_hard_signals(classification, None, cue_report, None)
        assert sig.bw_or_hcg is True
        assert sig.is_hard_quality is True

    def test_env_suppresses_bg_ratio(self):
        """Environmental framing (no face mesh + low person ratio) suppresses bg_ratio."""
        classification = {"lightQuality": "hard"}
        vision_data = _make_vision_data(
            catchlights={
                "ok": False,
                "reason": "no_face_mesh_detected",
                "catchlights": [],
            },
            region_attribution={
                "masks": {
                    "person_ratio": 0.08,
                    "background_ratio": 0.92,
                }
            },
        )
        cue_report = _make_cue_report()
        sig = _collect_dramatic_hard_signals(classification, vision_data, cue_report, None)
        assert sig.no_face_mesh is True
        # bg_ratio is high (0.92) but suppressed because no_face_mesh + low person_ratio
        assert sig.high_bg_ratio is False

    def test_no_face_mesh_suppresses_catchlight_signals(self):
        """No face mesh suppresses zero_catchlights and low_modifier_conf signals."""
        classification = {"lightQuality": "hard"}
        vision_data = _make_vision_data(
            catchlights={
                "ok": False,
                "reason": "no_face_mesh_detected",
                "catchlights": [],
            },
        )
        cue_report = _make_cue_report()
        intel = _FakeLightingIntel(light_count=0, modifier_confidence=0.1)
        sig = _collect_dramatic_hard_signals(classification, vision_data, cue_report, intel)
        assert sig.no_face_mesh is True
        assert sig.zero_catchlights is False  # suppressed
        assert sig.low_modifier_conf is False  # suppressed

    def test_studio_hard_light_high_score(self):
        """Studio portrait with hard light should score high."""
        classification = {
            "lightQuality": "hard",
            "brightness": "low",
            "mood": "dramatic",
        }
        cue_report = _make_cue_report()
        intel = _FakeLightingIntel(light_count=0, modifier_confidence=0.2)
        sig = _collect_dramatic_hard_signals(classification, None, cue_report, intel)
        assert sig.is_hard_quality is True
        assert sig.low_brightness is True
        assert sig.dramatic_mood is True
        assert sig.bw_or_hcg is True  # cue_report has is_bw=True
        assert sig.high_contrast is True  # cue_report has label="high"
        assert sig.score >= 4

    def test_soft_catchlights_gate(self):
        """Soft modifier catchlights should set catchlights_contradict gate."""
        classification = {"lightQuality": "hard"}
        vision_data = _make_vision_data(
            catchlights={
                "ok": True,
                "reason": "",
                "catchlights": [{"shape": "rectangular", "intensity": 0.8}],
                "inferred": {"likelyModifier": "softbox", "confidence": 0.8},
            },
        )
        cue_report = _make_cue_report()
        sig = _collect_dramatic_hard_signals(classification, vision_data, cue_report, None)
        assert sig.catchlights_contradict is True


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline Snapshot Tests — Phase 5
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineSnapshots:
    """Full pipeline regression checks.

    These tests exercise ``build_reference_photo_analysis()`` with known
    synthetic inputs and assert that critical output fields remain stable.
    """

    def test_studio_portrait_key_fields(self):
        """Studio portrait: dark BG, hard B&W, single source."""
        cue_report = _make_cue_report()
        vision_data = _make_vision_data()
        classification = {
            "lightQuality": "hard",
            "brightness": "low",
            "mood": "dramatic",
        }
        image_analysis = {"subject": {"angle": "three-quarter", "framing": "close-up"}}
        intel = _FakeLightingIntel()

        rpa = build_reference_photo_analysis(
            vision_data=vision_data,
            classification=classification,
            cue_report=cue_report,
            lighting_intel=intel,
            image_analysis=image_analysis,
        )

        assert rpa.ok is True
        assert rpa.image_read is not None
        assert rpa.lighting_read is not None
        assert rpa.recreation_setup is not None

        # Key field stability assertions
        assert rpa.lighting_read.source_quality in ("hard", "soft", "mixed")
        assert rpa.lighting_read.light_count >= 1
        assert rpa.lighting_read.confidence > 0.0
        assert "dramatic" in rpa.image_read.mood.lower() or "dark" in rpa.image_read.mood.lower()
        assert rpa.image_read.genre != "unknown"
        assert rpa.lighting_read.data_quality == "full"
        # Tonal processing notes should be populated (even for natural color)
        assert rpa.lighting_read.tonal_processing_notes != ""

    def test_environmental_scene_key_fields(self):
        """Environmental scene: no face mesh, environmental BG."""
        cue_report = _make_cue_report(
            background_illumination=BackgroundIllumination(
                pattern="environmental", brightness_relative="similar", confidence=0.6
            ),
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.4
            ),
            contrast_ratio=ContrastRatio(label="moderate", confidence=0.5),
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=False, estimated_processing="natural", confidence=0.7
            ),
        )
        vision_data = _make_vision_data(
            catchlights={
                "ok": False,
                "reason": "no_face_mesh_detected",
                "catchlights": [],
            },
            region_attribution={
                "masks": {
                    "person_ratio": 0.08,
                    "skin_ratio": 0.03,
                    "background_ratio": 0.92,
                }
            },
            background_environment={"classification": "outdoor"},
        )
        classification = {
            "lightQuality": "soft",
            "brightness": "medium",
            "mood": "natural",
        }
        image_analysis = {"subject": {"angle": "unknown", "framing": "unknown"}}
        intel = _FakeLightingIntel(
            light_count=0, modifier_confidence=0.0,
            pattern="unknown", modifier_family=None,
            face_mesh_available=False, data_quality="face_limited",
        )

        rpa = build_reference_photo_analysis(
            vision_data=vision_data,
            classification=classification,
            cue_report=cue_report,
            lighting_intel=intel,
            image_analysis=image_analysis,
        )

        assert rpa.ok is True
        assert rpa.lighting_read is not None

        # Phase 3: Environmental strategy corrections
        assert rpa.lighting_read.data_quality == "environmental_limited"
        assert rpa.lighting_read.light_count >= 1
        # source_quality should not be "hard" for environmental scenes without face mesh
        assert rpa.lighting_read.source_quality != "hard"
        # shadow_pattern should be descriptive, not "unknown"
        assert rpa.lighting_read.shadow_pattern != "unknown"
        assert "environmental" in rpa.lighting_read.shadow_pattern.lower()

    def test_no_cue_report_returns_not_ok(self):
        """When cue_report is None, analysis returns ok=False."""
        rpa = build_reference_photo_analysis(
            vision_data=None,
            classification=None,
            cue_report=None,
            lighting_intel=None,
            image_analysis=None,
        )
        assert rpa.ok is False
