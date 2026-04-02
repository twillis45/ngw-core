"""
NGW VLM Teacher Contract — Phase 3
=====================================

Defines how VLM output is ingested as a ranked semantic hint (Source 5)
in the pattern resolution pipeline.

VLM ROLE
--------
The VLM is a semantic teacher, not a sovereign classifier.
- VLM hints carry SEMANTIC_HINT status (below all CV classifiers in priority)
- Confidence capped at 0.45 (exact match) or 0.30 (substring match)
- VLM wins pattern only when all four CV classifiers fail to produce a result

IMPORT RULE
-----------
This module imports from engine.enums and engine.taxonomy only.
VLMDescription is kept as Any (guarded access) to prevent circular imports
from engine.image_analysis_models.

CIRCULAR IMPORT SAFETY
----------------------
Do NOT import from engine.orchestrator, engine.image_analysis_models,
engine.reference_read, engine.cue_inference, or engine.lighting_inference.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from engine.enums import FieldStatus


# ── VLM confidence ceiling constants ─────────────────────────────────────────

VLM_PATTERN_CONFIDENCE_EXACT  = 0.45   # exact key match in VLM_STYLE_TO_CANONICAL
VLM_PATTERN_CONFIDENCE_SUBSTR = 0.30   # substring / fallback match
VLM_FIELD_CONFIDENCE_DEFAULT  = 0.35   # non-pattern fields (environment, modifier, etc.)


# ── Canonical mapping: VLM free-text style → canonical field values ───────────
#
# Each entry maps one normalised VLM lighting_style string to a dict of
# canonical field values.  One canonical value per field — no lists.
# Pattern values must be canonical LightingPattern enum values or "unknown".
# Environment values must be canonical EnvironmentType-equivalent strings.
#
# Normalisation: callers lowercase + strip the VLM string before lookup.

VLM_STYLE_TO_CANONICAL: Dict[str, Dict[str, str]] = {
    "rembrandt":            {"pattern": "rembrandt",    "environment": "studio"},
    "loop":                 {"pattern": "loop",         "environment": "studio"},
    "butterfly/paramount":  {"pattern": "butterfly",    "environment": "studio"},
    "butterfly":            {"pattern": "butterfly",    "environment": "studio"},
    "paramount":            {"pattern": "butterfly",    "environment": "studio"},
    "split":                {"pattern": "split",        "environment": "studio"},
    "broad":                {"pattern": "broad",        "environment": "studio"},
    "short":                {"pattern": "short",        "environment": "studio"},
    "clamshell":            {"pattern": "clamshell",    "environment": "studio"},
    "flat/beauty":          {"pattern": "flat",         "environment": "studio"},
    "flat":                 {"pattern": "flat",         "environment": "studio"},
    "rim/edge":             {"pattern": "rim_only",     "environment": "studio"},
    "rim":                  {"pattern": "rim_only",     "environment": "studio"},
    "edge":                 {"pattern": "rim_only",     "environment": "studio"},
    "natural/ambient":      {"pattern": "unknown",      "environment": "outdoor_shade"},
    "natural":              {"pattern": "unknown",      "environment": "outdoor_shade"},
    "ambient":              {"pattern": "unknown",      "environment": "outdoor_shade"},
    "mixed/practical":      {"pattern": "unknown",      "environment": "studio"},
    "dramatic/chiaroscuro": {"pattern": "rembrandt",    "environment": "studio"},
    "chiaroscuro":          {"pattern": "rembrandt",    "environment": "studio"},
    "dramatic":             {"pattern": "rembrandt",    "environment": "studio"},
    "high-key":             {"pattern": "high_key",     "environment": "studio"},
    "high_key":             {"pattern": "high_key",     "environment": "studio"},
    "low-key":              {"pattern": "low_key",      "environment": "studio"},
    "low_key":              {"pattern": "low_key",      "environment": "studio"},
}


# ── VLMFieldHint ─────────────────────────────────────────────────────────────

@dataclass
class VLMFieldHint:
    """Normalised hint for a single field inferred from VLM output.

    Produced by build_vlm_semantic_hint().  Used inside VLMSemanticHint.
    Never put into a CV classifier slot — only into the vlm_hint source slot.

    Fields
    ------
    value
        Canonical field value (e.g. "rembrandt", "studio").
    confidence
        0–1 confidence.  Capped at VLM_PATTERN_CONFIDENCE_EXACT for pattern,
        VLM_FIELD_CONFIDENCE_DEFAULT for other fields.
    status
        Always SEMANTIC_HINT — VLM hints are not measurements.
    alternates
        Empty for Phase 3.  Future: other possible values this style could map to.
    raw_value
        The original VLM lighting_style string before normalisation.
    assumption
        Non-empty when the mapping was inferential (e.g. substring match).
    """
    value:      str
    confidence: float
    status:     FieldStatus = FieldStatus.SEMANTIC_HINT
    alternates: List[str]   = field(default_factory=list)
    raw_value:  str         = ""
    assumption: str         = ""


# ── VLMSemanticHint ───────────────────────────────────────────────────────────

@dataclass
class VLMSemanticHint:
    """Structured semantic hints produced from one VLM description.

    Built once in analyze_image() before resolve_pattern_candidates().
    Consumed by:
      1. resolve_pattern_candidates() — Source 5 candidate (pattern only)
      2. build_vlm_disagreements() — post-resolution disagreement capture

    Fields
    ------
    pattern
        VLMFieldHint for the inferred pattern, or None if mapping failed.
    environment
        VLMFieldHint for the inferred environment, or None.
    modifier
        VLMFieldHint for the inferred modifier, or None (Phase 3: always None).
    setup_family
        VLMFieldHint for the inferred setup family, or None (Phase 3: always None).
    fill_presence
        VLMFieldHint for fill presence, or None (Phase 3: always None).
    ambiguity_notes
        Free-text notes about mapping ambiguity or confidence degradation.
    mapping_failures
        List of raw VLM strings that had no entry in VLM_STYLE_TO_CANONICAL.
    source_vlm_style
        The raw VLM lighting_style string this was built from.
    pipeline_stage
        Always "vlm_hint" for Phase 3 hints.
    """
    pattern:          Optional[VLMFieldHint]
    environment:      Optional[VLMFieldHint]
    modifier:         Optional[VLMFieldHint]
    setup_family:     Optional[VLMFieldHint]
    fill_presence:    Optional[VLMFieldHint]
    ambiguity_notes:  List[str] = field(default_factory=list)
    mapping_failures: List[str] = field(default_factory=list)
    source_vlm_style: str       = ""
    pipeline_stage:   str       = "vlm_hint"


# ── VLMDisagreementRecord ─────────────────────────────────────────────────────

@dataclass
class VLMDisagreementRecord:
    """Additive record comparing VLM hint vs resolved field value.

    One record per field where VLM provided a hint.  Built after all
    resolution is complete.  Does NOT replace VLWDimensionResult — it is
    additive and uses canonical field names for cross-pipeline auditing.

    Agreement values
    ----------------
    confirmed    — VLM value == resolved value
    conflicting  — VLM value != resolved value (both non-unknown)
    vlm_only     — VLM has opinion, resolved is "unknown"

    Fields
    ------
    field_name
        Canonical field name per CANONICAL_FIELD_NAMES ("pattern", etc.)
    vlm_value
        The value the VLM hint suggested.
    vlm_confidence
        Confidence of the VLM hint at time of hint construction.
    resolved_value
        The final resolved value after all pipeline passes.
    resolved_source
        Source that produced the resolved value (e.g. "reference_read").
    agreement
        "confirmed" | "conflicting" | "vlm_only"
    disagreement_magnitude
        When conflicting: abs(vlm_confidence - resolved_confidence).
        When confirmed: 0.0.  When vlm_only: vlm_confidence.
    pipeline_version
        PIPELINE_VERSION at time of build — links record to a pipeline spec.
    """
    field_name:             str
    vlm_value:              str
    vlm_confidence:         float
    resolved_value:         str
    resolved_source:        str
    agreement:              str    # "confirmed" | "conflicting" | "vlm_only"
    disagreement_magnitude: float
    pipeline_version:       str


# ── Builder: VLM description → VLMSemanticHint ────────────────────────────────

def build_vlm_semantic_hint(vlm_description: Any) -> Optional[VLMSemanticHint]:
    """Build a VLMSemanticHint from a VLMDescription (passed as Any).

    Returns None when:
      - vlm_description is None
      - vlm_description.ok is False
      - lighting_style is empty

    Returns a VLMSemanticHint with pattern=None when the lighting_style
    string has no mapping in VLM_STYLE_TO_CANONICAL.  The mapping_failures
    list documents the unrecognised style.

    Parameters
    ----------
    vlm_description : Any
        VLMDescription instance (typed as Any to prevent circular import
        from engine.image_analysis_models).
    """
    if vlm_description is None:
        return None
    if not getattr(vlm_description, "ok", False):
        return None

    lighting_style = (getattr(vlm_description, "lighting_style", "") or "").strip()
    if not lighting_style:
        return None

    key = lighting_style.lower()

    # Exact match first
    mapping = VLM_STYLE_TO_CANONICAL.get(key)
    is_exact = mapping is not None

    # Substring fallback
    if mapping is None:
        for map_key, map_val in VLM_STYLE_TO_CANONICAL.items():
            if map_key in key or key in map_key:
                mapping = map_val
                break

    mapping_failures: List[str] = []

    if mapping is None:
        mapping_failures.append(lighting_style)
        return VLMSemanticHint(
            pattern=None,
            environment=None,
            modifier=None,
            setup_family=None,
            fill_presence=None,
            ambiguity_notes=[f"VLM style '{lighting_style}' not in VLM_STYLE_TO_CANONICAL"],
            mapping_failures=mapping_failures,
            source_vlm_style=lighting_style,
            pipeline_stage="vlm_hint",
        )

    # Pattern hint
    pat_val = mapping.get("pattern")
    pattern_hint: Optional[VLMFieldHint] = None
    if pat_val and pat_val != "unknown":
        conf = VLM_PATTERN_CONFIDENCE_EXACT if is_exact else VLM_PATTERN_CONFIDENCE_SUBSTR
        pattern_hint = VLMFieldHint(
            value=pat_val,
            confidence=conf,
            status=FieldStatus.SEMANTIC_HINT,
            raw_value=lighting_style,
            assumption="" if is_exact else f"substring match on '{key}'",
        )

    # Environment hint
    env_val = mapping.get("environment")
    environment_hint: Optional[VLMFieldHint] = None
    if env_val:
        environment_hint = VLMFieldHint(
            value=env_val,
            confidence=VLM_FIELD_CONFIDENCE_DEFAULT,
            status=FieldStatus.SEMANTIC_HINT,
            raw_value=lighting_style,
        )

    return VLMSemanticHint(
        pattern=pattern_hint,
        environment=environment_hint,
        modifier=None,
        setup_family=None,
        fill_presence=None,
        ambiguity_notes=[],
        mapping_failures=mapping_failures,
        source_vlm_style=lighting_style,
        pipeline_stage="vlm_hint",
    )


# ── Builder: VLM hint → disagreement records ──────────────────────────────────

def build_vlm_disagreements(
    vlm_hint: VLMSemanticHint,
    pattern_candidates: Any,   # PatternCandidates — Any to avoid circular import
    resolved_pattern: str,
    resolved_source: str,
    pipeline_version: str,
) -> List[VLMDisagreementRecord]:
    """Build disagreement records comparing VLM hints to resolved values.

    One record is built per field where VLM provided a non-unknown hint.
    Phase 3: only the pattern field is compared.

    Parameters
    ----------
    vlm_hint
        VLMSemanticHint built before resolution.
    pattern_candidates
        PatternCandidates from resolve_pattern_candidates() (typed as Any).
    resolved_pattern
        Final authoritative_pattern from AnalysisResult.
    resolved_source
        Final authoritative_pattern_source from AnalysisResult.
    pipeline_version
        PIPELINE_VERSION constant from orchestrator.
    """
    records: List[VLMDisagreementRecord] = []

    if vlm_hint.pattern is None:
        return records

    vlm_val = vlm_hint.pattern.value
    vlm_conf = vlm_hint.pattern.confidence

    if not vlm_val or vlm_val == "unknown":
        return records

    resolved = resolved_pattern or "unknown"

    if vlm_val == resolved:
        agreement = "confirmed"
        disagreement_magnitude = 0.0
    elif resolved in ("unknown", ""):
        agreement = "vlm_only"
        disagreement_magnitude = round(vlm_conf, 3)
    else:
        agreement = "conflicting"
        resolved_conf = 0.0
        primary = getattr(pattern_candidates, "primary", None) if pattern_candidates is not None else None
        if primary is not None:
            resolved_conf = float(getattr(primary, "confidence", 0.0))
        disagreement_magnitude = round(abs(vlm_conf - resolved_conf), 3)

    records.append(VLMDisagreementRecord(
        field_name="pattern",
        vlm_value=vlm_val,
        vlm_confidence=vlm_conf,
        resolved_value=resolved,
        resolved_source=resolved_source or "none",
        agreement=agreement,
        disagreement_magnitude=disagreement_magnitude,
        pipeline_version=pipeline_version,
    ))

    return records


__all__ = [
    "VLM_PATTERN_CONFIDENCE_EXACT",
    "VLM_PATTERN_CONFIDENCE_SUBSTR",
    "VLM_FIELD_CONFIDENCE_DEFAULT",
    "VLM_STYLE_TO_CANONICAL",
    "VLMFieldHint",
    "VLMSemanticHint",
    "VLMDisagreementRecord",
    "build_vlm_semantic_hint",
    "build_vlm_disagreements",
]
