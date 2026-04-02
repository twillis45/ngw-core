"""Tests for the visual cue model + extraction + inference pipeline.

Tests are structured in layers:
1. Model tests — VisualCueReport construction and methods
2. Extraction tests — individual cue extractors with mock data
3. Inference tests — 4-stage pipeline with synthetic cue reports
4. Integration test — end-to-end with mock vision data
"""

import pytest

from engine.image_analysis_models import (
    BackgroundIllumination,
    CatchlightPosition,
    CatchlightShape,
    ContrastRatio,
    EnvironmentInference,
    EnvironmentalShadowContinuity,
    GeometryInference,
    HighlightToShadowTransition,
    MultiShadowDetection,
    PoseInducedShadowInterference,
    PrimaryShadowDirection,
    ReflectionArchitecture,
    SetupFamilyInference,
    ShadowEdgeHardness,
    ShadowInterruptionPattern,
    SourceQualityInference,
    SpecularHighlightBehavior,
    SubjectBackgroundSeparation,
    TonalProcessingEstimation,
    VerticalLightAngle,
    VisualCueReport,
)

from engine.cue_inference import (
    infer_environment,
    infer_geometry,
    infer_setup_family,
    infer_source_quality,
    run_cue_inference_pipeline,
)


# ═══════════════════════════════════════════════════════════════════════════
# 1. Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestVisualCueReport:

    def test_empty_report(self):
        report = VisualCueReport()
        assert report.ok is True
        assert report.cues_computed == 0
        assert report.overall_confidence() == 0.0

    def test_overall_confidence_single_cue(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="hard", confidence=0.8
            ),
            cues_computed=1,
        )
        assert report.overall_confidence() == pytest.approx(0.8, abs=0.01)

    def test_overall_confidence_multiple_cues(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="hard", confidence=0.8
            ),
            contrast_ratio=ContrastRatio(
                ratio=5.0, label="high", confidence=0.6
            ),
            cues_computed=2,
        )
        assert report.overall_confidence() == pytest.approx(0.7, abs=0.01)

    def test_extra_forbid(self):
        with pytest.raises(Exception):
            ShadowEdgeHardness(classification="hard", confidence=0.5, bogus="nope")

    def test_cue_defaults(self):
        cue = ShadowEdgeHardness()
        assert cue.classification == "unknown"
        assert cue.confidence == 0.0
        assert cue.notes == []


class TestCueModels:

    def test_catchlight_position(self):
        cp = CatchlightPosition(
            left_eye=["10 o'clock", "6 o'clock"],
            right_eye=["2 o'clock", "6 o'clock"],
            symmetry="symmetric",
            confidence=0.7,
        )
        assert len(cp.left_eye) == 2
        assert cp.symmetry == "symmetric"

    def test_tonal_processing(self):
        tp = TonalProcessingEstimation(
            is_bw=True,
            estimated_processing="bw",
            confidence=0.7,
            notes=["Image is grayscale"],
        )
        assert tp.is_bw is True
        assert tp.estimated_processing == "bw"

    def test_pose_interference(self):
        psi = PoseInducedShadowInterference(
            detected=True,
            interference_regions=["chin_shadow"],
            severity="mild",
            confidence=0.5,
        )
        assert psi.detected is True
        assert "chin_shadow" in psi.interference_regions

    def test_environmental_shadow_continuity(self):
        esc = EnvironmentalShadowContinuity(
            has_natural_indicators=True,
            environment_hints=["dappled_foliage", "warm_background"],
            confidence=0.6,
        )
        assert esc.has_natural_indicators is True
        assert "dappled_foliage" in esc.environment_hints

    def test_shadow_interruption_pattern_defaults(self):
        sip = ShadowInterruptionPattern()
        assert sip.detected is False
        assert sip.classification == "none"
        assert sip.line_count == 0
        assert sip.line_parallelism == 0.0
        assert sip.periodicity_score == 0.0
        assert sip.shadow_face_incongruence == 0.0
        assert sip.confidence == 0.0
        assert sip.notes == []

    def test_shadow_interruption_pattern_construction(self):
        sip = ShadowInterruptionPattern(
            detected=True,
            classification="geometric_bar",
            line_count=5,
            line_parallelism=0.85,
            periodicity_score=0.7,
            shadow_face_incongruence=0.6,
            confidence=0.75,
            notes=["Parallel bar shadows across face"],
        )
        assert sip.detected is True
        assert sip.classification == "geometric_bar"
        assert sip.line_count == 5

    def test_shadow_interruption_pattern_extra_forbid(self):
        with pytest.raises(Exception):
            ShadowInterruptionPattern(detected=False, bogus="nope")

    def test_overall_confidence_includes_shadow_interruption(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True, classification="geometric_bar",
                line_count=4, confidence=0.8,
            ),
            contrast_ratio=ContrastRatio(
                ratio=5.0, label="high", confidence=0.6,
            ),
            cues_computed=2,
        )
        assert report.overall_confidence() == pytest.approx(0.7, abs=0.01)


