"""Stage 1 tests — solver foundation: models, coordinates, signal weights.

Tests cover:
  - Model instantiation and default values
  - Model serialization/deserialization
  - Canonical coordinate round-trip conversions
  - Angle conversions between reference frames
  - Direction comparison and agreement
  - Circular mean computation
  - Region reliability computation
  - Pass weight downgrading
  - Weighted average and categorical vote
"""
import math
import pytest

from engine.solver_models import (
    CanonicalCoord,
    CanonicalDirection,
    ConsensusResult,
    Contradiction,
    ContradictionReport,
    ConsistencyScore,
    DimensionConsensus,
    LightingHypothesis,
    LightSource,
    PassWeightProfile,
    RegionReliability,
    SceneGeometryModel,
    SignalWeight,
    SimulationPrediction,
    SolverResult,
    SolverTrace,
    ValidationScore,
)
from engine.solver_constants import (
    CLOCK_TO_AZIMUTH,
    DIRECTION_AGREEMENT_TOLERANCE_DEG,
    PASS_WEIGHT_DEFAULTS,
    REGION_RELIABILITY_DEFAULTS,
)
from engine.coordinate_system import (
    angle_to_canonical,
    angular_distance,
    azimuth_to_direction_label,
    canonical_to_clock,
    canonical_to_pixel,
    direction_label_to_azimuth,
    directions_agree,
    elevation_to_height_class,
    height_class_to_elevation,
    height_classes_agree,
    normalize_to_subject_coords,
    subject_scale_factor,
    weighted_circular_mean,
    pixel_to_scene_ray,
)
from engine.signal_weights import (
    compute_pass_weights,
    compute_region_reliability,
    filter_by_weight_and_confidence,
    weighted_average,
    weighted_categorical_vote,
)


# ═══════════════════════════════════════════════════════════════════════════
# Model Instantiation Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestModelDefaults:
    """All solver models should instantiate safely with no arguments."""

    def test_canonical_coord_default(self):
        c = CanonicalCoord()
        assert c.x == 0.0
        assert c.y == 0.0
        assert c.z == 0.0
        assert c.confidence == 0.0

    def test_canonical_direction_default(self):
        d = CanonicalDirection()
        assert d.azimuth_deg == 0.0
        assert d.elevation_deg == 0.0

    def test_region_reliability_default(self):
        r = RegionReliability()
        assert r.face == 0.0
        assert r.overall == 0.0

    def test_signal_weight_default(self):
        sw = SignalWeight()
        assert sw.base_weight == 1.0
        assert sw.adjusted_weight == 1.0
        assert not sw.is_downgraded

    def test_pass_weight_profile_default(self):
        p = PassWeightProfile()
        assert p.total_downgrades == 0
        assert p.get_weight("unknown_pass") == 0.5  # default for unknown

    def test_consensus_result_default(self):
        cr = ConsensusResult()
        assert cr.overall_agreement == 0.0
        assert cr.dominant_direction_deg is None

    def test_consistency_score_default(self):
        cs = ConsistencyScore()
        assert cs.score == 0.0

    def test_contradiction_default(self):
        c = Contradiction()
        assert c.severity == "low"

    def test_contradiction_report_default(self):
        cr = ContradictionReport()
        assert cr.ambiguity_class == "clean"
        assert not cr.has_serious_conflicts

    def test_scene_geometry_default(self):
        sg = SceneGeometryModel()
        assert sg.scene_complexity == "simple"

    def test_light_source_default(self):
        ls = LightSource()
        assert ls.role == "key"
        assert ls.intensity_relative == 1.0

    def test_lighting_hypothesis_default(self):
        lh = LightingHypothesis()
        assert lh.confidence == 0.0
        assert lh.pattern_name == "unknown"

    def test_simulation_prediction_default(self):
        sp = SimulationPrediction()
        assert sp.predicted_shadow_direction_deg is None

    def test_validation_score_default(self):
        vs = ValidationScore()
        assert vs.overall_score == 0.0

    def test_solver_trace_default(self):
        st = SolverTrace()
        assert st.total_duration_ms == 0.0

    def test_solver_result_default(self):
        sr = SolverResult()
        assert sr.ok is True
        assert sr.candidate_count == 0
        assert sr.best_candidate is None
        assert not sr.has_contradictions
        assert sr.ambiguity_class == "clean"


