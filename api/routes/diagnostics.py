"""Taxonomy-driven diagnostics API.

Serves structured diagnostic failure data from ``diagnostic_failures.yaml``
so the UI can replace hardcoded coaching logic with API-driven content.

Endpoints
---------
GET /api/diagnostics
    List all diagnostic failures, optionally filtered by ``pattern``.

GET /api/diagnostics/{failure_id}
    Retrieve a single diagnostic failure by ID.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from engine.taxonomy_loader import (
    get_all_diagnostics,
    get_diagnostic,
    get_diagnostics_for_pattern,
    list_known_patterns,
)

router = APIRouter()


def _humanize_id(slug: str) -> str:
    """Turn ``reduce_fill_power`` into ``Reduce fill power``."""
    return slug.replace("_", " ").capitalize()


def _enrich(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Add human-readable labels alongside the raw slug IDs."""
    return {
        **entry,
        "symptoms_display": entry.get("symptoms", []),
        "likely_causes_display": [_humanize_id(c) for c in entry.get("likely_causes", [])],
        "quick_fixes_display": [_humanize_id(f) for f in entry.get("quick_fixes", [])],
    }


@router.get("/diagnostics")
def list_diagnostics(
    pattern: Optional[str] = Query(
        None,
        description="Filter to failures affecting this lighting pattern (e.g. rembrandt, loop, butterfly).",
    ),
) -> Dict[str, Any]:
    """Return diagnostic failures, optionally filtered by pattern."""
    if pattern:
        results = get_diagnostics_for_pattern(pattern)
    else:
        results = get_all_diagnostics()

    return {
        "count": len(results),
        "pattern_filter": pattern,
        "known_patterns": list_known_patterns(),
        "diagnostics": [_enrich(d) for d in results],
    }


@router.get("/config")
def get_config() -> Dict[str, Any]:
    """Return UI option lists driven by the backend truth layer.

    Consumed by ReferenceEvalScreen so hardcoded option arrays stay in sync
    with what the engine actually accepts.
    """
    from engine.services.shoot_match_service import MOOD_MAP

    # Canonical internal mood IDs (de-dup MOOD_MAP values, sort for stability)
    mood_ids = sorted(set(MOOD_MAP.values()))
    mood_labels = {
        "beauty":    "Beauty",
        "cinematic": "Cinematic",
        "corporate": "Corporate",
        "editorial": "Editorial",
        "natural":   "Natural",
        "high_key":  "High Key",
        "low_key":   "Low Key",
    }
    moods = [
        {"value": m, "label": mood_labels.get(m, m.replace("_", " ").title())}
        for m in mood_ids
    ]

    patterns = [
        "rembrandt", "loop", "butterfly", "split", "flat", "broad",
        "short", "rim", "ring_light", "high_key", "low_key",
        "natural_window", "dramatic_key", "three_point",
    ]

    issue_types = [
        {"value": "wrong_pattern",  "label": "Pattern identified incorrectly"},
        {"value": "wrong_mood",     "label": "Mood / style misidentified"},
        {"value": "no_face",        "label": "No face found / wrong subject"},
        {"value": "confidence_low", "label": "Confidence feels too high"},
        {"value": "other",          "label": "Something else is off"},
    ]

    return {"moods": moods, "patterns": patterns, "issue_types": issue_types}


@router.get("/diagnostics/{failure_id}")
def get_single_diagnostic(failure_id: str) -> Dict[str, Any]:
    """Return a single diagnostic failure by ID."""
    entry = get_diagnostic(failure_id)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail=f"Diagnostic failure '{failure_id}' not found.",
        )
    return _enrich(entry)