# ═══════════════════════════════════════════════════════════════════════════
# 2. Extraction Tests (catchlight repackaging — no CV2 needed)
# ═══════════════════════════════════════════════════════════════════════════


class TestCatchlightExtraction:

    def test_extract_catchlight_position(self):
        from engine.cue_extraction import extract_catchlight_position

        data = {
            "ok": True,
            "count": 3,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                {"eye": "left", "position": "2 o'clock", "shape": "round", "intensity": 0.8},
                {"eye": "right", "position": "10 o'clock", "shape": "round", "intensity": 0.85},
            ],
        }
        result = extract_catchlight_position(data)
        assert result is not None
        assert len(result.left_eye) == 2
        assert len(result.right_eye) == 1
        assert result.symmetry == "asymmetric"

    def test_extract_catchlight_position_symmetric(self):
        from engine.cue_extraction import extract_catchlight_position

        data = {
            "ok": True,
            "count": 2,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                {"eye": "right", "position": "10 o'clock", "shape": "round", "intensity": 0.85},
            ],
        }
        result = extract_catchlight_position(data)
        assert result is not None
        assert result.symmetry == "symmetric"

    def test_extract_catchlight_position_no_data(self):
        from engine.cue_extraction import extract_catchlight_position

        result = extract_catchlight_position({"ok": False})
        assert result is None

    def test_extract_catchlight_shape(self):
        from engine.cue_extraction import extract_catchlight_shape

        data = {
            "ok": True,
            "count": 2,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "shape": "rectangular", "intensity": 0.9},
                {"eye": "right", "position": "10 o'clock", "shape": "rectangular", "intensity": 0.85},
            ],
        }
        result = extract_catchlight_shape(data)
        assert result is not None
        assert result.dominant_shape == "rectangular"

    def test_extract_reflection_architecture(self):
        from engine.cue_extraction import extract_reflection_architecture

        # P2e: With 3+ catchlights per eye, 6 o'clock (floor reflections)
        # are filtered out, reducing the count.
        data = {
            "ok": True,
            "count": 3,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock"},
                {"eye": "left", "position": "2 o'clock"},
                {"eye": "left", "position": "6 o'clock"},
                {"eye": "right", "position": "10 o'clock"},
                {"eye": "right", "position": "2 o'clock"},
                {"eye": "right", "position": "6 o'clock"},
            ],
        }
        result = extract_reflection_architecture(data)
        assert result is not None
        # 6 o'clock filtered (floor reflection with 3+ catchlights per eye)
        assert result.total_catchlights == 4
        assert result.per_eye_counts == {"left": 2, "right": 2}
        assert result.symmetry_score == 1.0
        assert len(result.notes) > 0  # dedup note present

    def test_extract_reflection_architecture_no_dedup(self):
        """With only 2 catchlights per eye, no floor dedup should occur."""
        from engine.cue_extraction import extract_reflection_architecture

        data = {
            "ok": True,
            "count": 2,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "intensity": 0.8},
                {"eye": "left", "position": "2 o'clock", "intensity": 0.7},
                {"eye": "right", "position": "10 o'clock", "intensity": 0.8},
                {"eye": "right", "position": "2 o'clock", "intensity": 0.7},
            ],
        }
        result = extract_reflection_architecture(data)
        assert result is not None
        assert result.total_catchlights == 4
        assert result.per_eye_counts == {"left": 2, "right": 2}


class TestMasterOrchestrator:

    def test_extract_visual_cues_no_masks(self):
        """Without masks, only catchlight cues should be extracted."""
        from engine.cue_extraction import extract_visual_cues
        import numpy as np

        img = np.zeros((100, 100, 3), dtype=np.uint8)
        vision_data = {
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.8},
                ],
            },
            "pose": {"ok": False},
            "region_attribution": {"face_box": None},
        }
        report = extract_visual_cues(img, vision_data)
        assert report.ok is True
        # Catchlight cues should work without masks
        assert report.catchlight_position is not None
        assert report.catchlight_shape is not None
        assert report.reflection_architecture is not None
        # Mask-dependent cues should be None
        assert report.shadow_edge_hardness is None
        assert "No masks available" in report.notes[0]


