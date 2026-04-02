"""Cross-pass consistency scoring engine.

For each lighting dimension, computes pairwise agreement between all passes
that report on that dimension.  Produces a consistency score per dimension
(0.0 = complete disagreement, 1.0 = all passes agree) and an overall
consistency score.

This does NOT determine what is "correct" — that's the consensus solver's
job.  This engine only measures how much the passes agree with each other.
High consistency → confident result.  Low consistency → possible ambiguity.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from engine.coordinate_system import angular_distance, directions_agree
from engine.signal_weights import PassWeightProfile
from engine.solver_constants import AGREEMENT_TOLERANCES, MIN_VOTE_CONFIDENCE
from engine.solver_models import ConsistencyScore, PairwiseAgreement

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Signal Extractors
# ═══════════════════════════════════════════════════════════════════════════


def _extract_signals_for_dimension(
    dimension: str,
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
) -> List[Tuple[str, Any, float]]:
    """Extract (pass_name, value, effective_weight) for a dimension.

    Returns only passes that actually have data for this dimension.
    """
    signals: List[Tuple[str, Any, float]] = []

    if dimension == "direction":
        # Shadow pass
        shadow = pass_outputs.get("shadow_pass", {})
        if isinstance(shadow, dict) and shadow.get("ok") and shadow.get("shadow_vector_deg") is not None:
            from engine.coordinate_system import angle_to_canonical
            canonical = angle_to_canonical(shadow["shadow_vector_deg"], "shadow_fall")
            w = pass_weights.get_weight("shadow_pass") * shadow.get("confidence", 0.5)
            signals.append(("shadow_pass", canonical, w))

        # LDF
        ldf = pass_outputs.get("light_direction_field_pass", {})
        if isinstance(ldf, dict) and ldf.get("ok") and ldf.get("dominant_light_vector_deg") is not None:
            w = pass_weights.get_weight("light_direction_field_pass") * ldf.get("confidence", 0.5)
            signals.append(("light_direction_field_pass", ldf["dominant_light_vector_deg"], w))

        # Catchlight
        catchlight = pass_outputs.get("catchlight_pass", {})
        if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("primary_clock_position") is not None:
            from engine.coordinate_system import angle_to_canonical
            canonical = angle_to_canonical(float(catchlight["primary_clock_position"]), "catchlight_clock")
            w = pass_weights.get_weight("catchlight_pass") * catchlight.get("confidence", 0.5)
            signals.append(("catchlight_pass", canonical, w))

    elif dimension == "height":
        shadow = pass_outputs.get("shadow_pass", {})
        if isinstance(shadow, dict) and shadow.get("ok") and shadow.get("shadow_vertical_angle_deg") is not None:
            from engine.coordinate_system import elevation_to_height_class
            h_class = elevation_to_height_class(shadow["shadow_vertical_angle_deg"])
            w = pass_weights.get_weight("shadow_pass") * shadow.get("confidence", 0.5)
            signals.append(("shadow_pass", h_class, w))

        catchlight = pass_outputs.get("catchlight_pass", {})
        if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("primary_clock_position") is not None:
            clock = int(catchlight["primary_clock_position"]) % 12 or 12
            if clock in (10, 11, 12, 1, 2):
                h_class = "high"
            elif clock in (3, 9):
                h_class = "eye_level"
            else:
                h_class = "low"
            w = pass_weights.get_weight("catchlight_pass") * catchlight.get("confidence", 0.5)
            signals.append(("catchlight_pass", h_class, w))

    elif dimension == "modifier_family":
        mod = pass_outputs.get("modifier_shape_solver_pass", {})
        if isinstance(mod, dict) and mod.get("ok") and mod.get("primary_modifier", "unknown") != "unknown":
            w = pass_weights.get_weight("modifier_shape_solver_pass") * mod.get("confidence", 0.5)
            signals.append(("modifier_shape_solver_pass", mod["primary_modifier"], w))

        pen = pass_outputs.get("shadow_penumbra_pass", {})
        if isinstance(pen, dict) and pen.get("ok"):
            source_size = pen.get("estimated_source_size_class", "unknown")
            size_to_mod = {"small": "bare", "medium": "beauty_dish", "large": "softbox", "very_large": "umbrella"}
            mod_est = size_to_mod.get(source_size, "unknown")
            if mod_est != "unknown":
                w = pass_weights.get_weight("shadow_penumbra_pass") * pen.get("confidence", 0.5)
                signals.append(("shadow_penumbra_pass", mod_est, w))

    elif dimension == "light_count":
        hyp = pass_outputs.get("lighting_hypothesis_engine", {})
        if isinstance(hyp, dict) and hyp.get("ok") and hyp.get("likely_light_count") is not None:
            w = pass_weights.get_weight("lighting_hypothesis_engine") * hyp.get("confidence", 0.5)
            signals.append(("lighting_hypothesis_engine", hyp["likely_light_count"], w))

        catchlight = pass_outputs.get("catchlight_pass", {})
        if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("catchlight_count", 0) > 0:
            w = pass_weights.get_weight("catchlight_pass") * catchlight.get("confidence", 0.5)
            signals.append(("catchlight_pass", catchlight["catchlight_count"], w))

    elif dimension == "environment":
        env = pass_outputs.get("environment_light_pass", {})
        if isinstance(env, dict) and env.get("ok") and env.get("environment_type", "unknown") != "unknown":
            w = pass_weights.get_weight("environment_light_pass") * env.get("confidence", 0.5)
            signals.append(("environment_light_pass", env["environment_type"], w))

        solar = pass_outputs.get("solar_geometry_pass", {})
        if isinstance(solar, dict) and solar.get("ok") and solar.get("sun_detected"):
            w = pass_weights.get_weight("solar_geometry_pass") * solar.get("confidence", 0.5)
            signals.append(("solar_geometry_pass", "outdoor_sun", w))

    elif dimension == "color_temperature":
        ct = pass_outputs.get("color_temperature_pass", {})
        if isinstance(ct, dict) and ct.get("ok") and ct.get("dominant_cct_kelvin") is not None:
            w = pass_weights.get_weight("color_temperature_pass") * ct.get("confidence", 0.5)
            signals.append(("color_temperature_pass", ct["dominant_cct_kelvin"], w))

    return signals


# ═══════════════════════════════════════════════════════════════════════════
# Pairwise Agreement
# ═══════════════════════════════════════════════════════════════════════════


def _values_agree(
    dimension: str, value_a: Any, value_b: Any
) -> Tuple[bool, float]:
    """Check if two values agree within the dimension's tolerance.

    Returns (agrees, distance) where distance is a measure of difference.
    """
    tolerance = AGREEMENT_TOLERANCES.get(dimension, 0.0)

    if dimension == "direction":
        dist = angular_distance(float(value_a), float(value_b))
        return (dist <= tolerance, dist)

    if dimension in ("height", "modifier_family", "environment"):
        # Categorical: must match exactly
        agrees = str(value_a).lower() == str(value_b).lower()
        return (agrees, 0.0 if agrees else 1.0)

    if dimension in ("light_count", "color_temperature"):
        # Numeric: within tolerance
        diff = abs(float(value_a) - float(value_b))
        return (diff <= tolerance, diff)

    # Unknown dimension — strict match
    return (value_a == value_b, 0.0 if value_a == value_b else 1.0)


def _compute_pairwise(
    dimension: str,
    signals: List[Tuple[str, Any, float]],
) -> Tuple[List[PairwiseAgreement], List[PairwiseAgreement]]:
    """Compute all pairwise agreements for a dimension.

    Returns (agreements, conflicts).
    """
    agreements: List[PairwiseAgreement] = []
    conflicts: List[PairwiseAgreement] = []

    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            name_a, val_a, _ = signals[i]
            name_b, val_b, _ = signals[j]
            agrees, dist = _values_agree(dimension, val_a, val_b)

            pa = PairwiseAgreement(
                pass_a=name_a,
                pass_b=name_b,
                dimension=dimension,
                value_a=val_a,
                value_b=val_b,
                agrees=agrees,
                distance=round(dist, 2),
            )

            if agrees:
                agreements.append(pa)
            else:
                conflicts.append(pa)

    return agreements, conflicts


# ═══════════════════════════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════════════════════════

CHECKED_DIMENSIONS = [
    "direction",
    "height",
    "modifier_family",
    "light_count",
    "environment",
    "color_temperature",
]


def score_consistency(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
) -> List[ConsistencyScore]:
    """Score cross-pass consistency for all dimensions.

    Parameters
    ----------
    pass_outputs : dict
        All pass result dicts, keyed by pass name.
    pass_weights : PassWeightProfile
        Adjusted weights per pass.

    Returns
    -------
    List[ConsistencyScore]
        One score per dimension.
    """
    scores: List[ConsistencyScore] = []

    for dimension in CHECKED_DIMENSIONS:
        signals = _extract_signals_for_dimension(dimension, pass_outputs, pass_weights)

        if len(signals) < 2:
            # Need at least 2 passes to compare
            _s = 1.0 if len(signals) == 1 else 0.0
            scores.append(ConsistencyScore(
                dimension=dimension,
                score=_s,
                overall_score=_s,
                total_pairs=0,
                agreeing_pairs=0,
                notes=[f"Only {len(signals)} pass(es) report {dimension}"],
            ))
            continue

        agreements, conflicts = _compute_pairwise(dimension, signals)
        total_pairs = len(agreements) + len(conflicts)
        agreeing_pairs = len(agreements)

        # Weighted score: weight each pair by their effective weights
        if total_pairs > 0:
            score = agreeing_pairs / total_pairs
        else:
            score = 0.0

        scores.append(ConsistencyScore(
            dimension=dimension,
            score=round(score, 3),
            overall_score=round(score, 3),
            total_pairs=total_pairs,
            agreeing_pairs=agreeing_pairs,
            agreements=agreements,
            conflicts=conflicts,
        ))

    return scores


def overall_consistency(scores: List[ConsistencyScore]) -> float:
    """Compute single overall consistency score from per-dimension scores.

    Weighted average where dimensions with more pairs get higher weight.
    """
    if not scores:
        return 0.0

    # Weight by number of pairs (more pairs = more informative)
    weights = [max(s.total_pairs, 1) for s in scores]
    values = [s.score for s in scores]

    total_w = sum(weights)
    if total_w <= 0:
        return 0.0

    return round(sum(v * w for v, w in zip(values, weights)) / total_w, 3)
