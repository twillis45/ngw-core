"""NGW Phase L1 — Structured analysis observability.

Emits one structured JSON log record per completed analysis run.
Designed to be the single authoritative source for analysis telemetry
consumed by monitoring dashboards, alerting, and offline debugging.

Logger: ``ngw.analysis.l1``
Format: JSON record via ``logging.info`` — compatible with any
        JSON-aware log aggregator (e.g. CloudWatch, Datadog, Loki).

Usage::

    from engine.observability import emit_analysis_l1
    record = emit_analysis_l1(result)   # emits + returns dict

The returned dict is also surfaced as ``"observability"`` in the
``POST /lab/analyze`` response body so the Lab Workbench can display
signal coverage and paradox state without re-running the pipeline.
"""

from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from engine.orchestrator import AnalysisResult

_l1_logger = logging.getLogger("ngw.analysis.l1")


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def emit_analysis_l1(result: "AnalysisResult") -> Dict[str, Any]:
    """Build and emit the L1 observability record for one analysis run.

    Parameters
    ----------
    result:
        Completed ``AnalysisResult`` from ``analyze_image()``.
        Called after ``_compute_perception_layer()`` so all
        diagnostics (signal_reliability, edge_case_flags,
        perception_explanation) are already populated.

    Returns
    -------
    dict
        JSON-safe dict with the full L1 record.  Callers may embed
        this in API responses; all values are plain Python scalars,
        lists, or dicts.
    """
    record = _build_record(result)
    _l1_logger.info(json.dumps(record, separators=(",", ":")))
    return record


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_record(result: "AnalysisResult") -> Dict[str, Any]:
    """Assemble the full L1 record from a completed AnalysisResult."""

    # ── Identity ────────────────────────────────────────────────────────────
    analysis_id = getattr(result, "analysis_id", None) or ""
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # ── Pattern resolution ───────────────────────────────────────────────────
    pattern = getattr(result, "authoritative_pattern", None) or "unknown"
    confidence = round(float(getattr(result, "pattern_confidence", 0.0) or 0.0), 4)
    confidence_label = getattr(result, "pattern_confidence_label", "weak") or "weak"
    source = getattr(result, "authoritative_pattern_source", "none") or "none"

    # ── Stage timings ────────────────────────────────────────────────────────
    stage_timings: Dict[str, float] = dict(getattr(result, "stage_timings", {}) or {})

    # ── Signal coverage (from SignalReliability) ─────────────────────────────
    sr = getattr(result, "signal_reliability", None)
    signal_coverage: Dict[str, Any] = {}
    if sr is not None:
        signal_coverage = {
            "signals_available":  getattr(sr, "signals_available", 0),
            "signals_total":      getattr(sr, "signals_total", 24),
            "overall_strength":   round(float(getattr(sr, "overall_signal_strength", 0.0) or 0.0), 4),
            "weak_signals":       list(getattr(sr, "weak_signals", []) or []),
            "missing_signals":    list(getattr(sr, "missing_signals", []) or []),
        }

    # ── Edge cases ───────────────────────────────────────────────────────────
    ecf = getattr(result, "edge_case_flags", None)
    active_edge_cases: List[str] = []
    if ecf is not None:
        _fields = (
            "blown_highlights", "mixed_color_temperature", "outdoor_foliage_shadows",
            "window_light_gradient", "extreme_low_key", "bw_processing",
            "no_face", "earring_catchlight_contamination",
        )
        active_edge_cases = [f for f in _fields if getattr(ecf, f, False)]

    # ── Paradoxes — parse from result.notes ──────────────────────────────────
    active_paradoxes: List[str] = []
    notes: List[str] = list(getattr(result, "notes", []) or [])
    for note in notes:
        if note.startswith("signal_paradoxes detected:"):
            # Format: "signal_paradoxes detected: p1, p2"
            payload = note.split(":", 1)[1].strip()
            active_paradoxes = [p.strip() for p in payload.split(",") if p.strip()]
            break

    # ── Contradictions + needs_review (from PatternCandidates) ───────────────
    pc = getattr(result, "pattern_candidates", None)
    contradictions: List[str] = []
    needs_review: bool = False
    if pc is not None:
        contradictions = list(getattr(pc, "contradictions", []) or [])
        needs_review = bool(getattr(pc, "needs_review", False))

    # ── Ambiguity flags (from PerceptionExplanation) ─────────────────────────
    pe = getattr(result, "perception_explanation", None)
    ambiguity_flags: List[str] = []
    if pe is not None:
        ambiguity_flags = list(getattr(pe, "ambiguity_flags", []) or [])

    # ── Face detected (from FaceValidation) ──────────────────────────────────
    fv = getattr(result, "face_validation", None)
    face_detected: bool = bool(getattr(fv, "face_detected", False)) if fv is not None else False

    # ── Layer 0 mode flags (Expert Deconstruction Order) ─────────────────────
    # Populated by _layer0_mode_preread() in analyze_image().
    # Surfaces the pre-read scene classification so Workbench reviewers can
    # see what gates were active during analysis.
    _mf: Dict[str, Any] = dict(getattr(result, "mode_flags", {}) or {})
    mode_flags: Dict[str, Any] = {
        "no_face":    bool(_mf.get("no_face", False)),
        "is_bw":      bool(_mf.get("is_bw", False)),
        "is_hcg":     bool(_mf.get("is_hcg", False)),
        "scene_type": str(_mf.get("scene_type", "unknown")),
    }

    # ── Stage 1 definitive pattern (if short-circuit fired) ──────────────────
    definitive_pattern: Optional[str] = getattr(result, "definitive_pattern", None)

    # ── Complex-Lighting Strategy Phase 1 — analysis mode (router output) ───
    # Surfaces the headline answer-shape (classical/bounded/hybrid/insufficient)
    # to the L1 telemetry stream.  Required for Phase 2 gate D — shadow-mode
    # production observation of false-positive HYBRID and false-positive
    # INSUFFICIENT rates over a two-week window before Phase 4 UI ships.
    # mode_confidence is router certainty in the chosen mode shape; per
    # strategy revision §4 it is a separate concept from pattern confidence
    # and must not be conflated with it.
    am = getattr(result, "analysis_mode", None)
    analysis_mode_value = (am.value if hasattr(am, "value") else str(am)) if am else "classical"
    mode_confidence = round(float(getattr(result, "mode_confidence", 0.0) or 0.0), 4)
    mode_rationale = getattr(result, "mode_rationale", "") or ""

    # ── Complex-Lighting Strategy Phase 3A — compact complexity summary ───
    # Surface only the high-signal axes and the not-yet-computed list.  Full
    # ComplexityProfile is in analysis_result_to_replay_dict; L1 keeps small.
    cp = getattr(result, "complexity_profile", None)
    complexity_summary: Dict[str, Any] = {}
    if cp is not None:
        complexity_summary = {
            "load_bearing_source_count": int(getattr(cp, "load_bearing_source_count", 0) or 0),
            "shadow_conflict_score":     round(float(getattr(cp, "shadow_conflict_score", 0.0) or 0.0), 4),
            "catchlight_conflict_score": round(float(getattr(cp, "catchlight_conflict_score", 0.0) or 0.0), 4),
            "ambient_contamination":     round(float(getattr(cp, "ambient_contamination", 0.0) or 0.0), 4),
            "multi_catchlight_topology": str(getattr(cp, "multi_catchlight_topology", "unknown") or "unknown"),
            "catchlight_reliability":    str(getattr(cp, "catchlight_reliability", "unknown") or "unknown"),
            "rim_load_bearing":          bool(getattr(cp, "rim_load_bearing", False)),
            "overall_complexity":        round(float(getattr(cp, "overall_complexity", 0.0) or 0.0), 4),
            "not_yet_computed":          list(getattr(cp, "not_yet_computed", []) or []),
        }

    # ── Assemble ─────────────────────────────────────────────────────────────
    return {
        "analysis_id":        analysis_id,
        "ts":                 ts,
        "pattern":            pattern,
        "confidence":         confidence,
        "confidence_label":   confidence_label,
        "source":             source,
        "stage_timings":      stage_timings,
        "signal_coverage":    signal_coverage,
        "active_edge_cases":  active_edge_cases,
        "active_paradoxes":   active_paradoxes,
        "contradictions":     contradictions,
        "ambiguity_flags":    ambiguity_flags,
        "needs_review":       needs_review,
        "face_detected":      face_detected,
        # Expert Deconstruction Order layer outputs
        "mode_flags":         mode_flags,
        "definitive_pattern": definitive_pattern,
        # Complex-Lighting Strategy Phase 1 router output
        "analysis_mode":      analysis_mode_value,
        "mode_confidence":    mode_confidence,
        "mode_rationale":     mode_rationale,
        # Complex-Lighting Strategy Phase 3A — compact complexity summary
        "complexity_summary": complexity_summary,
        # Complex-Lighting Strategy Phase 3B — top-candidate credibility
        # Surface only the (pattern, credibility) tuples for top candidates
        # so the L1 record stays small.  Full evidence traces are available
        # in analysis_result_to_replay_dict.
        "candidate_credibility_summary": [
            {"pattern": c.pattern, "credibility": round(float(c.credibility), 4),
             "is_classical": bool(c.is_classical)}
            for c in (getattr(result, "candidate_credibility", []) or [])
        ],
    }