class TestShadowInterruptionExtraction:

    def test_returns_sentinel_without_face_box(self):
        from engine.cue_extraction import extract_shadow_interruption_pattern
        import numpy as np

        img = np.zeros((100, 100, 3), dtype=np.uint8)
        person_mask = np.ones((100, 100), dtype=np.uint8) * 255
        skin_mask = np.ones((100, 100), dtype=np.uint8) * 255
        result = extract_shadow_interruption_pattern(img, person_mask, skin_mask, None)
        # Phase 2: sentinel object instead of None for degraded mode
        assert result is not None
        assert result.detected is False
        assert result.confidence == 0.0
        assert any("no_face_data" in n for n in result.notes)

    def test_not_detected_on_uniform_image(self):
        from engine.cue_extraction import extract_shadow_interruption_pattern
        import numpy as np

        img = np.full((200, 200, 3), 128, dtype=np.uint8)
        person_mask = np.ones((200, 200), dtype=np.uint8) * 255
        skin_mask = np.ones((200, 200), dtype=np.uint8) * 255
        face_box = (40, 40, 120, 120)
        result = extract_shadow_interruption_pattern(img, person_mask, skin_mask, face_box)
        assert result is not None
        assert result.detected is False
        assert result.classification == "none"

    def test_detected_on_bar_shadow_image(self):
        """Synthetic image with parallel black bars on bright face region."""
        from engine.cue_extraction import extract_shadow_interruption_pattern
        import numpy as np

        img = np.full((200, 200, 3), 200, dtype=np.uint8)
        # Draw parallel dark bars across the face region
        for y_start in range(50, 130, 15):
            img[y_start:y_start + 4, 50:150] = 30
        person_mask = np.ones((200, 200), dtype=np.uint8) * 255
        skin_mask = np.ones((200, 200), dtype=np.uint8) * 255
        face_box = (40, 40, 160, 160)
        result = extract_shadow_interruption_pattern(img, person_mask, skin_mask, face_box)
        assert result is not None
        # With strong parallel bars, should detect something
        assert result.line_count >= 1


# ═══════════════════════════════════════════════════════════════════════════
# 3. Inference Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestGeometryInference:

    def _report(self, **kwargs):
        return VisualCueReport(**kwargs)

    def test_triangle_from_reflections(self):
        """Triangle requires 3+ catchlights per eye AND low/medium contrast
        AND triangle geometry (two upper + one lower catchlight positions)."""
        report = self._report(
            reflection_architecture=ReflectionArchitecture(
                total_catchlights=6,
                per_eye_counts={"left": 3, "right": 3},
                symmetry_score=1.0,
                confidence=0.7,
            ),
            catchlight_position=CatchlightPosition(
                left_eye=["10 o'clock", "2 o'clock", "6 o'clock"],
                right_eye=["10 o'clock", "2 o'clock", "6 o'clock"],
                symmetry="symmetric",
                confidence=0.7,
            ),
            vertical_light_angle=VerticalLightAngle(
                angle="high", confidence=0.6,
            ),
            contrast_ratio=ContrastRatio(
                label="low", confidence=0.6,
            ),
            cues_computed=3,
        )
        geo = infer_geometry(report)
        assert geo.shadow_pattern == "triangle"
        assert geo.light_count_estimate == 3

    def test_triangle_rejected_high_contrast(self):
        """High contrast with 3+ catchlights per eye is NOT triangle.
        Triangle wraps from 3 sides → must have low contrast.
        Extra catchlights are reflections, not separate lights."""
        report = self._report(
            reflection_architecture=ReflectionArchitecture(
                total_catchlights=6,
                per_eye_counts={"left": 3, "right": 3},
                symmetry_score=1.0,
                confidence=0.7,
            ),
            vertical_light_angle=VerticalLightAngle(
                angle="high", confidence=0.6,
            ),
            contrast_ratio=ContrastRatio(
                label="extreme", confidence=0.7,
            ),
            primary_shadow_direction=PrimaryShadowDirection(
                direction="upper_left", confidence=0.6,
            ),
            cues_computed=4,
        )
        geo = infer_geometry(report)
        # Should NOT be triangle — extreme contrast contradicts 3-light wrap
        assert geo.shadow_pattern != "triangle"
        # With light_count=3 from catchlights, direction-based patterns
        # don't fire (they require light_count <= 2).  The downstream
        # build_lighting_read() corrects the light_count via artifact
        # detection and applies direction-based patterns there.

    def test_single_light_rembrandt(self):
        report = self._report(
            primary_shadow_direction=PrimaryShadowDirection(
                direction="upper_left", confidence=0.6,
            ),
            vertical_light_angle=VerticalLightAngle(
                angle="high", confidence=0.5,
            ),
            reflection_architecture=ReflectionArchitecture(
                total_catchlights=2,
                per_eye_counts={"left": 1, "right": 1},
                symmetry_score=1.0,
                confidence=0.6,
            ),
            cues_computed=3,
        )
        geo = infer_geometry(report)
        assert geo.shadow_pattern == "rembrandt"
        assert geo.light_count_estimate == 1

    def test_unknown_with_no_cues(self):
        report = self._report()
        geo = infer_geometry(report)
        assert geo.shadow_pattern == "unknown"
        assert geo.light_count_estimate == 1  # default assumption