class TestModelSerialization:
    """Models should serialize and deserialize cleanly."""

    def test_solver_result_round_trip(self):
        sr = SolverResult(
            candidates=[
                LightingHypothesis(
                    hypothesis_id="h1",
                    light_count=2,
                    confidence=0.8,
                    sources=[
                        LightSource(role="key", modifier="softbox"),
                        LightSource(role="fill", modifier="umbrella"),
                    ],
                ),
            ],
            best_candidate_index=0,
            overall_consistency=0.75,
            ambiguity_class="clean",
        )
        data = sr.model_dump()
        restored = SolverResult.model_validate(data)
        assert restored.candidate_count == 1
        assert restored.best_candidate.hypothesis_id == "h1"
        assert restored.best_candidate.light_count == 2
        assert len(restored.best_candidate.sources) == 2

    def test_canonical_coord_json(self):
        c = CanonicalCoord(x=1.5, y=-0.3, z=0.0, confidence=0.85)
        data = c.model_dump()
        assert data["x"] == 1.5
        assert data["confidence"] == 0.85
        restored = CanonicalCoord.model_validate(data)
        assert restored.x == c.x

    def test_contradiction_report_json(self):
        cr = ContradictionReport(
            contradictions=[
                Contradiction(
                    contradiction_id="c1",
                    pass_a="shadow_pass",
                    pass_b="catchlight_pass",
                    dimension="direction",
                    value_a=-45.0,
                    value_b=45.0,
                    severity="high",
                    resolution_hint="Check if multiple lights are present",
                ),
            ],
            ambiguity_class="genuine_ambiguity",
            high_severity_count=1,
        )
        data = cr.model_dump()
        restored = ContradictionReport.model_validate(data)
        assert len(restored.contradictions) == 1
        assert restored.has_serious_conflicts


# ═══════════════════════════════════════════════════════════════════════════
# Coordinate System Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestScaleFactor:
    """Test subject_scale_factor computation."""

    def test_from_face_box(self):
        scale = subject_scale_factor(
            face_box=(100, 100, 80, 100),
            person_mask_bounds=None,
            image_shape=(600, 800),
        )
        assert scale == pytest.approx(300.0)  # 100 * 3

    def test_from_person_mask(self):
        scale = subject_scale_factor(
            face_box=None,
            person_mask_bounds=(50, 50, 200, 500),
            image_shape=(600, 800),
        )
        assert scale == pytest.approx(300.0)  # 500 * 0.6

    def test_fallback(self):
        scale = subject_scale_factor(
            face_box=None,
            person_mask_bounds=None,
            image_shape=(600, 800),
        )
        assert scale == pytest.approx(200.0)  # 600 / 3


class TestCanonicalCoordRoundTrip:
    """Pixel → canonical → pixel should be identity."""

    def test_round_trip_with_face(self):
        face = (200, 150, 100, 120)
        shape = (600, 800)
        c = normalize_to_subject_coords(400, 300, face, None, shape)
        px, py = canonical_to_pixel(c, face, None, shape)
        assert px == pytest.approx(400.0, abs=0.1)
        assert py == pytest.approx(300.0, abs=0.1)

    def test_round_trip_with_person_mask(self):
        mask = (100, 50, 200, 500)
        shape = (600, 800)
        c = normalize_to_subject_coords(350, 250, None, mask, shape)
        px, py = canonical_to_pixel(c, None, mask, shape)
        assert px == pytest.approx(350.0, abs=0.01)
        assert py == pytest.approx(250.0, abs=0.01)

    def test_round_trip_fallback(self):
        shape = (600, 800)
        c = normalize_to_subject_coords(500, 200, None, None, shape)
        px, py = canonical_to_pixel(c, None, None, shape)
        assert px == pytest.approx(500.0, abs=0.01)
        assert py == pytest.approx(200.0, abs=0.01)

    def test_subject_center_is_origin(self):
        face = (200, 150, 100, 120)
        shape = (600, 800)
        # Face center = (250, 210)
        c = normalize_to_subject_coords(250, 210, face, None, shape)
        assert c.x == pytest.approx(0.0, abs=0.01)
        assert c.y == pytest.approx(0.0, abs=0.01)

    def test_confidence_levels(self):
        shape = (600, 800)
        c_face = normalize_to_subject_coords(400, 300, (200, 150, 100, 120), None, shape)
        c_mask = normalize_to_subject_coords(400, 300, None, (100, 50, 200, 500), shape)
        c_none = normalize_to_subject_coords(400, 300, None, None, shape)
        assert c_face.confidence > c_mask.confidence > c_none.confidence


