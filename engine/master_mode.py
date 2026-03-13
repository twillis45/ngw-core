"""Master Mode — enrichment / bias layer for the NGW scoring and diagram pipeline.

When a master mode is selected, it nudges scoring, diagram geometry, and coaching
toward a named photographic philosophy.  When ``master_mode`` is ``None``, every
function returns a neutral value (0.0, None, None) so the pipeline behaves
identically to its default path.
"""

from __future__ import annotations

import functools
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

_YAML_PATH = Path(__file__).resolve().parent.parent / "data" / "taxonomy" / "master_modes.yaml"


# ── Loader (cached) ──────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def load_master_modes() -> Dict[str, Any]:
    """Load and cache ``master_modes.yaml``.  Returns dict keyed by mode id."""
    if not _YAML_PATH.exists():
        return {}
    with open(_YAML_PATH, encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return data


def get_mode(master_mode: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return a single mode definition, or ``None`` if not found / not set."""
    if not master_mode:
        return None
    return load_master_modes().get(master_mode)


def list_modes() -> List[Dict[str, str]]:
    """Return a summary list suitable for an API listing endpoint."""
    modes = load_master_modes()
    result = []
    for mode_id, defn in modes.items():
        result.append({
            "id": mode_id,
            "label": defn.get("label", mode_id),
            "tagline": defn.get("tagline", ""),
            "icon": defn.get("icon", ""),
        })
    return result


# ── Scoring bias ─────────────────────────────────────────────────────────────

def compute_master_mode_bonus(
    system: Dict[str, Any],
    master_mode: Optional[str] = None,
) -> float:
    """Return an additive score bonus for *system* under *master_mode*.

    Returns ``0.0`` when *master_mode* is ``None`` or unrecognised, preserving
    default pipeline behaviour.

    The bonus is the mode's ``bonus_points`` scaled by how many affinity
    categories the system matches (mood, modifier, gear).  A full 3/3 match
    yields the full bonus; 1/3 yields one-third, etc.
    """
    mode = get_mode(master_mode)
    if mode is None:
        return 0.0

    bias = mode.get("scoring_bias") or {}
    bonus_points = float(bias.get("bonus_points", 0))
    if bonus_points == 0:
        return 0.0

    taxonomy = dict(system.get("taxonomy_refs") or {})
    matches = 0
    checks = 0

    # mood affinity
    mood_affinity = bias.get("mood_affinity") or []
    if mood_affinity:
        checks += 1
        sys_mood = str(taxonomy.get("mood", "")).lower().replace(" ", "_")
        if sys_mood in [m.lower().replace(" ", "_") for m in mood_affinity]:
            matches += 1

    # modifier affinity
    mod_affinity = bias.get("modifier_affinity") or []
    if mod_affinity:
        checks += 1
        sys_mod = str(taxonomy.get("modifier_family", "")).lower().replace(" ", "_")
        if sys_mod in [m.lower().replace(" ", "_") for m in mod_affinity]:
            matches += 1

    # gear affinity
    gear_affinity = bias.get("gear_affinity") or []
    if gear_affinity:
        checks += 1
        sys_gear = str(taxonomy.get("gear_profile", "")).lower().replace(" ", "_")
        if sys_gear in [g.lower().replace(" ", "_") for g in gear_affinity]:
            matches += 1

    if checks == 0:
        return 0.0

    return round(bonus_points * (matches / checks), 3)


def archetype_mode_affinity(
    archetype_result: Optional[Dict[str, Any]],
    master_mode: Optional[str] = None,
) -> float:
    """Compute an additive bonus when an archetype classification matches a master mode.

    Parameters
    ----------
    archetype_result : dict, optional
        The result from ``classify_archetype()``.  Must contain at least
        ``primary_archetype`` and ``primary_confidence``.
    master_mode : str, optional
        The currently active master mode (e.g. ``"hurley"``).

    Returns
    -------
    float
        Additive bonus: 0.0 when there is no match or no data; a positive
        float when the classified archetype aligns with the active mode.
        Bonus = mode's ``bonus_points`` * ``primary_confidence`` * 0.5
        (capped so archetype affinity is supplementary, not dominant).
    """
    if not master_mode or not archetype_result:
        return 0.0

    if not isinstance(archetype_result, dict):
        return 0.0

    primary = archetype_result.get("primary_archetype")
    if not primary:
        return 0.0

    # Direct match: archetype classification says this *is* the mode's style
    if primary != master_mode:
        return 0.0

    mode = get_mode(master_mode)
    if mode is None:
        return 0.0

    bias = mode.get("scoring_bias") or {}
    bonus_points = float(bias.get("bonus_points", 0))
    confidence = float(archetype_result.get("primary_confidence", 0.0))

    # Scale by confidence, capped at 50% of the full bonus
    return round(bonus_points * confidence * 0.5, 3)


# ── Diagram overrides ────────────────────────────────────────────────────────

def get_diagram_overrides(master_mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Return the ``diagram_override`` dict for *master_mode*, or ``None``.

    The caller should treat ``None``-valued fields within the dict as
    "use default" — only non-null fields represent intentional overrides.
    """
    mode = get_mode(master_mode)
    if mode is None:
        return None
    return mode.get("diagram_override")


# ── Coaching overlay ─────────────────────────────────────────────────────────

def get_coaching_overlay(master_mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Return the ``coaching_overlay`` dict for *master_mode*, or ``None``.

    The caller merges this into the response cards — prepending good_signs,
    warnings, quick_fixes, and overriding rationale / camera settings.
    """
    mode = get_mode(master_mode)
    if mode is None:
        return None
    overlay = mode.get("coaching_overlay")
    if overlay is None:
        return None
    # Attach mode metadata for the UI
    return {
        **overlay,
        "masterModeId": master_mode,
        "masterModeLabel": mode.get("label", master_mode),
        "masterModeIcon": mode.get("icon", ""),
    }
