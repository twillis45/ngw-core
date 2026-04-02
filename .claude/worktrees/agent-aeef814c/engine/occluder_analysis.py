"""Occluder analysis — estimates how light-blocking objects affect signal reliability.

Given scene geometry data (from vision passes), identifies occluders and
computes their impact on pass weights and solver confidence.

Usage::

    from engine.occluder_analysis import analyze_occluders

    impacts = analyze_occluders(scene_geometry)
"""

from __future__ import annotations

from typing import List, Optional

from engine.solver_models import (
    OccluderEstimate,
    OccluderImpact,
    SceneGeometryModel,
)


# ═══════════════════════════════════════════════════════════════════════════
# Occluder → pass impact mapping
# ═══════════════════════════════════════════════════════════════════════════

_REGION_PASS_MAP = {
    "face": ["catchlight_pass", "highlight_pass"],
    "torso": ["highlight_pass", "shadow_pass"],
    "background": ["shadow_pass", "light_direction_field_pass"],
}

_SEVERITY_WEIGHT = {
    "full": 0.8,
    "partial": 0.3,
}


# ═══════════════════════════════════════════════════════════════════════════
# Main analysis
# ═══════════════════════════════════════════════════════════════════════════

def analyze_occluders(
    scene_geometry: Optional[SceneGeometryModel],
) -> List[OccluderImpact]:
    """Compute the impact of each occluder on signal reliability.

    Args:
        scene_geometry: Scene geometry model containing occluder estimates.

    Returns:
        List of OccluderImpact records, one per occluder.
    """
    if not scene_geometry or not scene_geometry.occluders:
        return []

    return [_compute_impact(occ) for occ in scene_geometry.occluders]


def _compute_impact(occluder: OccluderEstimate) -> OccluderImpact:
    """Compute impact of a single occluder."""
    affected = occluder.affected_passes or _infer_affected_passes(occluder)
    severity_w = _SEVERITY_WEIGHT.get(occluder.severity, 0.3)
    weight_reduction = severity_w * occluder.confidence * len(affected) * 0.1

    # Shadow direction is compromised if a full occluder blocks the key direction
    shadow_compromised = (
        occluder.severity == "full"
        and occluder.confidence > 0.6
        and "shadow_pass" in affected
    )

    notes = []
    if shadow_compromised:
        notes.append(
            f"{occluder.occluder_type} occluder fully blocks shadow direction"
        )
    if occluder.severity == "full" and "catchlight_pass" in affected:
        notes.append("Catchlights likely obscured by occluder")

    return OccluderImpact(
        occluder_id=occluder.occluder_id,
        passes_downgraded=affected,
        weight_reduction=round(weight_reduction, 4),
        shadow_direction_compromised=shadow_compromised,
        notes=notes,
    )


def _infer_affected_passes(occluder: OccluderEstimate) -> List[str]:
    """Infer which passes are affected when not explicitly listed."""
    region = occluder.affected_region
    if region and region in _REGION_PASS_MAP:
        return list(_REGION_PASS_MAP[region])

    # Fall back based on occluder type
    if occluder.occluder_type == "body_part":
        return ["catchlight_pass", "highlight_pass"]
    if occluder.occluder_type == "architecture":
        return ["shadow_pass", "light_direction_field_pass"]

    return ["shadow_pass"]