class TestSourceQualityInference:

    def test_soft_source(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.7,
            ),
            catchlight_shape=CatchlightShape(
                dominant_shape="rectangular", confidence=0.6,
            ),
            highlight_to_shadow_transition=HighlightToShadowTransition(
                rate="gradual", confidence=0.5,
            ),
            cues_computed=3,
        )
        sq = infer_source_quality(report)
        assert sq.key_modifier_family == "softbox"
        assert sq.confidence > 0.3

    def test_hard_source(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="hard", confidence=0.7,
            ),
            specular_highlight_behavior=SpecularHighlightBehavior(
                intensity="strong", spread="tight", confidence=0.6,
            ),
            cues_computed=2,
        )
        sq = infer_source_quality(report)
        assert sq.key_modifier_family == "hard_source"

    def test_tonal_processing_warning(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="hard", confidence=0.7,
            ),
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, estimated_processing="bw", confidence=0.8,
            ),
            cues_computed=2,
        )
        sq = infer_source_quality(report)
        assert any("CAUTION" in n for n in sq.notes)


class TestEnvironmentInference:

    def test_natural_light_dappled(self):
        report = VisualCueReport(
            environmental_shadow_continuity=EnvironmentalShadowContinuity(
                has_natural_indicators=True,
                environment_hints=["dappled_foliage", "warm_background"],
                confidence=0.6,
            ),
            background_illumination=BackgroundIllumination(
                pattern="environmental", brightness_relative="similar",
                confidence=0.5,
            ),
            cues_computed=2,
        )
        env = infer_environment(report)
        assert env.is_natural_light is True
        assert "dappled_foliage" in env.special_cases

    def test_studio_controlled(self):
        report = VisualCueReport(
            environmental_shadow_continuity=EnvironmentalShadowContinuity(
                has_natural_indicators=False,
                has_artificial_indicators=True,
                confidence=0.5,
            ),
            background_illumination=BackgroundIllumination(
                pattern="even", brightness_relative="darker",
                confidence=0.6,
            ),
            cues_computed=2,
        )
        env = infer_environment(report)
        assert env.environment_type == "studio"
        assert env.is_natural_light is False

    def test_bw_processing_special_case(self):
        report = VisualCueReport(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, estimated_processing="bw", confidence=0.7,
            ),
            cues_computed=1,
        )
        env = infer_environment(report)
        assert "bw_processing" in env.special_cases

    def test_pose_interference_flag(self):
        report = VisualCueReport(
            pose_induced_shadow_interference=PoseInducedShadowInterference(
                detected=True,
                interference_regions=["chin_shadow"],
                severity="mild",
                confidence=0.5,
            ),
            cues_computed=1,
        )
        env = infer_environment(report)
        assert "pose_shadow_interference" in env.special_cases

    def test_shadow_interruption_special_case(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True,
                classification="geometric_bar",
                line_count=5,
                line_parallelism=0.8,
                confidence=0.7,
            ),
            cues_computed=1,
        )
        env = infer_environment(report)
        assert "shadow_interruption_pattern" in env.special_cases

    def test_shadow_interruption_not_detected_no_special_case(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=False,
                classification="none",
                confidence=0.0,
            ),
            cues_computed=1,
        )
        env = infer_environment(report)
        assert "shadow_interruption_pattern" not in env.special_cases


