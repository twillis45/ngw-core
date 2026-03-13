"""Vision debug overlays — visualize extracted signals on the source image.

Generates an annotated debug image with overlays for:
- Shadow vector arrow
- Highlight heatmap
- Catchlight detection circles
- Background gradient center marker
- Pose axis (head rotation)
- Specular highlight detection
- Pose solver geometry (shoulder axis, hip axis, head direction,
  occlusion/self-shadow highlights, corrected key light arrow,
  raw vs pose-corrected angle display)
- Surface class region labels
- Light role indicators and light count

Output: static/debug/analysis_overlay.jpg
"""
from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

logger = logging.getLogger(__name__)

DEBUG_OUTPUT_DIR = Path("static/debug")


def _ensure_output_dir() -> None:
    DEBUG_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ── Color palette for overlays ────────────────────────────────────────────

_SHADOW_COLOR = (255, 100, 0)      # Orange-red for shadow arrow
_HIGHLIGHT_COLOR = (0, 255, 255)    # Yellow for highlights
_CATCHLIGHT_COLOR = (0, 255, 0)     # Green for catchlights
_BG_CENTER_COLOR = (255, 0, 255)    # Magenta for background gradient center
_POSE_COLOR = (0, 200, 255)         # Gold for pose axis
_SPECULAR_COLOR = (255, 255, 0)     # Cyan for specular highlights
_SHOULDER_COLOR = (0, 165, 255)    # Orange for shoulder axis
_HIP_COLOR = (128, 0, 128)        # Purple for hip axis
_POSE_CORR_COLOR = (0, 255, 128)  # Spring green for corrected light arrow
_SELF_SHADOW_COLOR = (0, 0, 200)  # Dark red for self-shadow regions
_OCCLUSION_COLOR = (100, 100, 255)  # Light red for occlusion regions
_SURFACE_CLASS_COLOR = (200, 150, 50)  # Light blue-ish for surface labels
_LIGHT_ROLE_COLOR = (50, 200, 150)     # Teal for light role indicators
_TEXT_COLOR = (255, 255, 255)       # White for labels
_TEXT_BG = (0, 0, 0)               # Black for text background


def _put_label(
    img: np.ndarray,
    text: str,
    pos: Tuple[int, int],
    color: Tuple[int, int, int] = _TEXT_COLOR,
    scale: float = 0.5,
) -> None:
    """Draw a label with background on the image."""
    (tw, th), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    x, y = pos
    cv2.rectangle(img, (x - 2, y - th - 4), (x + tw + 2, y + 4), _TEXT_BG, -1)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


# ── Individual overlay functions ──────────────────────────────────────────