class TestAngleConversions:
    """Test angle conversion between reference frames."""

    def test_shadow_fall_to_canonical(self):
        # Shadow falls at 0° (forward) means key is behind (±180°)
        result = angle_to_canonical(0.0, "shadow_fall")
        assert abs(result) == pytest.approx(180.0, abs=1)

    def test_shadow_fall_left(self):
        # Shadow falls left (-90°) means key is on the right (+90°)
        az = angle_to_canonical(-90.0, "shadow_fall")
        assert az == pytest.approx(90.0, abs=1)

    def test_key_position_passthrough(self):
        assert angle_to_canonical(45.0, "key_position") == pytest.approx(45.0)

    def test_canonical_passthrough(self):
        assert angle_to_canonical(-30.0, "canonical") == pytest.approx(-30.0)

    def test_catchlight_clock_12(self):
        # 12 o'clock = front = 0°
        az = angle_to_canonical(12.0, "catchlight_clock")
        assert az == pytest.approx(0.0, abs=1)

    def test_catchlight_clock_3(self):
        # 3 o'clock = right = 90°
        az = angle_to_canonical(3.0, "catchlight_clock")
        assert az == pytest.approx(90.0, abs=1)

    def test_catchlight_clock_9(self):
        # 9 o'clock = left = -90°
        az = angle_to_canonical(9.0, "catchlight_clock")
        assert az == pytest.approx(-90.0, abs=1)


class TestCanonicalToClock:
    """Test azimuth to clock position conversion."""

    def test_front_is_12(self):
        assert canonical_to_clock(0.0) == "12 o'clock"

    def test_right_is_3(self):
        assert canonical_to_clock(90.0) == "3 o'clock"

    def test_behind_is_6(self):
        assert canonical_to_clock(180.0) == "6 o'clock"

    def test_left_is_9(self):
        assert canonical_to_clock(-90.0) == "9 o'clock"

    def test_upper_right_is_1_or_2(self):
        clock = canonical_to_clock(45.0)
        assert clock in ("1 o'clock", "2 o'clock")


class TestAngularDistance:
    """Test angular distance computation."""

    def test_same_angle(self):
        assert angular_distance(45.0, 45.0) == pytest.approx(0.0)

    def test_opposite(self):
        assert angular_distance(0.0, 180.0) == pytest.approx(180.0)

    def test_wrap_around(self):
        assert angular_distance(170.0, -170.0) == pytest.approx(20.0)

    def test_small_difference(self):
        assert angular_distance(10.0, 20.0) == pytest.approx(10.0)


class TestDirectionsAgree:
    """Test direction agreement checking."""

    def test_agree_same(self):
        assert directions_agree(45.0, 45.0)

    def test_agree_within_tolerance(self):
        assert directions_agree(45.0, 55.0)  # within 15°

    def test_disagree_beyond_tolerance(self):
        assert not directions_agree(45.0, 80.0)

    def test_wrap_around_agree(self):
        assert directions_agree(175.0, -175.0)  # 10° apart


class TestHeightClasses:
    """Test height class operations."""

    def test_high(self):
        assert elevation_to_height_class(45.0) == "high"

    def test_eye_level(self):
        assert elevation_to_height_class(5.0) == "eye_level"

    def test_low(self):
        assert elevation_to_height_class(-30.0) == "low"

    def test_boundary_high(self):
        assert elevation_to_height_class(20.0) == "high"

    def test_boundary_eye_level(self):
        assert elevation_to_height_class(-10.0) == "eye_level"

    def test_agree(self):
        assert height_classes_agree("high", "high")
        assert not height_classes_agree("high", "low")
        assert height_classes_agree("unknown", "high")  # unknown always agrees


class TestDirectionLabels:
    """Test direction label ↔ azimuth conversions."""

    def test_upper_right(self):
        assert direction_label_to_azimuth("upper_right") == pytest.approx(45.0)

    def test_left(self):
        assert direction_label_to_azimuth("left") == pytest.approx(-90.0)

    def test_unknown_label(self):
        assert direction_label_to_azimuth("nonsense") is None

    def test_azimuth_to_label(self):
        assert azimuth_to_direction_label(45.0) == "upper_right"
        assert azimuth_to_direction_label(-90.0) in ("left", "camera_left")


