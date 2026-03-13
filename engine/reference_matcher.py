"""Reference Matcher — matches reconstruction output against reference image entries.

Compares physics-based reconstruction results against the reference image
library.  Loads from two sources (in priority order):

  1. data/reference_index.json  — auto-generated index from sidecar files +
     legacy entries.  Built by engine/reference_ingestion.py.
  2. data/reference_library/references.json — legacy flat-file fallback.

Gold-tier references are scored with full trust.
Community-tier references are penalized by their entry_trust_score.
The physics reconstruction engine remains the source of truth.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_INDEX_PATH = _DATA_DIR / "reference_index.json"
_REFERENCES_PATH = _DATA_DIR / "reference_library" / "references.json"

_REFERENCES_CACHE: Optional[List[Dict[str, Any]]] = None


# ═══════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════

def _load_references() -> List[Dict[str, Any]]:
    """Load and cache reference entries.

    Tries the reference_index.json first (includes image-backed sidecar
    entries merged with legacy entries).  Falls back to the legacy
    references.json if the index doesn't exist yet.
    """
    global _REFERENCES_CACHE
    if _REFERENCES_CACHE is not None:
        return _REFERENCES_CACHE

    # Try index first (only if it has the expected schema version)
    if _INDEX_PATH.exists():
        try:
            with open(_INDEX_PATH, "r") as f:
                index = json.load(f)
            # Only use index if it has our schema (not an older format)
            if isinstance(index, dict) and "_schema_version" in index:
                _REFERENCES_CACHE = index.get("entries", [])
                logger.debug(
                    "Loaded %d reference entries from index (%d image-backed)",
                    len(_REFERENCES_CACHE),
                    index.get("image_backed_count", 0),
                )
                return _REFERENCES_CACHE
            else:
                logger.debug("Index exists but has old schema, falling back to legacy")
        except Exception as exc:
            logger.warning("Failed to load reference index, falling back to legacy: %s", exc)

    # Fallback to legacy
    try:
        with open(_REFERENCES_PATH, "r") as f:
            _REFERENCES_CACHE = json.load(f)
        logger.debug("Loaded %d reference entries from legacy file", len(_REFERENCES_CACHE))
        return _REFERENCES_CACHE
    except Exception as exc:
        logger.warning("Failed to load reference library: %s", exc)
        return []


def reload_references() -> None:
    """Force-reload references from disk (useful after LAB edits or ingestion)."""
    global _REFERENCES_CACHE
    _REFERENCES_CACHE = None
    _load_references()


def get_all_references() -> List[Dict[str, Any]]:
    """Return all loaded references (read-only copy)."""
    return list(_load_references())


# ═══════════════════════════════════════════════════════════════════════════
# SUB-SCORERS
# ═══════════════════════════════════════════════════════════════════════════

def _angle_similarity(a: Optional[float], b: Optional[float], max_diff: float = 90.0) -> float:
    """Compute similarity between two angles (0-1)."""
    if a is None or b is None:
        return 0.5
    diff = abs(a - b)
    if diff > 180:
        diff = 360 - diff
    return max(0.0, 1.0 - diff / max_diff)


def _score_light_direction(ref: Dict, reconstruction: Dict) -> float:
    """Score light direction similarity."""
    ref_lights = ref.get("lights", [])
    if not ref_lights:
        return 0.5

    recon_angle = (
        reconstruction.get("key_light_angle_deg_pose_corrected")
        or reconstruction.get("key_light_angle_deg")
    )
    recon_height_str = reconstruction.get("key_light_height")

    # Find the key light in the reference
    key_light = None
    for lt in ref_lights:
        if lt.get("role") == "key":
            key_light = lt
            break
    if key_light is None and ref_lights:
        key_light = ref_lights[0]

    scores: List[float] = []

    # Angle similarity
    ref_angle = key_light.get("angle_deg")
    scores.append(_angle_similarity(recon_angle, ref_angle))

    # Height similarity
    ref_height = key_light.get("height_deg")
    recon_height_deg = None
    if recon_height_str:
        _height_map = {
            "below_eye_level": -10, "eye_level": 0,
            "above_eye_level": 20, "high": 40,
        }
        recon_height_deg = _height_map.get(recon_height_str, 0)
    scores.append(_angle_similarity(recon_height_deg, ref_height, max_diff=45.0))

    return sum(scores) / len(scores) if scores else 0.5


def _score_modifier_similarity(ref: Dict, reconstruction: Dict) -> float:
    """Score modifier similarity."""
    ref_lights = ref.get("lights", [])
    if not ref_lights:
        return 0.5

    recon_mod = reconstruction.get("primary_modifier_hypothesis", "")
    recon_size = reconstruction.get("modifier_size_class", "")

    key_light = None
    for lt in ref_lights:
        if lt.get("role") == "key":
            key_light = lt
            break
    if key_light is None and ref_lights:
        key_light = ref_lights[0]

    ref_mod = key_light.get("modifier", "")

    if not recon_mod or not ref_mod:
        return 0.5

    # Direct name match
    recon_lower = recon_mod.lower().replace(" ", "_")
    ref_lower = ref_mod.lower().replace(" ", "_")
    if recon_lower == ref_lower:
        return 1.0
    if ref_lower in recon_lower or recon_lower in ref_lower:
        return 0.8

    # Family match
    _families = {
        "softbox": ["softbox_rect", "softbox_octa", "stripbox"],
        "beauty": ["beauty_dish"],
        "umbrella": ["umbrella", "parabolic_umbrella"],
        "hard": ["bare_bulb", "fresnel", "point_source", "snoot"],
        "natural": ["window", "sun", "sky", "sheer_curtain", "scrim"],
        "ring": ["ring_light"],
    }
    recon_family = None
    ref_family = None
    for fam, members in _families.items():
        for m in members:
            if m in recon_lower:
                recon_family = fam
            if m in ref_lower:
                ref_family = fam
    if recon_family and ref_family and recon_family == ref_family:
        return 0.7

    return 0.2


def _score_shadow_similarity(ref: Dict, reconstruction: Dict) -> float:
    """Score shadow signature similarity."""
    ref_shadow = ref.get("shadow_signature", {})
    if not ref_shadow:
        return 0.5

    scores: List[float] = []

    # Shadow softness vs reference shadow descriptors
    softness = reconstruction.get("shadow_softness")
    if softness is not None:
        # Map softness to descriptor
        if softness > 0.7:
            recon_desc = "minimal"
        elif softness > 0.5:
            recon_desc = "soft"
        elif softness > 0.3:
            recon_desc = "moderate"
        else:
            recon_desc = "strong"

        # Check nose shadow
        ref_nose = ref_shadow.get("nose_shadow", "")
        if ref_nose == "minimal" and recon_desc in ("minimal", "soft"):
            scores.append(1.0)
        elif ref_nose in ("opposite_key", "visible") and recon_desc in ("moderate", "strong"):
            scores.append(0.9)
        elif ref_nose == "directly_below":
            # On-axis light — check angle
            angle = reconstruction.get("key_light_angle_deg", 45)
            if isinstance(angle, (int, float)) and angle < 20:
                scores.append(0.9)
            else:
                scores.append(0.4)
        else:
            scores.append(0.5)

        # Check cheek shadow
        ref_cheek = ref_shadow.get("cheek_shadow", "")
        _cheek_scale = {"minimal": 0.8, "balanced": 0.6, "moderate": 0.5, "soft": 0.6,
                        "strong": 0.3, "deep": 0.2, "hard_edge": 0.1}
        ref_softness = _cheek_scale.get(ref_cheek, 0.5)
        if softness is not None:
            cheek_diff = abs(softness - ref_softness)
            scores.append(max(0.0, 1.0 - cheek_diff * 2.0))

    if not scores:
        return 0.5
    return sum(scores) / len(scores)


def _score_environment_match(ref: Dict, reconstruction: Dict) -> float:
    """Score environment match."""
    ref_env = ref.get("environment", "")
    recon_env = reconstruction.get("environment_class", "")
    if not ref_env or not recon_env:
        return 0.5
    if ref_env == recon_env:
        return 1.0
    # Window/studio crossover
    if {ref_env, recon_env} == {"studio", "window_light"}:
        return 0.5
    return 0.2


def _score_light_count(ref: Dict, reconstruction: Dict) -> float:
    """Score light count match."""
    ref_lights = ref.get("lights", [])
    ref_count = len(ref_lights)
    recon_count = reconstruction.get("likely_light_count")
    if recon_count is None or not isinstance(recon_count, (int, float)):
        return 0.5
    recon_count = int(recon_count)
    if recon_count == ref_count:
        return 1.0
    diff = abs(recon_count - ref_count)
    return max(0.0, 1.0 - diff * 0.3)


def _score_distance(ref: Dict, reconstruction: Dict) -> float:
    """Score distance similarity."""
    ref_lights = ref.get("lights", [])
    key_light = None
    for lt in ref_lights:
        if lt.get("role") == "key":
            key_light = lt
            break
    if key_light is None:
        return 0.5

    ref_dist = key_light.get("distance_ft")
    recon_dist = (
        reconstruction.get("estimated_source_distance_ft")
        or reconstruction.get("modifier_distance_ft")
    )
    if ref_dist is None or recon_dist is None or ref_dist == 0:
        return 0.5

    ratio = min(ref_dist, recon_dist) / max(ref_dist, recon_dist)
    return round(ratio, 3)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN MATCHER
# ═══════════════════════════════════════════════════════════════════════════

_REFERENCE_WEIGHTS = {
    "light_direction": 0.25,
    "modifier": 0.20,
    "shadow": 0.20,
    "environment": 0.15,
    "light_count": 0.10,
    "distance": 0.10,
}


def _match_single_reference(
    ref: Dict,
    reconstruction: Dict[str, Any],
) -> float:
    """Compute similarity score for a single reference entry."""
    s_dir = _score_light_direction(ref, reconstruction)
    s_mod = _score_modifier_similarity(ref, reconstruction)
    s_shadow = _score_shadow_similarity(ref, reconstruction)
    s_env = _score_environment_match(ref, reconstruction)
    s_count = _score_light_count(ref, reconstruction)
    s_dist = _score_distance(ref, reconstruction)

    raw_score = (
        _REFERENCE_WEIGHTS["light_direction"] * s_dir
        + _REFERENCE_WEIGHTS["modifier"] * s_mod
        + _REFERENCE_WEIGHTS["shadow"] * s_shadow
        + _REFERENCE_WEIGHTS["environment"] * s_env
        + _REFERENCE_WEIGHTS["light_count"] * s_count
        + _REFERENCE_WEIGHTS["distance"] * s_dist
    )

    # Apply trust score: gold entries get full score, community entries get penalized
    trust = ref.get("entry_trust_score", 1.0)
    tier = ref.get("dataset_tier", "community")
    if tier == "gold":
        final = raw_score
    else:
        # Community entries: blend raw score with trust
        final = raw_score * (0.5 + 0.5 * trust)

    return round(min(max(final, 0.0), 1.0), 3)


def match_reference_images(
    reconstruction_output: Dict[str, Any],
) -> Dict[str, Any]:
    """Match reconstruction output against reference image entries.

    Compares the lighting reconstruction against reference entries using
    light direction, modifier, shadow signature, environment, light count,
    and distance similarity.  Gold-tier references receive full trust;
    community entries are scaled by their trust score.

    Args:
        reconstruction_output: Output from reconstruction_pass, or any dict
            containing standard reconstruction keys.

    Returns:
        Dict with:
            closest_references: list of {reference_id, photographer,
                lighting_pattern, similarity, dataset_tier}
            top_reference: reference_id of best match
            top_similarity: similarity of best match (0.0-1.0)
    """
    references = _load_references()

    if not references:
        return {
            "closest_references": [],
            "top_reference": None,
            "top_similarity": 0.0,
        }

    scored: List[Dict[str, Any]] = []
    for ref in references:
        score = _match_single_reference(ref, reconstruction_output)
        scored.append({
            "reference_id": ref["reference_id"],
            "photographer": ref.get("photographer", ""),
            "lighting_pattern": ref.get("lighting_pattern", ""),
            "similarity": score,
            "dataset_tier": ref.get("dataset_tier", "community"),
        })

    scored.sort(key=lambda x: x["similarity"], reverse=True)

    top = scored[0] if scored else {"reference_id": None, "similarity": 0.0}

    return {
        "closest_references": scored[:5],
        "top_reference": top["reference_id"],
        "top_similarity": top["similarity"],
    }
