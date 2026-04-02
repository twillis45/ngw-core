"""Pattern Matcher — matches reconstruction output against named lighting patterns.

.. deprecated::
    This module is no longer called by the production pipeline.
    Authoritative pattern resolution is handled by
    ``engine.orchestrator.resolve_pattern_candidates()``, which consumes
    evidence directly from reference_read, lighting_inference, and
    cue_inference — not from this physics-based scorer.

    Retained for its sub-scorer functions (used by tests and potentially
    useful for future confidence-weighted ranking). Do not add new callers.

Compares physics-based reconstruction results against the lighting pattern
dataset in data/lighting_patterns.json.  Returns ranked pattern matches with
confidence scores and photographer-language descriptions.

This module does NOT determine the final lighting setup — it provides
interpretation so photographers can understand the analysis in terms they know.
The physics reconstruction engine remains the source of truth.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_PATTERNS_PATH = Path(__file__).resolve().parent.parent / "data" / "lighting_patterns.json"

_PATTERNS_CACHE: Optional[List[Dict[str, Any]]] = None


# ═══════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════

def _load_patterns() -> List[Dict[str, Any]]:
    """Load and cache lighting patterns from JSON."""
    global _PATTERNS_CACHE
    if _PATTERNS_CACHE is not None:
        return _PATTERNS_CACHE
    try:
        with open(_PATTERNS_PATH, "r") as f:
            _PATTERNS_CACHE = json.load(f)
        logger.debug("Loaded %d lighting patterns", len(_PATTERNS_CACHE))
        return _PATTERNS_CACHE
    except Exception as exc:
        logger.warning("Failed to load lighting patterns: %s", exc)
        return []


def reload_patterns() -> None:
    """Force-reload patterns from disk (useful after LAB edits)."""
    global _PATTERNS_CACHE
    _PATTERNS_CACHE = None
    _load_patterns()


def get_all_patterns() -> List[Dict[str, Any]]:
    """Return all loaded patterns (read-only copy)."""
    return list(_load_patterns())


# ═══════════════════════════════════════════════════════════════════════════
# SUB-SCORERS
# ═══════════════════════════════════════════════════════════════════════════

def _score_key_direction(pattern: Dict, angle_deg: Optional[float]) -> float:
    """Score how well reconstructed key angle matches the pattern's range."""
    if angle_deg is None:
        return 0.5
    geo = pattern.get("geometry", {})
    lo, hi = geo.get("key_direction_range_deg", [0, 180])
    if lo <= angle_deg <= hi:
        center = (lo + hi) / 2.0
        half_span = max((hi - lo) / 2.0, 1.0)
        dist = abs(angle_deg - center) / half_span
        return max(1.0 - 0.3 * dist, 0.7)
    if angle_deg < lo:
        overshoot = lo - angle_deg
    else:
        overshoot = angle_deg - hi
    return max(0.0, 0.5 - overshoot / 90.0)


def _score_key_height(pattern: Dict, height: Optional[str]) -> float:
    """Score key height match."""
    if height is None:
        return 0.5
    geo = pattern.get("geometry", {})
    pat_height = geo.get("key_height", "")
    if not pat_height:
        return 0.5
    height_lower = height.lower().replace(" ", "_")
    pat_lower = pat_height.lower().replace(" ", "_")
    if height_lower == pat_lower:
        return 1.0
    # Partial matches
    _height_order = ["below_eye_level", "eye_level", "above_eye_level", "high"]
    if height_lower in _height_order and pat_lower in _height_order:
        diff = abs(_height_order.index(height_lower) - _height_order.index(pat_lower))
        if diff == 1:
            return 0.6
        return 0.3
    return 0.4


def _score_shadow_signature(
    pattern: Dict,
    shadow_softness: Optional[float],
    contrast_class: Optional[str],
) -> float:
    """Score shadow characteristics against pattern's shadow signature."""
    sig = pattern.get("shadow_signature", {})
    scores: List[float] = []

    if shadow_softness is not None:
        lo, hi = sig.get("softness_range", [0.0, 1.0])
        if lo <= shadow_softness <= hi:
            scores.append(1.0)
        else:
            dist = lo - shadow_softness if shadow_softness < lo else shadow_softness - hi
            scores.append(max(0.0, 1.0 - dist * 2.0))

    if contrast_class and sig.get("contrast"):
        _contrast_levels = ["very_low", "low", "medium", "medium_high", "high", "very_high"]
        pat_contrast = sig["contrast"]
        if contrast_class == pat_contrast:
            scores.append(1.0)
        elif contrast_class in _contrast_levels and pat_contrast in _contrast_levels:
            diff = abs(_contrast_levels.index(contrast_class) - _contrast_levels.index(pat_contrast))
            scores.append(max(0.0, 1.0 - diff * 0.25))

    if not scores:
        return 0.5
    return sum(scores) / len(scores)


