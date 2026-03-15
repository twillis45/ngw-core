"""Coarse lighting simulator — forward model for hypothesis validation.

Given a lighting hypothesis (key direction, height, modifier, etc.),
predict what the image should look like:
    - Shadow direction and softness
    - Highlight direction
    - Catchlight clock position
    - Fill visibility
    - Background illumination character

This is NOT photorealistic rendering.  It exists to check whether
a hypothesis is physically consistent with observed signals.

Usage::

    from engine.lighting_simulator import simulate_hypothesis

    prediction = simulate_hypothesis(hypothesis)
"""

from __future__ import annotations

import math
from typing import Optional

from engine.solver_models import (
    LightingHypothesis,
    LightSource,
    SimulationPrediction,
)


# ═══════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════

HARD_MODIFIERS = frozenset({"bare_bulb", "grid_spot", "fresnel", "grid", "sun"})
SOFT_MODIFIERS = frozenset({
    "softbox", "small_softbox", "medium_softbox", "large_octa", "octa",
    "umbrella", "umbrella_white", "umbrella_silver", "beauty_dish",
    "diffusion_frame", "window", "panel",
})
MIXED_MODIFIERS = frozenset({"stripbox", "reflector", "tube_light", "ring_light"})


def modifier_quality(modifier: str) -> str:
    """Return the source quality for a modifier: 'hard', 'soft', 'mixed', or 'unknown'.

    This is the single canonical mapping — all other modules should import
    this function rather than maintaining their own lookup tables.
    """
    mod = modifier.lower() if modifier else "unknown"
    if mod in HARD_MODIFIERS:
        return "hard"
    if mod in SOFT_MODIFIERS:
        return "soft"
    if mod in MIXED_MODIFIERS:
        return "mixed"
    return "unknown"

_CLOSE_DISTANCE_FT = 4.0
_FAR_DISTANCE_FT = 12.0


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

def simulate_hypothesis(hypothesis: LightingHypothesis) -> SimulationPrediction:
    """Produce a coarse expected outcome from a lighting hypothesis.

    Returns a SimulationPrediction with predicted shadow direction,
    highlight direction, catchlight position, fill visibility, etc.
    """
    key = _find_key(hypothesis)
    fill = _find_role(hypothesis, "fill")
    rim = _find_role(hypothesis, "rim")
    bg = _find_role(hypothesis, "background")

    pred = SimulationPrediction(hypothesis_id=hypothesis.hypothesis_id)
    notes = []

    if not key:
        pred.confidence = 0.1
        pred.notes = ["No key light found in hypothesis — cannot simulate"]
        return pred

    # ── Shadow direction (opposite of key azimuth) ──
    key_az = _source_azimuth(key)
    if key_az is not None:
        pred.predicted_shadow_direction_deg = (key_az + 180.0) % 360.0
        pred.predicted_highlight_direction_deg = key_az

    # ── Shadow softness ──
    pred.predicted_shadow_softness = _predict_softness(key)

    # ── Catchlight clock position ──
    if key_az is not None:
        pred.predicted_catchlight_clock = _azimuth_to_clock(key_az)

    # ── Fill visibility ──
    pred.predicted_fill_visibility = _predict_fill_visibility(fill, key)

    # ── Background illumination ──
    pred.predicted_background_illumination = _predict_background(bg, key, hypothesis)

    # ── Confidence ──
    conf_factors = []
    if key_az is not None:
        conf_factors.append(key.confidence)
    if key.modifier != "unknown":
        conf_factors.append(0.8)
    else:
        conf_factors.append(0.3)
        notes.append("Key modifier unknown — softness prediction unreliable")

    pred.confidence = sum(conf_factors) / max(len(conf_factors), 1)
    pred.notes = notes

    return pred


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _find_key(hyp: LightingHypothesis) -> Optional[LightSource]:
    for s in hyp.sources:
        if s.role == "key":
            return s
    return hyp.sources[0] if hyp.sources else None


def _find_role(hyp: LightingHypothesis, role: str) -> Optional[LightSource]:
    for s in hyp.sources:
        if s.role == role:
            return s
    return None


def _source_azimuth(source: LightSource) -> Optional[float]:
    if source.direction and source.direction.azimuth_deg is not None:
        return source.direction.azimuth_deg
    if source.position:
        return math.degrees(math.atan2(source.position.x, source.position.z)) % 360.0
    return None


def _predict_softness(key: LightSource) -> str:
    mod = key.modifier.lower() if key.modifier else "unknown"
    if mod in HARD_MODIFIERS:
        return "hard"
    if mod in SOFT_MODIFIERS:
        return "soft"
    if mod in MIXED_MODIFIERS:
        return "mixed"

    # Fall back to size class
    size = key.size_class.lower() if key.size_class else "unknown"
    if size in ("point", "very_small", "small"):
        return "hard"
    if size in ("large", "very_large"):
        return "soft"
    if size == "medium":
        return "mixed"

    return "unknown"


def _azimuth_to_clock(azimuth_deg: float) -> int:
    """Convert azimuth (0=front, +CW) to clock position (12=top).

    In catchlight terms:
        0° (front) → 12 o'clock (above)
        90° (camera-left of subject) → 9 o'clock
        -90° (camera-right) → 3 o'clock
    """
    # Normalize to 0-360
    az = azimuth_deg % 360.0
    # Map: 0°→12, 30°→11, 60°→10, 90°→9, etc.
    # Clock position = 12 - (az / 30), wrapped
    clock = round(12 - az / 30.0) % 12
    return clock if clock != 0 else 12


def _predict_fill_visibility(
    fill: Optional[LightSource],
    key: Optional[LightSource],
) -> str:
    if fill is None:
        return "none"

    fill_conf = fill.confidence
    intensity = fill.intensity_relative

    if intensity >= 0.7:
        return "strong"
    if intensity >= 0.4:
        return "moderate"
    if intensity >= 0.15:
        return "subtle"
    if fill_conf > 0.5:
        return "subtle"
    return "none"


def _predict_background(
    bg: Optional[LightSource],
    key: Optional[LightSource],
    hyp: LightingHypothesis,
) -> str:
    env = hyp.environment.lower() if hyp.environment else "unknown"

    if bg and bg.confidence > 0.5:
        if bg.intensity_relative >= 0.8:
            return "even"
        return "gradient"

    # No explicit background light
    if env in ("studio",):
        return "dark"
    if env in ("natural", "outdoor", "mixed"):
        return "even"

    # Key spill might illuminate background
    if key and key.distance_ft_estimate and key.distance_ft_estimate < _CLOSE_DISTANCE_FT:
        return "gradient"

    return "dark"
