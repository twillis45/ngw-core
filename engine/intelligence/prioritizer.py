"""
Intelligence Prioritization Engine
=====================================
Ranks patterns and candidates based on:
  1. Pattern intelligence score (lower = higher priority)
  2. Usage volume (higher usage = more impact from a fix)
  3. Conversion impact (high-volume patterns affect revenue directly)
  4. Failure severity (confidently-wrong patterns penalized heavily)

Focus: confidently wrong + high-usage patterns first.
Output: ordered action list suitable for the autonomy engine.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Priority scoring ───────────────────────────────────────────────────────────

def _priority_score(
    intel_score: float,
    usage_count: int,
    high_conf_missed_rate: float,
    missed_it_rate: float,
    total_usage_fleet: int,
) -> float:
    """
    Internal numeric priority score (higher = act sooner).

    Components:
      - intelligence_gap    : (100 - intel_score) / 100     [0–1, weight 0.40]
      - usage_weight        : usage_count / total_usage      [0–1, weight 0.25]
      - confident_failure   : high_conf_missed_rate           [0–1, weight 0.25]
      - raw_failure_rate    : missed_it_rate                  [0–1, weight 0.10]
    """
    if total_usage_fleet == 0:
        usage_weight = 0.0
    else:
        usage_weight = min(1.0, usage_count / total_usage_fleet)

    intelligence_gap = (100.0 - intel_score) / 100.0

    return (
        intelligence_gap    * 0.40
        + usage_weight      * 0.25
        + high_conf_missed_rate * 0.25
        + missed_it_rate    * 0.10
    )


def prioritize_patterns(
    pattern_scores: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Accept the output of score.compute_pattern_scores() and return the same
    list with 'priority_score' added, sorted highest-priority first.
    Only includes patterns with sufficient_data=True.
    """
    eligible = [p for p in pattern_scores if p.get("sufficient_data", True)]
    if not eligible:
        return []

    total_usage = sum(p.get("usage_count", 0) for p in eligible)

    prioritized = []
    for p in eligible:
        ps = _priority_score(
            intel_score=p.get("score", 50),
            usage_count=p.get("usage_count", 0),
            high_conf_missed_rate=p.get("high_conf_missed_rate", 0),
            missed_it_rate=p.get("missed_it_rate", 0),
            total_usage_fleet=total_usage,
        )
        prioritized.append({**p, "priority_score": round(ps, 4)})

    prioritized.sort(key=lambda p: -p["priority_score"])
    return prioritized


# ── Candidate ranking ──────────────────────────────────────────────────────────

def rank_candidates(
    candidates: List[Dict[str, Any]],
    pattern_scores: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Re-rank rule_candidates by the intelligence priority of their target pattern.
    Candidates targeting critical/high-priority patterns bubble to the top.

    `candidates` should be a list of dicts as returned by db.database.get_rule_candidates().
    `pattern_scores` should be from score.compute_pattern_scores().
    """
    score_map = {p["pattern"]: p for p in pattern_scores}
    total_usage = sum(p.get("usage_count", 0) for p in pattern_scores)

    ranked = []
    for c in candidates:
        # Try to match candidate to a pattern via description/proposed_change
        pattern = _extract_pattern_from_candidate(c)
        pdata   = score_map.get(pattern, {})

        ps = _priority_score(
            intel_score=pdata.get("score", 50),
            usage_count=pdata.get("usage_count", 0),
            high_conf_missed_rate=pdata.get("high_conf_missed_rate", 0),
            missed_it_rate=pdata.get("missed_it_rate", 0),
            total_usage_fleet=total_usage,
        )
        ranked.append({
            **c,
            "intelligence_priority_score": round(ps, 4),
            "target_pattern_score": pdata.get("score"),
            "target_pattern_priority": pdata.get("priority_level"),
        })

    ranked.sort(key=lambda c: -c["intelligence_priority_score"])
    return ranked


def _extract_pattern_from_candidate(candidate: Dict[str, Any]) -> str:
    """
    Extract the target pattern name from a rule_candidate dict.
    Tries proposed_change JSON first, then cluster_id prefix, then description.
    Returns empty string if not found.
    """
    import json
    proposed = candidate.get("proposed_change") or ""
    if isinstance(proposed, str):
        try:
            proposed = json.loads(proposed)
        except Exception:
            pass
    if isinstance(proposed, dict):
        for key in ("pattern", "target_pattern", "lighting_pattern"):
            if key in proposed:
                return proposed[key]

    desc = candidate.get("description") or ""
    # Heuristic: first word of description is often the pattern name
    return desc.split()[0].lower() if desc else ""


# ── Impact summary ────────────────────────────────────────────────────────────

def build_impact_summary(
    prioritized_patterns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Return a high-level summary of where the biggest intelligence wins are.
    """
    if not prioritized_patterns:
        return {"total_patterns": 0, "critical": 0, "high": 0, "medium": 0, "monitor": 0}

    counts: Dict[str, int] = {"p1_critical": 0, "p2_high": 0, "p3_medium": 0, "p4_monitor": 0}
    for p in prioritized_patterns:
        lvl = p.get("priority_level", "p4_monitor")
        counts[lvl] = counts.get(lvl, 0) + 1

    top3 = prioritized_patterns[:3]

    return {
        "total_patterns": len(prioritized_patterns),
        "critical":       counts.get("p1_critical", 0),
        "high":           counts.get("p2_high", 0),
        "medium":         counts.get("p3_medium", 0),
        "monitor":        counts.get("p4_monitor", 0),
        "top_priorities": [
            {
                "pattern":       p["pattern"],
                "score":         p["score"],
                "priority_level": p["priority_level"],
                "usage_count":   p["usage_count"],
                "missed_it_rate": p["missed_it_rate"],
            }
            for p in top3
        ],
    }
