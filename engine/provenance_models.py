"""
NGW Field Provenance Models — Phase 2
=======================================

Defines the provenance-facing data structures for auditable field resolution.

DESIGN NOTES
------------
FieldCandidate is the normalized provenance record for one alternative interpretation.
It is NOT a replacement for PatternCandidate — PatternCandidate remains the live
internal structure in orchestrator.py. FieldCandidate is used only inside
FieldProvenance.alternates, where the audience is auditing and replay, not live
resolution logic.

FieldProvenance is attached to AnalysisResult fields after all resolution is complete.
It must not be mutated after assembly.

CIRCULAR IMPORT RULE
--------------------
This module imports from engine.enums only.
Do NOT import from engine.orchestrator, engine.image_analysis_models, or
any module that imports from here.

PHASE 2 SCOPE
-------------
- supporting_cues is included in both dataclasses but will be empty in Phase 2.
- Phase 3 will thread cue names from resolve_pattern_candidates() →
  PatternCandidate.supporting_cues → FieldProvenance.supporting_cues.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from engine.enums import FieldStatus


@dataclass
class FieldCandidate:
    """Normalized provenance-facing candidate record.

    Used inside FieldProvenance.alternates only. Not a replacement for
    PatternCandidate, which remains the live internal structure in
    orchestrator.py.

    Fields
    ------
    value
        The candidate field value (e.g. pattern name, modifier name).
    source
        The classifier or stage that produced this candidate.
    confidence
        0–1 confidence for this candidate at the time it was produced.
    supporting_cues
        Cue names from VisualCueReport that supported this value.
        EMPTY IN PHASE 2 — structure-first. Phase 3 threads cue names
        from the resolver into PatternCandidate then into this field.
    demotion_reason
        Non-empty when this candidate lost rank due to signal contradiction
        or cascade demotion. Populated from the resolver's demotion logic.
    status
        FieldStatus for this candidate's value, as assessed by the stage
        that produced it.
    """

    value:           str
    source:          str
    confidence:      float
    supporting_cues: List[str] = field(default_factory=list)
    demotion_reason: str = ""
    status:          FieldStatus = FieldStatus.UNKNOWN


@dataclass
class FieldProvenance:
    """Auditable provenance for one resolved field value.

    Populated by the orchestrator after all resolution and upgrade passes
    are complete. Do not mutate after assembly.

    Fields
    ------
    field_name
        Canonical field name per CANONICAL_FIELD_NAMES in engine.taxonomy.
    value
        The resolved field value.
    status
        FieldStatus for the resolved value. Matches the corresponding
        pattern_status / field-level FieldStatus on AnalysisResult.
    confidence
        0–1 confidence for the winning value.
    source
        Classifier or stage that produced the winning value.
    supporting_cues
        EMPTY IN PHASE 2 — see FieldCandidate.supporting_cues note.
        Phase 3 will populate this from the resolver.
    alternates
        Ranked alternative candidates that did not win, as FieldCandidate
        records. Populated from PatternCandidates.alternates after resolution.
    assumption_reason
        Non-empty only when status=ASSUMED. States the explicit no-signal
        condition that caused the fallback.
    demotion_applied
        True when the winning source was itself previously demoted by signal
        contradiction before ranking.
    pipeline_stage
        Which pipeline stage produced the final resolved value.
        E.g. "fusion", "cue_inference", "reference_read".
    """

    field_name:       str
    value:            str
    status:           FieldStatus
    confidence:       float
    source:           str
    supporting_cues:  List[str]
    alternates:       List[FieldCandidate]
    assumption_reason: str = ""
    demotion_applied:  bool = False
    pipeline_stage:    str = ""


__all__ = ["FieldCandidate", "FieldProvenance"]