class TestSetupFamilyInference:

    def _full_pipeline(self, report):
        geo = infer_geometry(report)
        sq = infer_source_quality(report)
        env = infer_environment(report)
        return infer_setup_family(geo, sq, env, report)

    def test_triangle_hypothesis(self):
        """Triangle requires low/medium contrast, 3+ catchlights per eye,
        AND triangle geometry (two upper + one lower)."""
        report = VisualCueReport(
            reflection_architecture=ReflectionArchitecture(
                total_catchlights=6,
                per_eye_counts={"left": 3, "right": 3},
                symmetry_score=1.0,
                confidence=0.7,
            ),
            catchlight_position=CatchlightPosition(
                left_eye=["10 o'clock", "2 o'clock", "6 o'clock"],
                right_eye=["10 o'clock", "2 o'clock", "6 o'clock"],
                symmetry="symmetric",
                confidence=0.7,
            ),
            contrast_ratio=ContrastRatio(
                label="low", confidence=0.6,
            ),
            cues_computed=2,
        )
        sf = self._full_pipeline(report)
        assert sf.primary_hypothesis == "triangle_headshot"
        assert sf.primary_confidence > 0.1  # thin input (2 cues) yields modest confidence

    def test_natural_dappled_hypothesis(self):
        report = VisualCueReport(
            environmental_shadow_continuity=EnvironmentalShadowContinuity(
                has_natural_indicators=True,
                environment_hints=["dappled_foliage"],
                confidence=0.6,
            ),
            cues_computed=1,
        )
        sf = self._full_pipeline(report)
        assert sf.primary_hypothesis == "natural_ambient"
        assert any("dappled" in n.lower() for n in sf.ambiguity_notes)

    def test_unknown_with_no_cues(self):
        report = VisualCueReport()
        sf = self._full_pipeline(report)
        assert sf.primary_hypothesis == "unknown"
        assert sf.primary_confidence < 0.3

    def test_alternates_populated(self):
        report = VisualCueReport(
            primary_shadow_direction=PrimaryShadowDirection(
                direction="upper_left", confidence=0.5,
            ),
            contrast_ratio=ContrastRatio(
                ratio=8.0, label="high", confidence=0.7,
            ),
            environmental_shadow_continuity=EnvironmentalShadowContinuity(
                has_natural_indicators=True,
                environment_hints=["warm_background"],
                confidence=0.4,
            ),
            cues_computed=3,
        )
        sf = self._full_pipeline(report)
        # Should have at least one alternate hypothesis
        assert len(sf.alternate_hypotheses) >= 1 or sf.primary_hypothesis != "unknown"

    def test_bw_ambiguity_note(self):
        report = VisualCueReport(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, estimated_processing="bw", confidence=0.8,
            ),
            cues_computed=1,
        )
        sf = self._full_pipeline(report)
        assert any("B&W" in n or "bw" in n.lower() for n in sf.ambiguity_notes)

    def test_geometric_bar_yields_slit_hypothesis(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True,
                classification="geometric_bar",
                line_count=5,
                line_parallelism=0.85,
                shadow_face_incongruence=0.6,
                confidence=0.75,
            ),
            cues_computed=1,
        )
        sf = self._full_pipeline(report)
        all_hyp = [sf.primary_hypothesis] + [
            a["hypothesis"] for a in sf.alternate_hypotheses
        ]
        assert "slit_cut_light" in all_hyp

    def test_patterned_projection_yields_gobo_hypothesis(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True,
                classification="patterned_projection",
                line_count=6,
                periodicity_score=0.7,
                confidence=0.7,
            ),
            cues_computed=1,
        )
        sf = self._full_pipeline(report)
        all_hyp = [sf.primary_hypothesis] + [
            a["hypothesis"] for a in sf.alternate_hypotheses
        ]
        assert "gobo_projection" in all_hyp

    def test_shadow_interruption_penalizes_traditional_candidates(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True,
                classification="geometric_bar",
                line_count=5,
                line_parallelism=0.85,
                confidence=0.75,
            ),
            primary_shadow_direction=PrimaryShadowDirection(
                direction="upper_left", confidence=0.6,
            ),
            cues_computed=2,
        )
        sf = self._full_pipeline(report)
        # Traditional candidates should be penalized — slit/gobo should rank high
        all_hyp = [sf.primary_hypothesis] + [
            a["hypothesis"] for a in sf.alternate_hypotheses
        ]
        assert "slit_cut_light" in all_hyp
        assert any("shadow interruption" in n.lower() for n in sf.ambiguity_notes)

    def test_shadow_interruption_ambiguity_note(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=True,
                classification="unknown",
                line_count=3,
                confidence=0.5,
            ),
            cues_computed=1,
        )
        sf = self._full_pipeline(report)
        assert any(
            "shadow interruption" in n.lower()
            for n in sf.ambiguity_notes
        )

    def test_no_shadow_interruption_no_effect(self):
        report = VisualCueReport(
            shadow_interruption_pattern=ShadowInterruptionPattern(
                detected=False, classification="none", confidence=0.0,
            ),
            primary_shadow_direction=PrimaryShadowDirection(
                direction="upper_left", confidence=0.6,
            ),
            cues_computed=2,
        )
        sf = self._full_pipeline(report)
        all_hyp = [sf.primary_hypothesis] + [
            a["hypothesis"] for a in sf.alternate_hypotheses
        ]
        assert "slit_cut_light" not in all_hyp
        assert "gobo_projection" not in all_hyp
        assert not any("shadow interruption" in n.lower() for n in sf.ambiguity_notes)