def _score_modifier_match(
    pattern: Dict,
    primary_modifier: Optional[str],
    modifier_candidates: Optional[List[Dict]],
) -> float:
    """Score whether detected modifier matches pattern's expected modifiers."""
    modifiers = pattern.get("modifiers", [])
    if not modifiers:
        return 0.5

    if primary_modifier:
        pm_lower = primary_modifier.lower().replace(" ", "_")
        for mod in modifiers:
            if mod.lower() in pm_lower or pm_lower in mod.lower():
                return 1.0

    if modifier_candidates:
        for cand in modifier_candidates:
            mt = (cand.get("modifier_type") or cand.get("modifier") or "").lower().replace(" ", "_")
            for mod in modifiers:
                if mod.lower() in mt or mt in mod.lower():
                    conf = cand.get("confidence", 0.5)
                    return 0.6 + 0.4 * conf

    return 0.2


def _score_environment(pattern: Dict, environment_class: Optional[str]) -> float:
    """Score environment compatibility."""
    compat = pattern.get("environment", [])
    if not compat or not environment_class:
        return 0.5
    if environment_class in compat:
        return 1.0
    # Partial matches
    if environment_class == "mixed":
        return 0.5
    if environment_class == "unknown":
        return 0.4
    # Window/studio crossover
    env_map = {"window_light": "studio", "studio": "window_light"}
    if env_map.get(environment_class) in compat:
        return 0.5
    return 0.15


def _score_light_count(
    pattern: Dict,
    light_count: Optional[int],
) -> float:
    """Score light count match."""
    lights = pattern.get("lights", {})
    min_lc = lights.get("min_lights", 1)
    max_lc = lights.get("max_lights", 4)

    if light_count is None:
        return 0.5
    if min_lc <= light_count <= max_lc:
        return 1.0
    if light_count < min_lc:
        return max(0.2, 1.0 - (min_lc - light_count) * 0.3)
    return max(0.2, 1.0 - (light_count - max_lc) * 0.2)


def _score_distance(
    pattern: Dict,
    distance_ft: Optional[float],
) -> float:
    """Score distance match."""
    dr = pattern.get("distance_range_ft", [0, 0])
    if not dr or dr == [0, 0] or distance_ft is None:
        return 0.5
    lo, hi = dr
    if lo <= distance_ft <= hi:
        return 1.0
    if distance_ft < lo:
        overshoot = lo - distance_ft
    else:
        overshoot = distance_ft - hi
    return max(0.0, 1.0 - overshoot / 10.0)


def _score_fill_strategy(
    pattern: Dict,
    fill_present: Optional[bool],
    negative_fill: Optional[bool],
) -> float:
    """Score fill strategy compatibility."""
    lights = pattern.get("lights", {})
    roles = lights.get("typical_roles", [])
    scores: List[float] = []

    pid = pattern.get("pattern_id", "")
    # Patterns expecting fill
    if "fill" in roles:
        if fill_present:
            scores.append(1.0)
        else:
            scores.append(0.4)
    # Patterns expecting negative fill
    if "negative_fill" in roles:
        if negative_fill:
            scores.append(1.0)
        else:
            scores.append(0.5)
    # Low-key, split, rim patterns prefer no fill
    if pid in ("low_key", "split", "rim_only"):
        if fill_present is False or negative_fill:
            scores.append(1.0)
        elif fill_present:
            scores.append(0.3)

    if not scores:
        return 0.5
    return sum(scores) / len(scores)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN MATCHER
# ═══════════════════════════════════════════════════════════════════════════

