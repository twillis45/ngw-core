"""Tests for pattern resolution improvements.

Covers:
  1. _normalize_pattern() canonical rescue from free-text descriptions
  2. PatternCandidates.confidence_label tiers (strong / partial / weak)
  3. AnalysisResult.pattern_confidence and pattern_confidence_label fields
  4. Clamshell guard from "unknown" (2+ lights + vertical symmetry / fill)
  5. Weak-signal results still return a named pattern (not "unknown")
  6. "unknown" only when truly no signals present
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from engine.orchestrator import (
    AnalysisResult,
    PatternCandidate,
    PatternCandidates,
    resolve_pattern_candidates,
)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _make_ar(*, li_pattern=None, li_conf=0.7, ref_pattern=None, ref_conf=0.85,
             cue_pattern=None, cue_conf=0.5, li_count=None) -> AnalysisResult:
    ar = AnalysisResult()
    ar.reference_analysis = None
    ar.cue_inference_result = None

    if li_pattern is not None:
        intel = MagicMock()
        intel.pattern = li_pattern
        intel.pattern_confidence = li_conf
        intel.light_count = li_count if li_count is not None else 0
        intel.fill_method_text = ""
        ar.lighting_intel = intel
    else:
        ar.lighting_intel = None

    if ref_pattern is not None:
        ref = MagicMock()
        lr = MagicMock()
        lr.shadow_pattern = ref_pattern
        lr.pattern_confidence = ref_conf
        ref.lighting_read = lr
        ar.reference_analysis = ref

    if cue_pattern is not None:
        geo = MagicMock()
        geo.shadow_pattern = cue_pattern
        geo.confidence = cue_conf
        ar.cue_inference_result = {"geometry": geo}

    return ar


# ── 1. _normalize_pattern() canonical rescue ─────────────────────────────────

class TestNormalizePatternRescue:
    """Valid pattern names embedded in free-text must be rescued, not collapsed."""

    def test_directional_rembrandt_rescues_rembrandt(self):
        ar = _make_ar(ref_pattern="directional rembrandt", ref_conf=0.80)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"

    def test_soft_clamshell_rescues_clamshell(self):
        ar = _make_ar(ref_pattern="soft clamshell setup", ref_conf=0.75)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "clamshell"

    def test_contrasty_loop_rescues_loop(self):
        ar = _make_ar(ref_pattern="contrasty loop lighting", ref_conf=0.70)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "loop"

    def test_beauty_butterfly_rescues_butterfly(self):
        ar = _make_ar(ref_pattern="beauty butterfly main light", ref_conf=0.72)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "butterfly"

    def test_split_descriptor_rescues_split(self):
        ar = _make_ar(ref_pattern="dramatic split portrait", ref_conf=0.68)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "split"

    def test_face_mesh_unavailable_stays_unknown(self):
        """Truly unparseable reference reads must still produce unknown."""
        ar = _make_ar(ref_pattern="hard shadows — face-mesh unavailable", ref_conf=0.5)
        pc = resolve_pattern_candidates(ar)
        # Unknown ref — falls to unknown (no other sources)
        assert pc.authoritative_pattern == "unknown"

    def test_environmental_stays_unknown(self):
        ar = _make_ar(ref_pattern="outdoor environmental light", ref_conf=0.5)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"

    def test_flat_fashion_descriptor_rescues_flat(self):
        """flat_fashion is now aliased to 'flat' in _ALIAS_REMAP."""
        ar = _make_ar(ref_pattern="editorial flat with fill", ref_conf=0.65)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "flat"

    def test_canonical_exact_match_unchanged(self):
        """Exact canonical names must never be mangled."""
        for pattern in ["rembrandt", "clamshell", "loop", "butterfly", "split"]:
            ar = _make_ar(ref_pattern=pattern, ref_conf=0.80)
            pc = resolve_pattern_candidates(ar)
            assert pc.authoritative_pattern == pattern, f"Failed for {pattern}"


# ── 2. confidence_label tiers ────────────────────────────────────────────────

class TestConfidenceLabel:
    def _pc(self, confidence: float) -> PatternCandidates:
        return PatternCandidates(
            primary=PatternCandidate(
                pattern="rembrandt", source="lighting_inference",
                confidence=confidence, rank=1,
            )
        )

    def test_strong_above_075(self):
        assert self._pc(0.76).confidence_label == "strong"
        assert self._pc(0.85).confidence_label == "strong"
        assert self._pc(1.0).confidence_label == "strong"

    def test_strong_boundary_excluded(self):
        # 0.75 is NOT > 0.75 so it falls to partial
        assert self._pc(0.75).confidence_label == "partial"

    def test_partial_at_050(self):
        assert self._pc(0.50).confidence_label == "partial"
        assert self._pc(0.60).confidence_label == "partial"
        assert self._pc(0.74).confidence_label == "partial"

    def test_weak_below_050(self):
        assert self._pc(0.49).confidence_label == "weak"
        assert self._pc(0.30).confidence_label == "weak"
        assert self._pc(0.0).confidence_label == "weak"

    def test_unknown_candidate_is_weak(self):
        pc = PatternCandidates(
            primary=PatternCandidate(pattern="unknown", source="none", confidence=0.0, rank=1)
        )
        assert pc.confidence_label == "weak"

    def test_confidence_label_in_to_dict(self):
        pc = self._pc(0.82)
        d = pc.to_dict()
        assert d["primary_candidate"]["confidence_label"] == "strong"


# ── 3. AnalysisResult.pattern_confidence fields ──────────────────────────────

class TestAnalysisResultConfidenceFields:
    def test_fields_initialise_to_defaults(self):
        ar = AnalysisResult()
        assert ar.pattern_confidence == 0.0
        assert ar.pattern_confidence_label == "weak"

    def test_fields_populated_after_resolve(self):
        """resolve_pattern_candidates sets pattern_confidence on AnalysisResult."""
        ar = _make_ar(li_pattern="rembrandt", li_conf=0.82)
        # Simulate what analyze_image does
        from engine.orchestrator import resolve_pattern_candidates
        pc = resolve_pattern_candidates(ar)
        ar.pattern_candidates = pc
        ar.authoritative_pattern = pc.authoritative_pattern
        ar.pattern_confidence = pc.primary.confidence
        ar.pattern_confidence_label = pc.confidence_label

        assert ar.pattern_confidence == pytest.approx(0.82)
        assert ar.pattern_confidence_label == "strong"

    def test_weak_confidence_label_set(self):
        ar = _make_ar(li_pattern="loop", li_conf=0.35)
        from engine.orchestrator import resolve_pattern_candidates
        pc = resolve_pattern_candidates(ar)
        ar.pattern_candidates = pc
        ar.pattern_confidence = pc.primary.confidence
        ar.pattern_confidence_label = pc.confidence_label

        assert ar.pattern_confidence_label == "weak"


# ── 4. Clamshell guard from "unknown" ────────────────────────────────────────

class TestClamshellGuardFromUnknown:
    """When pattern resolves to unknown but signals indicate clamshell, upgrade."""

    def _ar_with_clamshell_signals(self, vert_sym=0.5, fill_text="reflector below",
                                   li_count=2, shadow_density=0.05, lr_asym=0.03):
        ar = AnalysisResult()
        ar.reference_analysis = None
        ar.cue_inference_result = None
        ar.lighting_intel = None  # no classifier fires → unknown

        # lighting_intel provides light_count
        intel = MagicMock()
        intel.pattern = "unknown"
        intel.pattern_confidence = 0.0
        intel.light_count = li_count
        intel.fill_method_text = fill_text
        ar.lighting_intel = intel

        # cue_report with highlight_symmetry and light_structure
        # Use spec lists so getattr(..., default) falls through for unlisted attrs
        cr = MagicMock(spec=["highlight_symmetry", "light_structure"])
        hs = MagicMock()
        hs.vertical_symmetry = vert_sym
        # _detect_signal_paradoxes reads symmetry_score from highlight_symmetry
        hs.symmetry_score = 0.5
        cr.highlight_symmetry = hs

        ls = MagicMock()
        ls.shadow_density = shadow_density
        ls.left_right_asymmetry = lr_asym
        ls.pattern_name = None
        # Attributes read by _detect_signal_paradoxes and _apply_signal_confidence
        ls.triangle_isolation = 0.0
        ls.nose_shadow_centroid_distance = 0.0
        ls.nose_shadow_centroid_angle_deg = 0.0
        ls.highlight_width_ratio = 0.0
        ls.top_bottom_ratio = 0.0
        cr.light_structure = ls

        ar.cue_report = cr
        return ar

    def test_upgrades_to_clamshell_with_vertical_symmetry_and_2_lights(self):
        ar = self._ar_with_clamshell_signals(vert_sym=0.45, fill_text="", li_count=2)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "clamshell"
        assert pc.primary.source == "clamshell_guard"
        assert pc.primary.confidence == pytest.approx(0.40)

    def test_upgrades_to_clamshell_with_reflector_fill(self):
        ar = self._ar_with_clamshell_signals(vert_sym=0.0, fill_text="reflector below key", li_count=2)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "clamshell"

    def test_no_upgrade_with_only_1_light(self):
        ar = self._ar_with_clamshell_signals(vert_sym=0.5, li_count=1)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"

    def test_no_upgrade_without_shadow_evidence(self):
        """Shadow density ≈ 0 and lr_asym ≈ 0 means no dual-source evidence."""
        ar = self._ar_with_clamshell_signals(
            vert_sym=0.5, li_count=2, shadow_density=0.005, lr_asym=0.005
        )
        pc = resolve_pattern_candidates(ar)
        # _clam_shadow_ok = False → no upgrade
        assert pc.authoritative_pattern == "unknown"

    def test_no_upgrade_without_clamshell_signals(self):
        """2 lights but no vertical sym, no fill text → stays unknown."""
        ar = self._ar_with_clamshell_signals(vert_sym=0.0, fill_text="", li_count=2)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"


# ── 5. Weak signal still returns named pattern ───────────────────────────────

class TestWeakSignalReturnsPattern:
    """Low confidence must not cause "unknown" — pattern is preserved."""

    def test_low_confidence_lighting_inference_still_wins(self):
        ar = _make_ar(li_pattern="rembrandt", li_conf=0.22)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"
        assert pc.confidence_label == "weak"

    def test_low_confidence_cue_inference_still_wins_when_only_source(self):
        ar = _make_ar(cue_pattern="loop", cue_conf=0.18)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "loop"

    def test_zero_confidence_lighting_inference_still_returns_pattern(self):
        ar = _make_ar(li_pattern="butterfly", li_conf=0.0)
        pc = resolve_pattern_candidates(ar)
        # Pattern preserved even at 0.0 confidence
        assert pc.authoritative_pattern in ("butterfly", "clamshell")  # clamshell upgrade may fire

    def test_alternates_preserved_at_low_confidence(self):
        ar = _make_ar(li_pattern="rembrandt", li_conf=0.25, cue_pattern="loop", cue_conf=0.18)
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "rembrandt"
        assert any(c.pattern == "loop" for c in pc.alternates)


# ── 6. "unknown" only when truly no signals ──────────────────────────────────

class TestUnknownOnlyWhenNoSignals:
    def test_completely_empty_result_is_unknown(self):
        ar = AnalysisResult()
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"
        assert pc.primary.source == "none"

    def test_all_unknown_patterns_from_classifiers(self):
        ar = _make_ar(li_pattern="unknown", ref_pattern="unknown")
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"

    def test_none_patterns_from_classifiers(self):
        ar = AnalysisResult()
        intel = MagicMock()
        intel.pattern = None
        intel.pattern_confidence = 0.0
        intel.light_count = 0  # explicitly an int so rescue guard doesn't fail
        intel.fill_method_text = ""
        ar.lighting_intel = intel
        ar.reference_analysis = None
        ar.cue_inference_result = None
        pc = resolve_pattern_candidates(ar)
        assert pc.authoritative_pattern == "unknown"
