"""Named constants for the constrained inverse-lighting solver.

All thresholds, default weights, and magic numbers live here so that
solver modules stay clean and tuning is centralized.
"""
from __future__ import annotations

from typing import Dict

# ═══════════════════════════════════════════════════════════════════════════
# Canonical Coordinate System
# ═══════════════════════════════════════════════════════════════════════════

# Reference angles in the canonical coordinate system.
# 0° = directly in front of subject (camera direction)
# Positive = clockwise when viewed from above (subject's right / camera-left)
FRONT_DEG = 0.0
RIGHT_DEG = 90.0
BEHIND_DEG = 180.0
LEFT_DEG = -90.0

# Elevation reference angles
ABOVE_DEG = 90.0
EYE_LEVEL_DEG = 0.0
BELOW_DEG = -90.0

# Direction tolerance: two directions are "agreeing" if within this many degrees
DIRECTION_AGREEMENT_TOLERANCE_DEG = 15.0

# Height class definitions (elevation angle ranges)
HEIGHT_CLASS_THRESHOLDS = {
    "low": (-90.0, -10.0),
    "eye_level": (-10.0, 20.0),
    "high": (20.0, 90.0),
}

# Clock position mapping (azimuth to clock face)
# 12 = directly above/in front, 3 = right, 6 = below/behind, 9 = left
CLOCK_TO_AZIMUTH: Dict[int, float] = {
    12: 0.0,
    1: 30.0,
    2: 60.0,
    3: 90.0,
    4: 120.0,
    5: 150.0,
    6: 180.0,
    7: -150.0,
    8: -120.0,
    9: -90.0,
    10: -60.0,
    11: -30.0,
}


# ═══════════════════════════════════════════════════════════════════════════
# Region Reliability Defaults
# ═══════════════════════════════════════════════════════════════════════════

# Base reliability scores when data is clean and available
REGION_RELIABILITY_DEFAULTS: Dict[str, float] = {
    "face": 0.9,
    "torso": 0.7,
    "background": 0.4,
    "hair": 0.5,
    "skin_general": 0.7,
    "specular_surfaces": 0.5,
    "shadow_regions": 0.6,
    "highlight_regions": 0.6,
}

# Degradation multipliers applied when conditions reduce reliability
DEGRADATION_NO_FACE_MESH = 0.3          # face region when no face mesh detected
DEGRADATION_BW_IMAGE = 0.4              # color-dependent regions in B&W images
DEGRADATION_HIGH_CONTRAST_GRADE = 0.6   # regions in heavily graded images
DEGRADATION_EXTREME_CONTRAST = 0.5      # all regions when contrast is extreme
DEGRADATION_POSE_INTERFERENCE = 0.5     # shadow regions with pose interference
DEGRADATION_SPECULAR_SURFACE = 0.4      # highlight regions on specular surfaces
DEGRADATION_ENVIRONMENTAL_BG = 0.5      # background region in environmental scenes
DEGRADATION_LOW_RESOLUTION = 0.6        # all regions in low-resolution images


# ═══════════════════════════════════════════════════════════════════════════
# Pass Weight Defaults
# ═══════════════════════════════════════════════════════════════════════════

# Base weights for each pass (before contamination downgrading)
# Higher = more trusted by default
PASS_WEIGHT_DEFAULTS: Dict[str, float] = {
    "shadow_pass": 1.0,
    "highlight_pass": 0.8,
    "catchlight_pass": 0.9,
    "background_pass": 0.6,
    "specular_surface_pass": 0.7,
    "light_direction_field_pass": 0.85,
    "inverse_square_solver_pass": 0.7,
    "solar_geometry_pass": 0.8,
    "window_geometry_pass": 0.7,
    "bounce_geometry_pass": 0.6,
    "reflection_geometry_pass": 0.7,
    "shadow_penumbra_pass": 0.75,
    "occlusion_shadow_pass": 0.5,
    "color_temperature_pass": 0.7,
    "environment_light_pass": 0.65,
    "modifier_shape_solver_pass": 0.8,
    "pose_solver_pass": 0.85,
    "surface_class_pass": 0.7,
    "lighting_hypothesis_engine": 0.9,
}

