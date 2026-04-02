"""Hypothesis validator — compare simulated outcomes to observed signals.

Given a hypothesis and the observed pipeline signals, score how well the
hypothesis explains what we actually see in the image.

Scores five consistency dimensions:
    - direction_consistency: shadow/highlight direction match
    - height_consistency: vertical angle / catchlight position match
    - modifier_consistency: penumbra width / softness match
    - distance_consistency: falloff / softness match
    - environment_consistency: color temp / bounce / background match

Usage::

    from engine.hypothesis_validator import validate_hypothesis

    score = validate_hypothesis(hypothesis, prediction, observed_signals)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.coordinate_system import angular_distance
from engine.solver_models import (
    DimensionMatch,
    LightingHypothesis,
    SimulationPrediction,
    ValidationScore,
)


# ═══════════════════════════════════════════════════════════════════════════
# Tolerances
# ═══════════════════════════════════════════════════════════════════════════

_DIRECTION_PERFECT_DEG = 15.0    # within 15° = perfect match
_DIRECTION_ACCEPTABLE_DEG = 45.0  # within 45° = partial match
_DIRECTION_MAX_DEG = 180.0

_DIMENSION_WEIGHTS = {
    "direction": 0.30,
    "height": 0.20,
    "modifier": 0.20,
    "fill_visibility": 0.15,
    "background": 0.15,
}


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

def validate_hypothesis(
    hypothesis: LightingHypothesis,
    prediction: SimulationPrediction,
    observed_signals: Dict[str, Any],
) -> ValidationScore:
    """Compare a simulated prediction against observed signals.

    Args:
        hypothesis: The lighting hypothesis being validated
        prediction: Forward-model prediction from the simulator
        observed_signals: Dict of observed values from pipeline passes.
            Expected keys (all optional):
                shadow_direction_deg: float
                shadow_softness: str (hard/soft/mixed)
                highlight_direction_deg: float
                catchlight_clock: int (1-12)
                height_class: str
                fill_visibility: str (none/subtle/moderate/strong)
                background_illumination: str (dark/gradient/even/lit)
                environment: str

    Returns:
        ValidationScore with per-dimension match scores and overall.
    """
    matches: List[DimensionMatch] = []
    mismatches: List[str] = []

    # ── Direction consistency ──
    dm = _check_direction(prediction, observed_signals)
    if dm:
        matches.append(dm)
        if dm.match_score < 0.5:
            mismatches.append(
                f"Direction: predicted {dm.predicted}° vs observed {dm.observed}° "
                f"(distance {dm.distance:.0f}°)"
            )

    # ── Height consistency ──
    hm = _check_height(prediction, observed_signals)
    if hm:
        matches.append(hm)
        if hm.match_score < 0.5:
            mismatches.append(
                f"Height: predicted clock {hm.predicted} vs observed {hm.observed}"
            )

    # ── Modifier / softness consistency ──
    mm = _check_modifier(prediction, observed_signals)
    if mm:
        matches.append(mm)
        if mm.match_score < 0.5:
            mismatches.append(
                f"Softness: predicted {mm.predicted} vs observed {mm.observed}"
            )

    # ── Fill visibility ──
    fm = _check_fill(prediction, observed_signals)
    if fm:
        matches.append(fm)
        if fm.match_score < 0.5:
            mismatches.append(
                f"Fill: predicted {fm.predicted} vs observed {fm.observed}"
            )

    # ── Background ──
    bm = _check_background(prediction, observed_signals)
    if bm:
        matches.append(bm)
        if bm.match_score < 0.5:
            mismatches.append(
                f"Background: predicted {bm.predicted} vs observed {bm.observed}"
            )

    # ── Weighted overall score ──
    overall = _weighted_overall(matches)

    return ValidationScore(
        hypothesis_id=hypothesis.hypothesis_id,
        overall_score=overall,
        per_dimension=matches,
        mismatches=mismatches,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Per-dimension checkers
# ═══════════════════════════════════════════════════════════════════════════

def _check_direction(
    pred: SimulationPrediction,
    obs: Dict[str, Any],
) -> Optional[DimensionMatch]:
    """Compare predicted vs observed shadow/highlight direction."""
    # Try shadow direction first, then highlight
    pred_dir = pred.predicted_shadow_direction_deg
    obs_dir = obs.get("shadow_direction_deg")

    if pred_dir is None and pred.predicted_highlight_direction_deg is not None:
        pred_dir = pred.predicted_highlight_direction_deg
        obs_dir = obs.get("highlight_direction_deg", obs_dir)

    if pred_dir is None or obs_dir is None:
        return None

    dist = angular_distance(pred_dir, obs_dir)
    if dist <= _DIRECTION_PERFECT_DEG:
        score = 1.0
    elif dist <= _DIRECTION_ACCEPTABLE_DEG:
        score = 1.0 - (dist - _DIRECTION_PERFECT_DEG) / (_DIRECTION_ACCEPTABLE_DEG - _DIRECTION_PERFECT_DEG) * 0.5
    else:
        score = max(0.0, 0.5 - (dist - _DIRECTION_ACCEPTABLE_DEG) / (_DIRECTION_MAX_DEG - _DIRECTION_ACCEPTABLE_DEG) * 0.5)

    return DimensionMatch(
        dimension="direction",
        predicted=pred_dir,
        observed=obs_dir,
        match_score=round(score, 3),
        distance=dist,
    )


def _check_height(
    pred: SimulationPrediction,
    obs: Dict[str, Any],
) -> Optional[DimensionMatch]:
    """Compare predicted catchlight clock vs observed height indicators."""
    pred_clock = pred.predicted_catchlight_clock
    obs_clock = obs.get("catchlight_clock")
    obs_height = obs.get("height_class")

    if pred_clock is not None and obs_clock is not None:
        # Clock distance (wraparound)
        diff = abs(pred_clock - obs_clock)
        diff = min(diff, 12 - diff)
        score = max(0.0, 1.0 - diff / 3.0)  # 3 hours apart = 0
        return DimensionMatch(
            dimension="height",
            predicted=pred_clock,
            observed=obs_clock,
            match_score=round(score, 3),
            distance=float(diff),
        )

    if obs_height:
        # Can't compare directly without height prediction
        return DimensionMatch(
            dimension="height",
            predicted="inferred_from_clock",
            observed=obs_height,
            match_score=0.5,  # neutral — not enough to compare
            distance=0.0,
            notes="Height comparison via clock position not available",
        )

    return None


def _check_modifier(
    pred: SimulationPrediction,
    obs: Dict[str, Any],
) -> Optional[DimensionMatch]:
    """Compare predicted shadow softness vs observed softness."""
    pred_soft = pred.predicted_shadow_softness
    obs_soft = obs.get("shadow_softness")

    if not pred_soft or pred_soft == "unknown" or not obs_soft or obs_soft == "unknown":
        return None

    if pred_soft == obs_soft:
        score = 1.0
    elif {pred_soft, obs_soft} == {"hard", "soft"}:
        score = 0.0  # complete mismatch
    else:
        score = 0.5  # one is "mixed"

    return DimensionMatch(
        dimension="modifier",
        predicted=pred_soft,
        observed=obs_soft,
        match_score=score,
        distance=0.0 if pred_soft == obs_soft else 1.0,
    )


def _check_fill(
    pred: SimulationPrediction,
    obs: Dict[str, Any],
) -> Optional[DimensionMatch]:
    """Compare predicted vs observed fill visibility."""
    pred_fill = pred.predicted_fill_visibility
    obs_fill = obs.get("fill_visibility")

    if not pred_fill or pred_fill == "unknown" or not obs_fill or obs_fill == "unknown":
        return None

    order = ["none", "subtle", "moderate", "strong"]
    pred_idx = order.index(pred_fill) if pred_fill in order else -1
    obs_idx = order.index(obs_fill) if obs_fill in order else -1

    if pred_idx < 0 or obs_idx < 0:
        return None

    diff = abs(pred_idx - obs_idx)
    score = max(0.0, 1.0 - diff / 3.0)

    return DimensionMatch(
        dimension="fill_visibility",
        predicted=pred_fill,
        observed=obs_fill,
        match_score=round(score, 3),
        distance=float(diff),
    )


def _check_background(
    pred: SimulationPrediction,
    obs: Dict[str, Any],
) -> Optional[DimensionMatch]:
    """Compare predicted vs observed background illumination."""
    pred_bg = pred.predicted_background_illumination
    obs_bg = obs.get("background_illumination")

    if not pred_bg or pred_bg == "unknown" or not obs_bg or obs_bg == "unknown":
        return None

    if pred_bg == obs_bg:
        score = 1.0
    elif {pred_bg, obs_bg} <= {"dark", "gradient"}:
        score = 0.6  # close enough
    elif {pred_bg, obs_bg} <= {"gradient", "even"}:
        score = 0.6
    elif {pred_bg, obs_bg} <= {"even", "lit"}:
        score = 0.7
    else:
        score = 0.2

    return DimensionMatch(
        dimension="background",
        predicted=pred_bg,
        observed=obs_bg,
        match_score=round(score, 3),
        distance=0.0 if pred_bg == obs_bg else 1.0,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Score aggregation
# ═══════════════════════════════════════════════════════════════════════════

def _weighted_overall(matches: List[DimensionMatch]) -> float:
    """Compute weighted overall score from per-dimension matches."""
    if not matches:
        return 0.0

    total_weight = 0.0
    weighted_sum = 0.0

    for m in matches:
        w = _DIMENSION_WEIGHTS.get(m.dimension, 0.1)
        total_weight += w
        weighted_sum += w * m.match_score

    return round(weighted_sum / total_weight, 3) if total_weight > 0 else 0.0
