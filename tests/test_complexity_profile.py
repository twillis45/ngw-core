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
    CandidateCredibility,
    ComplexityProfile,
    PatternCandidate,
    PatternCandidates,
    FaceValidation,
    SignalReliability,
    EdgeCaseFlags,
    compute_candidate_credibility,
    compute_scene_complexity,
    route_analysis_mode,
)


def _populate_phase3_layers(r):
    """Helper: populate complexity_profile + candidate_credibility on a result."""
    r.complexity_profile = compute_scene_complexity(r)
    r.candidate_credibility = compute_candidate_credibility(r)


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
    intel_pattern: Optional[str] = None,
    cue_geo_pattern: Optional[str] = None,
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
    if intel_pattern is not None:
        r.lighting_intel.pattern = intel_pattern
    r.cue_report = _CueReportStub(
        multi_shadow_detection=_MultiShadowStub(shadow_count=msd_count) if msd_count else None,
    )
    # Optional cue_inference geometry pattern (helps tests simulate
    # multi-classifier evidence for credibility scenarios).
    if cue_geo_pattern is not None:
        class _GeoStub:
            shadow_pattern = cue_geo_pattern
            key_light_direction = "unknown"
            key_light_height = "unknown"
            light_count_estimate = 1
            confidence = 0.6
            notes: List[str] = []
        r.cue_inference_result = {"geometry": _GeoStub()}
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

    def test_long_term_fires_with_two_credible_classical_same_zone(self):
        # Phase 3B credibility-based predicate.  Loop + rembrandt are both
        # side-key (compatible zones).  Clean sources.  Multi-classifier
        # evidence: ref_read matches primary (loop), lighting_inference
        # AND cue_inference geometry both match alt (rembrandt) — alt
        # has 2 evidence pieces, primary has 1.  Predicate fires.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read",
            alternates=[{"pattern": "rembrandt", "confidence": 0.55, "source": "lighting_inference"}],
            pattern_status=FieldStatus.FUSED_FINAL,
            intel_pattern="rembrandt",     # lighting_inference votes rembrandt
            cue_geo_pattern="rembrandt",   # cue_inference geometry votes rembrandt
        )
        _populate_phase3_layers(r)
        mode, rationale, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.BOUNDED
        assert "credibility" in rationale.lower()
        assert conf == 0.80

    def test_long_term_blocked_on_incompatible_key_zones(self):
        # Phase 3B: loop (side) + clamshell (center) — incompatible key zones.
        # Even with similar credibilities, the predicate must NOT fire
        # because the two patterns place the key in different general
        # zones — that's HYBRID/INSUFFICIENT territory, not BOUNDED.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read",
            alternates=[{"pattern": "clamshell", "confidence": 0.55, "source": "lighting_inference"}],
            pattern_status=FieldStatus.FUSED_FINAL,
        )
        _populate_phase3_layers(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode != AnalysisMode.BOUNDED

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

    def test_bootstrap_does_not_fire_when_long_term_already_did(self):
        # Phase 3B: clean primary source + compatible-zone alt that meets
        # credibility thresholds → long-term BOUNDED fires (conf 0.80).
        # The bootstrap predicate requires `_demoted in primary source`
        # which doesn't hold here, so even if long-term hadn't fired, the
        # bootstrap couldn't.  This is a structural check — long-term and
        # bootstrap are essentially mutually exclusive under Phase 3B
        # (demoted source penalises credibility below the long-term floor).
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.62,
            primary_source="reference_read",
            alternates=[{"pattern": "rembrandt", "confidence": 0.55, "source": "lighting_inference"}],
            pattern_status=FieldStatus.FUSED_FINAL,
            intel_pattern="rembrandt",
            cue_geo_pattern="rembrandt",
        )
        _populate_phase3_layers(r)
        mode, rationale, conf = route_analysis_mode(r)
        assert mode == AnalysisMode.BOUNDED
        assert "credibility" in rationale.lower()
        assert conf == 0.80


# ═══════════════════════════════════════════════════════════════════════════
# 7. Phase 1 INSUFFICIENT and CLASSICAL preserved
# ═══════════════════════════════════════════════════════════════════════════


