"""
Failure Classifier
==================
Tags each failure_event with a failure_class based on the analysis context.

Classes
-------
misclassification
    The system was confident (≥ MIN_CONFIDENT threshold) but the user
    confirmed it was wrong. The predicted pattern doesn't match reality.
    These are the most damaging failures — system looks authoritative but is off.

blueprint_failure
    Pattern identification may be correct but the blueprint (setup steps,
    light placement guidance) didn't help the user achieve the shot.
    Indicated by: steps attempted, deviation_count > 0, or failed after shoot
    mode was entered.

low_confidence
    Confidence was below the reliable threshold when the failure occurred.
    These are expected failures — the system wasn't confident and was right
    to hedge. Priority for improvement is lower than misclassification.

edge_case
    Edge case flags were present (blown highlights, mixed color temp, extreme
    low key, no face detected, etc.). The failure is likely due to input
    conditions outside the reliable operating envelope, not a model error.

SAFETY: This module only reads data and returns labels. It never writes to DB
and never modifies any configuration or rule logic.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

# Confidence above this → system was claiming high certainty.
# Failures here are "confident + wrong" = misclassification.
_MIN_CONFIDENT = 0.60

# Signal quality below this → system's inputs were unreliable.
_MIN_SIGNAL_QUALITY = 0.45

# Steps attempted threshold — indicates blueprint was tried.
_MIN_STEPS_ATTEMPTED = 1


def classify_failure(
    confidence: Optional[float],
    signal_quality: Optional[float],
    shoot_mode_entered: bool,
    steps_completed: int,
    deviation_count: int,
    edge_case_flags: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Classify a confirmed failure into one of four classes.

    Parameters mirror the fields available on failure_event + session_signal.
    Returns one of: 'misclassification' | 'blueprint_failure' |
                    'low_confidence' | 'edge_case'
    """
    flags = edge_case_flags or {}

    # ── Priority 1: Edge case — input conditions explain the failure ────────
    # Any triggered edge case flag shifts responsibility to input quality.
    # Count non-trivial flags (True boolean values on the flags dict).
    active_flags = [k for k, v in flags.items() if v is True]
    if active_flags:
        return "edge_case"

    # ── Priority 2: Low signal quality ─────────────────────────────────────
    # Underlying visual signals were unreliable — failure was predictable.
    if signal_quality is not None and signal_quality < _MIN_SIGNAL_QUALITY:
        return "low_confidence"

    # ── Priority 3: Blueprint failure ───────────────────────────────────────
    # User entered shoot mode or attempted steps but couldn't achieve the shot.
    # Pattern might be right, but the guidance failed.
    if shoot_mode_entered or steps_completed >= _MIN_STEPS_ATTEMPTED or deviation_count > 0:
        return "blueprint_failure"

    # ── Priority 4: Misclassification ──────────────────────────────────────
    # System was confident but wrong. Most impactful class to fix.
    if confidence is not None and confidence >= _MIN_CONFIDENT:
        return "misclassification"

    # ── Default: low confidence ─────────────────────────────────────────────
    # System was uncertain and the failure confirms it. Expected outcome.
    return "low_confidence"


def classify_from_event(event: Dict[str, Any]) -> str:
    """
    Convenience wrapper: classify from a failure_event dict
    (as returned by db.failures.get_failure_events).
    """
    import json
    flags_raw = event.get("edge_case_flags_json", "{}")
    if isinstance(flags_raw, str):
        try:
            flags = json.loads(flags_raw)
        except Exception:
            flags = {}
    else:
        flags = flags_raw

    raw_ctx = event.get("raw_context_json", "{}")
    if isinstance(raw_ctx, str):
        try:
            ctx = json.loads(raw_ctx)
        except Exception:
            ctx = {}
    else:
        ctx = raw_ctx

    return classify_failure(
        confidence=event.get("confidence"),
        signal_quality=event.get("signal_quality"),
        shoot_mode_entered=bool(ctx.get("shoot_mode_entered", False)),
        steps_completed=int(ctx.get("steps_completed", 0)),
        deviation_count=int(ctx.get("deviation_count", 0)),
        edge_case_flags=flags,
    )


def severity_from_class_and_confidence(
    failure_class: str,
    confidence: Optional[float],
    frequency: int,
) -> str:
    """
    Map failure class + confidence + frequency to a severity level for clusters.
    Used by the ingestion pipeline when upsert-ing failure_cluster records.
    """
    if failure_class == "misclassification":
        if frequency >= 20 or (confidence is not None and confidence >= 0.75):
            return "critical"
        if frequency >= 5:
            return "high"
        return "medium"
    if failure_class == "blueprint_failure":
        if frequency >= 30:
            return "high"
        if frequency >= 10:
            return "medium"
        return "low"
    # low_confidence and edge_case are generally lower severity
    if frequency >= 50:
        return "medium"
    return "low"