def _match_single_pattern(
    pattern: Dict,
    reconstruction: Dict[str, Any],
) -> float:
    """Compute weighted match score for a single pattern."""
    weights = pattern.get("scoring_weights", {})

    # Extract reconstruction signals
    angle = (
        reconstruction.get("key_light_angle_deg_pose_corrected")
        or reconstruction.get("key_light_angle_deg")
        or reconstruction.get("key_angle_corrected_deg")
    )
    height = reconstruction.get("key_light_height")
    softness = reconstruction.get("shadow_softness")
    fill = reconstruction.get("fill_present")
    neg_fill = reconstruction.get("negative_fill")
    env_class = reconstruction.get("environment_class")
    primary_mod = reconstruction.get("primary_modifier_hypothesis")
    mod_candidates = reconstruction.get("modifier_candidates")
    distance = reconstruction.get("estimated_source_distance_ft") or reconstruction.get("modifier_distance_ft")

    light_count = None
    lc = reconstruction.get("likely_light_count")
    if isinstance(lc, (int, float)):
        light_count = int(lc)

    # Contrast class from softness
    contrast_class = None
    if softness is not None:
        if softness < 0.2:
            contrast_class = "very_high"
        elif softness < 0.35:
            contrast_class = "high"
        elif softness < 0.5:
            contrast_class = "medium_high"
        elif softness < 0.65:
            contrast_class = "medium"
        elif softness < 0.8:
            contrast_class = "low"
        else:
            contrast_class = "very_low"

    # Compute sub-scores
    s_dir = _score_key_direction(pattern, angle)
    s_height = _score_key_height(pattern, height)
    s_shadow = _score_shadow_signature(pattern, softness, contrast_class)
    s_mod = _score_modifier_match(pattern, primary_mod, mod_candidates)
    s_env = _score_environment(pattern, env_class)
    s_count = _score_light_count(pattern, light_count)
    s_dist = _score_distance(pattern, distance)
    s_fill = _score_fill_strategy(pattern, fill, neg_fill)

    # Weighted combination using pattern-specific weights
    total = (
        weights.get("key_direction", 0.2) * s_dir
        + weights.get("key_direction", 0.2) * 0.3 * s_height  # height is 30% of direction weight
        + weights.get("shadow_signature", 0.2) * s_shadow
        + weights.get("modifier_match", 0.2) * s_mod
        + weights.get("environment", 0.2) * s_env
        + weights.get("fill_strategy", 0.2) * s_fill
        + 0.10 * s_count  # light count always gets 10%
        + 0.05 * s_dist   # distance is a soft signal
    )
    # Normalize: total weights may exceed 1.0 due to additive count/dist
    total = total / 1.15  # compensate for the added 0.15
    return round(min(max(total, 0.0), 1.0), 3)


def match_lighting_patterns(
    reconstruction_output: Dict[str, Any],
) -> Dict[str, Any]:
    """Match reconstruction output against known lighting patterns.

    Compares the lighting reconstruction against the pattern dataset and
    returns ranked matches with confidence scores.

    Args:
        reconstruction_output: Output from reconstruction_pass, or any dict
            containing standard reconstruction keys.

    Returns:
        Dict with:
            pattern_matches: list of {pattern, name, confidence, category,
                description, use_cases, example_photographers}
            top_pattern: pattern_id of best match
            top_confidence: confidence of best match (0.0-1.0)
            category: category of best match
    """
    patterns = _load_patterns()

    if not patterns:
        return {
            "pattern_matches": [],
            "top_pattern": "unknown",
            "top_confidence": 0.0,
            "category": "unknown",
        }

    scored: List[Dict[str, Any]] = []
    for pat in patterns:
        score = _match_single_pattern(pat, reconstruction_output)
        scored.append({
            "pattern": pat["pattern_id"],
            "name": pat["name"],
            "confidence": score,
            "category": pat.get("category", ""),
            "description": pat.get("description", ""),
            "use_cases": pat.get("use_cases", []),
            "example_photographers": pat.get("example_photographers", []),
        })

    scored.sort(key=lambda x: x["confidence"], reverse=True)

    # Top matches
    top = scored[0] if scored else {"pattern": "unknown", "confidence": 0.0, "category": "unknown"}

    return {
        "pattern_matches": scored[:5],
        "top_pattern": top["pattern"],
        "top_confidence": top["confidence"],
        "category": top.get("category", "unknown"),
    }
