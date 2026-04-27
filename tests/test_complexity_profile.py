"""Phase 3A regression tests — ComplexityProfile + Phase 3A router gates.

Covers:
- compute_scene_complexity() axis derivations from existing engine signals
- HYBRID gate: requires load_bearing >= 2 AND a corroborator (corrected
  per Phase 3A correction #1)
- BOUNDED long-term predicate: spread <= 0.15 AND top_alt >= 0.50
  (corrected per Phase 3A correction #2)
- BOUNDED bootstrap: still works as fallback
- rim_load_bearing requires structural evidence, not pattern label
  (corrected per Phase 3A correction #3)
- placeholder axes carry not_yet_computed and cannot be mistaken for
  measured negatives (corrected per Phase 3A correction #4)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.enums import AnalysisMode, FieldStatus
from engine.orchestrator import (
    AnalysisResult,
    ComplexityProfile,
    PatternCandidate,
    PatternCandidates,
    FaceValidation,
    SignalReliability,
    EdgeCaseFlags,
    compute_scene_complexity,
    route_analysis_mode,
)


# ─── Helpers ───────────────────────────────────────────────────────────────


class _IntelStub:
    def __init__(
        self,
        light_count: int = 1,
        fill_method_text: str = "",
        catchlight_topology: Optional[Any] = None,
    ):
        self.light_count = light_count
        self.fill_method_text = fill_method_text
        self.catchlight_topology = catchlight_topology
        self.pattern = "unknown"


class _TopologyStub:
    def __init__(self, cluster_geometry: str = "unknown", catchlight_count: int = 0):
        self.cluster_geometry = cluster_geometry
        self.catchlight_count = catchlight_count


class _MultiShadowStub:
    def __init__(self, shadow_count: int = 0, confidence: float = 0.5):
        self.shadow_count = shadow_count
        self.confidence = confidence


class _CueReportStub:
    def __init__(
        self,
        multi_shadow_detection: Optional[_MultiShadowStub] = None,
        catchlight_topology: Optional[_TopologyStub] = None,
    ):
        self.multi_shadow_detection = multi_shadow_detection
        self.catchlight_topology = catchlight_topology
        self.light_structure = None
        self.tonal_processing_estimation = None
        self.background_illumination = None
        self.shadow_edge_hardness = None


class _LightingReadStub:
    def __init__(self, contradictions: Optional[List[str]] = None, shadow_pattern: str = "unknown"):
        self.contradictions = contradictions or []
        self.shadow_pattern = shadow_pattern
        self.confidence = 0.5


class _RefAnalysisStub:
    def __init__(self, lighting_read: Optional[_LightingReadStub] = None):
        self.lighting_read = lighting_read


def _make_result(
    *,
    face_detected: bool = True,
    face_quality: str = "good",
    signal_strength: float = 0.7,
    light_count: int = 1,
    fill_method_text: str = "",
    cluster_geometry: str = "unknown",
    msd_count: int = 0,
    window_light_gradient: bool = False,
    earring_contamination: bool = False,
    lr_contradictions: Optional[List[str]] = None,
    primary_pattern: str = "loop",
    primary_confidence: float = 0.85,
    primary_source: str = "reference_read",
    alternates: Optional[List[Dict[str, Any]]] = None,
    pattern_status: FieldStatus = FieldStatus.FUSED_FINAL,
    authoritative_pattern: str = "loop",
) -> AnalysisResult:
    """Build a minimal AnalysisResult populated with the routing inputs."""
    r = AnalysisResult()
    r.face_validation = FaceValidation(
        face_detected=face_detected, face_quality=face_quality,
        face_confidence=0.95, face_yaw=0.0, face_box_area_ratio=0.4,
    )
    r.signal_reliability = SignalReliability(
        signals_available=20, signals_total=24,
        face_dependent_signals_available=5,
        overall_signal_strength=signal_strength,
        weak_signals=[], missing_signals=[],
    )
    r.edge_case_flags = EdgeCaseFlags(
        window_light_gradient=window_light_gradient,
        earring_catchlight_contamination=earring_contamination,
    )
    topology = _TopologyStub(cluster_geometry=cluster_geometry) if cluster_geometry != "unknown" else None
    r.lighting_intel = _IntelStub(
        light_count=light_count,
        fill_method_text=fill_method_text,
        catchlight_topology=topology,
    )
    r.cue_report = _CueReportStub(
        multi_shadow_detection=_MultiShadowStub(shadow_count=msd_count) if msd_count else None,
    )
    r.reference_analysis = _RefAnalysisStub(
        lighting_read=_LightingReadStub(
            contradictions=lr_contradictions, shadow_pattern=primary_pattern,
        ),
    )
    primary = PatternCandidate(
        pattern=primary_pattern, source=primary_source,
        confidence=primary_confidence, rank=1,
    )
    alts = []
    for i, a in enumerate(alternates or []):
        alts.append(PatternCandidate(
            pattern=a["pattern"], source=a.get("source", "lighting_inference"),
            confidence=a["confidence"], rank=i + 2,
        ))
    r.pattern_candidates = PatternCandidates(
        primary=primary, alternates=alts,
        needs_review=False, contradictions=[],
    )
    r.pattern_status = pattern_status
    r.authoritative_pattern = authoritative_pattern
    r.authoritative_pattern_source = primary_source
    r.pattern_confidence = primary_confidence
    return r


# ═══════════════════════════════════════════════════════════════════════════
# 1. ComplexityProfile axis derivation
# ═══════════════════════════════════════════════════════════════════════════


class TestComplexityProfileAxes:

    def test_clean_classical_zeros_complexity_axes(self):
        r = _make_result(
            light_count=1, signal_strength=0.8,
            primary_pattern="loop", primary_confidence=0.85,
        )
        cp = compute_scene_complexity(r)
        assert cp.load_bearing_source_count == 1
        assert cp.shadow_conflict_score == 0.0
        assert cp.catchlight_conflict_score == 0.0
        assert cp.ambient_contamination == 0.0
        assert cp.multi_catchlight_topology == "unknown"
        assert cp.catchlight_reliability == "reliable"
        assert cp.rim_present is False
        assert cp.rim_load_bearing is False

    def test_load_bearing_count_from_max_of_intel_and_msd(self):
        # intel says 2, msd says 3 — take max
        r = _make_result(light_count=2, msd_count=3)
        cp = compute_scene_complexity(r)
        assert cp.load_bearing_source_count == 3

    def test_load_bearing_count_capped_at_six(self):
        r = _make_result(light_count=12)
        cp = compute_scene_complexity(r)
        assert cp.load_bearing_source_count == 6

    def test_catchlight_conflict_score_from_block_b(self):
        r = _make_result(lr_contradictions=[
            "catchlight_shadow_paradox: shadow→key=upper_right vs catchlight@9→key=left",
        ])
        cp = compute_scene_complexity(r)
        assert cp.catchlight_conflict_score == 1.0

    def test_catchlight_conflict_zero_without_paradox(self):
        r = _make_result(lr_contradictions=["unrelated_note"])
        cp = compute_scene_complexity(r)
        assert cp.catchlight_conflict_score == 0.0

    def test_ambient_contamination_from_window_flag(self):
        r = _make_result(window_light_gradient=True)
        cp = compute_scene_complexity(r)
        assert cp.ambient_contamination == 0.6

    def test_multi_catchlight_topology_from_intel(self):
        r = _make_result(cluster_geometry="triangular")
        cp = compute_scene_complexity(r)
        assert cp.multi_catchlight_topology == "triangular"

    def test_catchlight_reliability_blocked_on_no_face(self):
        r = _make_result(face_detected=False)
        cp = compute_scene_complexity(r)
        assert cp.catchlight_reliability == "blocked"
        assert cp.catchlight_reliability_reason == "no_face"

    def test_catchlight_reliability_degraded_on_earring(self):
        r = _make_result(earring_contamination=True)
        cp = compute_scene_complexity(r)
        assert cp.catchlight_reliability == "degraded"
        assert "earring" in cp.catchlight_reliability_reason


# ═══════════════════════════════════════════════════════════════════════════
# 2. Phase 3A correction #3 — rim_load_bearing requires structural evidence
# ═══════════════════════════════════════════════════════════════════════════


class TestRimLoadBearingDiscipline:

    def test_rim_label_alone_does_not_trigger_load_bearing(self):
        # Pattern is "rim" but fill_method_text has no rim phrasing.
        # Per correction #3: pattern label alone is taxonomy-polluted
        # evidence and must NOT set rim_load_bearing.
        r = _make_result(
            primary_pattern="rim", primary_source="definitive_signature",
            primary_confidence=0.95, fill_method_text="",
            authoritative_pattern="rim",
        )
        cp = compute_scene_complexity(r)
        assert cp.rim_load_bearing is False

    def test_rim_text_in_fill_method_sets_present_not_load_bearing(self):
        # fill_method_text mentions rim but no load-bearing phrasing.
        # rim_present=True; rim_load_bearing must stay False.
        r = _make_result(fill_method_text="rim accent on shoulder")
        cp = compute_scene_complexity(r)
        assert cp.rim_present is True
        assert cp.rim_load_bearing is False

    def test_explicit_rim_dominant_text_sets_load_bearing(self):
        r = _make_result(fill_method_text="rim-dominant editorial setup")
        cp = compute_scene_complexity(r)
        assert cp.rim_present is True
        assert cp.rim_load_bearing is True


# ═══════════════════════════════════════════════════════════════════════════
# 3. Phase 3A correction #4 — placeholder axes
# ═══════════════════════════════════════════════════════════════════════════


class TestPlaceholderAxes:

    def test_placeholder_axes_listed_in_not_yet_computed(self):
        r = _make_result()
        cp = compute_scene_complexity(r)
        # All Phase 3A placeholder axes must appear in not_yet_computed.
        expected_placeholders = {
            "practical_contamination", "practical_load_bearing",
            "color_contamination_score", "detected_gels",
            "occlusion_ratio", "crop_completeness",
            "face_count", "multi_face_lighting_consistency",
            "post_processing_risk", "is_composited",
        }
        assert expected_placeholders.issubset(set(cp.not_yet_computed))

    def test_placeholder_values_have_safe_defaults(self):
        # Phase 3A placeholders must NEVER look like positive measured signals.
        r = _make_result()
        cp = compute_scene_complexity(r)
        # Numeric placeholders default to 0.0 (or 1.0 for "no degradation"
        # baselines like crop_completeness). They cannot be mistaken for
        # measured positives because consumers must check not_yet_computed.
        assert cp.practical_contamination == 0.0
        assert cp.color_contamination_score == 0.0
        assert cp.occlusion_ratio == 0.0
        assert cp.post_processing_risk == 0.0
        assert cp.is_composited is False
        assert cp.detected_gels == []
        assert cp.face_count == 1  # single-face assumption
        # Doc contract: anything in not_yet_computed is by definition NOT
        # an authoritative measurement.
        for axis in cp.not_yet_computed:
            assert hasattr(cp, axis), f"axis {axis} listed but not on dataclass"

    def test_router_does_not_consume_placeholder_axes_for_hybrid(self):
        # Synthetic result: no real HYBRID triggers, just default placeholders.
        # Must NOT route to HYBRID despite placeholders existing.
        r = _make_result(light_count=1, signal_strength=0.8)
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.CLASSICAL


# ═══════════════════════════════════════════════════════════════════════════
# 4. Phase 3A correction #1 — HYBRID gate requires corroboration
# ═══════════════════════════════════════════════════════════════════════════


class TestHybridGateCorroboration:

    def test_load_bearing_2_alone_does_not_trigger_hybrid(self):
        # Per correction #1: load_bearing_source_count >= 2 alone is NOT
        # sufficient.  Must have a corroborator.
        r = _make_result(light_count=2, signal_strength=0.8)
        r.complexity_profile = compute_scene_complexity(r)
        # No rim text, no window flag, no shadow conflict, dual topology
        # (which is excluded from corroborators) → must NOT be HYBRID.
        mode, rationale, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.HYBRID

    def test_load_bearing_2_plus_rim_load_bearing_triggers_hybrid(self):
        r = _make_result(
            light_count=2, fill_method_text="rim-dominant editorial",
            signal_strength=0.8,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, rationale, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.HYBRID
        assert "rim_load_bearing" in rationale

    def test_load_bearing_2_plus_ambient_triggers_hybrid(self):
        r = _make_result(
            light_count=2, window_light_gradient=True, signal_strength=0.8,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, rationale, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.HYBRID
        assert "ambient" in rationale

    def test_dual_topology_does_not_corroborate_hybrid(self):
        # "dual" cluster_geometry is intentionally excluded — it routinely
        # indicates key+fill, not multi-source.
        r = _make_result(
            light_count=2, cluster_geometry="dual", signal_strength=0.8,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.HYBRID

    def test_topology_alone_does_not_trigger_hybrid_phase_3a(self):
        # Phase 3A correction (empirical): cluster_geometry values from
        # existing CV (triangular, linear, strip) fire on classical scenes
        # too readily (e.g., ring_light reads 'strip', clean Rembrandt with
        # small fill reads 'linear'/'triangular').  Topology is therefore
        # OBSERVATIONAL only in Phase 3A — not a HYBRID trigger.
        # Phase 3B will rebuild the trigger using intensity-relative
        # signals from catchlight_intelligence.
        r = _make_result(
            light_count=1, cluster_geometry="triangular", signal_strength=0.8,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.HYBRID
        # But the topology is still recorded on the profile for observability.
        assert r.complexity_profile.multi_catchlight_topology == "triangular"


# ═══════════════════════════════════════════════════════════════════════════
# 5. Phase 3A correction #2 — BOUNDED long-term predicate
# ═══════════════════════════════════════════════════════════════════════════


class TestBoundedLongTermPredicate:

    def test_long_term_fires_with_two_credible_classical_close_confidence(self):
        # primary 0.62, alt 0.55 — spread 0.07 <= 0.15, alt >= 0.50, both
        # classical — fires long-term BOUNDED.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read",
            alternates=[{"pattern": "clamshell", "confidence": 0.55}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, rationale, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.BOUNDED
        assert "long-term" in rationale.lower()
        assert conf == 0.78

    def test_long_term_blocked_when_spread_exceeds_15pp(self):
        # spread 0.20 > 0.15 → does not fire long-term.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.75,
            primary_source="reference_read",
            alternates=[{"pattern": "clamshell", "confidence": 0.55}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.BOUNDED

    def test_long_term_blocked_when_alt_confidence_below_50pp(self):
        # alt 0.45 < 0.50 — does not fire long-term.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.55,
            primary_source="reference_read",
            alternates=[{"pattern": "clamshell", "confidence": 0.45}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.BOUNDED

    def test_long_term_blocked_when_same_pattern_repeated(self):
        # Same pattern from two classifiers is CONFIRMATION, not ambiguity.
        # Strongest possible CLASSICAL signal — must NOT route BOUNDED.
        r = _make_result(
            primary_pattern="rembrandt", primary_confidence=0.95,
            primary_source="reference_read",
            alternates=[{"pattern": "rembrandt", "confidence": 0.85, "source": "lighting_inference"}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.CLASSICAL

    def test_long_term_blocked_when_alt_not_classical(self):
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read",
            alternates=[{"pattern": "window_portrait", "confidence": 0.55}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        # window_portrait not in _CLASSICAL_BOUNDED_SET → no long-term fire.
        assert mode == AnalysisMode.CLASSICAL


# ═══════════════════════════════════════════════════════════════════════════
# 6. BOUNDED bootstrap fallback still works
# ═══════════════════════════════════════════════════════════════════════════


class TestBoundedBootstrapFallback:

    def test_bootstrap_fires_when_long_term_does_not(self):
        # Demoted source + CONTESTED but alt confidence too low for long-term:
        # bootstrap should fire.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.41,
            primary_source="reference_read_demoted",
            alternates=[{"pattern": "clamshell", "confidence": 0.44, "source": "light_structure"}],
            pattern_status=FieldStatus.CONTESTED,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, rationale, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.BOUNDED
        assert "bootstrap" in rationale.lower()
        assert conf == 0.70

    def test_long_term_takes_precedence_over_bootstrap(self):
        # Both predicates eligible — long-term wins (0.78 > 0.70 and runs first).
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read_demoted",
            alternates=[{"pattern": "clamshell", "confidence": 0.55}],
            pattern_status=FieldStatus.CONTESTED,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, rationale, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.BOUNDED
        assert "long-term" in rationale.lower()
        assert conf == 0.78


# ═══════════════════════════════════════════════════════════════════════════
# 7. Phase 1 INSUFFICIENT and CLASSICAL preserved
# ═══════════════════════════════════════════════════════════════════════════


class TestPhase1Preserved:

    def test_no_face_routes_insufficient(self):
        r = _make_result(face_detected=False)
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.INSUFFICIENT

    def test_low_signal_routes_insufficient(self):
        r = _make_result(signal_strength=0.30)
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.INSUFFICIENT

    def test_clean_single_source_routes_classical(self):
        r = _make_result(
            light_count=1, signal_strength=0.85,
            primary_pattern="rembrandt", primary_confidence=0.90,
        )
        r.complexity_profile = compute_scene_complexity(r)
        mode, _, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.CLASSICAL
        assert conf == 0.85
