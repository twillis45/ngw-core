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
# NOTE: All colors are in OpenCV BGR order. Browser displays JPEG in RGB,
# so BGR (B, G, R) displays as the RGB color (R, G, B).
# Legend (browser display color → annotation meaning):
#   Blue         → Shadow direction arrow
#   Green        → Catchlight circles
#   Yellow       → Highlight heatmap
#   Magenta      → Background gradient center
#   Orange/gold  → Raw pose axis (head rotation)
#   Cyan         → Specular highlights
#   Orange       → Shoulder axis
#   Purple       → Hip axis
#   Chartreuse   → Corrected key-light arrow (pose-adjusted)
#   Red          → Self-shadow region tint
#   Salmon       → Occluded regions
#   Steel blue   → Surface class labels
#   Yellow-green → Light role indicators

_SHADOW_COLOR        = (255, 100,   0)  # BGR → displays blue
_HIGHLIGHT_COLOR     = (  0, 255, 255)  # BGR → displays yellow
_CATCHLIGHT_COLOR    = (  0, 255,   0)  # BGR → displays green
_BG_CENTER_COLOR     = (255,   0, 255)  # BGR → displays magenta
_POSE_COLOR          = (  0, 200, 255)  # BGR → displays orange/gold
_SPECULAR_COLOR      = (255, 255,   0)  # BGR → displays cyan
_SHOULDER_COLOR      = (  0, 165, 255)  # BGR → displays orange
_HIP_COLOR           = (128,   0, 128)  # BGR → displays purple
_POSE_CORR_COLOR     = (  0, 255, 128)  # BGR → displays chartreuse
_SELF_SHADOW_COLOR   = (  0,   0, 200)  # BGR → displays red
_OCCLUSION_COLOR     = (100, 100, 255)  # BGR → displays salmon
_SURFACE_CLASS_COLOR = (200, 150,  50)  # BGR → displays steel blue
_LIGHT_ROLE_COLOR    = ( 50, 200, 150)  # BGR → displays yellow-green
_TEXT_COLOR          = (255, 255, 255)  # White — label text
_TEXT_BG             = (  0,   0,   0)  # Black — label background box

# Dynamic font scale — set by generate_analysis_overlay based on image width.
# Targets ~14px text height when overlay is viewed at 600px wide in browser.
# Formula: (image_width / 600) * 0.55, clamped to [0.55, 3.0].
_FONT_SCALE: float = 0.55
_FONT_THICKNESS: int = 1


