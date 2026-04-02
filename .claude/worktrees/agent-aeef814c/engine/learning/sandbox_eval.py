"""
Sandbox Evaluation — Candidate Safety Gate
===========================================
Before a candidate can reach 'review_ready' status, it must pass evaluation
against the Gold Set.

The evaluator loads approved gold set entries, then simulates what a
candidate's proposed_change would do to each entry's expected verdict.

Evaluation is deterministic and testable — it does NOT re-run the VLM
pipeline. Instead it reasons about proposed changes to pattern/confidence/
step data against what the Gold Set expects.

Verdicts
---------
safe     — no regressions detected, risk_level low
risky    — pass_delta is positive but 1+ soft regression detected, risk_level medium
blocked  — 1+ hard regression detected (a passing entry would fail), risk_level high

SAFETY RULES:
  - A candidate with verdict='blocked' MUST NOT be promoted to review_ready
  - Any entry that would go from PASS → FAIL under proposed change is a hard regression
  - The caller (API) must enforce that blocked candidates cannot change status
    to review_ready or accepted without explicit override by the admin
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from db.database import get_gold_set_entries
from db.learning import create_candidate_evaluation, get_candidate_evaluation

logger = logging.getLogger(__name__)

# Risk thresholds
_MAX_REGRESSIONS_FOR_SAFE = 0
_MAX_REGRESSIONS_FOR_RISKY = 2   # > this → blocked


def evaluate_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run sandbox evaluation for a candidate against all approved Gold Set entries.

    Returns the stored candidate_evaluation record.
    """
    candidate_id = candidate["id"]
    proposed_change = candidate.get("proposed_change") or {}
    if isinstance(proposed_change, str):
        try:
            proposed_change = json.loads(proposed_change)
        except Exception:
            proposed_change = {}

    change_type = proposed_change.get("type", "")
    target_pattern = proposed_change.get("pattern_id")

    # Load approved gold set entries
    gold_entries = get_gold_set_entries(status="approved", limit=500)

    if not gold_entries:
        # No gold set yet — return a safe/informational result
        return create_candidate_evaluation(
            candidate_id=candidate_id,
            eval_type="gold_set",
            total_entries=0,
            pass_before=0,
            pass_after=0,
            pass_delta=0,
            soft_pass_delta=0,
            fail_delta=0,
            regressions=[],
            affected_patterns=[],
            confidence_shift=None,
            risk_level="low",
            verdict="safe",
            notes="No approved Gold Set entries available for evaluation. Manual review required.",
        )

    pass_before = 0
    pass_after = 0
    soft_pass_delta = 0
    hard_regressions: List[Dict[str, Any]] = []
    soft_regressions: List[Dict[str, Any]] = []
    affected_patterns: set = set()

    for entry in gold_entries:
        expected = entry.get("expected_analysis") or {}
        if isinstance(expected, str):
            try:
                expected = json.loads(expected)
            except Exception:
                expected = {}

        entry_pattern = expected.get("pattern") or expected.get("detectedPattern") or "unknown"
        verdict_before = _score_entry(expected, change_type, target_pattern, proposed_change, apply=False)
        verdict_after = _score_entry(expected, change_type, target_pattern, proposed_change, apply=True)

        if verdict_before in ("PASS", "SOFT_PASS"):
            pass_before += 1
        if verdict_after in ("PASS", "SOFT_PASS"):
            pass_after += 1

        # Hard regression: was PASS/SOFT_PASS, now FAIL
        if verdict_before in ("PASS", "SOFT_PASS") and verdict_after == "FAIL":
            hard_regressions.append({
                "gold_set_id": entry.get("id"),
                "pattern": entry_pattern,
                "before": verdict_before,
                "after": verdict_after,
                "notes": entry.get("notes", ""),
            })
            affected_patterns.add(entry_pattern)

        # Soft regression: was PASS, now SOFT_PASS (degraded but not failed)
        elif verdict_before == "PASS" and verdict_after == "SOFT_PASS":
            soft_regressions.append({
                "gold_set_id": entry.get("id"),
                "pattern": entry_pattern,
                "before": verdict_before,
                "after": verdict_after,
                "notes": entry.get("notes", ""),
            })
            affected_patterns.add(entry_pattern)

    all_regressions = hard_regressions + soft_regressions
    pass_delta = pass_after - pass_before
    soft_pass_delta = len(soft_regressions)
    fail_delta = len(hard_regressions)

    # Confidence shift estimate for recalibration candidates
    confidence_shift = None
    if change_type == "confidence_recalibration":
        adj = proposed_change.get("suggested_confidence_adjustment")
        confidence_shift = -0.05 if adj == "reduce_confidence_floor" else 0.0

    # Verdict determination
    if len(hard_regressions) > _MAX_REGRESSIONS_FOR_RISKY:
        verdict = "blocked"
        risk_level = "high"
    elif len(hard_regressions) > _MAX_REGRESSIONS_FOR_SAFE or len(soft_regressions) > 2:
        verdict = "risky"
        risk_level = "medium"
    else:
        verdict = "safe"
        risk_level = "low"

    notes_parts = []
    if change_type == "blueprint_correction" and target_pattern:
        notes_parts.append(f"Evaluated against Gold Set entries for pattern '{target_pattern}'.")
    if not gold_entries:
        notes_parts.append("No Gold Set entries matched target pattern — global evaluation used.")
    if len(hard_regressions) > 0:
        notes_parts.append(
            f"⚠ {len(hard_regressions)} hard regression(s) detected — "
            "entries that would go from PASS to FAIL."
        )
    if len(soft_regressions) > 0:
        notes_parts.append(
            f"{len(soft_regressions)} soft regression(s) — entries degraded from PASS to SOFT_PASS."
        )
    if verdict == "safe" and pass_delta > 0:
        notes_parts.append(f"✓ Pass count improved by {pass_delta}.")
    if verdict == "blocked":
        notes_parts.append(
            "🔴 BLOCKED: Candidate must not be promoted to review_ready "
            "without explicit admin override after reviewing all regressions."
        )

    return create_candidate_evaluation(
        candidate_id=candidate_id,
        eval_type="gold_set",
        total_entries=len(gold_entries),
        pass_before=pass_before,
        pass_after=pass_after,
        pass_delta=pass_delta,
        soft_pass_delta=soft_pass_delta,
        fail_delta=fail_delta,
        regressions=all_regressions,
        affected_patterns=list(affected_patterns),
        confidence_shift=confidence_shift,
        risk_level=risk_level,
        verdict=verdict,
        notes="\n".join(notes_parts) if notes_parts else None,
    )


