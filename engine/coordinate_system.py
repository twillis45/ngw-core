"""Canonical coordinate system for the inverse-lighting solver.

All pass signals use inconsistent reference frames — some are pixel-relative,
some face-relative, some use clock positions, some use compass directions.
This module normalizes everything into a single subject-centric canonical
coordinate system.

Canonical frame:
    Origin = subject center (face center if available, body center otherwise)
    X = subject's right (camera-left is positive)
    Y = up (ceiling is positive)
    Z = toward camera (behind subject is negative)

    Azimuth: 0° = front (toward camera), +90° = right, ±180° = behind, -90° = left
    Elevation: 0° = eye level, +90° = directly above, -90° = below

All positions are optionally normalized to subject scale:
    1.0 unit = approximate head-to-waist distance (face height × 3)
    This allows comparison across different framings and focal lengths.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from engine.solver_constants import (
    CLOCK_TO_AZIMUTH,
    DIRECTION_AGREEMENT_TOLERANCE_DEG,
    HEIGHT_CLASS_THRESHOLDS,
)
from engine.solver_models import CanonicalCoord, CanonicalDirection


# ═══════════════════════════════════════════════════════════════════════════
# Scale Factor
# ═══════════════════════════════════════════════════════════════════════════


def subject_scale_factor(
    face_box: Optional[Tuple[int, int, int, int]],
    person_mask_bounds: Optional[Tuple[int, int, int, int]],
    image_shape: Tuple[int, int],
) -> float:
    """Compute normalization scale factor from subject size in pixels.

    Returns pixels-per-unit where 1 unit = approximate head-to-waist distance.

    Parameters
    ----------
    face_box : (x, y, w, h) or None
        Face bounding box in pixels.
    person_mask_bounds : (x, y, w, h) or None
        Bounding box of the person segmentation mask.
    image_shape : (height, width)
        Image dimensions.

    Returns
    -------
    float
        Pixels per canonical unit. If no reference is available, falls back
        to 1/3 of image height (assumes full-body framing).
    """
    if face_box is not None:
        _, _, _, face_h = face_box
        if face_h > 0:
            # Head-to-waist ≈ 3× face height
            return face_h * 3.0

    if person_mask_bounds is not None:
        _, _, _, person_h = person_mask_bounds
        if person_h > 0:
            # Head-to-waist ≈ 60% of full body height
            return person_h * 0.6

    # Fallback: assume subject is ~1/3 of image height
    img_h = image_shape[0]
    return img_h / 3.0 if img_h > 0 else 300.0


def _subject_center(
    face_box: Optional[Tuple[int, int, int, int]],
    person_mask_bounds: Optional[Tuple[int, int, int, int]],
    image_shape: Tuple[int, int],
) -> Tuple[float, float]:
    """Determine the subject center in pixel coordinates.

    Returns (center_x, center_y) in pixels.
    """
    if face_box is not None:
        fx, fy, fw, fh = face_box
        return (fx + fw / 2.0, fy + fh / 2.0)

    if person_mask_bounds is not None:
        px, py, pw, ph = person_mask_bounds
        # Use upper third of person as "center" (roughly head/shoulders)
        return (px + pw / 2.0, py + ph * 0.33)

    # Fallback: image center
    img_h, img_w = image_shape
    return (img_w / 2.0, img_h / 2.0)


# ═══════════════════════════════════════════════════════════════════════════
# Pixel → Canonical Coordinate Conversion
# ═══════════════════════════════════════════════════════════════════════════


def normalize_to_subject_coords(
    pixel_x: float,
    pixel_y: float,
    face_box: Optional[Tuple[int, int, int, int]],
    person_mask_bounds: Optional[Tuple[int, int, int, int]],
    image_shape: Tuple[int, int],
) -> CanonicalCoord:
    """Convert pixel coordinates to subject-centric canonical coordinates.

    Parameters
    ----------
    pixel_x, pixel_y : float
        Position in pixel space (origin = top-left, X right, Y down).
    face_box : (x, y, w, h) or None
    person_mask_bounds : (x, y, w, h) or None
    image_shape : (height, width)

    Returns
    -------
    CanonicalCoord
        Position in canonical space (origin = subject, X right, Y up, Z toward camera).
        Z is always 0 (no depth information from 2D pixels).
    """
    scale = subject_scale_factor(face_box, person_mask_bounds, image_shape)
    cx, cy = _subject_center(face_box, person_mask_bounds, image_shape)

    if scale <= 0:
        return CanonicalCoord(confidence=0.0, notes=["Invalid scale factor"])

    # Pixel space: origin top-left, X right, Y down
    # Canonical: origin subject, X right, Y up, Z toward camera
    canonical_x = (pixel_x - cx) / scale
    canonical_y = -(pixel_y - cy) / scale  # flip Y: pixel Y down → canonical Y up

    confidence = 0.8 if face_box is not None else (0.6 if person_mask_bounds is not None else 0.3)

    return CanonicalCoord(
        x=round(canonical_x, 4),
        y=round(canonical_y, 4),
        z=0.0,
        confidence=confidence,
    )


def canonical_to_pixel(
    coord: CanonicalCoord,
    face_box: Optional[Tuple[int, int, int, int]],
    person_mask_bounds: Optional[Tuple[int, int, int, int]],
    image_shape: Tuple[int, int],
) -> Tuple[float, float]:
    """Convert canonical coordinates back to pixel space.

    Returns (pixel_x, pixel_y). Inverse of normalize_to_subject_coords.
    """
    scale = subject_scale_factor(face_box, person_mask_bounds, image_shape)
    cx, cy = _subject_center(face_box, person_mask_bounds, image_shape)

    pixel_x = coord.x * scale + cx
    pixel_y = -coord.y * scale + cy  # flip Y back

    return (pixel_x, pixel_y)


# ═══════════════════════════════════════════════════════════════════════════
# Angle Conversions
# ═══════════════════════════════════════════════════════════════════════════


def _normalize_angle(deg: float) -> float:
    """Normalize angle to [-180, 180) range."""
    deg = deg % 360
    if deg >= 180:
        deg -= 360
    return deg


def angle_to_canonical(angle_deg: float, reference_frame: str = "shadow_fall") -> float:
    """Convert a pass-specific angle to canonical azimuth.

    Reference frames:
    - "shadow_fall": shadow direction (0° = down/front). Key light is opposite.
    - "key_position": already the key light position
    - "catchlight_clock": clock position (12 = top/front)
    - "compass": compass bearing (0° = north/up in image)
    - "canonical": already canonical (pass-through)

    Returns canonical azimuth: 0° = front, +90° = right, ±180° = behind, -90° = left.
    """
    if reference_frame == "canonical":
        return _normalize_angle(angle_deg)

    if reference_frame == "shadow_fall":
        # Shadow falls opposite to key light direction.
        # Shadow at 0° (falling forward) means key is behind (180°)... but
        # convention in vision_passes: shadow_vector_deg is the direction
        # the shadow extends FROM the subject.
        # Invert by 180° to get key light position.
        return _normalize_angle(angle_deg + 180.0)

    if reference_frame == "key_position":
        return _normalize_angle(angle_deg)

    if reference_frame == "catchlight_clock":
        # Clock hours: 12=top(front), 3=right, 6=bottom(behind), 9=left
        # Map to canonical azimuth
        clock_pos = int(round(angle_deg)) % 12 or 12
        azimuth = CLOCK_TO_AZIMUTH.get(clock_pos, 0.0)
        return _normalize_angle(azimuth)

    if reference_frame == "compass":
        # Compass: 0° = up in image (assumed to be "behind" in scene).
        # Need to rotate: compass 0° → canonical 180° (behind)
        # compass 90° → canonical +90° (right)
        # compass 180° → canonical 0° (front)
        # compass 270° → canonical -90° (left)
        return _normalize_angle(angle_deg + 180.0)

    # Unknown frame — return as-is with warning
    return _normalize_angle(angle_deg)


def canonical_to_clock(azimuth_deg: float) -> str:
    """Convert canonical azimuth to clock position string.

    Returns a string like "2 o'clock".
    """
    az = _normalize_angle(azimuth_deg)

    # Find nearest clock position
    best_clock = 12
    best_dist = 999.0
    for clock, clock_az in CLOCK_TO_AZIMUTH.items():
        dist = abs(_normalize_angle(az - clock_az))
        if dist < best_dist:
            best_dist = dist
            best_clock = clock

    return f"{best_clock} o'clock"


def elevation_to_height_class(elevation_deg: float) -> str:
    """Convert canonical elevation angle to height class.

    Returns "low", "eye_level", or "high".
    """
    for cls, (lo, hi) in HEIGHT_CLASS_THRESHOLDS.items():
        if lo <= elevation_deg < hi:
            return cls
    return "high" if elevation_deg >= 20 else "low"


def height_class_to_elevation(height_class: str) -> float:
    """Convert height class back to a representative elevation angle."""
    midpoints = {
        "low": -45.0,
        "eye_level": 5.0,
        "high": 45.0,
    }
    return midpoints.get(height_class, 0.0)


# ═══════════════════════════════════════════════════════════════════════════
# Direction Comparison
# ═══════════════════════════════════════════════════════════════════════════


def angular_distance(angle_a_deg: float, angle_b_deg: float) -> float:
    """Compute the smallest angular distance between two angles in degrees.

    Always returns a non-negative value in [0, 180].
    """
    diff = abs(_normalize_angle(angle_a_deg - angle_b_deg))
    return min(diff, 360.0 - diff)


def directions_agree(
    angle_a_deg: float,
    angle_b_deg: float,
    tolerance_deg: float = DIRECTION_AGREEMENT_TOLERANCE_DEG,
) -> bool:
    """Check if two directions agree within tolerance."""
    return angular_distance(angle_a_deg, angle_b_deg) <= tolerance_deg


def height_classes_agree(class_a: str, class_b: str) -> bool:
    """Check if two height classes agree (must be identical)."""
    if class_a == "unknown" or class_b == "unknown":
        return True  # unknown is not a disagreement
    return class_a == class_b


# ═══════════════════════════════════════════════════════════════════════════
# Direction Label Conversions
# ═══════════════════════════════════════════════════════════════════════════

# Maps direction labels used in cue_inference to canonical azimuths
_DIRECTION_LABEL_TO_AZIMUTH: Dict[str, float] = {
    "upper_left": -45.0,
    "upper_right": 45.0,
    "left": -90.0,
    "right": 90.0,
    "top_center": 0.0,
    "below": 180.0,
    "lower_left": -135.0,
    "lower_right": 135.0,
    "front": 0.0,
    "behind": 180.0,
    "camera_left": -90.0,
    "camera_right": 90.0,
}


def direction_label_to_azimuth(label: str) -> Optional[float]:
    """Convert a direction label to canonical azimuth, or None if unknown."""
    return _DIRECTION_LABEL_TO_AZIMUTH.get(label.lower().strip())


def azimuth_to_direction_label(azimuth_deg: float) -> str:
    """Convert canonical azimuth to the nearest direction label."""
    az = _normalize_angle(azimuth_deg)

    # Find nearest label
    best_label = "unknown"
    best_dist = 999.0
    for label, label_az in _DIRECTION_LABEL_TO_AZIMUTH.items():
        dist = angular_distance(az, label_az)
        if dist < best_dist:
            best_dist = dist
            best_label = label

    return best_label


# ═══════════════════════════════════════════════════════════════════════════
# 3D Projection (simplified)
# ═══════════════════════════════════════════════════════════════════════════


def pixel_to_scene_ray(
    pixel_x: float,
    pixel_y: float,
    focal_length_px: float,
    image_shape: Tuple[int, int],
) -> CanonicalDirection:
    """Convert a pixel position to a scene ray direction.

    Uses pinhole camera model. Returns a CanonicalDirection representing
    the ray from camera through the pixel into the scene.

    Parameters
    ----------
    pixel_x, pixel_y : float
        Pixel position (origin = top-left).
    focal_length_px : float
        Focal length in pixels. If unknown, use image_width * 1.2 as default.
    image_shape : (height, width)
    """
    img_h, img_w = image_shape
    cx = img_w / 2.0
    cy = img_h / 2.0

    if focal_length_px <= 0:
        focal_length_px = img_w * 1.2  # reasonable default (~50mm on APS-C)

    # Normalized image coordinates
    dx = pixel_x - cx
    dy = -(pixel_y - cy)  # flip Y

    # Angular direction
    azimuth = math.degrees(math.atan2(dx, focal_length_px))
    elevation = math.degrees(math.atan2(dy, focal_length_px))

    return CanonicalDirection(
        azimuth_deg=round(azimuth, 2),
        elevation_deg=round(elevation, 2),
        confidence=0.7,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Weighted Circular Mean (for direction consensus)
# ═══════════════════════════════════════════════════════════════════════════


def weighted_circular_mean(
    angles_deg: List[float],
    weights: Optional[List[float]] = None,
) -> Tuple[float, float]:
    """Compute weighted circular mean of angles.

    Returns (mean_angle_deg, resultant_length) where resultant_length
    is 0-1 indicating concentration (1 = all same direction).
    """
    if not angles_deg:
        return (0.0, 0.0)

    if weights is None:
        weights = [1.0] * len(angles_deg)

    total_weight = sum(weights)
    if total_weight <= 0:
        return (0.0, 0.0)

    # Convert to radians and compute weighted vector sum
    sin_sum = 0.0
    cos_sum = 0.0
    for angle, w in zip(angles_deg, weights):
        rad = math.radians(angle)
        sin_sum += w * math.sin(rad)
        cos_sum += w * math.cos(rad)

    sin_sum /= total_weight
    cos_sum /= total_weight

    mean_angle = math.degrees(math.atan2(sin_sum, cos_sum))
    resultant_length = math.sqrt(sin_sum**2 + cos_sum**2)

    return (_normalize_angle(round(mean_angle, 2)), round(resultant_length, 4))