def _put_label(
    img: np.ndarray,
    text: str,
    pos: Tuple[int, int],
    color: Tuple[int, int, int] = _TEXT_COLOR,
    scale: float | None = None,
) -> None:
    """Draw a label with background on the image, clamped to stay inside bounds."""
    s = scale if scale is not None else _FONT_SCALE
    thickness = max(1, round(_FONT_THICKNESS))
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, s, thickness)
    ih, iw = img.shape[:2]
    pad_x, pad_y = max(3, round(s * 5)), max(4, round(s * 7))
    # Clamp so the background rect stays within the image
    x = max(pad_x, min(pos[0], iw - tw - pad_x * 2))
    y = max(th + pad_y, min(pos[1], ih - pad_y))
    cv2.rectangle(img, (x - pad_x, y - th - pad_y), (x + tw + pad_x, y + pad_y), _TEXT_BG, -1)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, s, color, thickness, cv2.LINE_AA)


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

    # Arrow points TOWARD the light source (shadow direction + 180°).
    # Shadow falls in `vector_deg` direction; light comes from opposite side.
    light_deg = (vector_deg + 180) % 360
    rad = math.radians(light_deg - 90)
    end_x = int(cx + arrow_len * math.cos(rad))
    end_y = int(cy + arrow_len * math.sin(rad))

    cv2.arrowedLine(overlay, (cx, cy), (end_x, end_y), _SHADOW_COLOR, 2, tipLength=0.3)
    _put_label(overlay, f"Key ~{light_deg:.0f}° (shadow {vector_deg:.0f}°)", (end_x + 5, end_y), _SHADOW_COLOR)

    softness = shadow_data.get("shadow_softness")
    if softness is not None:
        line_h = max(20, round(_FONT_SCALE * 30))
        _put_label(overlay, f"Soft: {softness:.2f}", (cx + 5, cy + line_h), _SHADOW_COLOR)


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
    intel_catchlights: Optional[list] = None,
) -> None:
    """Draw outline circles at actual catchlight positions and sizes.

    Args:
        intel_catchlights: Classified catchlights from lighting_inference
            (each has eye, position, role). Used to color-code circles by
            role (key=green, fill=amber). Raw catchlights have no role field.
    """
    catchlights = catchlight_data.get("catchlights", [])
    count = catchlight_data.get("count", 0) or len(catchlights)

    if count == 0 and not catchlights:
        return

    # Iris centers from face_geometry (actual pixel coords from MediaPipe)
    fg = catchlight_data.get("face_geometry", {})
    left_center  = fg.get("left_eye_center")   # (x, y) tuple or None
    right_center = fg.get("right_eye_center")

    # Estimate iris radius from face_box
    iris_r_px = 12  # default
    if face_box:
        x0, y0, x1, y1 = face_box
        iris_r_px = max(8, (x1 - x0) // 14)

    # Fallback eye centers from face_box if face_geometry not available
    if left_center is None and face_box:
        x0, y0, x1, y1 = face_box
        left_center  = (x0 + (x1 - x0) // 3,     y0 + (y1 - y0) // 3)
        right_center = (x0 + 2 * (x1 - x0) // 3, y0 + (y1 - y0) // 3)

    eye_centers = {"left": left_center, "right": right_center}

    # Role colors: key=green, fill=amber, else default green
    _role_colors = {
        "key": (80, 230, 80),    # BGR → bright green
        "fill": (60, 160, 230),  # BGR → amber/orange
    }

    # Build role lookup from intel catchlights: (eye, position) → role
    # Intel catchlights have roles assigned by lighting_inference; raw
    # vision catchlights have no role field so we fall back to raw's own
    # role key (empty string for unclassified).
    _role_lookup: dict = {}
    for _ic in (intel_catchlights or []):
        _ik = (_ic.get("eye", ""), _ic.get("position", ""))
        _role_lookup[_ik] = _ic.get("role", "")

    # Draw thin iris ring for each detected eye
    drawn_eyes: set = set()
    for cl in catchlights:
        eye = cl.get("eye", "")
        ec = eye_centers.get(eye)
        if ec is None:
            continue

        if eye not in drawn_eyes:
            cv2.circle(overlay, (int(ec[0]), int(ec[1])), iris_r_px, _CATCHLIGHT_COLOR, 1)
            drawn_eyes.add(eye)

        # Prefer intel role lookup; fall back to raw catchlight's own role (usually empty)
        position = cl.get("position", "")
        role = _role_lookup.get((eye, position), cl.get("role", ""))
        color = _role_colors.get(role, _CATCHLIGHT_COLOR)

        abs_cx = cl.get("abs_cx")
        abs_cy = cl.get("abs_cy")
        enc_r  = cl.get("enc_r_px")

        if abs_cx is not None and abs_cy is not None and enc_r is not None:
            # Use actual pixel position and size from detection
            r = max(2, int(enc_r))
            cv2.circle(overlay, (int(abs_cx), int(abs_cy)), r, color, 1)
        else:
            # Fallback: estimate position from clock angle + iris center
            pos_str = cl.get("position", "12 o'clock")
            try:
                hour = int(pos_str.split()[0])
            except (ValueError, IndexError):
                hour = 12
            angle_rad = math.radians((hour / 12) * 360 - 90)
            r = max(2, int((cl.get("size_ratio") or 0.2) * iris_r_px * 0.7))
            ox = int(ec[0] + iris_r_px * 0.65 * math.cos(angle_rad))
            oy = int(ec[1] + iris_r_px * 0.65 * math.sin(angle_rad))
            cv2.circle(overlay, (ox, oy), r, color, 1)

    if left_center:
        _put_label(
            overlay,
            f"CL: {count}",
            (int(left_center[0]) - 20, int(left_center[1]) - iris_r_px - 10),
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

    line_h = max(20, round(_FONT_SCALE * 30))
    _put_label(overlay, f"Spec: {count}", (10, h - line_h * 2), _SPECULAR_COLOR)


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
            (face_box[2] + 5, face_box[1] + max(15, round(_FONT_SCALE * 20))),
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
                    blended = cv2.addWeighted(sub, 0.82, red_tint, 0.18, 0)
                    overlay[ry0:ry1, rx0:rx1] = blended

        _lh = max(20, round(_FONT_SCALE * 30))
        _put_label(
            overlay,
            f"Self-shadow: {', '.join(self_shadow)}",
            (10, h - _lh * 3),
            _SELF_SHADOW_COLOR,
        )

    # ── Occlusion regions ───────────────────────────────────────────
    occluded = pose_data.get("occluded_regions", [])
    if occluded:
        _lh = max(20, round(_FONT_SCALE * 30))
        _put_label(
            overlay,
            f"Occluded: {', '.join(occluded)}",
            (10, h - _lh * 4),
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
            _lh = max(20, round(_FONT_SCALE * 30))
            _put_label(
                overlay,
                f"Raw: {raw_angle:.0f}° → Corr: {corrected_angle:.0f}° (Δ{delta:.0f}°)",
                (10, h - _lh * 5),
                _POSE_CORR_COLOR,
            )

    # ── Pose complexity badge ───────────────────────────────────────
    complexity = pose_data.get("pose_complexity_score", 0.0)
    adjustment = pose_data.get("pose_confidence_adjustment", "normal")
    if complexity > 0.1:
        badge_color = (0, 255, 0) if adjustment == "normal" else (
            (0, 200, 255) if adjustment == "moderate_caution" else (0, 0, 255)
        )
        _lh = max(20, round(_FONT_SCALE * 30))
        badge_x = max(10, w - round(_FONT_SCALE * 340))
        _put_label(
            overlay,
            f"Pose: {complexity:.2f} ({adjustment})",
            (badge_x, _lh * 1),
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
        _lh = max(20, round(_FONT_SCALE * 30))
        _put_label(
            overlay,
            f"REFLECTIVE: {', '.join(reflection_regions)}",
            (10, h - _lh * 6),
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
        _lh = max(20, round(_FONT_SCALE * 30))
        badge_x = max(10, w - round(_FONT_SCALE * 340))
        _put_label(
            overlay,
            f"Surface: {complexity:.2f} ({adj})",
            (badge_x, _lh * 2),
            badge_color,
        )


# ── Light role overlay ──────────────────────────────────────────────────

def _draw_light_roles(
    overlay: np.ndarray,
    light_role_data: Dict[str, Any],
) -> None:
    """Draw light role legend and light count badge."""
    h, w = overlay.shape[:2]

    # Shared line height for this function
    line_h = max(20, round(_FONT_SCALE * 30))
    badge_x = max(10, w - round(_FONT_SCALE * 340))

    # Light count badge — top-right slot 3
    count = light_role_data.get("likely_light_count", "?")
    count_conf = light_role_data.get("light_count_confidence", 0.0)
    _put_label(
        overlay,
        f"Lights: {count} (conf={count_conf:.0%})",
        (badge_x, line_h * 3),
        _LIGHT_ROLE_COLOR,
    )

    # Roles legend — start high enough to never conflict with the bottom fixed labels.
    # Bottom slots 1-7 are reserved; start roles at h - line_h * 16 going downward.
    roles = light_role_data.get("roles", {})
    y_start = h - line_h * 16
    for role_name, role_info in roles.items():
        if role_info.get("present"):
            conf = role_info.get("confidence", 0.0)
            evidence = role_info.get("evidence", [])
            ev_str = ", ".join(evidence[:2]) if evidence else ""
            label = f"  {role_name}: {conf:.0%} [{ev_str}]"
            _put_label(overlay, label, (10, y_start), _LIGHT_ROLE_COLOR)
            y_start += line_h

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

# All valid layer names — passed as a set to generate_analysis_overlay.
# None (the default) means "all layers".
ALL_LAYERS: frozenset[str] = frozenset({
    "shadow",
    "highlights",
    "catchlights",
    "background",
    "pose",
    "specular",
    "surface",
    "light_roles",
    "summary",
})


def generate_analysis_overlay(
    img_bgr: np.ndarray,
    pipeline_results: Dict[str, Any],
    face_box: Optional[Tuple[int, int, int, int]] = None,
    person_mask: Optional[np.ndarray] = None,
    output_path: Optional[str] = None,
    layers: Optional[frozenset[str]] = None,
    vision_data: Optional[Dict[str, Any]] = None,
    intel_catchlights: Optional[list] = None,
) -> Optional[str]:
    """Generate a debug overlay image with all detected signals visualized.

    Args:
        img_bgr: Source image (BGR format)
        pipeline_results: Output from run_extended_pipeline()
        face_box: Face bounding box (x0, y0, x1, y1)
        person_mask: Binary person segmentation mask
        output_path: Custom output path. If None, uses default.
        layers: Set of layer names to draw. None means all layers.
                Valid names: shadow, highlights, catchlights, background,
                pose, specular, surface, light_roles, summary.
        vision_data: Raw vision_data dict from vision_pipeline. When provided,
                     catchlight dots use vision_data["catchlights"] which contains
                     the full per-catchlight list and face_geometry from MediaPipe.
        intel_catchlights: Classified catchlights from lighting_inference
                     (each has eye, position, role). Used to color-code circles
                     by role: green=key, amber=fill.

    Returns:
        Path to saved overlay image, or None on failure.
    """
    if cv2 is None:
        logger.warning("cv2 not available, cannot generate overlay")
        return None

    # Resolve active layers — None means "draw everything"
    active = ALL_LAYERS if layers is None else (layers & ALL_LAYERS)

    try:
        overlay = img_bgr.copy()
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Adaptive font scale — keeps text ~14 px tall when viewed at 600 px wide
        global _FONT_SCALE, _FONT_THICKNESS
        img_w = img_bgr.shape[1]
        _FONT_SCALE = max(0.55, min(3.0, (img_w / 600) * 0.55))
        _FONT_THICKNESS = max(1, round(_FONT_SCALE))

        # Shadow vector
        if "shadow" in active:
            shadow = pipeline_results.get("shadow", {})
            if shadow.get("ok"):
                _draw_shadow_vector(overlay, shadow, face_box)

        # Highlight heatmap
        if "highlights" in active:
            highlight = pipeline_results.get("highlight", {})
            if highlight.get("ok"):
                _draw_highlight_heatmap(overlay, gray, person_mask)

        # Catchlight circles
        # pipeline_results["catchlight"] (no 's') = topology/analysis pass (no per-dot data)
        # vision_data["catchlights"] (with 's') = full MediaPipe result with face_geometry + catchlights array
        if "catchlights" in active:
            catchlight = (
                (vision_data or {}).get("catchlights")          # preferred: full per-dot data
                or pipeline_results.get("catchlights")          # fallback: may have face_yaw only
                or pipeline_results.get("catchlight", {})       # fallback: topology pass (no dot positions)
            )
            if catchlight.get("ok"):
                _draw_catchlight_circles(overlay, catchlight, face_box, intel_catchlights)

        # Background gradient center
        if "background" in active:
            background = pipeline_results.get("background", {})
            if background.get("ok"):
                _draw_bg_gradient_center(overlay, background)

        # Pose axis (basic geometry) + pose solver overlays
        # Both grouped under "pose" — they describe the same subject geometry.
        if "pose" in active:
            geometry = pipeline_results.get("geometry", {})
            _draw_pose_axis(overlay, geometry, face_box)

            pose_solver = pipeline_results.get("pose_solver", {})
            recon = pipeline_results.get("reconstruction", {})
            if pose_solver.get("ok"):
                _draw_pose_solver(overlay, pose_solver, recon, face_box)
        else:
            # recon is still needed for summary even when pose is off
            recon = pipeline_results.get("reconstruction", {})

        # Specular highlights
        if "specular" in active:
            specular = pipeline_results.get("specular_surface", {})
            if specular.get("ok"):
                _draw_specular_highlights(overlay, specular, img_bgr, person_mask)

        # Surface class overlays
        if "surface" in active:
            surface = pipeline_results.get("surface_class", {})
            if surface.get("ok"):
                _draw_surface_classes(overlay, surface, face_box, person_mask)

        # Light role overlays
        if "light_roles" in active:
            light_role = pipeline_results.get("light_role", {})
            if light_role.get("ok"):
                _draw_light_roles(overlay, light_role)

        # Reconstruction summary in corner
        if "summary" in active and recon.get("ok"):
            line_h = max(20, round(_FONT_SCALE * 30))
            y_pos = line_h
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
                    y_pos += line_h

        # Validation status (always shown — not part of the per-layer toggle)
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
            _lh = max(20, round(_FONT_SCALE * 30))
            _put_label(overlay, f"{status} (conf={conf:.2f})", (10, overlay.shape[0] - _lh), color)

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