class TestCircularMean:
    """Test weighted circular mean."""

    def test_single_angle(self):
        mean, r = weighted_circular_mean([45.0])
        assert mean == pytest.approx(45.0, abs=0.1)
        assert r == pytest.approx(1.0, abs=0.01)

    def test_two_close(self):
        mean, r = weighted_circular_mean([10.0, 20.0])
        assert mean == pytest.approx(15.0, abs=0.5)
        assert r > 0.99

    def test_wrap_around(self):
        mean, r = weighted_circular_mean([350.0, 10.0])
        assert mean == pytest.approx(0.0, abs=1.0)
        assert r > 0.98

    def test_opposite_low_resultant(self):
        mean, r = weighted_circular_mean([0.0, 180.0])
        assert r < 0.01  # cancels out

    def test_weighted(self):
        mean, r = weighted_circular_mean([0.0, 90.0], [3.0, 1.0])
        # Should be closer to 0° (heavier weight)
        assert mean < 45.0

    def test_empty(self):
        mean, r = weighted_circular_mean([])
        assert mean == 0.0
        assert r == 0.0


class TestPixelToSceneRay:
    """Test pixel to scene ray conversion."""

    def test_center_is_forward(self):
        d = pixel_to_scene_ray(400, 300, 960.0, (600, 800))
        assert abs(d.azimuth_deg) < 1.0
        assert abs(d.elevation_deg) < 1.0

    def test_right_of_center(self):
        d = pixel_to_scene_ray(700, 300, 960.0, (600, 800))
        assert d.azimuth_deg > 0  # right

    def test_above_center(self):
        d = pixel_to_scene_ray(400, 100, 960.0, (600, 800))
        assert d.elevation_deg > 0  # up


# ═══════════════════════════════════════════════════════════════════════════
# Signal Weights Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestRegionReliability:
    """Test region reliability computation."""

    def test_no_inputs(self):
        rel = compute_region_reliability(None, None, None)
        assert 0.0 < rel.overall < 1.0
        assert len(rel.degradation_reasons) > 0

    def test_with_face_mesh(self):
        """Scene with face mesh should have high face reliability."""

        class FakeCtx:
            has_face_mesh = True
            face_mesh_failure_reason = ""
            bg_is_environmental = False
            person_ratio = 0.3

        rel = compute_region_reliability(None, FakeCtx(), None)
        assert rel.face == pytest.approx(0.9, abs=0.01)

    def test_no_face_mesh_degrades(self):
        """Scene without face mesh should degrade face reliability."""

        class FakeCtx:
            has_face_mesh = False
            face_mesh_failure_reason = "no_face_mesh_detected"
            bg_is_environmental = False
            person_ratio = 0.3

        rel = compute_region_reliability(None, FakeCtx(), None)
        assert rel.face < 0.5

    def test_environmental_bg_degrades(self):
        """Environmental background should degrade background reliability."""

        class FakeCtx:
            has_face_mesh = True
            face_mesh_failure_reason = ""
            bg_is_environmental = True
            person_ratio = 0.3

        rel = compute_region_reliability(None, FakeCtx(), None)
        assert rel.background < REGION_RELIABILITY_DEFAULTS["background"]


