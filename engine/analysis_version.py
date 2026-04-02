"""
NGW Analysis Version Metadata
==============================

Attached to every AnalysisResult to capture the exact system state at the
time of analysis. Required in Phase 4 for version-scoped feedback joins —
so that NAILED_IT outcomes can be attributed to the pipeline version that
produced them, not a later version that may have different resolution logic.

Do not mutate after assembly. Treat as an immutable snapshot.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class AnalysisVersionMetadata:
    """Immutable version snapshot for one analysis run.

    Populated by the orchestrator after all stages complete.
    All three version strings are required at construction time.
    analysis_timestamp defaults to UTC now if not supplied.

    Fields
    ------
    system_version
        ENGINE_VERSION constant from the top-level service module.
        Tracks overall application release.
    taxonomy_version
        TAXONOMY_VERSION from engine.taxonomy.
        Tracks category boundary and alias-map changes.
    pipeline_version
        PIPELINE_VERSION from engine.orchestrator.
        Tracks stage-level logic changes (cue weights, resolver order, etc.).
    analysis_timestamp
        ISO-8601 UTC timestamp. Set once at assembly — never update after.
    """

    system_version:     str
    taxonomy_version:   str
    pipeline_version:   str
    analysis_timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


__all__ = ["AnalysisVersionMetadata"]