def _draw_shadow_vector(
    overlay: np.ndarray,
    shadow_data: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> None:
    """Draw shadow vector arrow on the overlay."""
    vector_deg = shadow_data.get("shadow_vector_deg")
    if vector_deg is None:
        return

    h, w = overlay.shape[:2]
    if face_box:
        cx = (face_box[0] + face_box[2]) // 2
        cy = (face_box[1] + face_box[3]) // 2
        arrow_len = (face_box[2] - face_box[0]) // 2
    else:
        cx, cy = w // 2, h // 3
        arrow_len = min(w, h) // 6

    # Convert degrees to radians (0=up, clockwise)
    rad = math.radians(vector_deg - 90)
    end_x = int(cx + arrow_len * math.cos(rad))
    end_y = int(cy + arrow_len * math.sin(rad))

    cv2.arrowedLine(overlay, (cx, cy), (end_x, end_y), _SHADOW_COLOR, 2, tipLength=0.3)
    _put_label(overlay, f"Shadow {vector_deg:.0f}°", (end_x + 5, end_y), _SHADOW_COLOR)

    softness = shadow_data.get("shadow_softness")
    if softness is not None:
        _put_label(overlay, f"Soft: {softness:.2f}", (cx + 5, cy + 20), _SHADOW_COLOR)


def _draw_highlight_heatmap(
    overlay: np.ndarray,
    img_gray: np.ndarray,
    person_mask: Optional[np.ndarray] = None,
) -> None:
    """Draw highlight heatmap overlay."""
    if person_mask is not None:
        masked = img_gray.copy()
        masked[~person_mask] = 0
    else:
        masked = img_gray

    # Threshold to bright areas
    thresh = max(180, int(np.percentile(masked[masked > 0], 90))) if np.any(masked > 0) else 200
    bright = (masked > thresh).astype(np.uint8) * 255

    # Create colored heatmap
    heatmap = np.zeros_like(overlay)
    heatmap[:, :, 0] = 0
    heatmap[:, :, 1] = bright
    heatmap[:, :, 2] = bright

    # Blend with overlay
    alpha = 0.3
    mask_3ch = np.stack([bright > 0] * 3, axis=-1)
    overlay[mask_3ch] = cv2.addWeighted(
        overlay, 1.0 - alpha, heatmap, alpha, 0
    )[mask_3ch]


def _draw_catchlight_circles(
    overlay: np.ndarray,
    catchlight_data: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> None:
    """Draw circles around detected catchlight positions."""
    count = catchlight_data.get("catchlight_count", 0)
    position = catchlight_data.get("catchlight_position", "")
    shape = catchlight_data.get("catchlight_shape", "")

    if not face_box or count == 0:
        return

    x0, y0, x1, y1 = face_box
    face_w = x1 - x0
    face_h = y1 - y0

    # Draw circles at estimated eye positions
    eye_y = y0 + face_h // 3
    left_eye_x = x0 + face_w // 3
    right_eye_x = x0 + 2 * face_w // 3
    radius = max(8, face_w // 15)

    cv2.circle(overlay, (left_eye_x, eye_y), radius, _CATCHLIGHT_COLOR, 2)
    cv2.circle(overlay, (right_eye_x, eye_y), radius, _CATCHLIGHT_COLOR, 2)

    _put_label(
        overlay,
        f"CL: {count}x {shape}",
        (left_eye_x - 20, eye_y - radius - 10),
        _CATCHLIGHT_COLOR,
    )


def _draw_bg_gradient_center(
    overlay: np.ndarray,
    bg_data: Dict[str, Any],
) -> None:
    """Draw background gradient center marker."""
    cx = bg_data.get("background_gradient_center_x")
    cy = bg_data.get("background_gradient_center_y")
    direction = bg_data.get("background_direction", "")

    if cx is None or cy is None:
        return

    h, w = overlay.shape[:2]
    px = int(cx * w)
    py = int(cy * h)

    # Cross marker
    size = 15
    cv2.line(overlay, (px - size, py), (px + size, py), _BG_CENTER_COLOR, 2)
    cv2.line(overlay, (px, py - size), (px, py + size), _BG_CENTER_COLOR, 2)
    cv2.circle(overlay, (px, py), size, _BG_CENTER_COLOR, 1)

    _put_label(overlay, f"BG: {direction}", (px + size + 5, py), _BG_CENTER_COLOR)


def _draw_pose_axis(
    overlay: np.ndarray,
    geometry_data: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> None:
    """Draw pose axis indicators."""
    head_rotation = geometry_data.get("head_rotation_deg")
    shoulder_angle = geometry_data.get("shoulder_line_angle")

    if not face_box:
        return

    x0, y0, x1, y1 = face_box
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    face_w = x1 - x0

    # Head rotation line
    if head_rotation is not None:
        rad = math.radians(head_rotation)
        line_len = face_w // 2
        dx = int(line_len * math.sin(rad))
        dy = int(line_len * math.cos(rad))
        cv2.line(overlay, (cx - dx, cy - dy), (cx + dx, cy + dy), _POSE_COLOR, 2)
        _put_label(overlay, f"Head: {head_rotation:.0f}°", (x1 + 5, cy), _POSE_COLOR)


def _draw_specular_highlights(
    overlay: np.ndarray,
    specular_data: Dict[str, Any],
    img_bgr: np.ndarray,
    person_mask: Optional[np.ndarray] = None,
) -> None:
    """Draw specular highlight detection markers."""
    count = specular_data.get("specular_highlight_count", 0)
    if count == 0:
        return

    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]

    pmask = person_mask.astype(np.uint8) * 255 if person_mask is not None else np.ones((h, w), dtype=np.uint8) * 255
    person_pixels = gray[pmask > 0]
    if len(person_pixels) < 100:
        return

    bright_thresh = max(220, int(np.percentile(person_pixels, 97)))
    specular_mask = (gray > bright_thresh) & (sat < 60) & (pmask > 0)

    contours, _ = cv2.findContours(
        specular_mask.astype(np.uint8) * 255,
        cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
    )

    for contour in contours:
        if cv2.contourArea(contour) < 10:
            continue
        M = cv2.moments(contour)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            radius = max(5, int(math.sqrt(cv2.contourArea(contour) / math.pi)))
            cv2.circle(overlay, (cx, cy), radius, _SPECULAR_COLOR, 2)

    _put_label(overlay, f"Spec: {count}", (10, h - 30), _SPECULAR_COLOR)


def _draw_pose_solver(
    overlay: np.ndarray,
    pose_data: Dict[str, Any],
    recon_data: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
) -> None:
    """Draw pose solver overlays: body axes, self-shadow, corrected light."""
    h, w = overlay.shape[:2]

    # ── Shoulder axis line ──────────────────────────────────────────
    shoulder_angle = pose_data.get("shoulder_line_angle_deg", 0.0)
    if face_box:
        s_cx = (face_box[0] + face_box[2]) // 2
        s_cy = min(h - 1, face_box[3] + (face_box[3] - face_box[1]) // 4)
        half_len = (face_box[2] - face_box[0]) * 2 // 3
    else:
        s_cx, s_cy = w // 2, h // 3
        half_len = min(w, h) // 5

    rad = math.radians(shoulder_angle)
    dx = int(half_len * math.cos(rad))
    dy = int(half_len * math.sin(rad))
    cv2.line(overlay, (s_cx - dx, s_cy - dy), (s_cx + dx, s_cy + dy), _SHOULDER_COLOR, 2)
    _put_label(overlay, f"Shldr: {shoulder_angle:.0f}°", (s_cx + dx + 5, s_cy + dy), _SHOULDER_COLOR)

    # ── Hip axis line ───────────────────────────────────────────────
    hip_angle = pose_data.get("hip_line_angle_deg", 0.0)
    if abs(hip_angle) > 1:
        hip_cy = min(h - 1, s_cy + (h - s_cy) // 3)
        rad_h = math.radians(hip_angle)
        hdx = int(half_len * 0.7 * math.cos(rad_h))
        hdy = int(half_len * 0.7 * math.sin(rad_h))
        cv2.line(overlay, (s_cx - hdx, hip_cy - hdy), (s_cx + hdx, hip_cy + hdy), _HIP_COLOR, 2)
        _put_label(overlay, f"Hip: {hip_angle:.0f}°", (s_cx + hdx + 5, hip_cy + hdy), _HIP_COLOR)

    # ── Head direction arrow ────────────────────────────────────────
    head_rot = pose_data.get("head_rotation_deg", 0.0)
    chin_yaw = pose_data.get("chin_yaw_deg", 0.0)
    if face_box and abs(head_rot) > 2:
        fcx = (face_box[0] + face_box[2]) // 2
        fcy = (face_box[1] + face_box[3]) // 2
        arrow_len = (face_box[2] - face_box[0]) // 3
        # Head direction: positive = turned right
        head_rad = math.radians(-head_rot)
        ex = int(fcx + arrow_len * math.sin(head_rad))
        ey = int(fcy - arrow_len * math.cos(head_rad) * 0.3)
        cv2.arrowedLine(overlay, (fcx, fcy), (ex, ey), _POSE_COLOR, 2, tipLength=0.35)
        _put_label(
            overlay,
            f"Head: {head_rot:.0f}° Yaw: {chin_yaw:.0f}°",
            (face_box[2] + 5, face_box[1] + 15),
            _POSE_COLOR,
        )

    # ── Self-shadow regions (semi-transparent red overlay) ──────────
    self_shadow = pose_data.get("self_shadow_regions", [])
    if self_shadow and face_box:
        x0, y0, x1, y1 = face_box
        region_rects = {
            "under_chin": (x0, y1, x1, min(h, y1 + (y1 - y0) // 4)),
            "neck_lower": (x0 + (x1 - x0) // 4, y1, x0 + 3 * (x1 - x0) // 4, min(h, y1 + (y1 - y0) // 3)),
            "torso_left": (max(0, x0 - (x1 - x0) // 2), y1, x0, min(h, y1 + (y1 - y0))),
            "torso_right": (x1, y1, min(w, x1 + (x1 - x0) // 2), min(h, y1 + (y1 - y0))),
        }
        for region in self_shadow:
            rect = region_rects.get(region)
            if rect:
                rx0, ry0, rx1, ry1 = rect
                sub = overlay[ry0:ry1, rx0:rx1]
                if sub.size > 0:
                    red_tint = np.full_like(sub, _SELF_SHADOW_COLOR)
                    blended = cv2.addWeighted(sub, 0.7, red_tint, 0.3, 0)
                    overlay[ry0:ry1, rx0:rx1] = blended

        _put_label(
            overlay,
            f"Self-shadow: {', '.join(self_shadow)}",
            (10, h - 50),
            _SELF_SHADOW_COLOR,
        )

    # ── Occlusion regions ───────────────────────────────────────────
    occluded = pose_data.get("occluded_regions", [])
    if occluded:
        _put_label(
            overlay,
            f"Occluded: {', '.join(occluded)}",
            (10, h - 70),
            _OCCLUSION_COLOR,
        )

    # ── Corrected key light direction arrow ─────────────────────────
    raw_angle = recon_data.get("key_light_angle_deg_raw")
    corrected_angle = recon_data.get("key_light_angle_deg_pose_corrected")
    if raw_angle is not None and corrected_angle is not None:
        # Draw from face center
        if face_box:
            lcx = (face_box[0] + face_box[2]) // 2
            lcy = (face_box[1] + face_box[3]) // 2
            light_len = (face_box[2] - face_box[0]) * 2 // 3
        else:
            lcx, lcy = w // 2, h // 3
            light_len = min(w, h) // 5

        # Corrected light arrow (spring green)
        corr_rad = math.radians(corrected_angle - 90)
        corr_ex = int(lcx + light_len * math.cos(corr_rad))
        corr_ey = int(lcy - light_len * math.sin(corr_rad))
        cv2.arrowedLine(overlay, (lcx, lcy), (corr_ex, corr_ey), _POSE_CORR_COLOR, 2, tipLength=0.25)
        _put_label(
            overlay,
            f"Key(corr): {corrected_angle:.0f}°",
            (corr_ex + 5, corr_ey - 10),
            _POSE_CORR_COLOR,
        )

        # Raw vs corrected label
        delta = abs(raw_angle - corrected_angle)
        if delta > 2:
            _put_label(
                overlay,
                f"Raw: {raw_angle:.0f}° → Corr: {corrected_angle:.0f}° (Δ{delta:.0f}°)",
                (10, h - 90),
                _POSE_CORR_COLOR,
            )

    # ── Pose complexity badge ───────────────────────────────────────
    complexity = pose_data.get("pose_complexity_score", 0.0)
    adjustment = pose_data.get("pose_confidence_adjustment", "normal")
    if complexity > 0.1:
        badge_color = (0, 255, 0) if adjustment == "normal" else (
            (0, 200, 255) if adjustment == "moderate_caution" else (0, 0, 255)
        )
        _put_label(
            overlay,
            f"Pose: {complexity:.2f} ({adjustment})",
            (w - 250, 20),
            badge_color,
        )


# ── Surface class overlay ────────────────────────────────────────────────

def _draw_surface_classes(
    overlay: np.ndarray,
    surface_data: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]],
    person_mask: Optional[np.ndarray],
) -> None:
    """Draw surface class labels at region positions."""
    h, w = overlay.shape[:2]
    dominant_surfaces = surface_data.get("dominant_surfaces", [])

    # Approximate region positions
    region_positions: Dict[str, Tuple[int, int]] = {
        "face": (w // 2, h // 5),
        "hair": (w // 2, h // 10),
        "body_upper": (w // 2, h * 2 // 5),
        "body_lower": (w // 2, h * 3 // 5),
        "clothing_upper": (w // 3, h * 2 // 5),
        "clothing_lower": (w // 3, h * 3 // 5),
        "background": (w - 80, h // 2),
    }

    if face_box:
        region_positions["face"] = (
            (face_box[0] + face_box[2]) // 2,
            (face_box[1] + face_box[3]) // 2,
        )
        region_positions["hair"] = (
            (face_box[0] + face_box[2]) // 2,
            max(10, face_box[1] - 20),
        )

    for entry in dominant_surfaces:
        region = entry.get("region", "unknown")
        sclass = entry.get("surface_class", "unknown")
        conf = entry.get("confidence", 0.0)

        pos = region_positions.get(region, (w // 2, h // 2))
        label = f"{region}: {sclass} ({conf:.0%})"
        _put_label(overlay, label, pos, _SURFACE_CLASS_COLOR)

    # Reflection-dominant regions
    reflection_regions = surface_data.get("reflection_dominant_regions", [])
    if reflection_regions:
        _put_label(
            overlay,
            f"REFLECTIVE: {', '.join(reflection_regions)}",
            (10, h - 110),
            (0, 100, 255),
        )

    # Surface complexity badge
    complexity = surface_data.get("surface_complexity_score", 0.0)
    adj = surface_data.get("surface_confidence_adjustment", "normal")
    if complexity > 0.1:
        badge_color = (
            (0, 255, 0) if adj == "normal" else
            (0, 200, 255) if adj == "moderate_caution" else
            (0, 0, 255)
        )
        _put_label(
            overlay,
            f"Surface: {complexity:.2f} ({adj})",
            (w - 280, 45),
            badge_color,
        )


# ── Light role overlay ──────────────────────────────────────────────────

def _draw_light_roles(
    overlay: np.ndarray,
    light_role_data: Dict[str, Any],
) -> None:
    """Draw light role legend and light count badge."""
    h, w = overlay.shape[:2]

    # Light count badge
    count = light_role_data.get("likely_light_count", "?")
    count_conf = light_role_data.get("light_count_confidence", 0.0)
    _put_label(
        overlay,
        f"Lights: {count} (conf={count_conf:.0%})",
        (w - 280, 70),
        _LIGHT_ROLE_COLOR,
    )

    # Roles legend
    roles = light_role_data.get("roles", {})
    y_start = h - 180
    for role_name, role_info in roles.items():
        if role_info.get("present"):
            conf = role_info.get("confidence", 0.0)
            evidence = role_info.get("evidence", [])
            ev_str = ", ".join(evidence[:2]) if evidence else ""
            label = f"  {role_name}: {conf:.0%} [{ev_str}]"
            _put_label(overlay, label, (10, y_start), _LIGHT_ROLE_COLOR)
            y_start += 18

    # False multi-light risk
    false_risk = light_role_data.get("false_multi_light_risk", 0.0)
    if false_risk > 0.3:
        _put_label(
            overlay,
            f"FALSE MULTI-LIGHT RISK: {false_risk:.0%}",
            (10, y_start),
            (0, 100, 255),
        )


# ── Main overlay function ────────────────────────────────────────────────

def generate_analysis_overlay(
    img_bgr: np.ndarray,
    pipeline_results: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
    person_mask: Optional[np.ndarray] = None,
    output_path: Optional[str] = None,
) -> Optional[str]:
    """Generate a debug overlay image with all detected signals visualized.

    Args:
        img_bgr: Source image (BGR format)
        pipeline_results: Output from run_extended_pipeline()
        face_box: Face bounding box (x0, y0, x1, y1)
        person_mask: Binary person segmentation mask
        output_path: Custom output path. If None, uses default.

    Returns:
        Path to saved overlay image, or None on failure.
    """
    if cv2 is None:
        logger.warning("cv2 not available, cannot generate overlay")
        return None

    try:
        overlay = img_bgr.copy()
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Shadow vector
        shadow = pipeline_results.get("shadow", {})
        if shadow.get("ok"):
            _draw_shadow_vector(overlay, shadow, face_box)

        # Highlight heatmap
        highlight = pipeline_results.get("highlight", {})
        if highlight.get("ok"):
            _draw_highlight_heatmap(overlay, gray, person_mask)

        # Catchlight circles
        catchlight = pipeline_results.get("catchlight", {})
        if catchlight.get("ok"):
            _draw_catchlight_circles(overlay, catchlight, face_box)

        # Background gradient center
        background = pipeline_results.get("background", {})
        if background.get("ok"):
            _draw_bg_gradient_center(overlay, background)

        # Pose axis (basic from geometry)
        geometry = pipeline_results.get("geometry", {})
        _draw_pose_axis(overlay, geometry, face_box)

        # Specular highlights
        specular = pipeline_results.get("specular_surface", {})
        if specular.get("ok"):
            _draw_specular_highlights(overlay, specular, img_bgr, person_mask)

        # Pose solver overlays (shoulder/hip axes, self-shadow,
        # corrected light arrow, complexity badge)
        pose_solver = pipeline_results.get("pose_solver", {})
        recon = pipeline_results.get("reconstruction", {})
        if pose_solver.get("ok"):
            _draw_pose_solver(overlay, pose_solver, recon, face_box)

        # Surface class overlays
        surface = pipeline_results.get("surface_class", {})
        if surface.get("ok"):
            _draw_surface_classes(overlay, surface, face_box, person_mask)

        # Light role overlays
        light_role = pipeline_results.get("light_role", {})
        if light_role.get("ok"):
            _draw_light_roles(overlay, light_role)

        # Reconstruction summary in corner
        if recon.get("ok"):
            y_pos = 20
            summary_keys = [
                "key_light_angle_deg_raw",
                "key_light_angle_deg_pose_corrected",
                "key_light_height",
                "modifier_size_class",
                "modifier_size_class_raw",
                "modifier_certainty",
                "pose_complexity_score",
                "likely_light_count",
            ]
            for key in summary_keys:
                val = recon.get(key)
                if val is not None:
                    _put_label(overlay, f"{key}: {val}", (10, y_pos))
                    y_pos += 20

        # Validation status
        validation = pipeline_results.get("validation", {})
        if validation.get("ok"):
            conf = validation.get("confidence", 0)
            valid = validation.get("valid", False)
            pose_adj = validation.get("pose_adjusted", False)
            surf_adj = validation.get("surface_adjusted", False)
            status = "VALID" if valid else "WARNINGS"
            if pose_adj:
                status += " [pose-adj]"
            if surf_adj:
                status += " [surf-adj]"
            color = (0, 255, 0) if valid else (0, 0, 255)
            _put_label(overlay, f"{status} (conf={conf:.2f})", (10, overlay.shape[0] - 10), color)

        # Save output
        _ensure_output_dir()
        if output_path is None:
            output_path = str(DEBUG_OUTPUT_DIR / "analysis_overlay.jpg")

        cv2.imwrite(output_path, overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])
        logger.info("Debug overlay saved: %s", output_path)
        return output_path

    except Exception as exc:
        logger.warning("Failed to generate debug overlay: %s", exc)
        return None