class TestCandidateCredibility:
    """Phase 3B — photographic-evidence credibility scoring."""

    def test_credibility_starts_at_neutral_baseline(self):
        # No upstream classifier matches; clean source.  Credibility = 0.50.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read",
        )
        # Force ref_read shadow_pattern to NOT match primary — strip evidence.
        r.reference_analysis.lighting_read.shadow_pattern = "unknown"
        cc = compute_candidate_credibility(r)
        assert len(cc) == 1
        assert cc[0].pattern == "loop"
        assert cc[0].credibility == 0.50

    def test_credibility_rewards_upstream_pattern_match(self):
        # ref_read shadow_pattern matches primary → +0.10 → 0.60.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read",
        )
        cc = compute_candidate_credibility(r)
        primary_cc = cc[0]
        assert primary_cc.pattern == "loop"
        assert primary_cc.credibility == 0.60
        assert "reference_read_pattern_match" in primary_cc.evidence_for

    def test_credibility_penalises_demoted_source(self):
        # ref_read match (+0.10 → 0.60) then × 0.7 demotion penalty → 0.42.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read_demoted",
        )
        cc = compute_candidate_credibility(r)
        primary_cc = cc[0]
        assert primary_cc.credibility == 0.42
        assert primary_cc.source_trust_multiplier == 0.70
        assert "source_demoted" in primary_cc.evidence_against

    def test_credibility_penalises_ambiguity_fallback(self):
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.30,
            primary_source="ambiguity_fallback",
        )
        cc = compute_candidate_credibility(r)
        primary_cc = cc[0]
        assert primary_cc.source_trust_multiplier == 0.50
        assert "source_ambiguity_fallback" in primary_cc.evidence_against

    def test_credibility_independent_of_raw_confidence(self):
        # Same evidence shape, very different raw confidence — credibility
        # is the same.  Per Phase 3B doctrine: credibility is photographic
        # fit, NOT resolver belief.
        r1 = _make_result(
            primary_pattern="loop", primary_confidence=0.95,
            primary_source="reference_read",
        )
        r2 = _make_result(
            primary_pattern="loop", primary_confidence=0.30,
            primary_source="reference_read",
        )
        cc1 = compute_candidate_credibility(r1)
        cc2 = compute_candidate_credibility(r2)
        assert cc1[0].credibility == cc2[0].credibility
        # raw_confidence is recorded for traceability but does not drive cred
        assert cc1[0].raw_confidence == 0.95
        assert cc2[0].raw_confidence == 0.30

    def test_credibility_top_classical_must_disagree_for_bounded(self):
        # Two SAME-pattern candidates from different classifiers: confirmation,
        # not ambiguity.  Long-term BOUNDED predicate must NOT fire.
        r = _make_result(
            primary_pattern="rembrandt", primary_confidence=0.75,
            primary_source="reference_read",
            alternates=[{"pattern": "rembrandt", "confidence": 0.65, "source": "lighting_inference"}],
        )
        _populate_phase3_layers(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.CLASSICAL


class TestBoundedRequiresCredibilityOverrulesResolver:
    """Phase 3B doctrinal anchor: BOUNDED long-term predicate fires only
    when credibility-scoring OVERRULES the resolver's primary pick.  If
    credibility agrees with the resolver (top-credibility pattern ==
    resolver primary pattern), the resolver was probably right — that's
    CLASSICAL, not BOUNDED.
    """

    def test_long_term_blocked_when_credibility_agrees_with_resolver(self):
        # Resolver picked loop with high confidence.  Credibility scoring
        # ALSO ranks loop as #1 (because primary has multi-classifier
        # support).  Alt rembrandt has 1 evidence piece.  Even though the
        # numerical thresholds are met, the predicate must NOT fire —
        # credibility agreed with the resolver, so the resolver was right.
        r = _make_result(
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read",
            alternates=[{"pattern": "rembrandt", "confidence": 0.55, "source": "lighting_inference"}],
            pattern_status=FieldStatus.FUSED_FINAL,
            intel_pattern="loop",       # lighting_inference also votes loop
            cue_geo_pattern="loop",     # cue_inference geometry also votes loop
        )
        _populate_phase3_layers(r)
        # Top credibility: loop with multi-classifier support.
        # Alt: rembrandt with one match (lighting_inference contradicting itself
        # — but here we use the alt source convention).  Actually with all
        # three classifiers voting loop, rembrandt has 0 matches → cred 0.50.
        # Either way the predicate should not fire.
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.CLASSICAL


class TestKeyZoneCompatibility:
    """Phase 3B — key-direction zone matching for BOUNDED predicate."""

    def test_loop_rembrandt_compatible(self):
        from engine.orchestrator import _key_zones_compatible
        assert _key_zones_compatible("loop", "rembrandt")

    def test_butterfly_clamshell_compatible(self):
        from engine.orchestrator import _key_zones_compatible
        assert _key_zones_compatible("butterfly", "clamshell")

    def test_loop_butterfly_incompatible(self):
        from engine.orchestrator import _key_zones_compatible
        # side vs center — disagree on horizontal placement
        assert not _key_zones_compatible("loop", "butterfly")

    def test_low_key_compatible_with_anything(self):
        from engine.orchestrator import _key_zones_compatible
        # low_key is a tonal regime, not a direction — "any" zone
        assert _key_zones_compatible("low_key", "loop")
        assert _key_zones_compatible("low_key", "butterfly")


class TestBackLightStructuralDetector:
    """Phase 3B Workstream B — back-light/hair-light structural detector.

    Fires when:
      - catchlight_count >= 5
      - cluster is 'linear' or 'triangular'
      - bilateral_symmetry_score in [0.30, 0.70]
      - lighting_intel.light_count == 1 (engine doesn't already see it)
      - resolver source is not definitive_signature or specialty:*
    """

    def _make_ct(self, count, cluster, bilat_sym):
        class _CT:
            pass
        ct = _CT()
        ct.catchlight_count = count
        ct.cluster_geometry = cluster
        ct.bilateral_symmetry_score = bilat_sym
        return ct

    def test_back_light_signature_upgrades_load_bearing_to_2(self):
        # All conditions met → back_light_structural=True → load_bearing
        # upgrades to 2, rim_load_bearing=True, HYBRID gate fires.
        r = _make_result(
            light_count=1,
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read",
        )
        r.cue_report.catchlight_topology = self._make_ct(6, "linear", 0.50)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.load_bearing_source_count == 2
        assert r.complexity_profile.rim_load_bearing is True
        assert r.complexity_profile.rim_present is True

    def test_back_light_blocked_when_definitive_signature_source(self):
        # rim_only / athletic_rim hit definitive_signature path.  Their
        # high catchlight_count is from rim-light specular but the pattern
        # is already classified.  Filter must exclude them.
        r = _make_result(
            light_count=1,
            primary_pattern="rim", primary_confidence=0.95,
            primary_source="definitive_signature",
        )
        r.cue_report.catchlight_topology = self._make_ct(8, "linear", 0.00)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.rim_load_bearing is False
        assert r.complexity_profile.load_bearing_source_count == 1

    def test_back_light_blocked_when_specialty_source(self):
        # high_key_beauty: count=8, linear, but source is
        # specialty:reference_read.  Specialty patterns have their own
        # tonal/source classification — back-light detector must skip them.
        r = _make_result(
            light_count=1,
            primary_pattern="high_key", primary_confidence=0.95,
            primary_source="specialty:reference_read",
        )
        r.cue_report.catchlight_topology = self._make_ct(8, "linear", 0.00)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.rim_load_bearing is False

    def test_back_light_blocked_when_count_below_5(self):
        # Standard butterfly with 3 catchlights (key + 2 fill specular)
        # is a clean classical, not a back-light scene.
        r = _make_result(
            light_count=1,
            primary_pattern="butterfly", primary_confidence=0.85,
            primary_source="reference_read",
        )
        r.cue_report.catchlight_topology = self._make_ct(3, "triangular", 0.15)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.rim_load_bearing is False

    def test_back_light_blocked_when_cluster_is_dual(self):
        # cluster='dual' = key+fill, NOT multi-source character.
        r = _make_result(
            light_count=1,
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="reference_read",
        )
        r.cue_report.catchlight_topology = self._make_ct(6, "dual", 0.50)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.rim_load_bearing is False


class TestCatchlightUnreliabilityDetector:
    """Phase 3B Workstream C — catchlight-unreliability detector.

    NOT a glasses-specific detector.  Detects "the catchlight signal
    is unresolvable" via the resolver's outcome quality.  Hits when:
      - face is detected, face_quality is good
      - signal_reliability >= 0.50
      - resolver source is _demoted
      - resolver pattern_confidence < 0.25
      - catchlight_count >= 4
    Sets catchlight_reliability='blocked', which routes INSUFFICIENT.

    Future cases (mirror selfie, sunglasses, jewelry contamination)
    expected to also hit this signature.
    """

    def _make_ct(self, count=5):
        class _CT:
            pass
        ct = _CT()
        ct.catchlight_count = count
        ct.cluster_geometry = "linear"
        ct.bilateral_symmetry_score = 0.00
        return ct

    def test_unreliability_fires_when_resolver_failed_with_face_intact(self):
        # Face fine, signals fine, but resolver picked a demoted candidate
        # at conf=0.15 with many catchlights → contamination signature.
        r = _make_result(
            face_detected=True, face_quality="good", signal_strength=0.65,
            primary_pattern="loop", primary_confidence=0.15,
            primary_source="lighting_inference_demoted",
            alternates=[{"pattern": "rembrandt", "confidence": 0.20, "source": "cue_inference_demoted"}],
            pattern_status=FieldStatus.CONTESTED,
        )
        r.cue_report.catchlight_topology = self._make_ct(count=6)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.catchlight_reliability == "blocked"
        # And the INSUFFICIENT gate must fire
        r.candidate_credibility = compute_candidate_credibility(r)
        mode, _, _ = route_analysis_mode(r)
        assert mode == AnalysisMode.INSUFFICIENT

    def test_unreliability_does_not_fire_on_clean_classical(self):
        # High confidence + clean source → unreliability detector silent.
        r = _make_result(
            face_detected=True, face_quality="good", signal_strength=0.65,
            primary_pattern="rembrandt", primary_confidence=0.95,
            primary_source="reference_read",
        )
        r.cue_report.catchlight_topology = self._make_ct(count=6)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.catchlight_reliability == "reliable"

    def test_unreliability_blocked_when_face_quality_poor(self):
        # If face quality is poor, the existing INSUFFICIENT gate (face
        # quality) handles it — unreliability detector should not double-fire.
        r = _make_result(
            face_detected=True, face_quality="poor", signal_strength=0.65,
            primary_pattern="loop", primary_confidence=0.15,
            primary_source="lighting_inference_demoted",
        )
        r.cue_report.catchlight_topology = self._make_ct(count=6)
        r.complexity_profile = compute_scene_complexity(r)
        # face_quality=poor short-circuits — reliability stays unflagged
        # because the unreliability check requires face_quality != "poor".
        # The existing face_quality INSUFFICIENT gate will route correctly.
        assert r.complexity_profile.catchlight_reliability == "reliable"

    def test_unreliability_blocked_when_few_catchlights(self):
        # catchlight_count < 4 → not the contamination signature.
        r = _make_result(
            face_detected=True, face_quality="good", signal_strength=0.65,
            primary_pattern="loop", primary_confidence=0.15,
            primary_source="lighting_inference_demoted",
        )
        r.cue_report.catchlight_topology = self._make_ct(count=2)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.catchlight_reliability == "reliable"

    def test_unreliability_blocked_when_high_confidence_resolver(self):
        # Resolver picked at high conf — even with many catchlights and a
        # demoted source, the resolver's confidence is the trump.
        r = _make_result(
            face_detected=True, face_quality="good", signal_strength=0.65,
            primary_pattern="loop", primary_confidence=0.85,
            primary_source="lighting_inference_demoted",
        )
        r.cue_report.catchlight_topology = self._make_ct(count=6)
        r.complexity_profile = compute_scene_complexity(r)
        assert r.complexity_profile.catchlight_reliability == "reliable"


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
