from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Optional

import numpy as np

try:
    import cv2
    import mediapipe as mp
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore
    mp = None  # type: ignore


# -------------------------
# Simple palette helper
# -------------------------

BASIC_COLOR_NAMES = [
    ("black", (0, 0, 0)),
    ("white", (255, 255, 255)),
    ("gray", (128, 128, 128)),
    ("red", (220, 20, 60)),
    ("orange", (255, 140, 0)),
    ("yellow", (255, 215, 0)),
    ("green", (34, 139, 34)),
    ("cyan", (0, 206, 209)),
    ("blue", (30, 144, 255)),
    ("purple", (138, 43, 226)),
    ("magenta", (255, 0, 255)),
    ("brown", (139, 69, 19)),
    ("beige", (245, 245, 220)),
]


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{r:02x}{g:02x}{b:02x}"


def _dist2(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> int:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def _nearest_basic_name(rgb: Tuple[int, int, int]) -> str:
    best = ("unknown", 10**18)
    for name, ref in BASIC_COLOR_NAMES:
        d = _dist2(rgb, ref)
        if d < best[1]:
            best = (name, d)
    return best[0]


def _kmeans_palette(pixels_rgb: np.ndarray, k: int = 5) -> List[Dict[str, Any]]:
    """
    pixels_rgb: Nx3 uint8
    Returns dominant colors with pct.
    """
    if pixels_rgb.size == 0:
        return []

    # downsample to keep it fast
    if pixels_rgb.shape[0] > 20000:
        idx = np.random.choice(pixels_rgb.shape[0], 20000, replace=False)
        pixels_rgb = pixels_rgb[idx]

    Z = pixels_rgb.astype(np.float32)

    # cv2.kmeans expects float32
    K = int(max(1, min(k, 8)))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _compact, labels, centers = cv2.kmeans(Z, K, None, criteria, 5, cv2.KMEANS_PP_CENTERS)

    labels = labels.flatten()
    counts = np.bincount(labels, minlength=K).astype(np.float64)
    total = counts.sum() if counts.sum() > 0 else 1.0

    out = []
    for i in np.argsort(counts)[::-1]:
        rgb = centers[i].clip(0, 255).astype(np.uint8)
        rgb_t = (int(rgb[0]), int(rgb[1]), int(rgb[2]))
        out.append(
            {
                "rgb": [rgb_t[0], rgb_t[1], rgb_t[2]],
                "hex": _rgb_to_hex(rgb_t),
                "name": _nearest_basic_name(rgb_t),
                "pct": round(100.0 * (counts[i] / total), 2),
            }
        )
    return out


# -------------------------
# Masks: person, face, skin, clothing, background
# -------------------------

def _ycbcr_skin_mask(img_bgr: np.ndarray) -> np.ndarray:
    """
    Conservative YCbCr skin mask. Returns boolean mask HxW.
    """
    ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
    # OpenCV order: Y, Cr, Cb
    Y = ycrcb[:, :, 0]
    Cr = ycrcb[:, :, 1]
    Cb = ycrcb[:, :, 2]

    # conservative bounds
    mask = (Cb >= 77) & (Cb <= 127) & (Cr >= 133) & (Cr <= 173) & (Y >= 25) & (Y <= 235)
    return mask


def _safe_box(x0: int, y0: int, x1: int, y1: int, w: int, h: int) -> Tuple[int, int, int, int]:
    x0 = max(0, min(x0, w - 1))
    y0 = max(0, min(y0, h - 1))
    x1 = max(1, min(x1, w))
    y1 = max(1, min(y1, h))
    if x1 <= x0 + 1:
        x1 = min(w, x0 + 2)
    if y1 <= y0 + 1:
        y1 = min(h, y0 + 2)
    return x0, y0, x1, y1


def _pose_guess(img_bgr: np.ndarray) -> Dict[str, Any]:
    """
    Very basic pose inference:
    - standing/sitting/unknown from hip-knee-ankle geometry visibility and y ordering
    - angle: front/profile-ish from shoulder width
    """
    if mp is None:
        return {"ok": False, "error": "mediapipe not installed"}

    mp_pose = mp.solutions.pose
    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    with mp_pose.Pose(static_image_mode=True, model_complexity=1, enable_segmentation=False) as pose:
        res = pose.process(img_rgb)

    if not res.pose_landmarks:
        return {"ok": False, "reason": "no_pose_detected"}

    lm = res.pose_landmarks.landmark

    def L(i: int) -> Tuple[float, float, float]:
        return lm[i].x * w, lm[i].y * h, lm[i].visibility

    # landmark indices (mediapipe)
    # shoulders: 11,12 ; hips: 23,24 ; knees: 25,26 ; ankles: 27,28
    lsx, lsy, lsv = L(11)
    rsx, rsy, rsv = L(12)
    lhx, lhy, lhv = L(23)
    rhx, rhy, rhv = L(24)
    lkx, lky, lkv = L(25)
    rkx, rky, rkv = L(26)
    lax, lay, lav = L(27)
    rax, ray, rav = L(28)

    vis = np.mean([lsv, rsv, lhv, rhv, lkv, rkv, lav, rav])
    shoulder_w = abs(lsx - rsx)
    angle = "front-ish" if shoulder_w > (0.18 * w) else "profile-ish"

    # Standing vs sitting heuristic:
    # If hips are above knees and knees above ankles with decent visibility -> standing likely
    # If knees/hips are close in y (knees high) or ankles missing -> sitting likely
    standing_score = 0
    sitting_score = 0

    if lhv > 0.4 and lkv > 0.4 and lav > 0.35:
        if lhy < lky < lay:
            standing_score += 1
        if abs(lhy - lky) < 0.08 * h:
            sitting_score += 1
    if rhv > 0.4 and rkv > 0.4 and rav > 0.35:
        if rhy < rky < ray:
            standing_score += 1
        if abs(rhy - rky) < 0.08 * h:
            sitting_score += 1

    if standing_score >= 1 and sitting_score == 0:
        pose_label = "standing"
    elif sitting_score >= 1:
        pose_label = "sitting"
    else:
        pose_label = "unknown"

    return {
        "ok": True,
        "pose": pose_label,
        "angle": angle,
        "visibility": float(vis),
        "notes": [
            "Pose is best-effort from landmarks; seated/leaning/cropped frames can confuse it.",
        ],
    }


def analyze_image_regions(image_path: str) -> Dict[str, Any]:
    if cv2 is None or mp is None:
        return {"ok": False, "error": "opencv-python and mediapipe are required"}

    img = cv2.imread(image_path)
    if img is None:
        return {"ok": False, "error": f"Could not read image: {image_path}"}

    h, w = img.shape[:2]

    # Person segmentation
    mp_seg = mp.solutions.selfie_segmentation
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    with mp_seg.SelfieSegmentation(model_selection=1) as seg:
        seg_res = seg.process(img_rgb)

    if seg_res.segmentation_mask is None:
        return {"ok": False, "reason": "no_segmentation_mask"}

    person_mask = (seg_res.segmentation_mask > 0.5)
    # clean mask a bit
    person_u8 = (person_mask.astype(np.uint8) * 255)
    person_u8 = cv2.medianBlur(person_u8, 7)
    person_mask = person_u8 > 0

    # Face detection for better skin region targeting
    mp_face = mp.solutions.face_detection
    face_box = None
    with mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.5) as fd:
        fd_res = fd.process(img_rgb)

    if fd_res.detections:
        det = fd_res.detections[0]
        bb = det.location_data.relative_bounding_box
        x0 = int(bb.xmin * w)
        y0 = int(bb.ymin * h)
        x1 = int((bb.xmin + bb.width) * w)
        y1 = int((bb.ymin + bb.height) * h)
        x0, y0, x1, y1 = _safe_box(x0, y0, x1, y1, w, h)
        face_box = (x0, y0, x1, y1)

    # Skin mask: use YCbCr mask, optionally constrained to face box
    skin_mask = _ycbcr_skin_mask(img)
    if face_box:
        x0, y0, x1, y1 = face_box
        face_only = np.zeros((h, w), dtype=bool)
        face_only[y0:y1, x0:x1] = True
        skin_mask = skin_mask & face_only

    skin_mask = skin_mask & person_mask

    # Clothing mask (rough): person minus skin
    clothing_mask = person_mask & (~skin_mask)

    # Background mask
    background_mask = ~person_mask

    def pixels_from_mask(mask: np.ndarray) -> np.ndarray:
        pts = img[mask]
        if pts.size == 0:
            return np.empty((0, 3), dtype=np.uint8)
        # convert BGR -> RGB for palette
        pts_rgb = pts[:, ::-1]
        return pts_rgb

    skin_px = pixels_from_mask(skin_mask)
    cloth_px = pixels_from_mask(clothing_mask)
    bg_px = pixels_from_mask(background_mask)

    # Palettes
    skin_pal = _kmeans_palette(skin_px, k=4) if skin_px.shape[0] >= 500 else []
    cloth_pal = _kmeans_palette(cloth_px, k=5) if cloth_px.shape[0] >= 1000 else []
    bg_pal = _kmeans_palette(bg_px, k=5) if bg_px.shape[0] >= 1000 else []

    # Pose
    pose_info = _pose_guess(img)

    # Skin tone guess from skin pixels luma (Y from YCrCb)
    skin_tone = {"ok": False, "reason": "no_skin_pixels"}
    if skin_px.shape[0] >= 800:
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        Y = ycrcb[:, :, 0]
        ys = Y[skin_mask]
        mean_y = float(np.mean(ys)) if ys.size else 0.0
        if mean_y <= 115:
            tone = "deep"
        elif mean_y <= 165:
            tone = "medium"
        else:
            tone = "light"
        ratio = float(skin_px.shape[0] / float(h * w))
        conf = "high" if ratio >= 0.10 else ("medium" if ratio >= 0.05 else "low")
        skin_tone = {
            "ok": True,
            "skin_tone_guess": tone,
            "mean_skin_luma_y": mean_y,
            "skin_pixel_ratio": ratio,
            "confidence": conf,
            "limits": [
                "Exposure/WB can shift results; treat as a starting guess.",
                "Strong gels/makeup can break inference.",
            ],
        }

    return {
        "ok": True,
        "region_attribution": {
            "enabled": True,
            "masks": {
                "person_ratio": float(np.mean(person_mask)),
                "skin_ratio": float(np.mean(skin_mask)),
                "clothing_ratio": float(np.mean(clothing_mask)),
                "background_ratio": float(np.mean(background_mask)),
            },
            "palettes": {
                "skin_palette": skin_pal,
                "clothing_palette": cloth_pal,
                "background_palette": bg_pal,
            },
            "face_box": list(face_box) if face_box else None,
            "notes": [
                "Skin/clothing/background palettes come from actual masked pixels (not guesses).",
                "Clothing mask is 'person minus skin' (hair may be included).",
            ],
        },
        "pose": pose_info,
        "skin_tone": skin_tone,
        "subject": {
            "description": "unknown",
            "gender": "unknown",
            "pose": pose_info.get("pose", "unknown") if isinstance(pose_info, dict) else "unknown",
            "needs_user_confirmation": True,
            "prompt": "Confirm: gender/presentation (optional), pose type, wardrobe colors, and intended mood.",
        },
    }
