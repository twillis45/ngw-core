"""Dominant-source consensus solver.

Collects all pass signals that speak to each lighting dimension (direction,
height, distance, modifier, light_count, environment) and computes a
weighted consensus.  Uses circular mean for direction, categorical vote
for discrete dimensions, and weighted median for numeric dimensions.

The consensus is NOT a final answer — it's the "most likely" interpretation
weighted by pass reliability.  The hypothesis solver uses this as a starting
point and generates alternatives where contradictions exist.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from engine.coordinate_system import (
    angle_to_canonical,
    direction_label_to_azimuth,
    elevation_to_height_class,
    weighted_circular_mean,
)
from engine.signal_weights import (
    PassWeightProfile,
    filter_by_weight_and_confidence,
    weighted_average,
    weighted_categorical_vote,
)
from engine.solver_constants import MIN_VOTE_CONFIDENCE, MIN_VOTE_WEIGHT
from engine.solver_models import (
    ConsensusResult,
    ConsensusVote,
    DimensionConsensus,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Pass Signal Extractors
# ═══════════════════════════════════════════════════════════════════════════
# Each function extracts a specific dimension's value from a pass output dict.


def _extract_direction_votes(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> List[ConsensusVote]:
    """Extract direction votes from passes that report light direction."""
    votes: List[ConsensusVote] = []

    # Shadow pass → key direction (invert shadow fall direction)
    shadow = pass_outputs.get("shadow_pass", {})
    if isinstance(shadow, dict) and shadow.get("ok"):
        shadow_deg = shadow.get("shadow_vector_deg")
        if shadow_deg is not None:
            canonical_deg = angle_to_canonical(shadow_deg, "shadow_fall")
            w = pass_weights.get_weight("shadow_pass")
            conf = shadow.get("confidence", 0.5)
            votes.append(ConsensusVote(
                pass_name="shadow_pass",
                value=canonical_deg,
                weight=w,
                confidence=conf,
            ))

    # Light direction field pass
    ldf = pass_outputs.get("light_direction_field_pass", {})
    if isinstance(ldf, dict) and ldf.get("ok"):
        ldf_deg = ldf.get("dominant_light_vector_deg")
        if ldf_deg is not None:
            w = pass_weights.get_weight("light_direction_field_pass")
            conf = ldf.get("vector_consistency", ldf.get("confidence", 0.5))
            votes.append(ConsensusVote(
                pass_name="light_direction_field_pass",
                value=ldf_deg,
                weight=w,
                confidence=conf,
            ))

    # Catchlight pass → key direction from catchlight position
    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok"):
        cl_clock = catchlight.get("primary_clock_position")
        if cl_clock is not None:
            canonical_deg = angle_to_canonical(float(cl_clock), "catchlight_clock")
            w = pass_weights.get_weight("catchlight_pass")
            conf = catchlight.get("confidence", 0.5)
            votes.append(ConsensusVote(
                pass_name="catchlight_pass",
                value=canonical_deg,
                weight=w,
                confidence=conf,
            ))

    # Cue inference geometry → key light direction
    if cue_inference:
        geometry = cue_inference.get("geometry")
        if geometry and hasattr(geometry, "key_light_direction"):
            label = geometry.key_light_direction
            az = direction_label_to_azimuth(label)
            if az is not None:
                votes.append(ConsensusVote(
                    pass_name="cue_inference_geometry",
                    value=az,
                    weight=0.7,
                    confidence=getattr(geometry, "confidence", 0.5),
                ))

    return votes


def _extract_height_votes(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> List[ConsensusVote]:
    """Extract height class votes from passes."""
    votes: List[ConsensusVote] = []

    # Shadow pass vertical angle
    shadow = pass_outputs.get("shadow_pass", {})
    if isinstance(shadow, dict) and shadow.get("ok"):
        vert = shadow.get("shadow_vertical_angle_deg")
        if vert is not None:
            h_class = elevation_to_height_class(vert)
            w = pass_weights.get_weight("shadow_pass")
            votes.append(ConsensusVote(
                pass_name="shadow_pass",
                value=h_class,
                weight=w,
                confidence=shadow.get("confidence", 0.5),
            ))

    # Catchlight vertical position
    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok"):
        cl_clock = catchlight.get("primary_clock_position")
        if cl_clock is not None:
            # Clock 10-2 = high, 3/9 = eye level, 4-8 = low
            clock = int(cl_clock) % 12 or 12
            if clock in (10, 11, 12, 1, 2):
                h_class = "high"
            elif clock in (3, 9):
                h_class = "eye_level"
            else:
                h_class = "low"
            w = pass_weights.get_weight("catchlight_pass")
            votes.append(ConsensusVote(
                pass_name="catchlight_pass",
                value=h_class,
                weight=w,
                confidence=catchlight.get("confidence", 0.5),
            ))

    # Cue inference geometry height
    if cue_inference:
        geometry = cue_inference.get("geometry")
        if geometry and hasattr(geometry, "key_light_height"):
            h = geometry.key_light_height
            if h != "unknown":
                votes.append(ConsensusVote(
                    pass_name="cue_inference_geometry",
                    value=h,
                    weight=0.7,
                    confidence=getattr(geometry, "confidence", 0.5),
                ))

    return votes


def _extract_modifier_votes(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> List[ConsensusVote]:
    """Extract modifier family votes."""
    votes: List[ConsensusVote] = []

    # Modifier shape solver
    mod = pass_outputs.get("modifier_shape_solver_pass", {})
    if isinstance(mod, dict) and mod.get("ok"):
        primary = mod.get("primary_modifier", "unknown")
        if primary != "unknown":
            w = pass_weights.get_weight("modifier_shape_solver_pass")
            votes.append(ConsensusVote(
                pass_name="modifier_shape_solver_pass",
                value=primary,
                weight=w,
                confidence=mod.get("confidence", 0.5),
            ))

    # Penumbra pass → source size → modifier inference
    pen = pass_outputs.get("shadow_penumbra_pass", {})
    if isinstance(pen, dict) and pen.get("ok"):
        source_size = pen.get("estimated_source_size_class", "unknown")
        modifier_map = {
            "small": "bare",
            "medium": "beauty_dish",
            "large": "softbox",
            "very_large": "umbrella",
        }
        modifier = modifier_map.get(source_size, "unknown")
        if modifier != "unknown":
            w = pass_weights.get_weight("shadow_penumbra_pass")
            votes.append(ConsensusVote(
                pass_name="shadow_penumbra_pass",
                value=modifier,
                weight=w,
                confidence=pen.get("confidence", 0.5),
            ))

    # Cue inference source quality
    if cue_inference:
        sq = cue_inference.get("source_quality")
        if sq and hasattr(sq, "key_modifier_family"):
            mod_fam = sq.key_modifier_family
            if mod_fam != "unknown":
                votes.append(ConsensusVote(
                    pass_name="cue_inference_source_quality",
                    value=mod_fam,
                    weight=0.7,
                    confidence=getattr(sq, "confidence", 0.5),
                ))

    return votes


def _extract_light_count_votes(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> List[ConsensusVote]:
    """Extract light count votes."""
    votes: List[ConsensusVote] = []

    # Lighting hypothesis engine
    hyp = pass_outputs.get("lighting_hypothesis_engine", {})
    if isinstance(hyp, dict) and hyp.get("ok"):
        count = hyp.get("likely_light_count")
        if count is not None:
            w = pass_weights.get_weight("lighting_hypothesis_engine")
            votes.append(ConsensusVote(
                pass_name="lighting_hypothesis_engine",
                value=count,
                weight=w,
                confidence=hyp.get("light_count_confidence", hyp.get("confidence", 0.5)),
            ))

    # Catchlight count from reflection architecture cue
    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok"):
        cl_count = catchlight.get("catchlight_count", 0)
        if cl_count > 0:
            w = pass_weights.get_weight("catchlight_pass")
            votes.append(ConsensusVote(
                pass_name="catchlight_pass",
                value=cl_count,
                weight=w * 0.8,  # slightly lower than dedicated counter
                confidence=catchlight.get("confidence", 0.5),
            ))

    # Cue inference
    if cue_inference:
        geometry = cue_inference.get("geometry")
        if geometry and hasattr(geometry, "light_count_estimate"):
            count = geometry.light_count_estimate
            if count > 0:
                votes.append(ConsensusVote(
                    pass_name="cue_inference_geometry",
                    value=count,
                    weight=0.7,
                    confidence=getattr(geometry, "confidence", 0.5),
                ))

    return votes


def _extract_environment_votes(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> List[ConsensusVote]:
    """Extract environment classification votes."""
    votes: List[ConsensusVote] = []

    # Environment light pass
    env = pass_outputs.get("environment_light_pass", {})
    if isinstance(env, dict) and env.get("ok"):
        env_type = env.get("environment_type", "unknown")
        if env_type != "unknown":
            w = pass_weights.get_weight("environment_light_pass")
            votes.append(ConsensusVote(
                pass_name="environment_light_pass",
                value=env_type,
                weight=w,
                confidence=env.get("confidence", 0.5),
            ))

    # Solar geometry → outdoor
    solar = pass_outputs.get("solar_geometry_pass", {})
    if isinstance(solar, dict) and solar.get("ok") and solar.get("sun_detected"):
        w = pass_weights.get_weight("solar_geometry_pass")
        votes.append(ConsensusVote(
            pass_name="solar_geometry_pass",
            value="outdoor_sun",
            weight=w,
            confidence=solar.get("confidence", 0.5),
        ))

    # Window geometry → indoor ambient
    window = pass_outputs.get("window_geometry_pass", {})
    if isinstance(window, dict) and window.get("ok") and window.get("window_detected"):
        w = pass_weights.get_weight("window_geometry_pass")
        votes.append(ConsensusVote(
            pass_name="window_geometry_pass",
            value="indoor_ambient",
            weight=w,
            confidence=window.get("confidence", 0.5),
        ))

    # Cue inference environment
    if cue_inference:
        env_inf = cue_inference.get("environment")
        if env_inf and hasattr(env_inf, "environment_type"):
            env_type = env_inf.environment_type
            if env_type != "unknown":
                votes.append(ConsensusVote(
                    pass_name="cue_inference_environment",
                    value=env_type,
                    weight=0.7,
                    confidence=getattr(env_inf, "confidence", 0.5),
                ))

    return votes


# ═══════════════════════════════════════════════════════════════════════════
# Dimension Consensus Builders
# ═══════════════════════════════════════════════════════════════════════════


def _build_direction_consensus(votes: List[ConsensusVote]) -> DimensionConsensus:
    """Build direction consensus using weighted circular mean."""
    if not votes:
        return DimensionConsensus(dimension="direction", notes=["No direction votes"])

    angles = [float(v.value) for v in votes]
    effective_weights = [v.weight * v.confidence for v in votes]

    mean_deg, resultant = weighted_circular_mean(angles, effective_weights)

    # Classify contributing vs dissenting based on distance from mean
    contributing = []
    dissenting = []
    for v in votes:
        from engine.coordinate_system import angular_distance
        dist = angular_distance(float(v.value), mean_deg)
        if dist <= 30.0:  # within 30° of consensus
            contributing.append(v)
        else:
            dissenting.append(v)

    return DimensionConsensus(
        dimension="direction",
        consensus_value=round(mean_deg, 1),
        consensus_confidence=round(resultant, 3),
        contributing_votes=contributing,
        dissenting_votes=dissenting,
        spread=round(1.0 - resultant, 3),
    )


def _build_categorical_consensus(
    dimension: str, votes: List[ConsensusVote]
) -> DimensionConsensus:
    """Build consensus for a categorical dimension using weighted vote."""
    if not votes:
        return DimensionConsensus(dimension=dimension, notes=[f"No {dimension} votes"])

    values = [str(v.value) for v in votes]
    effective_weights = [v.weight * v.confidence for v in votes]

    winner, fraction = weighted_categorical_vote(values, effective_weights)

    contributing = [v for v in votes if str(v.value) == winner]
    dissenting = [v for v in votes if str(v.value) != winner]

    return DimensionConsensus(
        dimension=dimension,
        consensus_value=winner,
        consensus_confidence=round(fraction, 3),
        contributing_votes=contributing,
        dissenting_votes=dissenting,
        spread=round(1.0 - fraction, 3),
    )


def _build_numeric_consensus(
    dimension: str, votes: List[ConsensusVote]
) -> DimensionConsensus:
    """Build consensus for a numeric dimension using weighted average."""
    if not votes:
        return DimensionConsensus(dimension=dimension, notes=[f"No {dimension} votes"])

    values = [float(v.value) for v in votes]
    effective_weights = [v.weight * v.confidence for v in votes]

    mean = weighted_average(values, effective_weights)

    # Classify contributing vs dissenting
    contributing = []
    dissenting = []
    for v in votes:
        if abs(float(v.value) - mean) <= abs(mean * 0.3) + 1.0:
            contributing.append(v)
        else:
            dissenting.append(v)

    total_w = sum(effective_weights) if effective_weights else 0
    contrib_w = sum(v.weight * v.confidence for v in contributing)
    conf = contrib_w / total_w if total_w > 0 else 0.0

    return DimensionConsensus(
        dimension=dimension,
        consensus_value=round(mean, 2),
        consensus_confidence=round(conf, 3),
        contributing_votes=contributing,
        dissenting_votes=dissenting,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════════════════════════


def solve_dominant_source(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> ConsensusResult:
    """Compute dominant-source consensus across all passes.

    Parameters
    ----------
    pass_outputs : dict
        All pass result dicts, keyed by pass name.
    pass_weights : PassWeightProfile
        Adjusted weights per pass.
    cue_inference : dict or None
        Output of run_cue_inference_pipeline (geometry, source_quality, etc.)

    Returns
    -------
    ConsensusResult
        Consensus values and agreement metrics for all dimensions.
    """
    dimensions: Dict[str, DimensionConsensus] = {}

    # Direction
    dir_votes = _extract_direction_votes(pass_outputs, pass_weights, cue_inference)
    dir_consensus = _build_direction_consensus(dir_votes)
    dimensions["direction"] = dir_consensus

    # Height
    height_votes = _extract_height_votes(pass_outputs, pass_weights, cue_inference)
    height_consensus = _build_categorical_consensus("height", height_votes)
    dimensions["height"] = height_consensus

    # Modifier
    mod_votes = _extract_modifier_votes(pass_outputs, pass_weights, cue_inference)
    mod_consensus = _build_categorical_consensus("modifier", mod_votes)
    dimensions["modifier"] = mod_consensus

    # Light count
    count_votes = _extract_light_count_votes(pass_outputs, pass_weights, cue_inference)
    count_consensus = _build_numeric_consensus("light_count", count_votes)
    dimensions["light_count"] = count_consensus

    # Environment
    env_votes = _extract_environment_votes(pass_outputs, pass_weights, cue_inference)
    env_consensus = _build_categorical_consensus("environment", env_votes)
    dimensions["environment"] = env_consensus

    # Overall agreement: average of per-dimension confidence scores
    confidences = [d.consensus_confidence for d in dimensions.values()]
    overall = sum(confidences) / len(confidences) if confidences else 0.0

    # Extract dominant values for easy access
    return ConsensusResult(
        dimensions=dimensions,
        overall_agreement=round(overall, 3),
        dominant_direction_deg=(
            dir_consensus.consensus_value
            if dir_consensus.consensus_confidence > 0 else None
        ),
        dominant_height_class=(
            str(height_consensus.consensus_value)
            if height_consensus.consensus_confidence > 0 else None
        ),
        dominant_modifier=(
            str(mod_consensus.consensus_value)
            if mod_consensus.consensus_confidence > 0 else None
        ),
        dominant_light_count=(
            int(round(float(count_consensus.consensus_value)))
            if count_consensus.consensus_value is not None
            and count_consensus.consensus_confidence > 0
            else None
        ),
        dominant_environment=(
            str(env_consensus.consensus_value)
            if env_consensus.consensus_confidence > 0 else None
        ),
    )


def consensus_confidence(result: ConsensusResult) -> float:
    """Compute overall consensus confidence.

    Higher when all dimensions have strong agreement from diverse passes.
    """
    return result.overall_agreement
