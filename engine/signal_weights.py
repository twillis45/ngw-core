"""Per-region reliability model and automatic pass weight downgrading.

This module answers two questions:
1. **Region reliability**: How much can we trust signals from each image region?
   (face, torso, background, etc.)
2. **Pass weights**: Given contamination conditions (B&W, no face mesh, pose
   interference, etc.), how much should we trust each vision pass?

Every downgrade is logged with a reason string for the solver trace.

Design:
- ``compute_region_reliability()`` examines scene context and vision data
  to produce per-region reliability scores.
- ``compute_pass_weights()`` applies the downgrade rules from
  ``solver_constants.DOWNGRADE_RULES`` based on detected conditions.
- ``weighted_average()`` is a generic utility for reliability-weighted
  consensus computation.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any, Dict, List, Optional, Sequence, Tuple

from engine.solver_constants import (
    DEGRADATION_BW_IMAGE,
    DEGRADATION_ENVIRONMENTAL_BG,
    DEGRADATION_EXTREME_CONTRAST,
    DEGRADATION_HIGH_CONTRAST_GRADE,
    DEGRADATION_LOW_RESOLUTION,
    DEGRADATION_NO_FACE_MESH,
    DEGRADATION_POSE_INTERFERENCE,
    DEGRADATION_SPECULAR_SURFACE,
    DOWNGRADE_RULES,
    MIN_VOTE_CONFIDENCE,
    MIN_VOTE_WEIGHT,
    PASS_WEIGHT_DEFAULTS,
    REGION_RELIABILITY_DEFAULTS,
)
from engine.solver_models import (
    PassWeightProfile,
    RegionReliability,
    SignalWeight,
)

try:
    from engine.image_analysis_models import SceneContext, VisualCueReport
except ImportError:
    SceneContext = None  # type: ignore
    VisualCueReport = None  # type: ignore

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Region Reliability
# ═══════════════════════════════════════════════════════════════════════════


def compute_region_reliability(
    vision_data: Optional[Dict[str, Any]],
    scene_ctx: Optional[Any],
    cue_report: Optional[Any] = None,
) -> RegionReliability:
    """Compute per-region reliability scores.

    Parameters
    ----------
    vision_data : dict or None
        Raw vision pipeline output.
    scene_ctx : SceneContext or None
        Scene context with face mesh availability, person ratio, etc.
    cue_report : VisualCueReport or None
        Cue report for additional quality signals.

    Returns
    -------
    RegionReliability
        Per-region scores, each 0.0-1.0.
    """
    # Start with defaults
    scores = dict(REGION_RELIABILITY_DEFAULTS)
    degradation_reasons: List[str] = []

    if scene_ctx is None:
        # No scene context — return conservative defaults
        return RegionReliability(
            **{k: v * 0.7 for k, v in scores.items()},
            overall=0.5,
            degradation_reasons=["No scene context available"],
        )

    # ── Face mesh availability ──
    if not getattr(scene_ctx, "has_face_mesh", False):
        scores["face"] *= DEGRADATION_NO_FACE_MESH
        degradation_reasons.append(
            f"No face mesh → face reliability ×{DEGRADATION_NO_FACE_MESH}"
        )
        reason = getattr(scene_ctx, "face_mesh_failure_reason", "")
        if reason:
            degradation_reasons.append(f"Face mesh failure: {reason}")

    # ── B&W or heavy grading ──
    is_bw = False
    is_heavy_grade = False
    if cue_report is not None:
        tp = getattr(cue_report, "tonal_processing_estimation", None)
        if tp is not None:
            is_bw = getattr(tp, "is_bw", False)
            is_heavy_grade = getattr(tp, "is_high_contrast_grade", False)

    if is_bw:
        # B&W kills color-dependent signal reliability
        for region in ("skin_general", "specular_surfaces"):
            scores[region] *= DEGRADATION_BW_IMAGE
        degradation_reasons.append(
            f"B&W image → color-dependent regions ×{DEGRADATION_BW_IMAGE}"
        )

    if is_heavy_grade:
        for region in scores:
            scores[region] *= DEGRADATION_HIGH_CONTRAST_GRADE
        degradation_reasons.append(
            f"Heavy grading detected → all regions ×{DEGRADATION_HIGH_CONTRAST_GRADE}"
        )

    # ── Extreme contrast ──
    if cue_report is not None:
        cr = getattr(cue_report, "contrast_ratio", None)
        if cr is not None and getattr(cr, "label", "") == "extreme":
            scores["shadow_regions"] *= DEGRADATION_EXTREME_CONTRAST
            scores["highlight_regions"] *= DEGRADATION_EXTREME_CONTRAST
            degradation_reasons.append(
                f"Extreme contrast → shadow/highlight regions ×{DEGRADATION_EXTREME_CONTRAST}"
            )

    # ── Pose interference ──
    if cue_report is not None:
        pi = getattr(cue_report, "pose_induced_shadow_interference", None)
        if pi is not None and getattr(pi, "detected", False):
            severity = getattr(pi, "severity", "mild")
            if severity in ("moderate", "severe"):
                scores["shadow_regions"] *= DEGRADATION_POSE_INTERFERENCE
                degradation_reasons.append(
                    f"Pose interference ({severity}) → shadow regions ×{DEGRADATION_POSE_INTERFERENCE}"
                )

    # ── Environmental background ──
    if getattr(scene_ctx, "bg_is_environmental", False):
        scores["background"] *= DEGRADATION_ENVIRONMENTAL_BG
        degradation_reasons.append(
            f"Environmental background → background reliability ×{DEGRADATION_ENVIRONMENTAL_BG}"
        )

    # ── Specular surfaces ──
    if vision_data is not None:
        spec = vision_data.get("specular_surface", {}) if isinstance(vision_data, dict) else {}
        if spec.get("ok") and spec.get("specular_area_ratio", 0) > 0.1:
            scores["specular_surfaces"] *= DEGRADATION_SPECULAR_SURFACE
            scores["highlight_regions"] *= DEGRADATION_SPECULAR_SURFACE
            degradation_reasons.append(
                f"Significant specular surfaces → specular/highlight regions ×{DEGRADATION_SPECULAR_SURFACE}"
            )

    # ── Person ratio (low = uncertain subject location) ──
    person_ratio = getattr(scene_ctx, "person_ratio", 0.0)
    if person_ratio < 0.05:
        for region in ("face", "torso", "skin_general"):
            scores[region] *= 0.4
        degradation_reasons.append(
            f"Very low person ratio ({person_ratio:.2f}) → body regions degraded"
        )

    # ── Resolution quality ──
    if vision_data is not None and isinstance(vision_data, dict):
        res_quality = vision_data.get("resolution_quality", "unknown")
        if res_quality == "poor":
            for region in scores:
                scores[region] *= DEGRADATION_LOW_RESOLUTION
            degradation_reasons.append(
                f"Low resolution → all regions ×{DEGRADATION_LOW_RESOLUTION}"
            )

    # Clamp all scores to [0, 1]
    for k in scores:
        scores[k] = max(0.0, min(1.0, round(scores[k], 3)))

    # Overall = weighted average of key regions
    key_regions = ["face", "torso", "shadow_regions", "highlight_regions"]
    key_scores = [scores.get(r, 0.5) for r in key_regions]
    overall = sum(key_scores) / len(key_scores) if key_scores else 0.5

    return RegionReliability(
        face=scores.get("face", 0.0),
        torso=scores.get("torso", 0.0),
        background=scores.get("background", 0.0),
        hair=scores.get("hair", 0.0),
        skin_general=scores.get("skin_general", 0.0),
        specular_surfaces=scores.get("specular_surfaces", 0.0),
        shadow_regions=scores.get("shadow_regions", 0.0),
        highlight_regions=scores.get("highlight_regions", 0.0),
        overall=round(overall, 3),
        degradation_reasons=degradation_reasons,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Pass Weight Computation
# ═══════════════════════════════════════════════════════════════════════════


def _detect_conditions(
    cue_report: Optional[Any],
    scene_ctx: Optional[Any],
    vision_data: Optional[Dict[str, Any]],
) -> List[str]:
    """Detect which downgrade conditions are active.

    Returns a list of condition keys matching DOWNGRADE_RULES keys.
    """
    conditions: List[str] = []

    if scene_ctx is None and cue_report is None:
        return conditions

    # ── pose_interference ──
    if cue_report is not None:
        pi = getattr(cue_report, "pose_induced_shadow_interference", None)
        if pi is not None and getattr(pi, "detected", False):
            severity = getattr(pi, "severity", "none")
            if severity in ("moderate", "severe"):
                conditions.append("pose_interference")

    # ── specular_surface ──
    if vision_data is not None and isinstance(vision_data, dict):
        spec = vision_data.get("specular_surface", {})
        if isinstance(spec, dict) and spec.get("ok") and spec.get("specular_area_ratio", 0) > 0.1:
            conditions.append("specular_surface")

    # ── bw_or_heavy_grade ──
    if cue_report is not None:
        tp = getattr(cue_report, "tonal_processing_estimation", None)
        if tp is not None:
            if getattr(tp, "is_bw", False) or getattr(tp, "is_high_contrast_grade", False):
                conditions.append("bw_or_heavy_grade")

    # ── no_face_mesh ──
    if scene_ctx is not None and not getattr(scene_ctx, "has_face_mesh", False):
        conditions.append("no_face_mesh")

    # ── environmental_background ──
    if scene_ctx is not None and getattr(scene_ctx, "bg_is_environmental", False):
        conditions.append("environmental_background")

    # ── multiple_shadow_directions ──
    if cue_report is not None:
        msd = getattr(cue_report, "multi_shadow_detection", None)
        if msd is not None and getattr(msd, "shadow_count", 0) > 1:
            conditions.append("multiple_shadow_directions")

    # ── shadow_interruption_pattern ──
    if cue_report is not None:
        sip = getattr(cue_report, "shadow_interruption_pattern", None)
        if sip is not None and getattr(sip, "detected", False):
            conditions.append("shadow_interruption_pattern")

    return conditions


def compute_pass_weights(
    cue_report: Optional[Any] = None,
    scene_ctx: Optional[Any] = None,
    vision_data: Optional[Dict[str, Any]] = None,
) -> PassWeightProfile:
    """Compute per-pass weights with contamination downgrading.

    Starts from ``PASS_WEIGHT_DEFAULTS`` and applies multipliers from
    ``DOWNGRADE_RULES`` based on detected conditions.

    Every downgrade is logged with a reason string.

    Parameters
    ----------
    cue_report : VisualCueReport or None
    scene_ctx : SceneContext or None
    vision_data : dict or None

    Returns
    -------
    PassWeightProfile
        Weights for all passes, with downgrade reasons.
    """
    # Build initial weights
    weights: Dict[str, SignalWeight] = {}
    for pass_name, base_w in PASS_WEIGHT_DEFAULTS.items():
        weights[pass_name] = SignalWeight(
            pass_name=pass_name,
            base_weight=base_w,
            adjusted_weight=base_w,
        )

    # Detect active conditions
    conditions = _detect_conditions(cue_report, scene_ctx, vision_data)

    total_downgrades = 0

    # Apply downgrade rules
    for condition in conditions:
        rule = DOWNGRADE_RULES.get(condition, {})
        for pass_name, multiplier in rule.items():
            if pass_name in weights:
                sw = weights[pass_name]
                old_weight = sw.adjusted_weight
                new_weight = round(old_weight * multiplier, 4)
                reason = f"{condition} → {pass_name} ×{multiplier} (was {old_weight:.3f}, now {new_weight:.3f})"
                sw.adjusted_weight = new_weight
                sw.downgrade_reasons.append(reason)
                total_downgrades += 1

    notes: List[str] = []
    if conditions:
        notes.append(f"Active conditions: {', '.join(conditions)}")
    if total_downgrades:
        notes.append(f"Total downgrades applied: {total_downgrades}")

    return PassWeightProfile(
        weights=weights,
        total_downgrades=total_downgrades,
        notes=notes,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Weighted Average Utilities
# ═══════════════════════════════════════════════════════════════════════════


def weighted_average(
    values: Sequence[float],
    weights: Optional[Sequence[float]] = None,
) -> float:
    """Compute weighted average of numeric values.

    If weights are None, uses uniform weights. Returns 0.0 if empty.
    """
    if not values:
        return 0.0

    if weights is None:
        return sum(values) / len(values)

    total_weight = sum(weights)
    if total_weight <= 0:
        return 0.0

    return sum(v * w for v, w in zip(values, weights)) / total_weight


def weighted_categorical_vote(
    votes: Sequence[str],
    weights: Optional[Sequence[float]] = None,
) -> Tuple[str, float]:
    """Weighted categorical vote — returns (winner, winner_weight_fraction).

    Parameters
    ----------
    votes : sequence of category strings
    weights : optional sequence of weights per vote

    Returns
    -------
    (winner, fraction) where fraction is the winner's weight share (0-1)
    """
    if not votes:
        return ("unknown", 0.0)

    if weights is None:
        weights = [1.0] * len(votes)

    # Tally weights per category
    tally: Dict[str, float] = {}
    total_weight = 0.0
    for vote, w in zip(votes, weights):
        if vote == "unknown":
            continue
        tally[vote] = tally.get(vote, 0.0) + w
        total_weight += w

    if not tally or total_weight <= 0:
        return ("unknown", 0.0)

    winner = max(tally, key=tally.get)  # type: ignore[arg-type]
    fraction = tally[winner] / total_weight

    return (winner, round(fraction, 3))


def filter_by_weight_and_confidence(
    pass_outputs: Dict[str, Any],
    pass_weights: PassWeightProfile,
    dimension: str = "",
    min_weight: float = MIN_VOTE_WEIGHT,
    min_confidence: float = MIN_VOTE_CONFIDENCE,
) -> List[Tuple[str, Any, float]]:
    """Filter pass outputs to only those with sufficient weight and confidence.

    Returns list of (pass_name, value, effective_weight) tuples.
    """
    results: List[Tuple[str, Any, float]] = []

    for pass_name, output in pass_outputs.items():
        if not isinstance(output, dict):
            continue
        if not output.get("ok", False):
            continue

        weight = pass_weights.get_weight(pass_name)
        if weight < min_weight:
            continue

        confidence = output.get("confidence", 0.0)
        if confidence < min_confidence:
            continue

        effective_weight = weight * confidence
        results.append((pass_name, output, effective_weight))

    return results


# ═══════════════════════════════════════════════════════════════════════════
# Solver Feedback Loop
# ═══════════════════════════════════════════════════════════════════════════

# Multipliers applied per contradiction involving a pass.
_FEEDBACK_SEVERITY_MULTIPLIERS = {
    "high": 0.65,
    "medium": 0.80,
    "low": 0.92,
}

# Floor — never reduce a pass weight below this fraction of its base.
_FEEDBACK_WEIGHT_FLOOR = 0.15


def apply_contradiction_feedback(
    pass_weights: PassWeightProfile,
    contradiction_report: Any,
    consensus_result: Any = None,
) -> PassWeightProfile:
    """Adjust pass weights based on solver contradiction findings.

    For each contradiction, identify which pass(es) disagree with the
    consensus on that dimension.  Penalise the dissenting pass by a
    severity-dependent multiplier.  When no consensus is available to
    arbitrate, both sides of the contradiction receive a smaller penalty.

    Parameters
    ----------
    pass_weights : PassWeightProfile
        Current weights (mutated in-place and returned).
    contradiction_report : ContradictionReport
        Output of ``find_contradictions()``.
    consensus_result : ConsensusResult or None
        If available, used to identify which side of each contradiction
        is the dissenting side.

    Returns
    -------
    PassWeightProfile
        Same object with adjusted weights and added downgrade reasons.
    """
    contradictions = getattr(contradiction_report, "contradictions", [])
    if not contradictions:
        return pass_weights

    # Build set of dissenting pass names per dimension from consensus.
    dissenters: Dict[str, set] = {}  # dimension → {pass_name, ...}
    if consensus_result is not None:
        dims = getattr(consensus_result, "dimensions", {})
        for dim_name, dim_consensus in (dims.items() if isinstance(dims, dict) else []):
            dissenting_votes = getattr(dim_consensus, "dissenting_votes", [])
            dissenters[dim_name] = {
                getattr(v, "pass_name", "") for v in dissenting_votes
            }

    adjustments = 0
    for contradiction in contradictions:
        severity = getattr(contradiction, "severity", "low")
        multiplier = _FEEDBACK_SEVERITY_MULTIPLIERS.get(severity, 0.92)
        dimension = getattr(contradiction, "dimension", "")
        pa = getattr(contradiction, "pass_a", "")
        pb = getattr(contradiction, "pass_b", "")
        dim_dissenters = dissenters.get(dimension, set())

        # Determine which pass(es) to penalise.
        if dim_dissenters:
            # Penalise only the pass(es) that dissented from consensus.
            targets = []
            if pa in dim_dissenters:
                targets.append(pa)
            if pb in dim_dissenters:
                targets.append(pb)
            # If neither is a known dissenter (e.g., both contributed
            # to a split consensus), apply a softer penalty to both.
            if not targets:
                targets = [pa, pb]
                multiplier = 1.0 - (1.0 - multiplier) * 0.5  # half penalty
        else:
            # No consensus data for this dimension — penalise both lightly.
            targets = [pa, pb]
            multiplier = 1.0 - (1.0 - multiplier) * 0.5

        for pass_name in targets:
            sw = pass_weights.weights.get(pass_name)
            if sw is None:
                continue
            old_w = sw.adjusted_weight
            new_w = max(
                sw.base_weight * _FEEDBACK_WEIGHT_FLOOR,
                round(old_w * multiplier, 4),
            )
            if new_w < old_w:
                reason = (
                    f"contradiction_feedback({severity}) on {dimension}: "
                    f"{pa} vs {pb} → {pass_name} ×{multiplier:.2f} "
                    f"(was {old_w:.3f}, now {new_w:.3f})"
                )
                sw.adjusted_weight = new_w
                sw.downgrade_reasons.append(reason)
                adjustments += 1

    if adjustments:
        pass_weights.total_downgrades += adjustments
        pass_weights.notes.append(
            f"Contradiction feedback: {adjustments} weight adjustment(s) "
            f"from {len(contradictions)} contradiction(s)"
        )

    return pass_weights
