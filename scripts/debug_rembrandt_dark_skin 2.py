"""
Dump the raw shadow-geometry signals from light_structure_pass() for the
dark-skin Rembrandt reference image.

Purpose: verify that the Loop-vs-Rembrandt branch mis-classifies on Fitzpatrick V/VI
because the absolute/linear thresholds in the nose-shadow mask bias against dark skin.

Usage:
    python scripts/debug_rembrandt_dark_skin.py [path/to/image]

Default image: benchmarks/images/Tier 1/Rembrandt/a4d9fcb1711db2da773cb253e705869d.jpg
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

DEFAULT_IMG = REPO / "benchmarks" / "images" / "Tier 1" / "Rembrandt" / "a4d9fcb1711db2da773cb253e705869d.jpg"


def _detect_face_box(img_bgr: np.ndarray):
    """Reuse the mediapipe face detector the real pipeline uses."""
    try:
        import mediapipe as mp
    except Exception as exc:
        raise RuntimeError(f"mediapipe not available: {exc}")

    h, w = img_bgr.shape[:2]
    from engine.vision_pipeline import _MODEL_DIR, _mp_delegate, _safe_box, SEGMENTATION

    fd_model = _MODEL_DIR / "face_detector.tflite"
    if not fd_model.exists():
        raise RuntimeError(f"face_detector.tflite not found at {fd_model}")

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    fd_opts = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(
            model_asset_path=str(fd_model),
            delegate=_mp_delegate(),
        ),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        min_detection_confidence=SEGMENTATION.FACE_DETECTOR_CONFIDENCE,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(fd_opts)
    try:
        fd_res = detector.detect(mp_image)
    finally:
        detector.close()

    if not fd_res.detections:
        return None
    bb = fd_res.detections[0].bounding_box
    x0 = bb.origin_x
    y0 = bb.origin_y
    x1 = bb.origin_x + bb.width
    y1 = bb.origin_y + bb.height
    return tuple(_safe_box(x0, y0, x1, y1, w, h))


def instrumented_light_structure(img_bgr: np.ndarray, face_box):
    """
    Duplicate the core Loop/Rembrandt decision path from
    engine.vision_passes.light_structure_pass (≈ lines 2879-3230), with
    every intermediate printed.  We keep this file in lockstep with the
    real function for one investigation, then delete it.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    fx, fy, fx1, fy1 = face_box
    fw = fx1 - fx
    fh = fy1 - fy
    face_roi = gray[fy:fy + fh, fx:fx + fw]
    face_mean = float(np.mean(face_roi))
    face_std = float(np.std(face_roi))

    print("=" * 72)
    print(f"image shape        : {w}x{h}")
    print(f"face_box           : x=({fx},{fx1}) y=({fy},{fy1})  fw={fw} fh={fh}")
    print(f"face_mean          : {face_mean:7.2f}   (0-255 gray)")
    print(f"face_std (σ_face)  : {face_std:7.2f}")
    print(f"face_mean - 0.35σ  : {face_mean - 0.35*face_std:7.2f}  <-- proposed connectivity gate (fix 2)")

    # Nose region
    nose_top = fh // 3
    nose_bottom = 2 * fh // 3
    nose_left = fw // 3
    nose_right = 2 * fw // 3
    nose_region = face_roi[nose_top:nose_bottom, nose_left:nose_right]
    nose_mean = float(np.mean(nose_region))
    nose_std = float(np.std(nose_region))
    print(f"nose_region shape  : {nose_region.shape}  mean={nose_mean:.2f} std={nose_std:.2f}")

    # ── (1) Current shadow threshold (line 2914-2917) ────────────────
    _shadow_ratio_base_cur = 0.70 + max(0.0, (130.0 - face_mean) / 400.0)
    _shadow_ratio_base_cur = min(_shadow_ratio_base_cur, 0.82)
    shadow_threshold_cur = face_mean * _shadow_ratio_base_cur
    shadow_mask_cur = (nose_region < shadow_threshold_cur).astype(np.uint8)
    shadow_ratio_cur = float(np.mean(shadow_mask_cur))
    print("-" * 72)
    print("CURRENT (absolute ratio):")
    print(f"  shadow_ratio_base: {_shadow_ratio_base_cur:.4f}")
    print(f"  shadow_threshold : {shadow_threshold_cur:7.2f}")
    print(f"  shadow_ratio (%) : {shadow_ratio_cur:.4f}  ({int(shadow_ratio_cur*100)}% of nose pixels flagged)")

    # ── (1-fix) Proposed local-contrast threshold ────────────────────
    # Otsu within the face ROI (not nose region) — gives one number that
    # separates lit from shadow skin based on the within-face distribution.
    _otsu_threshold, _ = cv2.threshold(face_roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    shadow_threshold_otsu = float(_otsu_threshold)
    shadow_mask_otsu = (nose_region < shadow_threshold_otsu).astype(np.uint8)
    shadow_ratio_otsu = float(np.mean(shadow_mask_otsu))
    # Alternative: face_mean − k*σ_face
    k = 0.5
    shadow_threshold_sigma = face_mean - k * face_std
    shadow_mask_sigma = (nose_region < shadow_threshold_sigma).astype(np.uint8)
    shadow_ratio_sigma = float(np.mean(shadow_mask_sigma))
    print("PROPOSED FIX (local contrast):")
    print(f"  [otsu]  threshold : {shadow_threshold_otsu:7.2f}  shadow_ratio={shadow_ratio_otsu:.4f}")
    print(f"  [σ k=0.5] thresh  : {shadow_threshold_sigma:7.2f}  shadow_ratio={shadow_ratio_sigma:.4f}")

    def _dump_decision(label, mask, thr):
        nr_h, nr_w = nose_region.shape
        mid_x = nr_w // 2
        left_shadow = float(np.mean(mask[:, :mid_x]))
        right_shadow = float(np.mean(mask[:, mid_x:]))
        top_shadow = float(np.mean(mask[:nr_h // 2, :]))
        bottom_shadow = float(np.mean(mask[nr_h // 2:, :]))
        lr_asym = abs(left_shadow - right_shadow)
        print(f"\n--- {label} ---")
        print(f"  left_shadow    : {left_shadow:.4f}")
        print(f"  right_shadow   : {right_shadow:.4f}")
        print(f"  L/R asymmetry  : {lr_asym:.4f}  (loop<0.20, rem>0.20)")
        print(f"  top_shadow     : {top_shadow:.4f}")
        print(f"  bottom_shadow  : {bottom_shadow:.4f}")
        print(f"  bottom>top*1.05: {bottom_shadow > top_shadow * 1.05}")

        # Shadow side
        shadow_side = "left" if left_shadow > right_shadow else "right"
        print(f"  shadow_side    : {shadow_side}")

        # Connectivity (line 3107-3116)
        _rem_conn_y0 = int(fh * 0.35)
        _rem_conn_y1 = int(fh * 0.65)
        if shadow_side == "left":
            _rem_conn_region = face_roi[_rem_conn_y0:_rem_conn_y1, :fw // 3]
        else:
            _rem_conn_region = face_roi[_rem_conn_y0:_rem_conn_y1, 2 * fw // 3:]
        _rem_conn_mean = float(np.mean(_rem_conn_region))
        _conn_cur = _rem_conn_mean < face_mean * 0.90
        _conn_fix = _rem_conn_mean < face_mean - 0.35 * face_std
        print(f"  conn mid-strip mean : {_rem_conn_mean:.2f}")
        print(f"  CUR connected? (<{face_mean*0.90:.2f}) : {_conn_cur}")
        print(f"  FIX connected? (<{face_mean-0.35*face_std:.2f}) : {_conn_fix}")

        # Shadow strength
        _shadow_side_pct = left_shadow if shadow_side == "left" else right_shadow
        print(f"  shadow_side_pct: {_shadow_side_pct:.4f}  >=0.15? {_shadow_side_pct >= 0.15}")

        # Triangle isolation (line 3129-3157)
        cheek_top = 2 * fh // 3
        cheek_bottom = fh
        if shadow_side == "left":
            cheek_region = face_roi[cheek_top:cheek_bottom, :fw // 3]
            surround_region = face_roi[fh // 2:cheek_top, :fw // 3]
        else:
            cheek_region = face_roi[cheek_top:cheek_bottom, 2 * fw // 3:]
            surround_region = face_roi[fh // 2:cheek_top, 2 * fw // 3:]
        cheek_brightness = float(np.mean(cheek_region))
        surround_brightness = float(np.mean(surround_region)) if surround_region.size > 20 else cheek_brightness
        _tri_iso_cur = (cheek_brightness - surround_brightness) / max(face_mean, 1.0)
        _tri_iso_fix = (cheek_brightness - surround_brightness) / max(face_std, 1.0)
        print(f"  cheek_brightness   : {cheek_brightness:.2f}")
        print(f"  surround_brightness: {surround_brightness:.2f}")
        print(f"  cheek-surround     : {cheek_brightness - surround_brightness:+.2f}")
        print(f"  CUR triangle_iso (÷face_mean): {_tri_iso_cur:+.4f}  >=0.12? {_tri_iso_cur >= 0.12}")
        print(f"  FIX triangle_iso (÷σ_face)   : {_tri_iso_fix:+.4f}  >=? (calibrate)")
        print(f"  cheek > thr ({thr:.2f})?    : {cheek_brightness > thr}")

        # Branch prediction
        if lr_asym > 0.5:
            branch = "split"
        elif lr_asym > 0.2:
            above_thr = cheek_brightness > thr
            if above_thr and _tri_iso_cur >= 0.12 and _conn_cur and _shadow_side_pct >= 0.15:
                branch = "REMBRANDT ✓"
            elif above_thr and _tri_iso_cur >= 0.12:
                branch = "loop (triangle found but conn/strength weak)"
            else:
                branch = "loop (no triangle)"
        elif lr_asym < 0.20 and bottom_shadow > top_shadow * 1.05:
            branch = "loop (main branch)"
        elif lr_asym >= 0.15:
            branch = "indeterminate zone"
        else:
            branch = "clamshell/butterfly/other"
        print(f"  >>> CURRENT decision: {branch}")

        # Fix prediction (hypothetical)
        if lr_asym > 0.5:
            fbranch = "split"
        elif lr_asym > 0.2:
            above_thr = cheek_brightness > thr
            if above_thr and _tri_iso_fix >= 0.30 and _conn_fix and _shadow_side_pct >= 0.15:
                fbranch = "REMBRANDT ✓"
            elif above_thr and _tri_iso_fix >= 0.30:
                fbranch = "loop (triangle but weak conn/strength)"
            else:
                fbranch = "loop (no triangle)"
        else:
            fbranch = "loop/indeterminate"
        print(f"  >>> FIXED decision (σ-normalized): {fbranch}")

    _dump_decision("CURRENT mask", shadow_mask_cur, shadow_threshold_cur)
    _dump_decision("FIX (Otsu) mask", shadow_mask_otsu, shadow_threshold_otsu)
    _dump_decision("FIX (face_mean - 0.5σ) mask", shadow_mask_sigma, shadow_threshold_sigma)
    print("=" * 72)


def main():
    img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IMG
    if not img_path.exists():
        raise SystemExit(f"image not found: {img_path}")

    print(f"loading: {img_path}")
    img_bgr = cv2.imread(str(img_path))
    if img_bgr is None:
        raise SystemExit("cv2 failed to decode image")

    print("detecting face via mediapipe face_detector.tflite...")
    face_box = _detect_face_box(img_bgr)
    if not face_box:
        raise SystemExit("no face detected")
    print(f"face_box = {face_box}")

    instrumented_light_structure(img_bgr, face_box)

    # Also run the real function for comparison
    from engine.vision_passes import light_structure_pass
    print("\nREAL light_structure_pass() output:")
    result = light_structure_pass(img_bgr, face_box=face_box)
    for k in ("pattern_name", "nose_shadow_shape", "triangle_detected",
              "triangle_cheek", "triangle_completeness",
              "nose_shadow_length_ratio", "nose_shadow_angle_deg", "notes"):
        print(f"  {k}: {result.get(k)}")


if __name__ == "__main__":
    main()