# Downgrade rules: condition → { pass_name: multiplier }
# Applied in signal_weights.compute_pass_weights()
DOWNGRADE_RULES: Dict[str, Dict[str, float]] = {
    "pose_interference": {
        "shadow_pass": 0.5,
        "highlight_pass": 0.7,
    },
    "specular_surface": {
        "highlight_pass": 0.6,
        "specular_surface_pass": 0.5,
    },
    "bw_or_heavy_grade": {
        "color_temperature_pass": 0.3,
        "environment_light_pass": 0.5,
    },
    "no_face_mesh": {
        "catchlight_pass": 0.4,
        "shadow_pass": 0.7,
        "highlight_pass": 0.6,
    },
    "environmental_background": {
        "background_pass": 0.5,
        "environment_light_pass": 0.7,
    },
    "multiple_shadow_directions": {
        "shadow_pass": 0.6,
    },
    "shadow_interruption_pattern": {
        "shadow_pass": 0.4,
        "modifier_shape_solver_pass": 0.6,
    },
}


# ═══════════════════════════════════════════════════════════════════════════
# Consensus & Consistency
# ═══════════════════════════════════════════════════════════════════════════

# Minimum weight for a pass vote to be included in consensus
MIN_VOTE_WEIGHT = 0.2

# Minimum confidence for a pass output to contribute to consensus
MIN_VOTE_CONFIDENCE = 0.3

# Tolerance tables for pairwise agreement
AGREEMENT_TOLERANCES: Dict[str, float] = {
    "direction": 15.0,        # degrees
    "height": 0.0,            # must be same class (categorical)
    "distance": 2.0,          # feet
    "modifier": 0.0,          # must be same family (categorical)
    "light_count": 1.0,       # ±1 light
    "environment": 0.0,       # must be same (categorical)
    "color_temperature": 500,  # Kelvin
}

# Ambiguity classification thresholds
AMBIGUITY_HIGH_SEVERITY_THRESHOLD = 2    # >N high-severity contradictions → genuine_ambiguity
CONSISTENCY_LOW_THRESHOLD = 0.5           # overall consistency < this → conflicting_evidence
CONFIDENCE_LOW_THRESHOLD = 0.4            # best candidate < this → low_confidence
MIN_CUES_FOR_RELIABLE = 3                 # fewer cues → insufficient_data


# ═══════════════════════════════════════════════════════════════════════════
# Hypothesis Generation
# ═══════════════════════════════════════════════════════════════════════════

# Maximum number of candidate hypotheses to generate
MAX_CANDIDATES = 5

# Minimum confidence for a candidate to survive pruning
MIN_CANDIDATE_CONFIDENCE = 0.15

# Validation score thresholds
VALIDATION_EXCELLENT = 0.8
VALIDATION_GOOD = 0.6
VALIDATION_POOR = 0.3


# ═══════════════════════════════════════════════════════════════════════════
# Simulation
# ═══════════════════════════════════════════════════════════════════════════

# Prediction precision (these match the coarseness of CV observations)
SHADOW_DIRECTION_PRECISION_DEG = 15.0
CONTRAST_RATIO_PRECISION = 0.3
COLOR_TEMP_PRECISION_KELVIN = 500
CATCHLIGHT_CLOCK_PRECISION = 1  # ±1 clock position

# Dimension weights for overall validation score
VALIDATION_DIMENSION_WEIGHTS: Dict[str, float] = {
    "shadow_direction": 1.0,
    "shadow_softness": 0.8,
    "highlight_direction": 0.7,
    "contrast_ratio": 0.6,
    "catchlight_clock": 0.9,
    "color_temperature": 0.5,
    "fill_visibility": 0.5,
    "background_illumination": 0.4,
}
