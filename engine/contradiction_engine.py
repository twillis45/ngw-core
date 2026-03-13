"""Explicit contradiction detection engine.

While the consistency engine measures general agreement between passes,
this engine detects specific, meaningful contradictions that indicate
genuine ambiguity in the lighting setup.

Each contradiction has:
- The two passes that disagree
- The dimension of disagreement
- The specific values that conflict
- A severity level (low/medium/high)
- A resolution hint for the hypothesis solver

High-severity contradictions drive the hypothesis solver to generate
alternative candidates.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from engine.coordinate_system import (
    angle_to_canonical,
    angular_distance,
    direction_label_to_azimuth,
    elevation_to_height_class,
)
from engine.solver_constants import (
    AMBIGUITY_HIGH_SEVERITY_THRESHOLD,
    DIRECTION_AGREEMENT_TOLERANCE_DEG,
    MIN_CUES_FOR_RELIABLE,
)
from engine.solver_models import Contradiction, ContradictionReport

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Contradiction Detectors
# ═══════════════════════════════════════════════════════════════════════════


def _check_direction_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any],
    cue_inference: Optional[Dict[str, Any]],
) -> List[Contradiction]:
    """Detect contradictions in light direction between passes."""
    contradictions: List[Contradiction] = []

    # Collect direction signals
    direction_signals: Dict[str, float] = {}

    shadow = pass_outputs.get("shadow_pass", {})
    if isinstance(shadow, dict) and shadow.get("ok") and shadow.get("shadow_vector_deg") is not None:
        direction_signals["shadow_pass"] = angle_to_canonical(
            shadow["shadow_vector_deg"], "shadow_fall"
        )

    ldf = pass_outputs.get("light_direction_field_pass", {})
    if isinstance(ldf, dict) and ldf.get("ok") and ldf.get("dominant_light_vector_deg") is not None:
        direction_signals["light_direction_field_pass"] = ldf["dominant_light_vector_deg"]

    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("primary_clock_position") is not None:
        direction_signals["catchlight_pass"] = angle_to_canonical(
            float(catchlight["primary_clock_position"]), "catchlight_clock"
        )

    # Compare pairs
    signals = list(direction_signals.items())
    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            name_a, val_a = signals[i]
            name_b, val_b = signals[j]
            dist = angular_distance(val_a, val_b)

            if dist > 60:  # >60° disagreement is significant
                severity = "high" if dist > 90 else "medium"
                contradictions.append(Contradiction(
                    contradiction_id=f"dir_{name_a}_{name_b}",
                    pass_a=name_a,
                    pass_b=name_b,
                    dimension="direction",
                    value_a=round(val_a, 1),
                    value_b=round(val_b, 1),
                    severity=severity,
                    resolution_hint=(
                        f"{name_a} says {val_a:.0f}° but {name_b} says {val_b:.0f}° "
                        f"({dist:.0f}° apart). Check for multiple light sources or "
                        f"pose interference confusing shadow direction."
                    ),
                ))

    return contradictions


def _check_height_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any],
    cue_inference: Optional[Dict[str, Any]],
) -> List[Contradiction]:
    """Detect contradictions in height classification."""
    contradictions: List[Contradiction] = []

    height_signals: Dict[str, str] = {}

    shadow = pass_outputs.get("shadow_pass", {})
    if isinstance(shadow, dict) and shadow.get("ok") and shadow.get("shadow_vertical_angle_deg") is not None:
        height_signals["shadow_pass"] = elevation_to_height_class(shadow["shadow_vertical_angle_deg"])

    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("primary_clock_position") is not None:
        clock = int(catchlight["primary_clock_position"]) % 12 or 12
        if clock in (10, 11, 12, 1, 2):
            height_signals["catchlight_pass"] = "high"
        elif clock in (3, 9):
            height_signals["catchlight_pass"] = "eye_level"
        else:
            height_signals["catchlight_pass"] = "low"

    # Compare
    signals = list(height_signals.items())
    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            name_a, val_a = signals[i]
            name_b, val_b = signals[j]
            if val_a != val_b and val_a != "unknown" and val_b != "unknown":
                # "high" vs "low" is more severe than "high" vs "eye_level"
                severity_map = {
                    frozenset({"high", "low"}): "high",
                    frozenset({"high", "eye_level"}): "low",
                    frozenset({"eye_level", "low"}): "low",
                }
                severity = severity_map.get(frozenset({val_a, val_b}), "medium")
                contradictions.append(Contradiction(
                    contradiction_id=f"height_{name_a}_{name_b}",
                    pass_a=name_a,
                    pass_b=name_b,
                    dimension="height",
                    value_a=val_a,
                    value_b=val_b,
                    severity=severity,
                    resolution_hint=(
                        f"{name_a} indicates '{val_a}' height but {name_b} "
                        f"indicates '{val_b}'. Check for tilted face or "
                        f"multiple catchlights from different heights."
                    ),
                ))

    return contradictions


def _check_modifier_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any],
    cue_inference: Optional[Dict[str, Any]],
) -> List[Contradiction]:
    """Detect modifier contradictions (soft penumbra vs hard catchlight, etc.)."""
    contradictions: List[Contradiction] = []

    # Penumbra → source softness
    softness_signal: Optional[str] = None
    pen = pass_outputs.get("shadow_penumbra_pass", {})
    if isinstance(pen, dict) and pen.get("ok"):
        size_class = pen.get("estimated_source_size_class", "unknown")
        if size_class in ("large", "very_large"):
            softness_signal = "soft"
        elif size_class == "small":
            softness_signal = "hard"

    # Catchlight shape → modifier type
    catchlight_modifier: Optional[str] = None
    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok"):
        cl_shapes = catchlight.get("shapes_seen", [])
        if "rectangular" in cl_shapes:
            catchlight_modifier = "hard_edged"  # softbox typically
        elif "round" in cl_shapes:
            catchlight_modifier = "round_source"  # umbrella/beauty_dish/bare

    # Soft penumbra but hard/small catchlight shape could indicate contradictions
    if softness_signal == "hard" and catchlight_modifier == "hard_edged":
        # Actually consistent — small source with rectangular catchlight (grid)
        pass
    elif softness_signal == "soft" and catchlight_modifier == "round_source":
        # Consistent — large source with round catchlight (umbrella)
        pass
    elif softness_signal == "hard" and catchlight_modifier == "hard_edged":
        pass
    elif softness_signal is not None and catchlight_modifier is not None:
        # Check for actual contradiction: soft shadows but hard catchlight or vice versa
        if softness_signal == "soft" and catchlight_modifier == "hard_edged":
            # Soft shadow penumbra but rectangular catchlight — could be softbox at distance
            # Not really a contradiction, skip
            pass
        elif softness_signal == "hard" and catchlight_modifier == "round_source":
            contradictions.append(Contradiction(
                contradiction_id="modifier_softness_vs_catchlight",
                pass_a="shadow_penumbra_pass",
                pass_b="catchlight_pass",
                dimension="modifier",
                value_a=f"hard (small source: {pen.get('estimated_source_size_class')})",
                value_b=f"round catchlight shape suggesting larger source",
                severity="medium",
                resolution_hint=(
                    "Shadow edges suggest a small/hard source but catchlight shape "
                    "suggests a larger/round modifier. Possible causes: grids on "
                    "softboxes, processing artifacts, or mixed lighting."
                ),
            ))

    # Modifier shape solver vs cue inference
    mod = pass_outputs.get("modifier_shape_solver_pass", {})
    if isinstance(mod, dict) and mod.get("ok") and cue_inference:
        sq = cue_inference.get("source_quality")
        if sq and hasattr(sq, "key_modifier_family"):
            cv_mod = mod.get("primary_modifier", "unknown")
            inf_mod = sq.key_modifier_family
            if cv_mod != "unknown" and inf_mod != "unknown" and cv_mod != inf_mod:
                # Different modifier families from different analysis paths
                contradictions.append(Contradiction(
                    contradiction_id="modifier_cv_vs_inference",
                    pass_a="modifier_shape_solver_pass",
                    pass_b="cue_inference_source_quality",
                    dimension="modifier",
                    value_a=cv_mod,
                    value_b=inf_mod,
                    severity="medium",
                    resolution_hint=(
                        f"CV modifier analysis says '{cv_mod}' but inference "
                        f"pipeline says '{inf_mod}'. Both should be considered "
                        f"as candidates."
                    ),
                ))

    return contradictions


def _check_light_count_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any],
    cue_inference: Optional[Dict[str, Any]],
) -> List[Contradiction]:
    """Detect contradictions in light count estimates."""
    contradictions: List[Contradiction] = []

    count_signals: Dict[str, int] = {}

    hyp = pass_outputs.get("lighting_hypothesis_engine", {})
    if isinstance(hyp, dict) and hyp.get("ok") and hyp.get("likely_light_count") is not None:
        count_signals["lighting_hypothesis_engine"] = int(hyp["likely_light_count"])

    catchlight = pass_outputs.get("catchlight_pass", {})
    if isinstance(catchlight, dict) and catchlight.get("ok") and catchlight.get("catchlight_count", 0) > 0:
        count_signals["catchlight_pass"] = int(catchlight["catchlight_count"])

    # Check cue_report multi_shadow_detection
    if cue_report is not None:
        msd = getattr(cue_report, "multi_shadow_detection", None)
        if msd is not None and getattr(msd, "shadow_count", 0) > 0:
            count_signals["multi_shadow_detection"] = msd.shadow_count

    # Compare
    signals = list(count_signals.items())
    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            name_a, val_a = signals[i]
            name_b, val_b = signals[j]
            diff = abs(val_a - val_b)
            if diff >= 2:
                severity = "high" if diff >= 3 else "medium"
                contradictions.append(Contradiction(
                    contradiction_id=f"count_{name_a}_{name_b}",
                    pass_a=name_a,
                    pass_b=name_b,
                    dimension="light_count",
                    value_a=val_a,
                    value_b=val_b,
                    severity=severity,
                    resolution_hint=(
                        f"{name_a} says {val_a} lights but {name_b} says {val_b}. "
                        f"Check for reflections being misidentified as sources, "
                        f"or multiple shadows from a single occluded source."
                    ),
                ))

    return contradictions


def _check_environment_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any],
    cue_inference: Optional[Dict[str, Any]],
) -> List[Contradiction]:
    """Detect contradictions in environment classification."""
    contradictions: List[Contradiction] = []

    env_signals: Dict[str, str] = {}

    env = pass_outputs.get("environment_light_pass", {})
    if isinstance(env, dict) and env.get("ok") and env.get("environment_type", "unknown") != "unknown":
        env_signals["environment_light_pass"] = env["environment_type"]

    solar = pass_outputs.get("solar_geometry_pass", {})
    if isinstance(solar, dict) and solar.get("ok") and solar.get("sun_detected"):
        env_signals["solar_geometry_pass"] = "outdoor_sun"

    window = pass_outputs.get("window_geometry_pass", {})
    if isinstance(window, dict) and window.get("ok") and window.get("window_detected"):
        env_signals["window_geometry_pass"] = "indoor_ambient"

    # Studio vs outdoor is a strong contradiction
    STUDIO_TYPES = {"studio", "studio_portrait"}
    OUTDOOR_TYPES = {"outdoor_sun", "outdoor_shade", "outdoor"}

    signals = list(env_signals.items())
    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            name_a, val_a = signals[i]
            name_b, val_b = signals[j]
            if val_a == val_b:
                continue

            # Studio vs outdoor = high severity
            a_studio = val_a in STUDIO_TYPES
            b_studio = val_b in STUDIO_TYPES
            a_outdoor = val_a in OUTDOOR_TYPES
            b_outdoor = val_b in OUTDOOR_TYPES

            if (a_studio and b_outdoor) or (a_outdoor and b_studio):
                contradictions.append(Contradiction(
                    contradiction_id=f"env_{name_a}_{name_b}",
                    pass_a=name_a,
                    pass_b=name_b,
                    dimension="environment",
                    value_a=val_a,
                    value_b=val_b,
                    severity="high",
                    resolution_hint=(
                        f"{name_a} says '{val_a}' but {name_b} says '{val_b}'. "
                        f"This is a strong environment conflict. Possible causes: "
                        f"studio with natural-looking backdrop, or outdoor with flash."
                    ),
                ))
            elif val_a != val_b:
                contradictions.append(Contradiction(
                    contradiction_id=f"env_{name_a}_{name_b}",
                    pass_a=name_a,
                    pass_b=name_b,
                    dimension="environment",
                    value_a=val_a,
                    value_b=val_b,
                    severity="low",
                    resolution_hint=(
                        f"{name_a} says '{val_a}' but {name_b} says '{val_b}'."
                    ),
                ))

    return contradictions


# ═══════════════════════════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════════════════════════


def find_contradictions(
    pass_outputs: Dict[str, Any],
    cue_report: Optional[Any] = None,
    cue_inference: Optional[Dict[str, Any]] = None,
) -> ContradictionReport:
    """Find all explicit contradictions across passes.

    Parameters
    ----------
    pass_outputs : dict
        All pass results keyed by pass name.
    cue_report : VisualCueReport or None
    cue_inference : dict or None

    Returns
    -------
    ContradictionReport
        All detected contradictions with severity and resolution hints.
    """
    all_contradictions: List[Contradiction] = []

    all_contradictions.extend(
        _check_direction_contradictions(pass_outputs, cue_report, cue_inference)
    )
    all_contradictions.extend(
        _check_height_contradictions(pass_outputs, cue_report, cue_inference)
    )
    all_contradictions.extend(
        _check_modifier_contradictions(pass_outputs, cue_report, cue_inference)
    )
    all_contradictions.extend(
        _check_light_count_contradictions(pass_outputs, cue_report, cue_inference)
    )
    all_contradictions.extend(
        _check_environment_contradictions(pass_outputs, cue_report, cue_inference)
    )

    high_count = sum(1 for c in all_contradictions if c.severity == "high")
    medium_count = sum(1 for c in all_contradictions if c.severity == "medium")

    ambiguity = classify_ambiguity(all_contradictions, cue_report)

    return ContradictionReport(
        contradictions=all_contradictions,
        ambiguity_class=ambiguity,
        high_severity_count=high_count,
        notes=[
            f"Found {len(all_contradictions)} contradictions "
            f"({high_count} high, {medium_count} medium)"
        ],
    )


def classify_ambiguity(
    contradictions: List[Contradiction],
    cue_report: Optional[Any] = None,
) -> str:
    """Classify the ambiguity level based on contradictions.

    Returns:
    - "clean" — no significant contradictions
    - "minor_conflicts" — some low/medium contradictions
    - "genuine_ambiguity" — multiple high-severity contradictions
    - "insufficient_data" — too few cues to assess
    """
    # Check for insufficient data
    if cue_report is not None:
        cues_computed = getattr(cue_report, "cues_computed", 0)
        if cues_computed < MIN_CUES_FOR_RELIABLE:
            return "insufficient_data"

    high_count = sum(1 for c in contradictions if c.severity == "high")

    if high_count > AMBIGUITY_HIGH_SEVERITY_THRESHOLD:
        return "genuine_ambiguity"

    if high_count > 0 or len(contradictions) > 3:
        return "minor_conflicts"

    return "clean"