class TestPassWeights:
    """Test pass weight downgrading."""

    def test_clean_image_no_downgrades(self):
        pw = compute_pass_weights()
        assert pw.total_downgrades == 0
        assert pw.get_weight("shadow_pass") == PASS_WEIGHT_DEFAULTS["shadow_pass"]

    def test_no_face_mesh_downgrades_catchlight(self):
        """No face mesh should downgrade catchlight and shadow passes."""

        class FakeCtx:
            has_face_mesh = False
            face_mesh_failure_reason = ""
            bg_is_environmental = False

        pw = compute_pass_weights(scene_ctx=FakeCtx())
        assert pw.total_downgrades > 0
        assert pw.get_weight("catchlight_pass") < PASS_WEIGHT_DEFAULTS["catchlight_pass"]
        assert "no_face_mesh" in pw.downgraded_passes()[0] or len(pw.downgraded_passes()) > 0

    def test_bw_downgrades_color_temp(self):
        """B&W image should downgrade color temperature pass."""
        from engine.image_analysis_models import TonalProcessingEstimation, VisualCueReport

        cue = VisualCueReport(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, confidence=0.9,
            ),
            cues_computed=1,
        )
        pw = compute_pass_weights(cue_report=cue)
        assert pw.get_weight("color_temperature_pass") < PASS_WEIGHT_DEFAULTS["color_temperature_pass"]

    def test_pose_interference_downgrades_shadow(self):
        """Pose interference should downgrade shadow pass."""
        from engine.image_analysis_models import PoseInducedShadowInterference, VisualCueReport

        cue = VisualCueReport(
            pose_induced_shadow_interference=PoseInducedShadowInterference(
                detected=True, severity="severe", confidence=0.8,
            ),
            cues_computed=1,
        )
        pw = compute_pass_weights(cue_report=cue)
        assert pw.get_weight("shadow_pass") < PASS_WEIGHT_DEFAULTS["shadow_pass"]

    def test_multiple_conditions_compound(self):
        """Multiple conditions should compound their downgrades."""
        from engine.image_analysis_models import (
            PoseInducedShadowInterference,
            TonalProcessingEstimation,
            VisualCueReport,
        )

        class FakeCtx:
            has_face_mesh = False
            face_mesh_failure_reason = ""
            bg_is_environmental = True

        cue = VisualCueReport(
            tonal_processing_estimation=TonalProcessingEstimation(
                is_bw=True, confidence=0.9,
            ),
            pose_induced_shadow_interference=PoseInducedShadowInterference(
                detected=True, severity="severe", confidence=0.8,
            ),
            cues_computed=2,
        )
        pw = compute_pass_weights(cue_report=cue, scene_ctx=FakeCtx())
        # Should have many downgrades from multiple conditions
        assert pw.total_downgrades >= 5


class TestWeightedAverage:
    """Test weighted average utilities."""

    def test_uniform(self):
        assert weighted_average([1.0, 2.0, 3.0]) == pytest.approx(2.0)

    def test_weighted(self):
        assert weighted_average([1.0, 3.0], [1.0, 3.0]) == pytest.approx(2.5)

    def test_empty(self):
        assert weighted_average([]) == 0.0

    def test_zero_weights(self):
        assert weighted_average([1.0, 2.0], [0.0, 0.0]) == 0.0


class TestCategoricalVote:
    """Test weighted categorical vote."""

    def test_clear_winner(self):
        winner, frac = weighted_categorical_vote(["soft", "soft", "hard"])
        assert winner == "soft"
        assert frac > 0.5

    def test_weighted_winner(self):
        winner, frac = weighted_categorical_vote(
            ["hard", "soft"], [0.3, 0.9]
        )
        assert winner == "soft"

    def test_all_unknown(self):
        winner, frac = weighted_categorical_vote(["unknown", "unknown"])
        assert winner == "unknown"

    def test_empty(self):
        winner, frac = weighted_categorical_vote([])
        assert winner == "unknown"


class TestFilterByWeight:
    """Test filter_by_weight_and_confidence."""

    def test_filters_low_weight(self):
        pass_outputs = {
            "shadow_pass": {"ok": True, "confidence": 0.8, "value": 45},
        }
        pw = PassWeightProfile(weights={
            "shadow_pass": SignalWeight(pass_name="shadow_pass", base_weight=0.1, adjusted_weight=0.1),
        })
        result = filter_by_weight_and_confidence(pass_outputs, pw)
        assert len(result) == 0  # weight too low

    def test_filters_low_confidence(self):
        pass_outputs = {
            "shadow_pass": {"ok": True, "confidence": 0.1, "value": 45},
        }
        pw = PassWeightProfile(weights={
            "shadow_pass": SignalWeight(pass_name="shadow_pass", base_weight=1.0, adjusted_weight=1.0),
        })
        result = filter_by_weight_and_confidence(pass_outputs, pw)
        assert len(result) == 0  # confidence too low

    def test_passes_good_signals(self):
        pass_outputs = {
            "shadow_pass": {"ok": True, "confidence": 0.8, "value": 45},
            "catchlight_pass": {"ok": True, "confidence": 0.7, "value": 50},
        }
        pw = compute_pass_weights()  # all defaults
        result = filter_by_weight_and_confidence(pass_outputs, pw)
        assert len(result) == 2

    def test_skips_not_ok(self):
        pass_outputs = {
            "shadow_pass": {"ok": False, "confidence": 0.8},
        }
        pw = compute_pass_weights()
        result = filter_by_weight_and_confidence(pass_outputs, pw)
        assert len(result) == 0