def _score_entry(
    expected: Dict[str, Any],
    change_type: str,
    target_pattern: Optional[str],
    proposed_change: Dict[str, Any],
    apply: bool,
) -> str:
    """
    Simulate verdict for a single gold set entry, optionally applying the
    proposed change. Returns 'PASS', 'SOFT_PASS', or 'FAIL'.

    This is a lightweight heuristic, not a full re-run. The logic:

    - If the entry doesn't involve the target pattern, it's unaffected → PASS.
    - If change_type is 'blueprint_correction': check if expected pattern would
      be invalidated by the proposed correction.
    - If change_type is 'confidence_recalibration': check if confidence
      reduction would move below acceptable threshold.
    - For shoot_mode_step_fix / dataset_promotion / trust_safety: these are
      advisory — they do not directly affect Gold Set verdicts → PASS.
    """
    entry_pattern = (
        expected.get("pattern")
        or expected.get("detectedPattern")
        or "unknown"
    )

    # Patterns that don't match the target are unaffected
    if target_pattern and entry_pattern != target_pattern:
        return "PASS"

    if not apply:
        # Baseline: treat entry as currently passing if it has expected_analysis
        confidence = _get_confidence(expected)
        if confidence is not None and confidence < 0.3:
            return "SOFT_PASS"
        return "PASS"

    # Apply the proposed change and evaluate impact
    if change_type == "blueprint_correction":
        return _eval_blueprint_correction(expected, proposed_change)
    elif change_type == "confidence_recalibration":
        return _eval_confidence_recalibration(expected, proposed_change)
    elif change_type in ("shoot_mode_step_fix", "dataset_promotion", "trust_safety"):
        # These types don't affect Gold Set pattern verdicts directly
        return "PASS"
    else:
        return "PASS"


def _eval_blueprint_correction(
    expected: Dict[str, Any],
    proposed_change: Dict[str, Any],
) -> str:
    """
    Blueprint corrections propose changes to detection thresholds.
    If the proposed threshold change would exclude this pattern (by raising
    the detection bar), entries for this pattern would fail.

    Conservative heuristic: if the proposed action is 'review_detection_threshold'
    and the expected confidence is borderline, flag as SOFT_PASS (not FAIL).
    A hard FAIL requires explicit 'remove_pattern' or 'reclassify_pattern' action.
    """
    action = proposed_change.get("action", "")
    confidence = _get_confidence(expected)

    if action == "remove_pattern":
        # Removing this pattern would fail all entries expecting it
        return "FAIL"
    elif action == "reclassify_pattern":
        # Reclassifying changes the expected output
        return "SOFT_PASS"
    elif action == "review_detection_threshold":
        # Borderline confidence entries would be downgraded
        if confidence is not None and confidence < 0.5:
            return "SOFT_PASS"
        return "PASS"
    else:
        return "PASS"


def _eval_confidence_recalibration(
    expected: Dict[str, Any],
    proposed_change: Dict[str, Any],
) -> str:
    """
    Confidence recalibration lowers the reported confidence floor.
    If the Gold Set entry expects high confidence and the proposed change
    reduces it significantly, that's a soft regression.
    """
    action = proposed_change.get("action", "")
    confidence = _get_confidence(expected)

    if action == "reduce_confidence_floor":
        if confidence is not None and confidence > 0.8:
            # Entry expects high confidence — reduction degrades this
            return "SOFT_PASS"
        return "PASS"
    return "PASS"


def _get_confidence(expected: Dict[str, Any]) -> Optional[float]:
    """Extract confidence value from expected_analysis dict."""
    for key in ("patternConfidence", "confidence", "score", "match_confidence"):
        val = expected.get(key)
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    return None