class TestRunCueInferencePipeline:

    def test_full_pipeline_returns_all_stages(self):
        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.6,
            ),
            cues_computed=1,
        )
        result = run_cue_inference_pipeline(report)
        assert "geometry" in result
        assert "source_quality" in result
        assert "environment" in result
        assert "setup_family" in result
        assert isinstance(result["geometry"], GeometryInference)
        assert isinstance(result["source_quality"], SourceQualityInference)
        assert isinstance(result["environment"], EnvironmentInference)
        assert isinstance(result["setup_family"], SetupFamilyInference)


# ═══════════════════════════════════════════════════════════════════════════
# 4. Integration: LightingInference enrichment
# ═══════════════════════════════════════════════════════════════════════════


class TestLightingInferenceCueEnrichment:

    def test_cue_report_field_on_dataclass(self):
        from engine.lighting_inference import LightingInference

        li = LightingInference(cue_report=None)
        assert li.cue_report is None

        report = VisualCueReport(cues_computed=3, ok=True)
        li2 = LightingInference(cue_report=report)
        assert li2.cue_report is not None

    def test_to_input_ctx_with_cue_report(self):
        from engine.lighting_inference import LightingInference

        report = VisualCueReport(
            shadow_edge_hardness=ShadowEdgeHardness(
                classification="soft", confidence=0.7,
            ),
            cues_computed=1,
        )
        li = LightingInference(
            pattern="loop",
            pattern_confidence=0.6,
            cue_report=report,
        )
        ctx = li.to_input_ctx_fields()
        assert ctx.get("cue_analysis_available") is True
        assert ctx.get("cue_confidence") == pytest.approx(0.7, abs=0.01)

    def test_to_input_ctx_without_cue_report(self):
        from engine.lighting_inference import LightingInference

        li = LightingInference(pattern="loop", pattern_confidence=0.6)
        ctx = li.to_input_ctx_fields()
        assert "cue_analysis_available" not in ctx


# ═══════════════════════════════════════════════════════════════════════════
# 5. Master Mode lights_guide
# ═══════════════════════════════════════════════════════════════════════════


class TestLightsGuide:

    def test_all_modes_have_lights_guide(self):
        from engine.master_mode import get_coaching_overlay

        for mode_id in ["hurley", "adler", "heisler", "bryce", "caravaggio"]:
            overlay = get_coaching_overlay(mode_id)
            assert overlay is not None, f"{mode_id} missing coaching overlay"
            assert "lights_guide" in overlay, f"{mode_id} missing lights_guide"
            guide = overlay["lights_guide"]
            assert len(guide) >= 1, f"{mode_id} lights_guide is empty"
            for light in guide:
                assert "role" in light
                assert "label" in light
                assert "purpose" in light
                assert "modifier" in light
                assert "positioning" in light

    def test_hurley_has_three_lights(self):
        from engine.master_mode import get_coaching_overlay

        overlay = get_coaching_overlay("hurley")
        guide = overlay["lights_guide"]
        assert len(guide) == 3
        roles = {l["role"] for l in guide}
        assert "key_left" in roles
        assert "key_right" in roles
        assert "fill" in roles

    def test_caravaggio_has_single_light(self):
        from engine.master_mode import get_coaching_overlay

        overlay = get_coaching_overlay("caravaggio")
        guide = overlay["lights_guide"]
        assert len(guide) == 1
        assert guide[0]["role"] == "key"
