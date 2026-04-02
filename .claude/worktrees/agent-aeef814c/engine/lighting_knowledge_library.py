"""Lighting Knowledge Library — maps reconstruction output to named lighting patterns.

.. deprecated::
    This module is no longer called by the production pipeline.
    The extended pipeline (vision_passes.py) no longer invokes
    ``lighting_knowledge_library_pass()``.  Authoritative pattern
    resolution is handled by ``engine.orchestrator.resolve_pattern_candidates()``.

    Retained for backward compatibility with existing tests. Do not add
    new callers.

Delegates pattern matching to engine/pattern_matcher.py, which uses the
structured dataset in data/lighting_patterns.json.  This module adds
physics-consistency adjustments, photographer references, and the
pipeline-compatible return format.

This module does NOT determine the final lighting setup — it provides
reference-level context so photographers can understand the analysis in
terms they already know.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from engine.pattern_matcher import (
    _load_patterns,
    match_lighting_patterns,
)

logger = logging.getLogger(__name__)


def lighting_knowledge_library_pass(
    reconstruction: Dict[str, Any],
    hypothesis: Optional[Dict[str, Any]] = None,
    physics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Match reconstruction output against known lighting patterns.

    Delegates core matching to pattern_matcher.match_lighting_patterns(),
    then adds physics consistency adjustments and photographer references.

    Args:
        reconstruction: Output from reconstruction_pass (required).
        hypothesis: Output from lighting_hypothesis_engine (optional).
        physics: Output from physics_consistency_engine (optional).

    Returns:
        Dict with ok, pattern_matches, top_pattern, top_pattern_confidence,
        master_reference, notes.
    """
    notes: List[str] = []

    # Build merged reconstruction dict for matching
    merged = dict(reconstruction)
    if hypothesis:
        for key in ("environment_class",):
            if key not in merged or merged.get(key) is None:
                merged[key] = hypothesis.get(key)

    # Core pattern matching
    match_result = match_lighting_patterns(merged)
    pattern_matches = match_result.get("pattern_matches", [])

    if not pattern_matches:
        notes.append("No lighting patterns loaded")
        return {
            "ok": False,
            "pattern_matches": [],
            "top_pattern": "unknown",
            "top_pattern_confidence": 0.0,
            "master_reference": [],
            "notes": notes,
        }

    # Physics consistency boost/penalty
    if physics and physics.get("best_physics_score") is not None:
        phys_score = physics["best_physics_score"]
        if phys_score > 0.7:
            notes.append(f"Physics consistency high ({phys_score:.2f}), boosting top match")
            if pattern_matches:
                pattern_matches[0]["confidence"] = min(
                    1.0, pattern_matches[0]["confidence"] + 0.05
                )
        elif phys_score < 0.3:
            notes.append(f"Physics consistency low ({phys_score:.2f}), top match less certain")
            if pattern_matches:
                pattern_matches[0]["confidence"] = max(
                    0.0, pattern_matches[0]["confidence"] - 0.1
                )

    # Collect photographer references from top patterns
    patterns = _load_patterns()
    master_refs: List[str] = []
    seen_refs: set = set()
    for match in pattern_matches[:3]:
        pat_id = match["pattern"]
        for pat in patterns:
            if pat.get("pattern_id") == pat_id:
                for photog in pat.get("example_photographers", []):
                    if photog not in seen_refs:
                        master_refs.append(photog)
                        seen_refs.add(photog)
                break

    top_pattern = pattern_matches[0]["pattern"] if pattern_matches else "unknown"
    top_confidence = pattern_matches[0]["confidence"] if pattern_matches else 0.0

    notes.append(f"Top pattern: {top_pattern} ({top_confidence:.2f})")
    if len(pattern_matches) >= 2 and pattern_matches[1]["confidence"] > top_confidence - 0.05:
        notes.append(
            f"Close second: {pattern_matches[1]['pattern']} ({pattern_matches[1]['confidence']:.2f})"
        )

    return {
        "ok": True,
        "pattern_matches": pattern_matches,
        "top_pattern": top_pattern,
        "top_pattern_confidence": round(top_confidence, 3),
        "master_reference": master_refs,
        "notes": notes,
    }
