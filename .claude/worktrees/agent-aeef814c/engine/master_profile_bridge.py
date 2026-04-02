"""Bridge between archetype classifier and solver output models.

Converts an ArchetypeClassification (raw classifier output) into a
MasterProfileSummary (structured model for SolverResult) and populates
the lighter-weight fields on VLMReconstruction.

Usage::

    from engine.master_profile_bridge import build_master_profile_summary

    summary = build_master_profile_summary(archetype_dict)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from engine.solver_models import MasterProfileSummary


# ═══════════════════════════════════════════════════════════════════════════
# Archetype → StyleFamily mapping
# ═══════════════════════════════════════════════════════════════════════════

_ARCHETYPE_STYLE_MAP: Dict[str, str] = {
    "hurley":     "commercial_headshot",
    "penn":       "editorial_portrait",
    "karsh":      "dramatic_portrait",
    "leibovitz":  "editorial_portrait",
    "adler":      "beauty",
    "heisler":    "dramatic_portrait",
    "caravaggio": "dramatic_portrait",
    "bryce":      "natural_light",
}


# ═══════════════════════════════════════════════════════════════════════════
# Main builder
# ═══════════════════════════════════════════════════════════════════════════

def build_master_profile_summary(
    archetype_data: Optional[Dict[str, Any]],
) -> Optional[MasterProfileSummary]:
    """Convert archetype classification dict to a MasterProfileSummary.

    Args:
        archetype_data: The dict from ``ArchetypeClassification.model_dump()``,
            or None if classification was unavailable.

    Returns:
        A MasterProfileSummary, or None if the input is empty/invalid.
    """
    if not archetype_data:
        return None

    primary = archetype_data.get("primary_archetype") or "unknown"
    primary_conf = archetype_data.get("primary_confidence", 0.0)

    # Skip if classification failed or confidence is negligible
    if primary == "unknown" and primary_conf < 0.1:
        if not archetype_data.get("ok", True):
            return None

    secondary = archetype_data.get("secondary_archetype")
    secondary_conf = archetype_data.get("secondary_confidence", 0.0)

    style = _ARCHETYPE_STYLE_MAP.get(primary, "unknown")

    return MasterProfileSummary(
        primary_profile=primary,
        primary_confidence=primary_conf,
        secondary_profile=secondary,
        secondary_confidence=secondary_conf,
        style_family=style,
        matched_signals=archetype_data.get("matched_signals", []),
        unmatched_signals=archetype_data.get("unmatched_signals", []),
        notes=archetype_data.get("notes", []),
    )


def apply_master_profile_to_vlm(
    vlm_dict: Dict[str, Any],
    archetype_data: Optional[Dict[str, Any]],
) -> None:
    """Populate the master_profile fields on a VLMReconstruction dict in-place.

    This is a lightweight alternative to build_master_profile_summary for
    contexts where only the flat fields are needed (e.g., VLMReconstruction).
    """
    if not archetype_data:
        return

    primary = archetype_data.get("primary_archetype")
    if primary:
        vlm_dict["master_profile"] = primary
        vlm_dict["master_profile_confidence"] = archetype_data.get(
            "primary_confidence", 0.0
        )
        vlm_dict["style_family"] = _ARCHETYPE_STYLE_MAP.get(primary, "unknown")
