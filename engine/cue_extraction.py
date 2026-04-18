"""Visual cue extraction from image data.

Each function extracts one of the 16 visual cues from the vision pipeline
output (masks, palettes, catchlights, pose) and/or the raw image.

The master orchestrator ``extract_visual_cues()`` calls all 16 extractors
inside independent try/except blocks — one failure never breaks others.

Dependencies:
- numpy (always available in the engine)
- cv2 (optional, graceful fallback)
- engine.image_analysis_models (cue Pydantic models)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from engine.constants import (
    BG,
    CATCHLIGHT,
    CONTRAST,
    ENVIRONMENT,
    FACE,
    HOUGH,
    SEPARATION,
    SHADOW,
    SPECULAR,
    TONAL,
    TRANSITION,
)

from engine.image_analysis_models import (
    BackgroundIllumination,
    BounceContributorAnalysis,
    CatchlightPosition,
    CatchlightShape,
    CatchlightTopology,
    ContinuousSourceSignals,
    ContrastRatio,
    EnvironmentalShadowContinuity,
    EyeSocketShadow,
    FaceOrientation,
    FillRatio,
    HighlightAxisMap,
    HighlightSymmetry,
    HighlightToShadowTransition,
    LightStructureDetection,
    MultiShadowDetection,
    NoseShadowLength,
    OffAxisKeyDetection,
    PoseInducedShadowInterference,
    PrimaryShadowDirection,
    ReflectionArchitecture,
    SeparationLightAnalysis,
    ShadowContinuity,
    ShadowEdgeHardness,
    ShadowInterruptionPattern,
    ShadowPenumbra,
    SpecularHighlightBehavior,
    SubjectBackgroundSeparation,
    TonalProcessingEstimation,
    VerticalLightAngle,
    VisualCueReport,
)

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Individual Cue Extractors
# ═══════════════════════════════════════════════════════════════════════════


def extract_shadow_edge_hardness(
    img_bgr: np.ndarray,
    person_mask: np.ndarray,
    skin_mask: np.ndarray,
    is_high_contrast_grade: bool = False,
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> Optional[ShadowEdgeHardness]:
    """Cue 1: Classify shadow edges as hard, soft, or mixed.

    Method: Run Canny edge detection on the luminance channel within the
    person region. Compare edge density in shadow vs midtone zones.
    Hard light produces sharper, higher-density edges at shadow boundaries.

    P2d: When is_high_contrast_grade is True, the contrast grading inflates
    edge density at shadow boundaries.  We raise the hard threshold to
    compensate — a "hard" classification under heavy grading needs stronger
    evidence than under neutral processing.

    Constrained to an expanded face region when available: clothing texture,
    hair, and accessories in the full person mask inflate edge density and
    corrupt hard/soft classification. Face shadow edges directly reflect
    modifier quality. Face box expanded 20% on all sides to include forehead,
    chin, and cheek shadow falloff areas.
    """
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Prefer face-box-constrained region for edge density measurement.
    analysis_mask = person_mask
    if face_box is not None:
        _h, _w = gray.shape
        _fx0, _fy0, _fx1, _fy1 = face_box
        _pad = int((_fy1 - _fy0) * 0.2)
        _ex0 = max(0, _fx0 - _pad)
        _ey0 = max(0, _fy0 - _pad)
        _ex1 = min(_w, _fx1 + _pad)
        _ey1 = min(_h, _fy1 + _pad)
        _face_zone = np.zeros((_h, _w), dtype=bool)
        _face_zone[_ey0:_ey1, _ex0:_ex1] = True
        _face_mask = person_mask & _face_zone
        if np.sum(_face_mask) >= SHADOW.MIN_PERSON_PIXELS:
            analysis_mask = _face_mask

    # Isolate analysis region
    person_gray = gray.copy()
    person_gray[~analysis_mask] = 0

    # Shadow region: darker third of analysis pixels
    person_pixels = gray[analysis_mask]
    if person_pixels.size < SHADOW.MIN_PERSON_PIXELS:
        return None

    p33 = np.percentile(person_pixels, SHADOW.SHADOW_PERCENTILE)
    p66 = np.percentile(person_pixels, SHADOW.MIDTONE_PERCENTILE)

    shadow_mask = analysis_mask & (gray <= p33)
    midtone_mask = analysis_mask & (gray > p33) & (gray <= p66)

    # Canny edges
    edges = cv2.Canny(person_gray, SHADOW.CANNY_LOW, SHADOW.CANNY_HIGH)

    shadow_area = max(np.sum(shadow_mask), 1)
    midtone_area = max(np.sum(midtone_mask), 1)

    shadow_edge_density = np.sum(edges[shadow_mask]) / (shadow_area * 255.0)
    midtone_edge_density = np.sum(edges[midtone_mask]) / (midtone_area * 255.0)

    notes = [f"Shadow edge density: {shadow_edge_density:.4f}, midtone: {midtone_edge_density:.4f}"]

    # P2e: Texture / occlusion correction.  Hard light creates sharp edges
    # specifically at shadow boundaries while midtone regions stay relatively
    # smooth.  When objects on the face (flowers, accessories, detailed
    # clothing) or heavy skin texture inflate edges everywhere, the midtone
    # edge density will be comparably high.  In that case the shadow edge
    # density is inflated by texture, not by hard light — correct it by
    # subtracting the texture baseline (midtone density).
    if midtone_edge_density > 0.005 and shadow_edge_density > 0:
        density_ratio = midtone_edge_density / shadow_edge_density
        if density_ratio > 0.4:
            # Subtract texture baseline; keep at least 30% of original density
            # so genuinely hard light with some texture isn't zeroed out.
            corrected = shadow_edge_density - midtone_edge_density * 0.7
            shadow_edge_density = max(corrected, shadow_edge_density * 0.3)
            notes.append(
                f"Texture correction applied: midtone/shadow ratio={density_ratio:.2f}, "
                f"corrected density={shadow_edge_density:.4f}"
            )

    # P2d: Contrast-grade-aware thresholds.  Heavy contrast grading amplifies
    # edge density at shadow boundaries, making soft light appear hard.
    # Raise the hard threshold from 0.03 to 0.05 under heavy grading.
    hard_threshold = SHADOW.HARD_DENSITY
    soft_threshold = SHADOW.SOFT_DENSITY
    if is_high_contrast_grade:
        hard_threshold = SHADOW.HARD_DENSITY_HCG
        soft_threshold = SHADOW.SOFT_DENSITY_HCG
        notes.append("Contrast-grade-aware thresholds applied (hard=0.05, soft=0.015).")

    # High edge density at shadow boundaries → hard light
    total_density = shadow_edge_density + midtone_edge_density
    if total_density < SHADOW.MIN_TOTAL_DENSITY:
        classification = "unknown"
        confidence = 0.2
    elif shadow_edge_density > hard_threshold:
        classification = "hard"
        confidence = min(0.85, 0.5 + shadow_edge_density * 5)
        if is_high_contrast_grade:
            confidence = min(confidence, 0.65)  # cap confidence under grading
    elif shadow_edge_density < soft_threshold:
        classification = "soft"
        confidence = min(0.80, 0.5 + (hard_threshold - shadow_edge_density) * 20)
    else:
        classification = "mixed"
        confidence = 0.45

    # Measure shadow-to-midtone transition width (gradient extent in pixels).
    # Dilate the shadow mask boundary and measure average gradient magnitude
    # along the transition zone.
    transition_px = None
    try:
        boundary = cv2.dilate(shadow_mask.astype(np.uint8), None, iterations=2) - \
                   cv2.erode(shadow_mask.astype(np.uint8), None, iterations=2)
        if np.sum(boundary) > 0:
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            mag = np.sqrt(sobel_x ** 2 + sobel_y ** 2)
            boundary_mag = mag[boundary > 0]
            if boundary_mag.size > 0:
                # Inverse of gradient magnitude → transition width.
                # High gradient = sharp edge = small width; low = soft = large.
                mean_mag = float(np.mean(boundary_mag))
                if mean_mag > 1.0:
                    transition_px = round(255.0 / mean_mag, 1)
                else:
                    transition_px = 255.0  # very soft edge
    except Exception:
        pass

    return ShadowEdgeHardness(
        classification=classification,
        transition_width_px=transition_px,
        confidence=round(confidence, 2),
        notes=notes,
    )


def extract_primary_shadow_direction(
    img_bgr: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]],
    skin_mask: np.ndarray,
) -> Optional[PrimaryShadowDirection]:
    """Cue 2: Determine primary shadow direction from face brightness asymmetry.

    Uses two complementary methods:
    1. **Nose shadow position** (primary): Find the darkest valley in the
       central nose region across multiple heights.  The nose shadow falls
       on the side AWAY from the key light — this is the most reliable
       physical indicator, unaffected by clothing occlusion or face turn.
    2. **Half-face brightness** (secondary): Compare left/right mean
       brightness of the face box.  Used as a fallback or cross-check,
       but can be confounded by clothing (hats, feathered collars,
       scarves) covering one side of the face box.

    When the two methods disagree, the nose shadow method takes priority
    because it measures the actual light physics rather than overall
    brightness which can be skewed by non-face content in the face box.
    """
    if face_box is None:
        return PrimaryShadowDirection(
            direction="unknown", confidence=0.0,
            notes=["no_face_data: face_box unavailable"],
        )

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if cv2 is not None else None
    if gray is None:
        return None

    x0, y0, x1, y1 = face_box
    face_gray = gray[y0:y1, x0:x1]
    if face_gray.size < 100:
        return None

    face_h, face_w = face_gray.shape
    mid_x = face_w // 2
    notes: List[str] = []

    # ── Method 1: Nose shadow position ──────────────────────────────
    # The nose casts a shadow on the side away from the key light.
    # Find the darkest valley in the central nose region at multiple
    # heights (y 40-55% of face box) and check which side of center
    # it consistently falls on.
    nose_shadow_side = "unknown"
    nose_shadow_confidence = 0.0
    center_start = int(face_w * 0.30)
    center_end = int(face_w * 0.70)
    center_width = center_end - center_start

    if center_width > 10:
        left_votes = 0
        right_votes = 0
        total_votes = 0
        for pct_y in (0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54):
            row_y = int(face_h * pct_y)
            if row_y < 0 or row_y >= face_h:
                continue
            row = face_gray[row_y, center_start:center_end]
            if row.size < 5:
                continue
            min_idx = int(np.argmin(row))
            min_val = int(row[min_idx])
            # The valley must be reasonably dark (below 50% of overall face mean)
            face_mean = float(np.mean(face_gray))
            if min_val > face_mean * 0.5:
                continue  # No clear shadow valley at this height
            min_x_pct = (center_start + min_idx) / face_w
            total_votes += 1
            if min_x_pct < 0.47:
                left_votes += 1
            elif min_x_pct > 0.53:
                right_votes += 1
            # Between 0.47-0.53 is ambiguous (centered shadow)

        # Require 2+ agreeing rows (lowered from 3) so subtle Rembrandt
        # shadows — where moderate shadow density means fewer rows pass
        # the darkness threshold — still resolve direction.  Confidence
        # is lower at 2 votes (starts at 0.35 vs 0.45 for 3+) so that
        # the half-face method retains priority in ambiguous cases.
        if total_votes >= 2:
            if left_votes > right_votes and left_votes >= total_votes * 0.5:
                nose_shadow_side = "left"
                _base_conf = 0.35 if total_votes == 2 else 0.45
                nose_shadow_confidence = min(0.80, _base_conf + left_votes / total_votes * 0.35)
                notes.append(
                    f"Nose shadow falls LEFT of center ({left_votes}/{total_votes} rows) "
                    f"— key light from camera-right."
                )
            elif right_votes > left_votes and right_votes >= total_votes * 0.5:
                nose_shadow_side = "right"
                _base_conf = 0.35 if total_votes == 2 else 0.45
                nose_shadow_confidence = min(0.80, _base_conf + right_votes / total_votes * 0.35)
                notes.append(
                    f"Nose shadow falls RIGHT of center ({right_votes}/{total_votes} rows) "
                    f"— key light from camera-left."
                )

    # ── Method 2: Half-face brightness comparison ───────────────────
    left_half = face_gray[:, :mid_x]
    right_half = face_gray[:, mid_x:]

    if left_half.size == 0 or right_half.size == 0:
        return None

    left_mean = float(np.mean(left_half))
    right_mean = float(np.mean(right_half))
    diff = abs(left_mean - right_mean)

    overall_mean = float(np.mean(face_gray))
    if overall_mean < 1:
        return None

    relative_diff = diff / overall_mean
    halfface_side = "unknown"
    halfface_confidence = 0.0

    if relative_diff < 0.05:
        halfface_side = "unknown"
        halfface_confidence = 0.2
        notes.append("Face brightness is nearly symmetric — flat or frontal lighting.")
    elif left_mean < right_mean:
        halfface_side = "left"
        halfface_confidence = min(0.8, 0.4 + relative_diff * 3)
        notes.append(f"Left face darker by {diff:.1f} (relative {relative_diff:.2f}).")
    else:
        halfface_side = "right"
        halfface_confidence = min(0.8, 0.4 + relative_diff * 3)
        notes.append(f"Right face darker by {diff:.1f} (relative {relative_diff:.2f}).")

    # ── Method 2b: Clothing interference detection ────────────────
    # Check skin_mask coverage in each half of the face box.  When the
    # "darker" half has significantly lower skin ratio than the brighter
    # half, the darkness likely comes from non-skin content (garments,
    # feathers, accessories, dark hair) rather than actual shadow.
    # In that case, demote half-face confidence so nose shadow can win.
    _clothing_interference = False
    if halfface_side != "unknown" and skin_mask is not None and skin_mask.size > 0:
        face_skin = skin_mask[y0:y1, x0:x1]
        if face_skin.size > 0 and face_skin.shape[1] > 1:
            _fs_mid = face_skin.shape[1] // 2
            left_skin = face_skin[:, :_fs_mid]
            right_skin = face_skin[:, _fs_mid:]
            left_skin_ratio = float(np.mean(left_skin > 0)) if left_skin.size > 0 else 0.0
            right_skin_ratio = float(np.mean(right_skin > 0)) if right_skin.size > 0 else 0.0
            # If the darker half has <60% of the skin coverage of the
            # brighter half, clothing is likely interfering with brightness.
            if halfface_side == "left" and right_skin_ratio > 0.1:
                skin_ratio = left_skin_ratio / max(right_skin_ratio, 0.01)
                if skin_ratio < 0.6:
                    _clothing_interference = True
                    halfface_confidence *= 0.5
                    notes.append(
                        f"Clothing interference: left skin ratio {left_skin_ratio:.2f} "
                        f"vs right {right_skin_ratio:.2f} — dark half has less skin. "
                        f"Half-face confidence reduced."
                    )
            elif halfface_side == "right" and left_skin_ratio > 0.1:
                skin_ratio = right_skin_ratio / max(left_skin_ratio, 0.01)
                if skin_ratio < 0.6:
                    _clothing_interference = True
                    halfface_confidence *= 0.5
                    notes.append(
                        f"Clothing interference: right skin ratio {right_skin_ratio:.2f} "
                        f"vs left {left_skin_ratio:.2f} — dark half has less skin. "
                        f"Half-face confidence reduced."
                    )

    # ── Combine: nose shadow preferred when clothing interferes ────
    # When clothing interference is detected, the nose shadow method is
    # more reliable because it measures actual light physics on skin
    # rather than overall brightness which is skewed by garments.
    # Otherwise, half-face remains primary with nose as cross-check.
    _prefer_nose = (
        _clothing_interference
        and nose_shadow_side != "unknown"
        and nose_shadow_confidence >= 0.4
    )
    if _prefer_nose:
        # Clothing interfered with half-face → trust nose shadow
        # Determine vertical prefix from face brightness split
        _mid_y0 = face_h // 2
        _upper_m0 = float(np.mean(face_gray[:_mid_y0, :])) if _mid_y0 > 0 else 128.0
        _lower_m0 = float(np.mean(face_gray[_mid_y0:, :])) if _mid_y0 < face_h else 128.0
        _v_prefix0 = "lower" if (_lower_m0 - _upper_m0) > 25.0 else "upper"
        direction = f"{_v_prefix0}_{nose_shadow_side}"
        confidence = nose_shadow_confidence
        if halfface_side != "unknown" and halfface_side != nose_shadow_side:
            notes.append(
                f"Nose shadow ({nose_shadow_side}) overrides half-face ({halfface_side}) "
                f"due to clothing interference."
            )
        elif halfface_side == nose_shadow_side:
            confidence = min(0.90, confidence + 0.05)
            notes.append("Nose shadow agrees with half-face despite clothing interference.")
    elif halfface_side != "unknown":
        confidence = halfface_confidence
        # Cross-check with nose shadow
        if nose_shadow_side != "unknown" and nose_shadow_side == halfface_side:
            confidence = min(0.90, confidence + 0.10)
            notes.append("Nose shadow confirms half-face direction.")
        elif nose_shadow_side != "unknown" and nose_shadow_side != halfface_side:
            notes.append(
                f"Nose shadow suggests shadow on {nose_shadow_side} side "
                f"(disagreeing with half-face). Possible hat/hair shadow confound — "
                f"using half-face brightness as primary method."
            )
        # Determine vertical prefix: if bottom of face is brighter than top,
        # key is from below → lower_*; otherwise assume key above → upper_*
        _mid_y = face_h // 2
        _upper_m = float(np.mean(face_gray[:_mid_y, :])) if _mid_y > 0 else 128.0
        _lower_m = float(np.mean(face_gray[_mid_y:, :])) if _mid_y < face_h else 128.0
        _v_prefix = "lower" if (_lower_m - _upper_m) > 25.0 else "upper"
        direction = f"{_v_prefix}_{halfface_side}"
    elif nose_shadow_side != "unknown":
        # Fallback to nose shadow when half-face is inconclusive
        _mid_y2 = face_h // 2
        _upper_m2 = float(np.mean(face_gray[:_mid_y2, :])) if _mid_y2 > 0 else 128.0
        _lower_m2 = float(np.mean(face_gray[_mid_y2:, :])) if _mid_y2 < face_h else 128.0
        _v_prefix2 = "lower" if (_lower_m2 - _upper_m2) > 25.0 else "upper"
        direction = f"{_v_prefix2}_{nose_shadow_side}"
        confidence = nose_shadow_confidence
    else:
        direction = "unknown"
        confidence = 0.2

    # Map direction label to clock position (shadow fall direction)
    _DIR_TO_CLOCK = {
        "upper_left":  10,
        "upper_right":  2,
        "lower_left":   8,
        "lower_right":  4,
        "left":         9,
        "right":        3,
        "below":        6,
    }
    clock_angle = _DIR_TO_CLOCK.get(direction)

    return PrimaryShadowDirection(
        direction=direction,
        clock_angle=clock_angle,
        consistency="unknown",
        confidence=round(confidence, 2),
        notes=notes,
    )


def extract_vertical_light_angle(
    img_bgr: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]],
) -> Optional[VerticalLightAngle]:
    """Cue 3: Estimate vertical light angle from upper/lower face brightness.

    Method: Split face into upper and lower halves. High light = upper brighter;
    eye-level = even; low light = lower brighter.
    """
    if face_box is None:
        return VerticalLightAngle(
            angle="unknown", confidence=0.0,
            notes=["no_face_data: face_box unavailable"],
        )
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    x0, y0, x1, y1 = face_box
    face_gray = gray[y0:y1, x0:x1]
    if face_gray.size < 100:
        return None

    mid_y = face_gray.shape[0] // 2
    upper_half = face_gray[:mid_y, :]
    lower_half = face_gray[mid_y:, :]

    if upper_half.size == 0 or lower_half.size == 0:
        return None

    upper_mean = float(np.mean(upper_half))
    lower_mean = float(np.mean(lower_half))
    diff = upper_mean - lower_mean
    overall = float(np.mean(face_gray))
    if overall < 1:
        return None

    relative_diff = diff / overall

    if relative_diff > 0.08:
        angle = "high"
        evidence = "Upper face significantly brighter than lower — key light is above eye level."
        confidence = min(0.75, 0.4 + relative_diff * 3)
    elif relative_diff < -0.08:
        angle = "low"
        evidence = "Lower face brighter than upper — key light is below eye level (unusual)."
        confidence = min(0.65, 0.3 + abs(relative_diff) * 3)
    else:
        angle = "eye_level"
        evidence = "Upper and lower face brightness similar — key light near eye level."
        confidence = 0.4

    return VerticalLightAngle(
        angle=angle,
        evidence=evidence,
        confidence=round(confidence, 2),
    )


def extract_catchlight_position(
    catchlight_data: Dict[str, Any],
) -> Optional[CatchlightPosition]:
    """Cue 4: Repackage existing catchlight positions into cue model."""
    if not catchlight_data.get("ok") or catchlight_data.get("count", 0) == 0:
        return None

    catchlights = catchlight_data.get("catchlights", [])
    left_positions = [c["position"] for c in catchlights if c.get("eye") == "left"]
    right_positions = [c["position"] for c in catchlights if c.get("eye") == "right"]

    # Assess symmetry
    if left_positions and right_positions:
        if len(left_positions) == len(right_positions):
            symmetry = "symmetric"
        else:
            symmetry = "asymmetric"
    else:
        symmetry = "unknown"

    confidence = 0.7 if (left_positions and right_positions) else 0.4

    return CatchlightPosition(
        left_eye=left_positions,
        right_eye=right_positions,
        symmetry=symmetry,
        confidence=confidence,
    )


def extract_catchlight_shape(
    catchlight_data: Dict[str, Any],
) -> Optional[CatchlightShape]:
    """Cue 5: Repackage existing catchlight shapes and sizes into cue model.

    size_ratio_mean is the mean of per-catchlight (area / iris_area) ratios
    (capped at 0.5 by the vision pass).  We map it to a size_class that
    informs modifier size estimation in infer_source_quality.

    Size thresholds (iris-relative):
      point     < 0.08   bare bulb, small fresnel, direct flash
      small     0.08-0.18  gridded modifier, small beauty dish (~16")
      medium    0.18-0.32  medium octa/softbox (~24-36")
      large     0.32-0.42  large softbox, umbrella (~48-60")
      very_large > 0.42   huge diffusion panel, scrim, full-sky
    """
    if not catchlight_data.get("ok") or catchlight_data.get("count", 0) == 0:
        return None

    catchlights = catchlight_data.get("catchlights", [])
    shapes = [c.get("shape", "unknown") for c in catchlights]
    shapes_seen = list(set(shapes))

    ring_count = shapes.count("ring")
    round_count = shapes.count("round")
    rect_count = shapes.count("rectangular")

    # "ring" (donut/hollow center) is the strongest signal — it's the
    # defining signature of a ring light and harder to false-positive on
    # than plain "round".  If ANY catchlight is "ring", promote it to
    # dominant immediately.  This prevents a mixed ["ring", "round"] pair
    # from averaging down to "round" and losing the ring_light detection.
    if ring_count > 0:
        dominant = "ring"
    elif round_count > rect_count:
        dominant = "round"
    elif rect_count > round_count:
        dominant = "rectangular"
    elif shapes_seen:
        dominant = "mixed"
    else:
        dominant = "unknown"

    # ── Catchlight size → modifier size class ────────────────────────────
    size_ratios = [c.get("size_ratio") for c in catchlights if c.get("size_ratio") is not None]
    size_ratio_mean = float(sum(size_ratios) / len(size_ratios)) if size_ratios else None
    size_class = "unknown"
    if size_ratio_mean is not None:
        if size_ratio_mean < 0.08:
            size_class = "point"
        elif size_ratio_mean < 0.18:
            size_class = "small"
        elif size_ratio_mean < 0.32:
            size_class = "medium"
        elif size_ratio_mean < 0.42:
            size_class = "large"
        else:
            size_class = "very_large"

    notes = []
    if size_ratio_mean is not None:
        notes.append(
            f"Catchlight size_ratio_mean={size_ratio_mean:.3f} → size_class={size_class}."
        )

    confidence = 0.6 if len(shapes) >= 2 else 0.35

    return CatchlightShape(
        dominant_shape=dominant,
        shapes_seen=shapes_seen,
        size_ratio_mean=size_ratio_mean,
        size_class=size_class,
        confidence=confidence,
        notes=notes,
    )


def extract_catchlight_topology(
    topology_data: Dict[str, Any],
) -> Optional[CatchlightTopology]:
    """Extract catchlight topology cue from the catchlight_topology_pass output.

    Repackages the topology pass results into a ``CatchlightTopology`` model.
    Returns None when the pass failed or found zero catchlights.
    """
    if not topology_data.get("ok", False):
        return None

    count = topology_data.get("catchlight_count", 0)
    if count == 0:
        return None

    return CatchlightTopology(
        primary=topology_data.get("primary"),
        secondary=topology_data.get("secondary"),
        tertiary=topology_data.get("tertiary"),
        catchlight_count=count,
        cluster_geometry=topology_data.get("cluster_geometry", "unknown"),
        cluster_spread_deg=topology_data.get("cluster_spread_deg", 0.0),
        inter_catchlight_spacing=topology_data.get("inter_catchlight_spacing"),
        bilateral_symmetry_score=topology_data.get("bilateral_symmetry_score", 0.0),
        confidence=topology_data.get("confidence", 0.0),
        notes=topology_data.get("notes", []),
    )


def extract_highlight_axis_map(
    axis_map_data: Dict[str, Any],
) -> Optional[HighlightAxisMap]:
    """Extract highlight axis map cue from the highlight_axis_map_pass output."""
    if not axis_map_data.get("ok", False):
        return None

    regions = axis_map_data.get("regions", {})
    if not regions:
        return None

    return HighlightAxisMap(
        regions=regions,
        dominant_axis_deg=axis_map_data.get("dominant_axis_deg", 0.0),
        axis_count=axis_map_data.get("axis_count", 0),
        axis_consistency=axis_map_data.get("axis_consistency", 0.0),
        wrap_ratio=axis_map_data.get("wrap_ratio", 0.0),
        confidence=axis_map_data.get("confidence", 0.0),
        notes=axis_map_data.get("notes", []),
    )


def extract_highlight_symmetry(
    symmetry_data: Dict[str, Any],
) -> Optional[HighlightSymmetry]:
    """Extract highlight symmetry cue from the highlight_symmetry_pass output."""
    if not symmetry_data.get("ok", False):
        return None

    return HighlightSymmetry(
        left_intensity=symmetry_data.get("left_intensity", 0.0),
        right_intensity=symmetry_data.get("right_intensity", 0.0),
        symmetry_score=symmetry_data.get("symmetry_score", 0.0),
        dominant_side=symmetry_data.get("dominant_side", "unknown"),
        intensity_ratio=symmetry_data.get("intensity_ratio", 1.0),
        fill_detected=symmetry_data.get("fill_detected", False),
        fill_side=symmetry_data.get("fill_side"),
        underfill_ev=symmetry_data.get("underfill_ev"),
        confidence=symmetry_data.get("confidence", 0.0),
        notes=symmetry_data.get("notes", []),
    )


def extract_continuous_source_signals(
    source_data: Dict[str, Any],
) -> Optional[ContinuousSourceSignals]:
    """Extract continuous source signals cue from the continuous_source_heuristic_pass output."""
    if not source_data.get("ok", False):
        return None

    return ContinuousSourceSignals(
        likely_technology=source_data.get("likely_technology", "unknown"),
        technology_confidence=source_data.get("technology_confidence", 0.0),
        evidence=source_data.get("evidence", []),
        specular_edge_sharpness=source_data.get("specular_edge_sharpness", 0.0),
        color_temp_consistency=source_data.get("color_temp_consistency", 0.0),
        confidence=source_data.get("confidence", 0.0),
        notes=source_data.get("notes", []),
    )


def extract_bounce_contributor(
    bounce_data: Dict[str, Any],
) -> Optional[BounceContributorAnalysis]:
    """Extract bounce contributor analysis from the bounce_contributor_pass output."""
    if not bounce_data.get("ok", False):
        return None

    return BounceContributorAnalysis(
        contributors=bounce_data.get("contributors", []),
        primary_fill_type=bounce_data.get("primary_fill_type", "unknown"),
        fill_to_key_ratio=bounce_data.get("fill_to_key_ratio", 0.0),
        total_bounce_contribution=bounce_data.get("total_bounce_contribution", 0.0),
        confidence=bounce_data.get("confidence", 0.0),
        notes=bounce_data.get("notes", []),
    )


def extract_separation_light(
    sep_data: Dict[str, Any],
) -> Optional[SeparationLightAnalysis]:
    """Extract separation light analysis from the separation_light_pass output."""
    if not sep_data.get("ok", False):
        return None

    return SeparationLightAnalysis(
        has_hair_light=sep_data.get("has_hair_light", False),
        hair_light_direction_deg=sep_data.get("hair_light_direction_deg"),
        hair_light_intensity=sep_data.get("hair_light_intensity", 0.0),
        hair_light_width_ratio=sep_data.get("hair_light_width_ratio", 0.0),
        has_rim_light=sep_data.get("has_rim_light", False),
        rim_side=sep_data.get("rim_side"),
        has_background_spill=sep_data.get("has_background_spill", False),
        spill_vs_intentional_confidence=sep_data.get("spill_vs_intentional_confidence", 0.0),
        confidence=sep_data.get("confidence", 0.0),
        notes=sep_data.get("notes", []),
    )


def extract_off_axis_key(
    off_axis_data: Dict[str, Any],
) -> Optional[OffAxisKeyDetection]:
    """Extract off-axis key detection from the off_axis_key_pass output."""
    if not off_axis_data.get("ok", False):
        return None

    return OffAxisKeyDetection(
        key_azimuth_deg=off_axis_data.get("key_azimuth_deg", 0.0),
        key_elevation_deg=off_axis_data.get("key_elevation_deg", 0.0),
        is_off_axis=off_axis_data.get("is_off_axis", False),
        off_axis_angle_deg=off_axis_data.get("off_axis_angle_deg", 0.0),
        detection_method=off_axis_data.get("detection_method", "unknown"),
        confidence=off_axis_data.get("confidence", 0.0),
        notes=off_axis_data.get("notes", []),
    )


def extract_light_structure(
    structure_data: Dict[str, Any],
) -> Optional[LightStructureDetection]:
    """Extract light structure detection from the light_structure_pass output."""
    if structure_data.get("ok") is False:
        return None

    return LightStructureDetection(
        nose_shadow_shape=structure_data.get("nose_shadow_shape", "unknown"),
        nose_shadow_length_ratio=structure_data.get("nose_shadow_length_ratio", 0.0),
        nose_shadow_angle_deg=structure_data.get("nose_shadow_angle_deg", 0.0),
        triangle_detected=structure_data.get("triangle_detected", False),
        triangle_cheek=structure_data.get("triangle_cheek"),
        triangle_completeness=structure_data.get("triangle_completeness", 0.0),
        pattern_name=structure_data.get("pattern_name", "unknown"),
        confidence=structure_data.get("confidence", 0.0),
        notes=structure_data.get("notes", []),
        # ── Enhanced signals (v2) ──
        nose_shadow_centroid_angle_deg=structure_data.get("nose_shadow_centroid_angle_deg", 0.0),
        nose_shadow_centroid_distance=structure_data.get("nose_shadow_centroid_distance", 0.0),
        left_right_asymmetry=structure_data.get("left_right_asymmetry", 0.0),
        top_bottom_ratio=structure_data.get("top_bottom_ratio", 0.0),
        shadow_density=structure_data.get("shadow_density", 0.0),
        triangle_isolation=structure_data.get("triangle_isolation", 0.0),
        highlight_width_ratio=structure_data.get("highlight_width_ratio", 0.0),
    )


def extract_highlight_to_shadow_transition(
    img_bgr: np.ndarray,
    skin_mask: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> Optional[HighlightToShadowTransition]:
    """Cue 6: Measure how gradually highlights transition to shadows on skin.

    Method: Histogram of skin luminance. Bimodal = sharp; unimodal spread = gradual.

    Constrained to face box when available: neck/shoulder skin may have different
    lighting than the face (e.g. rim light on shoulder, fill on neck) and would
    contaminate the histogram with irrelevant luminance values.
    """
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Prefer face-box-constrained skin pixels.
    if face_box is not None:
        _h, _w = gray.shape
        _fx0, _fy0, _fx1, _fy1 = face_box
        _face_only = np.zeros((_h, _w), dtype=bool)
        _face_only[_fy0:_fy1, _fx0:_fx1] = True
        _face_skin = skin_mask & _face_only
        skin_pixels = gray[_face_skin] if _face_skin.any() else gray[skin_mask]
    else:
        skin_pixels = gray[skin_mask]

    if skin_pixels.size < 200:
        return None

    # Compute histogram
    hist, _ = np.histogram(skin_pixels, bins=32, range=(0, 256))
    hist_norm = hist.astype(float) / max(hist.sum(), 1)

    # Check for bimodality: two peaks separated by a valley
    peaks = []
    for i in range(1, len(hist_norm) - 1):
        if hist_norm[i] > hist_norm[i - 1] and hist_norm[i] > hist_norm[i + 1]:
            if hist_norm[i] > 0.03:
                peaks.append(i)

    std_dev = float(np.std(skin_pixels))
    relative_std = std_dev / 255.0

    if len(peaks) >= 2 and (peaks[-1] - peaks[0]) > 8:
        rate = "sharp"
        confidence = min(0.7, 0.4 + (peaks[-1] - peaks[0]) * 0.02)
    elif relative_std > 0.15:
        rate = "mixed"
        confidence = 0.4
    else:
        rate = "gradual"
        confidence = min(0.7, 0.4 + (0.2 - relative_std) * 3)

    return HighlightToShadowTransition(
        rate=rate,
        transition_zone_width=round(relative_std, 3),
        confidence=round(confidence, 2),
        notes=[f"Skin luminance std: {std_dev:.1f}, peaks: {len(peaks)}"],
    )


def extract_contrast_ratio(
    img_bgr: np.ndarray,
    person_mask: np.ndarray,
    face_box: Optional[tuple] = None,
) -> Optional[ContrastRatio]:
    """Cue 7: Measure overall contrast ratio of the person region.

    When face_box is provided, also computes a face-region-only contrast label
    stored in ``face_label``.  Dark clothing inflates the person-region spread
    to "high"/"extreme" even when the face is evenly lit; face_label is used by
    downstream gates (e.g. triangle detection) that care about lighting contrast
    on the face, not clothing contrast.
    """
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    person_pixels = gray[person_mask]
    if person_pixels.size < 100:
        return None

    p5 = float(np.percentile(person_pixels, CONTRAST.PERCENTILE_LOW))
    p95 = float(np.percentile(person_pixels, CONTRAST.PERCENTILE_HIGH))

    if p5 < 1:
        p5 = 1.0
    ratio = p95 / p5
    spread = (p95 - p5) / 255.0

    if spread < CONTRAST.SPREAD_LOW:
        label = "low"
    elif spread < CONTRAST.SPREAD_MEDIUM:
        label = "medium"
    elif spread < CONTRAST.SPREAD_HIGH:
        label = "high"
    else:
        label = "extreme"

    confidence = 0.7  # histogram-based, fairly reliable

    # Face-region contrast — only when face_box available and big enough
    face_label: Optional[str] = None
    if face_box is not None:
        try:
            x0, y0, x1, y1 = face_box
            h, w = gray.shape[:2]
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(w, x1), min(h, y1)
            face_region = gray[y0:y1, x0:x1]
            if face_region.size >= 200:
                fp5 = float(np.percentile(face_region, CONTRAST.PERCENTILE_LOW))
                fp95 = float(np.percentile(face_region, CONTRAST.PERCENTILE_HIGH))
                if fp5 < 1:
                    fp5 = 1.0
                face_spread = (fp95 - fp5) / 255.0
                if face_spread < CONTRAST.SPREAD_LOW:
                    face_label = "low"
                elif face_spread < CONTRAST.SPREAD_MEDIUM:
                    face_label = "medium"
                elif face_spread < CONTRAST.SPREAD_HIGH:
                    face_label = "high"
                else:
                    face_label = "extreme"
        except Exception:
            face_label = None

    return ContrastRatio(
        ratio=round(ratio, 2),
        label=label,
        face_label=face_label,
        confidence=confidence,
        notes=[f"P5={p5:.0f}, P95={p95:.0f}, spread={spread:.2f}"],
    )


def extract_subject_background_separation(
    img_bgr: np.ndarray,
    person_mask: np.ndarray,
    background_mask: np.ndarray,
) -> Optional[SubjectBackgroundSeparation]:
    """Cue 8: Measure luminance separation between subject and background."""
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    person_px = gray[person_mask]
    bg_px = gray[background_mask]

    if person_px.size < 100 or bg_px.size < 100:
        return None

    person_mean = float(np.mean(person_px))
    bg_mean = float(np.mean(bg_px))
    delta = abs(person_mean - bg_mean) / 255.0

    if delta > SEPARATION.SHARP_DELTA:
        edge_sharpness = "sharp"
    elif delta > SEPARATION.GRADUAL_DELTA:
        edge_sharpness = "gradual"
    else:
        edge_sharpness = "none"

    confidence = min(0.75, 0.4 + delta)

    return SubjectBackgroundSeparation(
        luminance_delta=round(delta, 3),
        edge_sharpness=edge_sharpness,
        confidence=round(confidence, 2),
        notes=[f"Subject mean: {person_mean:.0f}, BG mean: {bg_mean:.0f}"],
    )


def extract_background_illumination(
    img_bgr: np.ndarray,
    background_mask: np.ndarray,
) -> Optional[BackgroundIllumination]:
    """Cue 9: Characterize background illumination pattern."""
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bg_pixels = gray[background_mask]

    if bg_pixels.size < 500:
        return None

    bg_mean = float(np.mean(bg_pixels))
    bg_std = float(np.std(bg_pixels))

    # Relative brightness — compare BG against foreground (subject) pixels.
    # Using overall image mean is misleading when the subject is dominated by
    # dark clothing (hat, feathers, dark suit) which drags down the mean and
    # makes a mid-grey backdrop appear "brighter than subject".  Foreground
    # pixels give a more perceptually accurate comparison.
    fg_pixels = gray[~background_mask]
    if fg_pixels.size > 0:
        # Use the 90th percentile of foreground luminance (approximates
        # skin/highlight areas) rather than the mean, which is skewed by
        # dark clothing.  Photographers judge "darker/brighter than subject"
        # relative to the lit face, not the dark outfit.
        fg_ref = float(np.percentile(fg_pixels, 90))
    else:
        fg_ref = float(np.mean(gray))
    if bg_mean > fg_ref + BG.BRIGHTNESS_DELTA:
        brightness_relative = "brighter"
    elif bg_mean < fg_ref - BG.BRIGHTNESS_DELTA:
        brightness_relative = "darker"
    else:
        brightness_relative = "similar"

    # Pattern classification.
    # P2f: Check mean brightness FIRST — a dark background is studio-controlled
    # regardless of std (which contrast grading inflates in dark areas).
    if bg_mean < BG.DARK_MEAN:
        pattern = "dark"
    elif bg_mean < BG.DARK_MEDIUM_MEAN and brightness_relative == "darker" and bg_std < BG.STUDIO_STD_MAX:
        # Moderately dark, darker than subject, AND low variation →
        # controlled studio bg.  High std (>= 40) with moderate mean
        # suggests an environmental interior (café, room), not a studio
        # backdrop — the variation comes from real scene content.
        pattern = "dark"
    elif bg_std < BG.EVEN_STD:
        pattern = "even"
    elif bg_std < BG.STUDIO_STD_MAX:
        pattern = "gradient"
    elif bg_std < BG.GRADIENT_STD_MAX and brightness_relative in ("darker", "similar") and bg_mean >= BG.GRADIENT_MEAN_MIN:
        # P2c: Mid-tone backgrounds (80-200 mean) with moderate std (40-60)
        # that are darker/similar to the subject are typically studio
        # backdrops with vignette or slight falloff, not environmental.
        # P2d: Require bg_mean >= 80 — below 80 with std > 40 is a dimly
        # lit environmental interior (café, room), where the high variation
        # comes from scene content rather than backdrop gradient.
        pattern = "gradient"
    elif bg_std < BG.GRADIENT_STD_MAX and bg_mean < BG.DARK_GARMENT_CORRECTION_MEAN and brightness_relative == "brighter":
        # Dark-garment correction: when the subject is dominated by dark
        # clothing (hat, feathers, dark fabric), overall image mean drops
        # well below bg_mean, making the BG appear "brighter".  But a
        # bg_mean < 120 with moderate std is still a controlled studio
        # backdrop with gradient falloff, not environmental.
        pattern = "gradient"
    else:
        pattern = "environmental"

    confidence = 0.55

    notes_list = [f"BG mean: {bg_mean:.0f}, std: {bg_std:.1f}"]
    if bg_mean < BG.DARK_MEDIUM_MEAN and brightness_relative == "darker" and bg_std >= BG.STUDIO_STD_MAX:
        notes_list.append(
            "P2f: Dark background with elevated std (likely contrast grading) "
            "→ classified as 'dark' (studio) rather than 'environmental'."
        )

    return BackgroundIllumination(
        pattern=pattern,
        brightness_relative=brightness_relative,
        confidence=confidence,
        notes=notes_list,
    )


def extract_specular_highlight_behavior(
    img_bgr: np.ndarray,
    skin_mask: np.ndarray,
    person_mask: Optional[np.ndarray] = None,
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> Optional[SpecularHighlightBehavior]:
    """Cue 10: Analyze specular highlights on skin (bright spots).

    Falls back to person_mask when skin_mask has insufficient pixels
    (e.g. B&W images where skin segmentation fails).

    Constrained to face box when available: specular highlights on the face
    encode key light position and intensity. Shoulder/arm highlights may come
    from rim or fill lights and inflate the count, obscuring the key signal.
    """
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Choose the best available mask: skin_mask preferred, person_mask fallback
    active_mask = skin_mask
    is_fallback = False
    skin_pixels = gray[skin_mask] if skin_mask is not None else np.array([])
    if skin_pixels.size < 200 and person_mask is not None:
        person_pixels = gray[person_mask]
        if person_pixels.size >= 200:
            active_mask = person_mask
            is_fallback = True
            skin_pixels = person_pixels

    if skin_pixels.size < 200:
        return None

    # Constrain to face box: face highlights encode key light; body highlights inflate counts.
    if face_box is not None and active_mask is not None:
        _h, _w = gray.shape
        _fx0, _fy0, _fx1, _fy1 = face_box
        _face_only = np.zeros((_h, _w), dtype=bool)
        _face_only[_fy0:_fy1, _fx0:_fx1] = True
        _face_constrained = active_mask & _face_only
        _face_px = gray[_face_constrained] if _face_constrained.any() else np.array([])
        if _face_px.size >= 100:
            active_mask = _face_constrained
            skin_pixels = _face_px

    # Specular highlights: very bright pixels in skin/person region
    threshold = max(SPECULAR.BRIGHT_THRESHOLD, float(np.percentile(skin_pixels, 95)))
    bright_mask = active_mask & (gray > threshold)
    bright_count = int(np.sum(bright_mask))
    area = int(np.sum(active_mask))

    if area == 0:
        return None

    bright_ratio = bright_count / area

    if bright_ratio > SPECULAR.RATIO_STRONG:
        intensity = "strong"
        spread = "broad"
    elif bright_ratio > SPECULAR.RATIO_MODERATE:
        intensity = "moderate"
        spread = "tight"
    elif bright_ratio > SPECULAR.RATIO_SUBTLE:
        intensity = "subtle"
        spread = "tight"
    else:
        intensity = "none"
        spread = "unknown"

    confidence = 0.5 if bright_count > 10 else 0.3
    # Lower confidence when using person_mask fallback (less precise than skin)
    if is_fallback:
        confidence = round(confidence * 0.7, 2)

    notes_list = [f"Bright pixel ratio: {bright_ratio:.4f} ({bright_count}/{area})"]
    if is_fallback:
        notes_list.append("Used person_mask fallback (no skin detected)")

    return SpecularHighlightBehavior(
        intensity=intensity,
        spread=spread,
        count_estimate=min(bright_count, 100),
        confidence=confidence,
        notes=notes_list,
    )


def _parse_clock(pos_text: str) -> Optional[int]:
    """Parse '5 o'clock' → 5."""
    import re
    m = re.match(r"(\d+)\s*o'?clock", str(pos_text).lower().strip())
    return int(m.group(1)) if m else None


def _dedup_catchlights_per_eye(
    catchlights: list, eye_label: str,
) -> list:
    """P2e: Deduplicate catchlights for one eye.

    1.  Drop floor reflections: 5–7 o'clock with below-median intensity.
    2.  Group remaining by proximity — catchlights within ±1 clock position
        are likely the same source; keep the brightest.
    """
    eye_cals = [c for c in catchlights if c.get("eye") == eye_label]
    if not eye_cals:
        return []

    # Median intensity for floor-reflection filtering
    intensities = [c.get("intensity", 0.5) for c in eye_cals]
    med_intensity = sorted(intensities)[len(intensities) // 2]

    # Pass 1: remove likely floor reflections (5–7 o'clock).
    # Two heuristics:
    #   a) Below-median intensity at 5-7 o'clock → almost certainly floor bounce.
    #   b) When 3+ catchlights exist per eye, 5-7 o'clock positions are floor
    #      reflections regardless of intensity (genuine 3+ light setups rarely
    #      place a source directly below).
    _many_catchlights = len(eye_cals) >= 3
    filtered = []
    for c in eye_cals:
        clock = _parse_clock(c.get("position", ""))
        if clock is not None and clock in (5, 6, 7):
            if c.get("intensity", 0.5) < med_intensity:
                continue  # low-intensity floor reflection
            if _many_catchlights:
                continue  # 3+ catchlights = floor bounce very likely
        filtered.append(c)

    # Pass 2: group by proximity — within ±1 clock position = same source.
    # Soft modifiers (softboxes, umbrellas) can span adjacent clock positions;
    # different parts of the same modifier reflect at slightly different angles.
    #
    # Proximity threshold is ±1, not ±2: a ±2 window collapses 11, 12, and 1
    # o'clock into one cluster, discarding genuine off-axis key catchlights
    # (e.g. loop key at 1 o'clock merged with a brighter strip at 12 o'clock).
    #
    # Shape-agreement guard: different shapes at adjacent positions are likely
    # different sources (e.g. rectangular softbox at 1 o'clock vs strip at 12).
    # Only merge if shapes match OR one shape is unknown.
    def _clock_key(c):
        ck = _parse_clock(c.get("position", ""))
        return ck if ck is not None else 99

    filtered.sort(key=_clock_key)
    deduped = []
    for c in filtered:
        ck = _parse_clock(c.get("position", ""))
        if ck is None:
            deduped.append(c)
            continue
        c_shape = (c.get("shape") or "").lower()
        # Check if any existing deduped catchlight is within ±1
        merged = False
        for i, d in enumerate(deduped):
            dk = _parse_clock(d.get("position", ""))
            if dk is not None:
                diff = min(abs(ck - dk), 12 - abs(ck - dk))  # circular
                d_shape = (d.get("shape") or "").lower()
                # Only merge if within ±1 AND shapes agree (or one is unknown)
                shape_agree = (not c_shape or not d_shape or c_shape == d_shape)
                if diff <= 1 and shape_agree:
                    # Keep the brighter one
                    if c.get("intensity", 0) > d.get("intensity", 0):
                        deduped[i] = c
                    merged = True
                    break
        if not merged:
            deduped.append(c)

    return deduped


def extract_reflection_architecture(
    catchlight_data: Dict[str, Any],
) -> Optional[ReflectionArchitecture]:
    """Cue 11: Overall catchlight count and symmetry across both eyes.

    P2e: Uses deduplication to filter floor reflections and group nearby
    catchlights as the same source before counting.
    """
    if not catchlight_data.get("ok"):
        return None

    catchlights = catchlight_data.get("catchlights", [])
    left_deduped = _dedup_catchlights_per_eye(catchlights, "left")
    right_deduped = _dedup_catchlights_per_eye(catchlights, "right")

    left_count = len(left_deduped)
    right_count = len(right_deduped)
    total = left_count + right_count

    if total == 0:
        symmetry_score = 0.0
    elif left_count == right_count:
        symmetry_score = 1.0
    else:
        symmetry_score = round(min(left_count, right_count) / max(left_count, right_count), 2)

    confidence = 0.6 if total >= 2 else 0.3

    raw_left = len([c for c in catchlights if c.get("eye") == "left"])
    raw_right = len([c for c in catchlights if c.get("eye") == "right"])
    notes_list = []
    if raw_left + raw_right != total:
        notes_list.append(
            f"Deduped catchlights: {raw_left + raw_right} raw → {total} "
            f"(L:{raw_left}→{left_count}, R:{raw_right}→{right_count})"
        )

    return ReflectionArchitecture(
        total_catchlights=total,
        per_eye_counts={"left": left_count, "right": right_count},
        symmetry_score=symmetry_score,
        confidence=confidence,
        notes=notes_list,
    )


def extract_multi_shadow_detection(
    img_bgr: np.ndarray,
    person_mask: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> Optional[MultiShadowDetection]:
    """Cue 12: Detect multiple distinct shadow directions (multi-light setup).

    Method: Edge detection in shadow regions, then look for multiple distinct
    edge orientations via gradient direction histogram.

    Constrained to an expanded face region when available: clothing folds, hair,
    and limb contours in the full person mask produce spurious edge directions
    that read as multi-source lighting. Face/neck shadows directly encode
    key and fill geometry.  Face box is expanded 40% below (neck/chin) and 20%
    horizontally to capture shoulder-adjacent shadow directions.
    """
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Constrain to expanded face region when available.
    active_mask = person_mask
    if face_box is not None:
        _h, _w = gray.shape
        _fx0, _fy0, _fx1, _fy1 = face_box
        _fh = _fy1 - _fy0
        _fw = _fx1 - _fx0
        _pad_x = int(_fw * 0.2)
        _pad_y_above = int(_fh * 0.2)
        _pad_y_below = int(_fh * 0.4)  # more below to include neck/chin shadows
        _ex0 = max(0, _fx0 - _pad_x)
        _ey0 = max(0, _fy0 - _pad_y_above)
        _ex1 = min(_w, _fx1 + _pad_x)
        _ey1 = min(_h, _fy1 + _pad_y_below)
        _expanded = np.zeros((_h, _w), dtype=bool)
        _expanded[_ey0:_ey1, _ex0:_ex1] = True
        _face_region = person_mask & _expanded
        if np.sum(_face_region) >= 50:
            active_mask = _face_region

    person_pixels = gray[active_mask]
    if person_pixels.size < 200:
        return None

    # Shadow region
    p30 = np.percentile(person_pixels, 30)
    shadow_mask = active_mask & (gray <= p30)

    if np.sum(shadow_mask) < 50:
        return MultiShadowDetection(shadow_count=0, confidence=0.3,
                                     notes=["Too few shadow pixels for multi-shadow analysis."])

    # Sobel gradients for direction
    masked_gray = gray.copy()
    masked_gray[~active_mask] = 128  # neutral

    gx = cv2.Sobel(masked_gray, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(masked_gray, cv2.CV_64F, 0, 1, ksize=3)

    # Only shadow boundary pixels
    angles = np.arctan2(gy[shadow_mask], gx[shadow_mask])
    magnitudes = np.sqrt(gx[shadow_mask] ** 2 + gy[shadow_mask] ** 2)

    # Filter by significant gradient magnitude
    significant = magnitudes > np.percentile(magnitudes, 70)
    if np.sum(significant) < 20:
        return MultiShadowDetection(shadow_count=1, confidence=0.3,
                                     notes=["Weak shadow gradients — likely single source."])

    sig_angles = angles[significant]

    # Bin angles into 8 directions (45-degree bins)
    bins = np.histogram(sig_angles, bins=8, range=(-np.pi, np.pi))[0]
    bins_norm = bins / max(bins.sum(), 1)

    # Count dominant directions (bins with >15% of edges)
    dominant_dirs = int(np.sum(bins_norm > 0.15))

    if dominant_dirs >= 3:
        shadow_count = min(dominant_dirs, 4)
        confidence = 0.5
    elif dominant_dirs == 2:
        shadow_count = 2
        confidence = 0.45
    else:
        shadow_count = 1
        confidence = 0.4

    return MultiShadowDetection(
        shadow_count=shadow_count,
        angular_spread=None,
        confidence=confidence,
        notes=[f"Dominant gradient directions: {dominant_dirs}, bin distribution: {bins_norm.round(2).tolist()}"],
    )


def extract_environmental_shadow_continuity(
    img_bgr: np.ndarray,
    background_mask: np.ndarray,
    classification: Optional[Dict[str, Any]] = None,
) -> Optional[EnvironmentalShadowContinuity]:
    """Cue 13: Detect natural/environmental vs artificial light indicators.

    Indicators for natural light:
    - Warm color temperature in background
    - Uneven background with organic patterns
    - Mixed hard/soft shadow edges (dappled foliage)

    Indicators for artificial light:
    - Even background with controlled falloff
    - Neutral/cool color temperature
    - Clean, consistent shadow edges
    """
    if cv2 is None:
        return None

    hints: List[str] = []
    notes: List[str] = []

    # Color temperature from background
    bg_pixels = img_bgr[background_mask]
    if bg_pixels.size < 300:
        return EnvironmentalShadowContinuity(
            has_natural_indicators=False,
            has_artificial_indicators=False,
            confidence=0.2,
            notes=["Insufficient background pixels for environment analysis."],
        )

    # Average B, G, R channels in background
    mean_bgr = np.mean(bg_pixels.reshape(-1, 3), axis=0)
    warm_bias = float(mean_bgr[2] - mean_bgr[0])  # R - B

    if warm_bias > ENVIRONMENT.WARM_BIAS:
        hints.append("warm_background")
        notes.append(f"Background warm bias: {warm_bias:.1f} (R-B)")

    # Background texture variance (natural scenes have more texture)
    bg_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bg_std = float(np.std(bg_gray[background_mask]))

    if bg_std > ENVIRONMENT.TEXTURE_STD_ENV:
        hints.append("textured_background")
        notes.append(f"Background texture std: {bg_std:.1f} — environmental/outdoor likely.")

    # Check classification hint
    if classification and classification.get("colorTemperature") == "warm":
        hints.append("warm_overall")

    # Dappled foliage hint: high variance + warm + green presence
    bg_rgb = bg_pixels[:, ::-1]  # BGR → RGB
    mean_rgb = np.mean(bg_rgb.reshape(-1, 3), axis=0)
    green_dominance = mean_rgb[1] - (mean_rgb[0] + mean_rgb[2]) / 2
    if green_dominance > ENVIRONMENT.GREEN_DOMINANCE and bg_std > ENVIRONMENT.DAPPLED_STD_MIN:
        hints.append("dappled_foliage")
        notes.append("Green-biased background with high texture — possible dappled foliage light.")

    has_natural = len(hints) >= 2 or "dappled_foliage" in hints
    has_artificial = bg_std < ENVIRONMENT.ARTIFICIAL_STD_MAX and abs(warm_bias) < ENVIRONMENT.ARTIFICIAL_WARM_MAX

    if has_artificial:
        hints.append("controlled_background")
        notes.append("Low-variance neutral background — studio/controlled environment likely.")

    confidence = 0.5 if (has_natural or has_artificial) else 0.25

    return EnvironmentalShadowContinuity(
        has_natural_indicators=has_natural,
        has_artificial_indicators=has_artificial,
        environment_hints=hints,
        confidence=confidence,
        notes=notes,
    )


def extract_pose_induced_shadow_interference(
    pose_data: Dict[str, Any],
    img_bgr: np.ndarray,
    skin_mask: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]],
) -> Optional[PoseInducedShadowInterference]:
    """Cue 14: Detect shadows caused by pose rather than lighting.

    Common pose-induced shadows:
    - Chin down → shadow on neck/chest
    - Crossed arms → shadow on torso
    - Hand on face → shadow on cheek

    We detect these by checking for dark regions immediately below/adjacent
    to the face that are inconsistent with the overall lighting direction.
    """
    if not pose_data or not pose_data.get("ok"):
        return PoseInducedShadowInterference(
            detected=False,
            severity="none",
            confidence=0.2,
            notes=["No pose data available for interference analysis."],
        )

    if face_box is None:
        return PoseInducedShadowInterference(
            detected=False, severity="none", confidence=0.0,
            notes=["no_face_data: face_box unavailable"],
        )
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    x0, y0, x1, y1 = face_box
    face_height = y1 - y0

    regions: List[str] = []
    notes: List[str] = []

    # Check region below face (chin shadow on neck/chest)
    chin_y0 = min(y1, h - 1)
    chin_y1 = min(y1 + face_height // 2, h)
    if chin_y1 > chin_y0:
        chin_region = gray[chin_y0:chin_y1, x0:x1]
        face_region = gray[y0:y1, x0:x1]
        if chin_region.size > 50 and face_region.size > 50:
            chin_mean = float(np.mean(chin_region))
            face_mean = float(np.mean(face_region))
            if face_mean > 0 and (face_mean - chin_mean) / face_mean > 0.25:
                regions.append("chin_shadow")
                notes.append(f"Dark region below face (delta={face_mean - chin_mean:.0f}) — likely chin shadow.")

    # Check pose type for interference risk
    pose_label = pose_data.get("pose", "unknown")
    framing = pose_data.get("framing", "unknown")
    if pose_label == "sitting" or framing == "half_body":
        notes.append("Seated/half-body pose — arm and body shadows may interfere with lighting inference.")

    detected = len(regions) > 0
    severity = "none"
    if len(regions) >= 2:
        severity = "moderate"
    elif len(regions) == 1:
        severity = "mild"

    confidence = 0.5 if detected else 0.3

    return PoseInducedShadowInterference(
        detected=detected,
        interference_regions=regions,
        severity=severity,
        confidence=confidence,
        notes=notes,
    )


def extract_tonal_processing_estimation(
    img_bgr: np.ndarray,
    classification: Optional[Dict[str, Any]] = None,
    is_grayscale_like: bool = False,
) -> Optional[TonalProcessingEstimation]:
    """Cue 15: Detect heavy tonal processing (B&W, high-contrast grade, film look).

    When detected, downstream inference should discount color cues and note
    that contrast may be editorial rather than from lighting.
    """
    if cv2 is None:
        return None

    notes: List[str] = []
    is_bw = is_grayscale_like
    if is_bw:
        notes.append("Image is grayscale / B&W — color-based cues are unreliable.")

    # Check saturation
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    mean_sat = float(np.mean(hsv[:, :, 1]))

    # P2a: Warm-toned B&W detection — sepia, selenium, silver-gelatin prints
    # have slight colour cast so is_grayscale_like misses them.
    # Two complementary checks:
    #   1) Low mean saturation + low p90 (catches most warm B&W)
    #   2) >90% of pixels below saturation 40 (catches warm B&W with
    #      compression artefacts that spike p99 but don't affect bulk)
    # Using p90 instead of p99 avoids false negatives from isolated hot
    # pixels in JPEG/WebP artefact zones.
    if not is_bw and mean_sat < TONAL.WARM_BW_MEAN_SAT:
        sat_channel = hsv[:, :, 1]
        p90_sat = float(np.percentile(sat_channel, 90))
        pct_low_sat = float(np.sum(sat_channel < TONAL.LOW_SAT_THRESHOLD)) / sat_channel.size * 100
        if p90_sat < TONAL.WARM_BW_P90_SAT or pct_low_sat > TONAL.LOW_SAT_PIXEL_PCT:
            is_bw = True
            notes.append(
                f"Warm-toned B&W detected (mean sat={mean_sat:.0f}, "
                f"p90 sat={p90_sat:.0f}, {pct_low_sat:.0f}% below 40) "
                f"— treating as monochrome."
            )

    # Channel-difference B&W detection — catches dark images where HSV
    # saturation is misleadingly high.  In dark pixels, even tiny RGB
    # differences (e.g. RGB 20,18,15) produce high HSV saturation because
    # S = (max-min)/max amplifies noise when max is small.  RGB channel
    # differences are immune to this artefact.
    if not is_bw:
        b_ch = img_bgr[:, :, 0].astype(np.float32)
        g_ch = img_bgr[:, :, 1].astype(np.float32)
        r_ch = img_bgr[:, :, 2].astype(np.float32)
        avg_diff = float(
            np.mean(np.abs(r_ch - g_ch))
            + np.mean(np.abs(g_ch - b_ch))
            + np.mean(np.abs(r_ch - b_ch))
        )
        if avg_diff < TONAL.CHANNEL_DIFF_BW:
            is_bw = True
            notes.append(
                f"Channel-difference B&W detected (avg RGB diff sum={avg_diff:.1f}, "
                f"HSV sat={mean_sat:.0f}) — RGB channels nearly identical despite "
                f"high HSV saturation in dark regions."
            )

    is_desaturated = mean_sat < TONAL.DESATURATED_SAT
    if is_desaturated and not is_bw:
        notes.append(f"Very low saturation ({mean_sat:.0f}) — desaturated processing likely.")

    # Check contrast from classification
    is_high_contrast = False
    if classification:
        light_quality = classification.get("lightQuality", "")
        brightness = classification.get("brightness", "")
        if light_quality == "hard" and brightness == "low":
            is_high_contrast = True
            notes.append("Hard light + low brightness from palette — possible high-contrast grading.")

    # Also check histogram spread
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    p1 = float(np.percentile(gray, 1))
    p5 = float(np.percentile(gray, 5))
    p95 = float(np.percentile(gray, 95))
    p99 = float(np.percentile(gray, 99))
    if p99 - p1 > TONAL.HCG_TONAL_RANGE_MIN and mean_sat < TONAL.HCG_SATURATION_MAX:
        is_high_contrast = True
        notes.append(f"Near-full tonal range ({p1:.0f}–{p99:.0f}) with low saturation — high-contrast grade.")

    # Crushed shadows / clipped highlights detection: even with saturated
    # colours, aggressive tone curves compress shadows or highlights,
    # amplifying shadow edge density and causing false "hard" classifications.
    shadow_crush = (p5 - p1 < TONAL.CRUSH_P5_DELTA) and (p1 < TONAL.CRUSH_P1_MAX)
    highlight_clip = (p99 - p95 < TONAL.CLIP_P99_DELTA) and (p99 > TONAL.CLIP_P99_MIN)
    if not is_high_contrast and (shadow_crush and highlight_clip):
        is_high_contrast = True
        notes.append(
            f"Crushed shadows (p1={p1:.0f}, p5={p5:.0f}) + clipped highlights "
            f"(p95={p95:.0f}, p99={p99:.0f}) — heavy contrast grading detected."
        )
    elif not is_high_contrast and shadow_crush and (p99 - p1 > TONAL.CRUSH_RANGE_MIN):
        is_high_contrast = True
        notes.append(
            f"Crushed shadows (p1={p1:.0f}, p5={p5:.0f}) with wide tonal range "
            f"({p1:.0f}–{p99:.0f}) — contrast grading detected."
        )

    # Determine processing label
    if is_bw:
        processing = "bw"
    elif is_high_contrast and is_desaturated:
        processing = "heavy_grade"
    elif is_high_contrast:
        processing = "high_contrast"
    elif is_desaturated:
        processing = "film_emulation"
    else:
        processing = "none"

    confidence = 0.7 if (is_bw or is_high_contrast) else (0.5 if is_desaturated else 0.3)

    return TonalProcessingEstimation(
        is_bw=is_bw,
        is_high_contrast_grade=is_high_contrast,
        is_desaturated=is_desaturated,
        highlights_clipped=bool(highlight_clip),
        estimated_processing=processing,
        mean_saturation=round(mean_sat, 1),
        confidence=confidence,
        notes=notes,
    )


# ── Cue 16: Shadow Interruption Pattern ──────────────────────────────────

def extract_shadow_interruption_pattern(
    img_bgr: np.ndarray,
    person_mask: np.ndarray,
    skin_mask: np.ndarray,
    face_box: Optional[Tuple[int, int, int, int]],
) -> Optional[ShadowInterruptionPattern]:
    """Cue 16: Detect shadow interruption patterns (gobo / projection / slit).

    Method
    ------
    1. Isolate shadow region within expanded face bounding box.
    2. Canny edge detection on shadow boundaries.
    3. ``cv2.HoughLinesP`` to find straight line segments.
    4. Score lines for parallelism, periodicity, and facial-contour
       incongruence.
    5. Classify as ``geometric_bar``, ``patterned_projection``, or ``unknown``.

    Coordination with other cues:
    - Cue 1 (ShadowEdgeHardness) measures overall hard/soft — this cue
      measures *line geometry* within hard-shadow regions.
    - Cue 12 (MultiShadowDetection) counts shadows by gradient direction —
      this cue looks for *straight parallel lines*, a different signal.
    """
    if face_box is None:
        return ShadowInterruptionPattern(
            detected=False, classification="none", confidence=0.0,
            notes=["no_face_data: face_box unavailable"],
        )
    if cv2 is None:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    # ── 1. Shadow mask within expanded face region ──
    x0, y0, x1, y1 = face_box
    pad_x = int((x1 - x0) * 0.2)
    pad_y = int((y1 - y0) * 0.2)
    rx0, ry0 = max(0, x0 - pad_x), max(0, y0 - pad_y)
    rx1, ry1 = min(w, x1 + pad_x), min(h, y1 + pad_y)

    face_region_mask = np.zeros_like(gray, dtype=bool)
    face_region_mask[ry0:ry1, rx0:rx1] = True
    analysis_mask = (person_mask > 0) & face_region_mask

    person_pixels = gray[analysis_mask]
    if person_pixels.size < 200:
        return None

    p33 = float(np.percentile(person_pixels, 33))
    shadow_mask = analysis_mask & (gray <= p33)
    if int(np.sum(shadow_mask)) < 50:
        return None

    # ── 2. Canny edges near shadow boundaries ──
    masked_gray = gray.copy()
    masked_gray[~analysis_mask] = 128
    edges = cv2.Canny(masked_gray, 50, 150)

    kernel = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(shadow_mask.astype(np.uint8), kernel, iterations=1)
    shadow_boundary = dilated.astype(bool) & ~shadow_mask
    boundary_edges = edges.copy()
    boundary_edges[~(shadow_boundary | shadow_mask)] = 0
    # Restrict to face region
    boundary_edges[:ry0, :] = 0
    boundary_edges[ry1:, :] = 0
    boundary_edges[:, :rx0] = 0
    boundary_edges[:, rx1:] = 0

    # ── 3. HoughLinesP ──
    face_w = max(x1 - x0, 1)
    min_len = max(20, face_w // 6)
    lines = cv2.HoughLinesP(
        boundary_edges, rho=1, theta=np.pi / 180,
        threshold=30, minLineLength=min_len, maxLineGap=10,
    )

    if lines is None or len(lines) < 2:
        return ShadowInterruptionPattern(
            detected=False,
            classification="none",
            confidence=0.3,
            notes=["Fewer than 2 line segments in shadow region."],
        )

    line_count = len(lines)
    notes: List[str] = [f"HoughLinesP found {line_count} segments in face shadow region."]

    # ── 4a. Line angles & lengths ──
    angles = np.empty(line_count)
    lengths = np.empty(line_count)
    for idx, line in enumerate(lines):
        lx0, ly0, lx1, ly1 = line[0]
        angles[idx] = np.arctan2(ly1 - ly0, lx1 - lx0)
        lengths[idx] = np.sqrt((lx1 - lx0) ** 2 + (ly1 - ly0) ** 2)

    # ── 4b. Parallelism (circular mean resultant of doubled angles) ──
    doubled = angles * 2
    mean_sin = float(np.average(np.sin(doubled), weights=lengths))
    mean_cos = float(np.average(np.cos(doubled), weights=lengths))
    parallelism = float(np.clip(np.sqrt(mean_sin ** 2 + mean_cos ** 2), 0.0, 1.0))

    # ── 4c. Periodicity (CV of perpendicular spacing) ──
    periodicity = 0.0
    if parallelism > 0.5 and line_count >= 3:
        dominant_angle = np.arctan2(mean_sin, mean_cos) / 2
        perp_x = -np.sin(dominant_angle)
        perp_y = np.cos(dominant_angle)
        projections = []
        for line in lines:
            mx = (line[0][0] + line[0][2]) / 2.0
            my = (line[0][1] + line[0][3]) / 2.0
            projections.append(mx * perp_x + my * perp_y)
        projections.sort()
        spacings = np.diff(projections)
        if len(spacings) >= 2 and np.mean(spacings) > 0:
            cv_spacing = float(np.std(spacings) / np.mean(spacings))
            periodicity = float(np.clip(1.0 - cv_spacing, 0.0, 1.0))
            notes.append(f"Line spacing CV={cv_spacing:.2f}, periodicity={periodicity:.2f}")

    # ── 4d. Shadow–face incongruence ──
    face_h = max(y1 - y0, 1)
    face_aspect_angle = np.arctan2(float(face_h), float(face_w))
    angle_diffs = np.abs(angles - face_aspect_angle)
    angle_diffs = np.minimum(angle_diffs, np.pi - angle_diffs)
    incongruence = float(np.clip(
        np.average(angle_diffs, weights=lengths) / (np.pi / 4), 0.0, 1.0,
    ))

    # ── 4e. Cross / perpendicular pattern detection ──
    # When parallelism is LOW, check if lines cluster into two groups
    # roughly 90° apart (cross-shaped gobo pattern).
    # Wrap angles to [0, π) for grouping (undirected lines).
    cross_score = 0.0
    if line_count >= 2 and parallelism < 0.6:
        # Normalize angles to [0, π)
        norm_angles = angles % np.pi
        # K-means style: find 2 clusters of angles
        # Simple approach: sort and find the gap
        sorted_ang = np.sort(norm_angles)
        # Check if angles form two groups ~90° apart
        # Compute pairwise angular differences (wrapped to [0, π/2])
        from itertools import combinations
        perp_pairs = 0
        total_pairs = 0
        for i, j in combinations(range(line_count), 2):
            diff = abs(norm_angles[i] - norm_angles[j])
            diff = min(diff, np.pi - diff)  # wrap to [0, π/2]
            total_pairs += 1
            # ~90° apart (±20° tolerance)
            if abs(diff - np.pi / 2) < np.pi / 9:  # ±20°
                perp_pairs += 1
        if total_pairs > 0:
            cross_score = perp_pairs / total_pairs
        notes.append(f"Cross-pattern score={cross_score:.2f} ({perp_pairs}/{total_pairs} perpendicular pairs)")

    # ── 4e. P2b: Body-contour / textured-garment false-positive suppression ──
    # When lines have very low parallelism (< 0.35) the detected "lines" are
    # likely body contours / anatomical shadow boundaries (e.g. a prone figure
    # on a white surface) or textured garment edges (feathers, fringe, lace)
    # rather than projected gobo/slit patterns.  Real gobo patterns have
    # moderate-to-high parallelism (parallel slits) or high cross_score
    # (perpendicular grid).  Suppress detection when neither is met.
    # Thresholds tightened: cross_score raised from 0.25→0.35 to avoid
    # textured garment edges passing as grid patterns.
    _body_contour_likely = (
        parallelism < 0.35
        and cross_score < 0.35
        and periodicity < 0.4
    )
    if _body_contour_likely:
        notes.append(
            f"Low parallelism ({parallelism:.2f}), low cross-score ({cross_score:.2f}) "
            f"— lines likely from body contours, not projected pattern. Suppressing."
        )
        return ShadowInterruptionPattern(
            detected=False,
            classification="none",
            line_count=line_count,
            line_parallelism=round(parallelism, 3),
            periodicity_score=round(periodicity, 3),
            shadow_face_incongruence=round(incongruence, 3),
            confidence=0.2,
            notes=notes,
        )

    # ── 4f. High-density clothing / garment texture suppression ──
    # Formal uniforms (ribbon racks, medal bars, epaulettes) and structured
    # garments (herringbone, pinstripe, lace) produce dense, highly periodic
    # horizontal lines within the expanded face region.  These mimic slit /
    # venetian-blind gobo patterns.
    #
    # Key discriminator: real gobo patterns project shadow lines ONTO SKIN.
    # Garment-texture lines lie in the clothing region (person_mask but NOT
    # skin_mask).  Measure the skin-coverage fraction of all detected line pixels.
    #
    # Secondary discriminator: real flag / gobo setups produce < 12 bold lines
    # (3–8 for venetian-blind, 2–4 for flags).  > 20 lines is nearly always
    # clothing or garment texture.
    if line_count > 12 and skin_mask is not None and skin_mask.size > 0:
        # Build a binary mask of all detected line pixels
        _line_draw = np.zeros((h, w), dtype=np.uint8)
        for ln in lines:
            cv2.line(_line_draw, (int(ln[0][0]), int(ln[0][1])),
                     (int(ln[0][2]), int(ln[0][3])), 255, 1)
        _skin_bin = (skin_mask > 0).astype(np.uint8)
        _line_pixels = int(np.count_nonzero(_line_draw))
        _skin_overlap = int(np.count_nonzero(_line_draw & _skin_bin))
        _skin_coverage = _skin_overlap / max(_line_pixels, 1)

        # Also check the simpler y-position heuristic as corroboration
        face_bottom_y = float(y1)
        _lines_below = sum(
            1 for ln in lines
            if (float(ln[0][1]) + float(ln[0][3])) / 2.0 > face_bottom_y
        )
        _below_fraction = _lines_below / line_count

        # Suppress when:
        #   • > 20 lines (too many for any real gobo) regardless of skin coverage, OR
        #   • 12-20 lines AND skin coverage < 10 % (lines are on clothing, not face)
        _garment_texture = (
            line_count > 20
            or (line_count > 12 and _skin_coverage < 0.10)
        )
        if _garment_texture:
            notes.append(
                f"Line count={line_count}, skin_coverage={_skin_coverage:.1%}, "
                f"below_face={_below_fraction:.0%} — garment texture (ribbon rack, "
                f"uniform, structured fabric), not projected lighting. Suppressing."
            )
            return ShadowInterruptionPattern(
                detected=False,
                classification="none",
                line_count=line_count,
                line_parallelism=round(parallelism, 3),
                periodicity_score=round(periodicity, 3),
                shadow_face_incongruence=round(incongruence, 3),
                confidence=0.15,
                notes=notes,
            )

    # ── 5. Classification ──
    if parallelism > 0.6 and line_count >= 3 and incongruence > 0.4:
        classification = "geometric_bar"
        confidence = min(0.85, 0.4 + parallelism * 0.3 + incongruence * 0.2)
        notes.append(
            f"Parallel bars across face (parallelism={parallelism:.2f}, "
            f"incongruence={incongruence:.2f}) — geometric bar / slit lighting."
        )
    elif periodicity > 0.5 and line_count >= 4:
        classification = "patterned_projection"
        confidence = min(0.80, 0.35 + periodicity * 0.3 + line_count * 0.02)
        notes.append(
            f"Periodic pattern ({periodicity:.2f}, {line_count} lines) "
            f"— gobo or projection lighting."
        )
    elif cross_score > 0.45 and line_count >= 3 and incongruence > 0.25:
        # Cross / perpendicular gobo pattern (e.g. cross-shaped shadow).
        # Thresholds tightened: cross_score from 0.3→0.45, line_count from
        # 2→3, incongruence from 0.2→0.25 to avoid false positives from
        # textured garments (feathers, fringe, lace) whose edges create
        # pseudo-perpendicular line segments.
        classification = "patterned_projection"
        confidence = min(0.70, 0.3 + cross_score * 0.3 + incongruence * 0.1)
        notes.append(
            f"Cross/perpendicular pattern (cross_score={cross_score:.2f}, "
            f"{line_count} lines) — gobo with cross or grid projection."
        )
    elif line_count >= 5 and incongruence > 0.3 and parallelism >= 0.25:
        # Low-parallelism guard: require at least some parallelism (0.25) to
        # avoid classifying random textured-garment edges as gobo projection.
        # True gobo patterns with 5+ lines always show some degree of
        # parallelism from the structured light source.
        classification = "patterned_projection"
        confidence = min(0.65, 0.3 + line_count * 0.03 + incongruence * 0.15)
        notes.append(
            f"Multiple non-anatomical segments ({line_count}) — possible gobo/projection."
        )
    elif (parallelism > 0.5 or incongruence > 0.5) and line_count >= 2:
        classification = "unknown"
        confidence = 0.35
        notes.append("Some geometric shadow signal but insufficient for confident classification.")
    else:
        return ShadowInterruptionPattern(
            detected=False,
            classification="none",
            line_count=line_count,
            line_parallelism=round(parallelism, 3),
            periodicity_score=round(periodicity, 3),
            shadow_face_incongruence=round(incongruence, 3),
            confidence=0.3,
            notes=notes + ["Lines found but do not form a geometric interruption pattern."],
        )

    return ShadowInterruptionPattern(
        detected=True,
        classification=classification,
        line_count=line_count,
        line_parallelism=round(parallelism, 3),
        periodicity_score=round(periodicity, 3),
        shadow_face_incongruence=round(incongruence, 3),
        confidence=round(confidence, 2),
        notes=notes,
    )


def detect_projected_pattern_shape(
    person_mask: np.ndarray,
) -> Optional[str]:
    """Detect cross/slit gobo shape from the spatial distribution of the person mask.

    When person_ratio is very low (< 0.25), the lit region likely comes from a
    narrow projected pattern (gobo/slit).  This function analyzes the row and
    column projections of the person mask to determine whether the visible area
    forms a cross (+), horizontal slit, or vertical slit.

    Returns: "cross" | "vertical_slit" | "horizontal_slit" | None
    """
    if person_mask is None or not np.any(person_mask):
        return None

    h, w = person_mask.shape
    total = h * w
    if total == 0:
        return None

    person_ratio = float(np.sum(person_mask)) / total
    if person_ratio > 0.25:
        return None  # Too much visible — not a narrow projection

    # Row and column projections: fraction of each row/column that is lit
    row_proj = np.sum(person_mask, axis=1).astype(float) / w
    col_proj = np.sum(person_mask, axis=0).astype(float) / h

    # A "bar" exists when some rows/columns have substantial coverage (>20%).
    # A cross pattern has bars in BOTH axes; a slit has a bar in ONE axis.
    row_peak = float(np.max(row_proj)) if len(row_proj) > 0 else 0.0
    col_peak = float(np.max(col_proj)) if len(col_proj) > 0 else 0.0

    # Count how many rows/cols exceed a threshold (bar width)
    bar_thresh = 0.15
    row_bar_count = int(np.sum(row_proj > bar_thresh))
    col_bar_count = int(np.sum(col_proj > bar_thresh))

    # Minimum bar width: at least 5% of the dimension
    row_has_bar = row_peak > 0.20 and row_bar_count > int(h * 0.05)
    col_has_bar = col_peak > 0.20 and col_bar_count > int(w * 0.05)

    if row_has_bar and col_has_bar:
        return "cross"
    elif col_has_bar and not row_has_bar:
        return "vertical_slit"
    elif row_has_bar and not col_has_bar:
        return "horizontal_slit"
    return None


# ═══════════════════════════════════════════════════════════════════════════
# P3 / P4 / P5 — Nose Shadow Length, Shadow Continuity, Fill Ratio
# ═══════════════════════════════════════════════════════════════════════════


def extract_nose_shadow_length(
    img_bgr: np.ndarray,
    face_box: Tuple[int, int, int, int],
) -> Optional[NoseShadowLength]:
    """Measure how far the nose shadow drops below the nose tip.

    Scans a narrow vertical column at the horizontal center of the face
    starting from the estimated nose tip (≈72% of face height) downward.
    Returns the normalised drop length so pattern inference can distinguish
    butterfly (tiny drop) from loop (mid drop) from rembrandt (long drop).
    """
    if cv2 is None:
        return None

    x0, y0, x1, y1 = face_box
    face_h = y1 - y0
    face_w = x1 - x0
    if face_h < 40 or face_w < 30:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    notes: List[str] = []

    # Nose tip: MediaPipe landmark 1 is approximately 72% down the face box.
    # Using 0.70 gives robust results across a range of head tilts.
    nose_tip_y = int(y0 + face_h * 0.70)
    nose_tip_y_ratio = round((nose_tip_y - y0) / face_h, 3)

    # Scan the central 20% of face width downward from the nose tip
    cx0 = int(x0 + face_w * 0.40)
    cx1 = int(x0 + face_w * 0.60)
    cx0, cx1 = max(0, cx0), min(img_bgr.shape[1], cx1)

    # Baseline luminance: row just above the nose tip (lit upper nose bridge)
    baseline_row = max(y0, nose_tip_y - int(face_h * 0.06))
    baseline_lum = float(np.mean(gray[baseline_row, cx0:cx1])) if cx1 > cx0 else 128.0

    # Shadow threshold: 60% of baseline brightness defines the shadow region
    shadow_thresh = baseline_lum * 0.60

    # Scan downward from nose tip; stop at lip (≈90% of face height) to avoid chin shadow
    lip_y = int(y0 + face_h * 0.88)
    scan_end = min(lip_y, y1)

    shadow_end_y = nose_tip_y  # default: no drop
    in_shadow = False
    for scan_y in range(nose_tip_y, scan_end):
        row_lum = float(np.mean(gray[scan_y, cx0:cx1])) if cx1 > cx0 else baseline_lum
        if row_lum < shadow_thresh:
            in_shadow = True
            shadow_end_y = scan_y
        elif in_shadow:
            # Shadow ended — stop (don't skip through lit gaps)
            break

    extension_px = max(0, shadow_end_y - nose_tip_y)
    scannable_h = max(1, scan_end - nose_tip_y)
    # Normalise to face height, not scannable height, for scale invariance
    length_ratio = round(extension_px / max(face_h, 1), 3)

    # Map to pattern label
    if length_ratio < 0.10:
        shadow_label = "butterfly"
    elif length_ratio < 0.30:
        shadow_label = "loop"
    elif length_ratio < 0.50:
        shadow_label = "loop_rembrandt"
    else:
        shadow_label = "rembrandt"

    # Confidence: higher when shadow is clear and scannable region is adequate
    conf = round(min(0.80, 0.40 + (scannable_h / face_h) * 0.50), 2)
    notes.append(
        f"Nose shadow drop: {extension_px}px / face_h={face_h}px → "
        f"ratio={length_ratio:.3f} ({shadow_label}); baseline_lum={baseline_lum:.0f}."
    )

    return NoseShadowLength(
        length_ratio=length_ratio,
        shadow_label=shadow_label,
        nose_tip_y_ratio=nose_tip_y_ratio,
        confidence=conf,
        notes=notes,
    )


def extract_shadow_continuity(
    img_bgr: np.ndarray,
    face_box: Tuple[int, int, int, int],
    shadow_side: str = "unknown",
) -> Optional[ShadowContinuity]:
    """Check whether the nose shadow connects continuously to the cheek shadow.

    A true Rembrandt triangle requires the nose shadow to merge into the
    far-cheek shadow with no luminance gap.  Loop lighting leaves a clear
    lit gap between them.

    Uses connected-component analysis on the dark mask in the
    nose-tip-to-upper-lip region.
    """
    if cv2 is None:
        return None

    x0, y0, x1, y1 = face_box
    face_h = y1 - y0
    face_w = x1 - x0
    if face_h < 40 or face_w < 30:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    notes: List[str] = []

    # Region of interest: nose-tip area to below nose (shadow triangle zone)
    roi_y0 = int(y0 + face_h * 0.65)   # just above nose tip
    roi_y1 = int(y0 + face_h * 0.88)   # upper lip
    roi_x0, roi_x1 = max(0, x0), min(img_bgr.shape[1], x1)
    roi_y0, roi_y1 = max(0, roi_y0), min(img_bgr.shape[0], roi_y1)

    if roi_y1 - roi_y0 < 10 or roi_x1 - roi_x0 < 20:
        return None

    roi_gray = gray[roi_y0:roi_y1, roi_x0:roi_x1]
    roi_h, roi_w = roi_gray.shape

    # Adaptive dark threshold: 55th percentile of ROI
    p55 = float(np.percentile(roi_gray, 55))
    dark_mask = (roi_gray < p55).astype(np.uint8)

    # Connected components on the dark mask
    n_labels, labels = cv2.connectedComponents(dark_mask)

    if n_labels <= 1:
        # Entire region is lit — no shadow at all in this zone
        notes.append("No shadow components found in nose-cheek zone.")
        return ShadowContinuity(
            triangle_connected=False,
            connectivity_score=0.0,
            gap_width_ratio=1.0,
            confidence=0.45,
            notes=notes,
        )

    # Component sizes (excluding background 0)
    comp_sizes = [(labels == i).sum() for i in range(1, n_labels)]

    # Nose shadow component: dark region in the central column (x 30–70% of ROI)
    nose_col_lo = int(roi_w * 0.30)
    nose_col_hi = int(roi_w * 0.70)
    nose_region = dark_mask[:, nose_col_lo:nose_col_hi]
    nose_lbl_region = labels[:, nose_col_lo:nose_col_hi]
    nose_labels_present = set(nose_lbl_region[nose_region > 0]) - {0}

    # Cheek shadow component: dark region on the shadow side (outer 30% of ROI)
    if shadow_side == "left":
        cheek_col_lo, cheek_col_hi = 0, int(roi_w * 0.30)
    else:  # right or unknown — check right side
        cheek_col_lo, cheek_col_hi = int(roi_w * 0.70), roi_w

    cheek_region = dark_mask[:, cheek_col_lo:cheek_col_hi]
    cheek_lbl_region = labels[:, cheek_col_lo:cheek_col_hi]
    cheek_labels_present = set(cheek_lbl_region[cheek_region > 0]) - {0}

    # Triangle connected: nose and cheek shadows share a component label
    shared = nose_labels_present & cheek_labels_present
    triangle_connected = len(shared) > 0

    # Gap width: find the lit corridor between nose and cheek shadows
    # Measure the maximum consecutive lit columns between nose_col_hi and cheek_col_lo
    if not triangle_connected and shadow_side != "left":
        bridge_zone = dark_mask[:, nose_col_hi:cheek_col_lo]
    elif not triangle_connected:
        bridge_zone = dark_mask[:, cheek_col_hi:nose_col_lo]
    else:
        bridge_zone = None

    gap_w = 0
    if bridge_zone is not None and bridge_zone.shape[1] > 0:
        # Fraction of columns that are entirely lit (no dark pixels)
        col_has_dark = (bridge_zone.sum(axis=0) > 0)
        gap_w = int((~col_has_dark).sum())

    gap_width_ratio = round(gap_w / max(face_w, 1), 3)
    connectivity_score = 1.0 if triangle_connected else round(
        max(0.0, 1.0 - gap_width_ratio * 3.0), 2
    )

    conf = round(min(0.75, 0.35 + (roi_h * roi_w) / (face_h * face_w) * 0.80), 2)
    notes.append(
        f"{'Triangle CONNECTED' if triangle_connected else 'Triangle DISCONNECTED'}: "
        f"connectivity={connectivity_score:.2f}, gap_ratio={gap_width_ratio:.3f}."
    )

    return ShadowContinuity(
        triangle_connected=triangle_connected,
        connectivity_score=connectivity_score,
        gap_width_ratio=gap_width_ratio,
        confidence=conf,
        notes=notes,
    )


def extract_fill_ratio(
    img_bgr: np.ndarray,
    face_box: Tuple[int, int, int, int],
    skin_mask: Optional[np.ndarray],
    shadow_direction: str = "unknown",
) -> Optional[FillRatio]:
    """Measure shadow-side vs key-side luminance ratio to quantify fill.

    Splits the face box into two halves based on the primary shadow direction
    (shadow side = far from key) and measures mean luminance in the skin region
    of each half.  The ratio (shadow/lit) indicates how much fill is present.
    """
    if cv2 is None:
        return None

    x0, y0, x1, y1 = face_box
    face_w = x1 - x0
    face_h = y1 - y0
    if face_h < 40 or face_w < 30:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    notes: List[str] = []

    # Determine which horizontal half is lit and which is shadow
    # shadow_direction is where the shadow FALLS (inverted from key position)
    # e.g. shadow_direction = "upper_right" → shadow on right → key on left → lit_side = left
    shadow_on_right = shadow_direction in ("upper_right", "right", "lower_right")
    shadow_on_left = shadow_direction in ("upper_left", "left", "lower_left")
    if not shadow_on_right and not shadow_on_left:
        # Unknown direction — measure both halves directly rather than
        # defaulting to "right".  The darker half is the shadow side.
        # This prevents a systematic fill_ratio inversion for images
        # where the key is from the left (shadow on left) and the
        # shadow direction was not resolved by extract_primary_shadow_direction.
        _fr_cx  = (x0 + x1) // 2
        _fr_vpad = int((y1 - y0) * 0.10)
        _fr_vy0 = max(0, y0 + _fr_vpad)
        _fr_vy1 = min(gray.shape[0], y1 - _fr_vpad)
        _fr_left  = gray[_fr_vy0:_fr_vy1, x0:_fr_cx]
        _fr_right = gray[_fr_vy0:_fr_vy1, _fr_cx:x1]
        _fr_lm = float(np.mean(_fr_left))  if _fr_left.size  > 0 else 128.0
        _fr_rm = float(np.mean(_fr_right)) if _fr_right.size > 0 else 128.0
        # Shadow (darker) side drives the measurement
        shadow_on_right = _fr_rm < _fr_lm
        notes.append(
            f"shadow_dir=unknown: self-measured — "
            f"left={_fr_lm:.1f}, right={_fr_rm:.1f}, "
            f"shadow={'right' if shadow_on_right else 'left'}"
        )

    face_cx = (x0 + x1) // 2
    if shadow_on_right:
        lit_x0, lit_x1 = x0, face_cx
        shadow_x0, shadow_x1 = face_cx, x1
    else:
        lit_x0, lit_x1 = face_cx, x1
        shadow_x0, shadow_x1 = x0, face_cx

    # Restrict to central 80% vertically (avoid hairline and chin)
    vert_pad = int(face_h * 0.10)
    vy0 = max(0, y0 + vert_pad)
    vy1 = min(h_img, y1 - vert_pad)

    def _half_mean(hx0: int, hx1: int) -> float:
        hx0 = max(0, min(hx0, w_img))
        hx1 = max(0, min(hx1, w_img))
        region = gray[vy0:vy1, hx0:hx1]
        if skin_mask is not None:
            mask_region = skin_mask[vy0:vy1, hx0:hx1]
            skin_px = region[mask_region > 0]
            if len(skin_px) >= 30:
                return float(np.mean(skin_px))
        return float(np.mean(region)) if region.size > 0 else 128.0

    lit_mean = _half_mean(lit_x0, lit_x1)
    shadow_mean = _half_mean(shadow_x0, shadow_x1)

    ratio = round(shadow_mean / max(lit_mean, 1.0), 3)
    ratio = min(1.0, ratio)  # clamp: shadow can't be brighter than lit for a real fill ratio

    if ratio > 0.75:
        fill_label = "flat"
    elif ratio > 0.55:
        fill_label = "soft_fill"
    elif ratio > 0.35:
        fill_label = "moderate_fill"
    elif ratio > 0.20:
        fill_label = "low_fill"
    else:
        fill_label = "no_fill"

    # Confidence: higher when sides are well-separated in luminance
    separation = abs(lit_mean - shadow_mean) / max(lit_mean, 1.0)
    conf = round(min(0.80, 0.35 + separation * 1.5), 2)

    notes.append(
        f"Fill ratio: lit_mean={lit_mean:.0f}, shadow_mean={shadow_mean:.0f}, "
        f"ratio={ratio:.3f} → {fill_label} (shadow_dir={shadow_direction})."
    )

    return FillRatio(
        ratio=ratio,
        fill_label=fill_label,
        lit_side_mean=round(lit_mean, 1),
        shadow_side_mean=round(shadow_mean, 1),
        confidence=conf,
        notes=notes,
    )


def extract_eye_socket_shadow(
    img_bgr: np.ndarray,
    face_box: Tuple[int, int, int, int],
) -> Optional[EyeSocketShadow]:
    """Measure the eye socket shadow depth to estimate key light height.

    A high key light projects the brow ridge downward into the eye socket,
    creating a dark band above the iris.  This function measures that band's
    mean luminance relative to the broader face and returns a height_label.

    Implementation:
    - Eye socket band: rows 22%–38% from top of face box
      (roughly brow-to-upper-iris region for a frontal head crop)
    - Reference region: rows 38%–80% (mid-face — cheeks, nose, mouth)
      avoids hairline (top 22%) and chin (bottom 20%)
    - depth_ratio = (ref_mean - socket_mean) / max(ref_mean, 1)
      High depth_ratio → dark socket → high key
    """
    if cv2 is None:
        return None

    x0, y0, x1, y1 = face_box
    face_h = y1 - y0
    face_w = x1 - x0
    if face_h < 60 or face_w < 40:
        return None

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape

    # Horizontal inset: use central 70% to avoid ear/hair edges
    hx_pad = int(face_w * 0.15)
    hx0 = max(0, x0 + hx_pad)
    hx1 = min(w_img, x1 - hx_pad)

    # Eye socket band: 22%–38% from top of face
    socket_y0 = max(0, y0 + int(face_h * 0.22))
    socket_y1 = min(h_img, y0 + int(face_h * 0.38))

    # Mid-face reference: 38%–80% from top
    ref_y0 = min(h_img, y0 + int(face_h * 0.38))
    ref_y1 = min(h_img, y0 + int(face_h * 0.80))

    socket_region = gray[socket_y0:socket_y1, hx0:hx1]
    ref_region = gray[ref_y0:ref_y1, hx0:hx1]

    if socket_region.size < 20 or ref_region.size < 20:
        return None

    socket_mean = float(np.mean(socket_region))
    ref_mean = float(np.mean(ref_region))

    if ref_mean < 5.0:
        return None  # pathologically dark image — no signal

    depth_ratio = round((ref_mean - socket_mean) / max(ref_mean, 1.0), 3)
    depth_ratio = max(-0.5, min(1.0, depth_ratio))  # clamp

    # Height labels
    if depth_ratio > 0.25:
        height_label = "high"
    elif depth_ratio > 0.10:
        height_label = "eye_level"
    else:
        height_label = "low"

    # Confidence based on face size and depth signal magnitude
    size_factor = min(1.0, face_h / 120.0)          # larger face → more reliable
    signal_factor = min(1.0, abs(depth_ratio) / 0.20)  # stronger shadow → more reliable
    conf = round(max(0.25, min(0.70, 0.3 + 0.4 * size_factor * signal_factor)), 2)

    notes = [
        f"Eye socket: socket_mean={socket_mean:.0f}, ref_mean={ref_mean:.0f}, "
        f"depth_ratio={depth_ratio:.3f} → {height_label} (conf {conf:.2f})."
    ]

    return EyeSocketShadow(
        depth_ratio=depth_ratio,
        socket_mean_lum=round(socket_mean, 1),
        face_mean_lum=round(ref_mean, 1),
        height_label=height_label,
        confidence=conf,
        notes=notes,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Master Orchestrator
# ═══════════════════════════════════════════════════════════════════════════


def extract_visual_cues(
    img_bgr: np.ndarray,
    vision_data: Dict[str, Any],
    classification: Optional[Dict[str, Any]] = None,
) -> VisualCueReport:
    """Extract all 16 visual cues from image data.

    Each extractor runs independently inside a try/except — one failure
    never prevents other cues from being computed.

    Args:
        img_bgr: Raw BGR image (numpy array from cv2.imread).
        vision_data: Output from ``analyze_image_regions()`` with ``return_masks=True``.
                     Must contain ``_masks`` dict and ``catchlights`` dict.
        classification: Palette classification from ``describe_image()``.

    Returns:
        VisualCueReport with all successfully extracted cues populated.
    """
    masks = vision_data.get("_masks", {})
    person_mask = masks.get("person")
    skin_mask = masks.get("skin")
    background_mask = masks.get("background")

    catchlight_data = vision_data.get("catchlights", {})
    pose_data = vision_data.get("pose", {})
    face_box_list = vision_data.get("region_attribution", {}).get("face_box")
    face_box = tuple(face_box_list) if face_box_list else None

    is_grayscale = False
    if classification:
        # Check if grayscale from the parent describe_image output
        is_grayscale = classification.get("_is_grayscale_like", False)

    report = VisualCueReport()
    cue_count = 0
    all_notes: List[str] = []

    # Helper to safely extract a cue
    def _safe_extract(name: str, fn, *args, **kwargs):
        nonlocal cue_count
        try:
            result = fn(*args, **kwargs)
            if result is not None:
                cue_count += 1
            return result
        except Exception as exc:
            logger.warning("Cue extraction failed for %s: %s", name, exc)
            all_notes.append(f"Cue '{name}' extraction failed: {exc}")
            return None

    # Need masks for most cues
    has_masks = person_mask is not None and skin_mask is not None and background_mask is not None

    if has_masks:
        # P2d: Extract tonal processing FIRST so we can pass
        # is_high_contrast_grade to shadow edge detection.
        report.tonal_processing_estimation = _safe_extract(
            "tonal_processing_estimation", extract_tonal_processing_estimation,
            img_bgr, classification, is_grayscale,
        )
        _is_hcg = (
            report.tonal_processing_estimation is not None
            and report.tonal_processing_estimation.is_high_contrast_grade
        )
        report.shadow_edge_hardness = _safe_extract(
            "shadow_edge_hardness", extract_shadow_edge_hardness,
            img_bgr, person_mask, skin_mask, _is_hcg, face_box,
        )
        report.primary_shadow_direction = _safe_extract(
            "primary_shadow_direction", extract_primary_shadow_direction,
            img_bgr, face_box, skin_mask,
        )
        report.vertical_light_angle = _safe_extract(
            "vertical_light_angle", extract_vertical_light_angle,
            img_bgr, face_box,
        )
        report.highlight_to_shadow_transition = _safe_extract(
            "highlight_to_shadow_transition", extract_highlight_to_shadow_transition,
            img_bgr, skin_mask, face_box,
        )
        report.contrast_ratio = _safe_extract(
            "contrast_ratio", extract_contrast_ratio,
            img_bgr, person_mask, face_box,
        )
        report.subject_background_separation = _safe_extract(
            "subject_background_separation", extract_subject_background_separation,
            img_bgr, person_mask, background_mask,
        )
        report.background_illumination = _safe_extract(
            "background_illumination", extract_background_illumination,
            img_bgr, background_mask,
        )
        report.specular_highlight_behavior = _safe_extract(
            "specular_highlight_behavior", extract_specular_highlight_behavior,
            img_bgr, skin_mask, person_mask, face_box,
        )
        report.multi_shadow_detection = _safe_extract(
            "multi_shadow_detection", extract_multi_shadow_detection,
            img_bgr, person_mask, face_box,
        )
        report.environmental_shadow_continuity = _safe_extract(
            "environmental_shadow_continuity", extract_environmental_shadow_continuity,
            img_bgr, background_mask, classification,
        )
        report.pose_induced_shadow_interference = _safe_extract(
            "pose_induced_shadow_interference", extract_pose_induced_shadow_interference,
            pose_data, img_bgr, skin_mask, face_box,
        )
        # tonal_processing_estimation already extracted above (before shadow_edge_hardness)
        report.shadow_interruption_pattern = _safe_extract(
            "shadow_interruption_pattern", extract_shadow_interruption_pattern,
            img_bgr, person_mask, skin_mask, face_box,
        )
        # Projected pattern shape: detect cross/slit from person mask spatial
        # distribution.  Runs independently of SIP (which requires face_box).
        report.projected_pattern_shape = _safe_extract(
            "projected_pattern_shape", detect_projected_pattern_shape,
            person_mask,
        )

        # ── P3: Nose shadow length ───────────────────────────────────────
        if face_box is not None:
            report.nose_shadow_length = _safe_extract(
                "nose_shadow_length", extract_nose_shadow_length,
                img_bgr, face_box,
            )

        # ── P4: Shadow continuity (Rembrandt triangle check) ────────────
        if face_box is not None:
            # Get primary shadow direction for sided-split
            _sd = "unknown"
            if report.primary_shadow_direction:
                _sd = report.primary_shadow_direction.direction or "unknown"
            report.shadow_continuity = _safe_extract(
                "shadow_continuity", extract_shadow_continuity,
                img_bgr, face_box, _sd,
            )

        # ── P5: Fill ratio ───────────────────────────────────────────────
        if face_box is not None:
            _fill_sd = "unknown"
            if report.primary_shadow_direction:
                _fill_sd = report.primary_shadow_direction.direction or "unknown"
            report.fill_ratio = _safe_extract(
                "fill_ratio", extract_fill_ratio,
                img_bgr, face_box, skin_mask, _fill_sd,
            )

        # ── P8: Eye socket shadow depth ─────────────────────────────────
        # Measure the dark band above the iris — directly encodes key height
        # without requiring catchlights (works even when eyes are occluded).
        if face_box is not None:
            report.eye_socket_shadow = _safe_extract(
                "eye_socket_shadow", extract_eye_socket_shadow,
                img_bgr, face_box,
            )
    else:
        all_notes.append("No masks available — only catchlight-based cues extracted.")

    # Catchlight cues don't need masks
    report.catchlight_position = _safe_extract(
        "catchlight_position", extract_catchlight_position,
        catchlight_data,
    )
    report.catchlight_shape = _safe_extract(
        "catchlight_shape", extract_catchlight_shape,
        catchlight_data,
    )
    report.reflection_architecture = _safe_extract(
        "reflection_architecture", extract_reflection_architecture,
        catchlight_data,
    )

    report.cues_computed = cue_count
    report.notes = all_notes

    return report


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline-Derived Cue Enrichment
# ═══════════════════════════════════════════════════════════════════════════


def enrich_cue_report_from_pipeline(
    report: VisualCueReport,
    pipeline_results: Dict[str, Any],
) -> VisualCueReport:
    """Enrich cue report with cues derived from the extended vision pipeline.

    The extended pipeline (``run_extended_pipeline``) produces passes that
    are not available during initial cue extraction.  This function attaches
    those results to the existing cue report.  New cues are only attached
    when the pipeline pass succeeded (``ok=True``).

    Parameters
    ----------
    report : VisualCueReport
        Existing cue report to enrich (mutated in place and returned).
    pipeline_results : dict
        Full output from ``run_extended_pipeline``.

    Returns
    -------
    VisualCueReport
        The same report object, enriched with pipeline-derived cues.
    """
    # ── Catchlight topology ──
    topology_data = pipeline_results.get("catchlight_topology")
    if isinstance(topology_data, dict) and topology_data.get("ok"):
        try:
            report.catchlight_topology = extract_catchlight_topology(topology_data)
        except Exception:
            pass  # best-effort enrichment

        # Backfill size_ratio_mean / size_class into catchlight_shape.
        # The topology pass stores per-catchlight size_ratio in primary /
        # secondary / tertiary dicts.  Collect across all three so we can
        # compute a mean and map to a modifier size class.
        try:
            topo_entries = [
                topology_data[k] for k in ("primary", "secondary", "tertiary")
                if isinstance(topology_data.get(k), dict)
            ]
            if topo_entries:
                ratios = [
                    c["size_ratio"] for c in topo_entries
                    if isinstance(c.get("size_ratio"), (int, float))
                ]
                if ratios:
                    mean_ratio = float(sum(ratios) / len(ratios))
                    if mean_ratio < 0.08:
                        size_class = "point"
                    elif mean_ratio < 0.18:
                        size_class = "small"
                    elif mean_ratio < 0.32:
                        size_class = "medium"
                    elif mean_ratio < 0.42:
                        size_class = "large"
                    else:
                        size_class = "very_large"

                    if report.catchlight_shape is not None:
                        # Mutate the existing model (Pydantic v2 supports direct assignment)
                        report.catchlight_shape.size_ratio_mean = round(mean_ratio, 3)
                        report.catchlight_shape.size_class = size_class
                        report.catchlight_shape.notes.append(
                            f"Topology size_ratio_mean={mean_ratio:.3f} → {size_class}."
                        )
                    else:
                        # Eyes were visible in topology but not basic pass — create shape cue
                        shapes = [c.get("shape", "unknown") for c in topo_entries]
                        ring_count = shapes.count("ring")
                        rect_count = shapes.count("rectangular")
                        round_count = shapes.count("round")
                        dominant = (
                            "ring" if ring_count > 0
                            else "rectangular" if rect_count > round_count
                            else "round" if round_count > rect_count
                            else "mixed" if shapes else "unknown"
                        )
                        report.catchlight_shape = CatchlightShape(
                            dominant_shape=dominant,
                            shapes_seen=list(set(shapes)),
                            size_ratio_mean=round(mean_ratio, 3),
                            size_class=size_class,
                            confidence=0.55,
                            notes=[f"Topology size_ratio_mean={mean_ratio:.3f} → {size_class}."],
                        )
        except Exception:
            pass  # best-effort size enrichment

    # ── Highlight axis map ──
    axis_map_data = pipeline_results.get("highlight_axis_map")
    if isinstance(axis_map_data, dict) and axis_map_data.get("ok"):
        try:
            report.highlight_axis_map = extract_highlight_axis_map(axis_map_data)
        except Exception:
            pass

    # ── Highlight symmetry ──
    symmetry_data = pipeline_results.get("highlight_symmetry")
    if isinstance(symmetry_data, dict) and symmetry_data.get("ok"):
        try:
            report.highlight_symmetry = extract_highlight_symmetry(symmetry_data)
        except Exception:
            pass

    # ── Continuous source signals ──
    source_data = pipeline_results.get("continuous_source")
    if isinstance(source_data, dict) and source_data.get("ok"):
        try:
            report.continuous_source_signals = extract_continuous_source_signals(source_data)
        except Exception:
            pass

    # ── Bounce contributor ──
    bounce_data = pipeline_results.get("bounce_contributor")
    if isinstance(bounce_data, dict) and bounce_data.get("ok"):
        try:
            report.bounce_contributor = extract_bounce_contributor(bounce_data)
        except Exception:
            pass

    # ── Separation light ──
    sep_data = pipeline_results.get("separation_light")
    if isinstance(sep_data, dict) and sep_data.get("ok"):
        try:
            report.separation_light = extract_separation_light(sep_data)
        except Exception:
            pass

    # ── Off-axis key ──
    off_axis_data = pipeline_results.get("off_axis_key")
    if isinstance(off_axis_data, dict) and off_axis_data.get("ok"):
        try:
            report.off_axis_key = extract_off_axis_key(off_axis_data)
        except Exception:
            pass

    # ── Light structure ──
    structure_data = pipeline_results.get("light_structure")
    if isinstance(structure_data, dict) and structure_data.get("ok"):
        try:
            report.light_structure = extract_light_structure(structure_data)
        except Exception:
            pass

    # ── Face orientation (P6: broad / short disambiguation) ──
    # face_yaw is computed in the catchlight pass from landmark geometry.
    # Positive yaw → face turned image-right; negative → image-left.
    # The broad side is whichever image-direction shows MORE of the face.
    cl_data = pipeline_results.get("catchlights", {})
    if isinstance(cl_data, dict):
        try:
            face_yaw = cl_data.get("face_yaw")
            if face_yaw is not None:
                yaw = float(face_yaw)
                _FRONTAL_THRESHOLD = 0.12
                if abs(yaw) < _FRONTAL_THRESHOLD:
                    yaw_label = "frontal"
                    broad_side = "unknown"
                    short_side = "unknown"
                    fo_conf = 0.0
                elif yaw > 0:
                    # Face turned image-right → image-left side is more visible
                    broad_side = "left"
                    short_side = "right"
                    if yaw < 0.25:
                        yaw_label = "slight_right"
                        fo_conf = 0.45
                    elif yaw < 0.40:
                        yaw_label = "moderate_right"
                        fo_conf = 0.65
                    else:
                        yaw_label = "significant_right"
                        fo_conf = 0.80
                else:  # yaw < 0
                    # Face turned image-left → image-right side is more visible
                    broad_side = "right"
                    short_side = "left"
                    if yaw > -0.25:
                        yaw_label = "slight_left"
                        fo_conf = 0.45
                    elif yaw > -0.40:
                        yaw_label = "moderate_left"
                        fo_conf = 0.65
                    else:
                        yaw_label = "significant_left"
                        fo_conf = 0.80

                report.face_orientation = FaceOrientation(
                    yaw=round(yaw, 3),
                    yaw_label=yaw_label,
                    broad_side=broad_side,
                    short_side=short_side,
                    confidence=fo_conf,
                    notes=[
                        f"face_yaw={yaw:.3f} → {yaw_label}; "
                        f"broad_side={broad_side}, short_side={short_side}."
                    ],
                )
        except Exception:
            pass  # best-effort enrichment

    # ── Occlusion shadow (gobo / projection pattern detection) ──
    # occlusion_shadow_pass() detects high-frequency shadow patterns on the
    # subject (blinds, geometric gobos, foliage).  When the pass detects a
    # regular or geometric pattern (blinds | geometric), store the occlusion
    # type in projected_pattern_shape so _apply_specialty_pattern can promote
    # the base geometric pattern to "projected".
    occlusion_data = pipeline_results.get("occlusion")
    if isinstance(occlusion_data, dict) and occlusion_data.get("ok"):
        try:
            occ_type = occlusion_data.get("occlusion_type", "none")
            occ_conf = occlusion_data.get("occlusion_confidence", 0.0)
            if occ_type in ("blinds", "geometric") and occ_conf > 0.5:
                report.projected_pattern_shape = occ_type
        except Exception:
            pass  # best-effort enrichment

    # ── Shadow penumbra ──
    # shadow_penumbra_pass() runs in the extended pipeline and outputs
    # penumbra_width_ratio + apparent_source_size.  Wire the result into
    # the cue report so infer_source_quality can use it as an independent
    # modifier-size signal (separate from catchlight shape).
    penumbra_data = pipeline_results.get("penumbra")
    if isinstance(penumbra_data, dict) and penumbra_data.get("ok"):
        try:
            # Derive confidence from penumbra_uniformity — uniform edges
            # across the subject give higher confidence in the width estimate.
            uniformity = penumbra_data.get("penumbra_uniformity", 0.0)
            pen_conf = round(max(0.3, min(0.75, 0.3 + uniformity * 0.45)), 2)
            report.shadow_penumbra = ShadowPenumbra(
                penumbra_width_px=penumbra_data.get("penumbra_width_px", 0.0),
                penumbra_width_ratio=penumbra_data.get("penumbra_width_ratio", 0.0),
                apparent_source_size=penumbra_data.get("apparent_source_size", "unknown"),
                penumbra_uniformity=uniformity,
                confidence=pen_conf,
                notes=penumbra_data.get("notes", []),
            )
        except Exception:
            pass  # best-effort enrichment

    return report
