#!/usr/bin/env python3
"""
Side-by-side geometry comparison: CV pipeline vs OpenAI models.

Runs 5 test images through:
  1. CV camera_geometry_pass (from face mesh landmarks)
  2. gpt-4.1 (current default VLM)
  3. gpt-4o (latest 4o)
  4. o4-mini (reasoning model)

Prints a comparison table: camera_height, camera_horizontal_angle, confidence.
"""
from __future__ import annotations

import json
import os
import sys
import time
import base64
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Project root on path ────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv()

# ── Imports ─────────────────────────────────────────────────────────────
import cv2
import numpy as np
from openai import OpenAI

from engine.vision_passes import camera_geometry_pass
from engine.vlm import _SYSTEM_PROMPT, _USER_PROMPT

client = OpenAI()

# ── Test images — diverse angles and heights ────────────────────────────
TEST_IMAGES: List[Tuple[str, str]] = [
    ("static/uploads/162dc0ef91424d3a.jpg",          "Upload – portrait 1"),
    ("benchmarks/images/rembrandt_classic.jpg",       "Benchmark – Rembrandt"),
    ("benchmarks/images/butterfly.jpg",               "Benchmark – Butterfly"),
    ("benchmarks/images/loop_standard.jpg",           "Benchmark – Loop"),
    ("benchmarks/images/beauty_dish_clean.jpg",       "Benchmark – Beauty Dish"),
]

MODELS = ["gpt-4.1", "gpt-4o", "o4-mini"]

# ── Geometry-only prompt (lighter, cheaper) ─────────────────────────────
_GEOMETRY_PROMPT = """\
You are a professional photography analyst. Look at this portrait and return \
ONLY a JSON object with the camera geometry:

{
  "camera_height_relative_to_eyes": "<'above' | 'at_eye_level' | 'below'>",
  "camera_horizontal_angle": "<'straight_on' | 'slight_left' | 'slight_right' | 'profile_left' | 'profile_right'>",
  "head_rotation_deg": <float -90 to 90>,
  "torso_rotation_deg": <float -90 to 90 or null>,
  "height_confidence": <float 0.0-1.0>,
  "angle_confidence": <float 0.0-1.0>,
  "reasoning": "<1 sentence explaining your geometry assessment>"
}

Conventions:
- camera_height: 'above' means camera is higher than subject's eyes
- camera_horizontal_angle: 'slight_left' means camera is to the viewer's left
- head_rotation_deg: negative = turned left, positive = turned right
Return ONLY valid JSON. No markdown, no code blocks."""


def encode_image(path: str) -> Tuple[str, str]:
    """Return (base64, mime) for an image file."""
    data = Path(path).read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    ext = Path(path).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp"}
    return b64, mime_map.get(ext, "image/jpeg")


def call_vlm(model: str, image_path: str) -> Dict[str, Any]:
    """Call OpenAI vision model for geometry-only analysis."""
    b64, mime = encode_image(image_path)
    t0 = time.time()

    kwargs: Dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": "You are a professional photography lighting analyst."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _GEOMETRY_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"},
                    },
                ],
            },
        ],
        temperature=0.2,
        timeout=45,
    )

    # o-series models don't support temperature, system, or response_format
    if model.startswith("o"):
        kwargs.pop("temperature", None)
        # Flatten system + user into single user message
        sys_content = kwargs["messages"][0]["content"]
        user_msg = kwargs["messages"][1]
        user_msg["content"][0]["text"] = sys_content + "\n\n" + user_msg["content"][0]["text"]
        kwargs["messages"] = [user_msg]
        kwargs["max_completion_tokens"] = 1000
    else:
        kwargs["max_tokens"] = 800
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = client.chat.completions.create(**kwargs)
        raw = response.choices[0].message.content or "{}"
        # Strip markdown fences if present (o-series sometimes wraps)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        result = json.loads(raw)
        elapsed = round(time.time() - t0, 1)
        result["_elapsed_s"] = elapsed
        return result
    except Exception as exc:
        return {"error": str(exc), "_elapsed_s": round(time.time() - t0, 1)}


def _detect_face_box(img_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """Detect face box using the same Tasks API as the main pipeline."""
    import mediapipe as mp
    from engine.vision_pipeline import _MODEL_DIR, _mp_delegate, _make_mp_image

    h, w = img_bgr.shape[:2]
    fd_model = _MODEL_DIR / "face_detector.tflite"
    if not fd_model.exists():
        return None

    fd_opts = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(
            model_asset_path=str(fd_model),
            delegate=_mp_delegate(),
        ),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        min_detection_confidence=0.4,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(fd_opts)
    try:
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        mp_image = _make_mp_image(img_rgb)
        fd_res = detector.detect(mp_image)
    finally:
        detector.close()

    if not fd_res.detections:
        return None

    bb = fd_res.detections[0].bounding_box
    x0 = max(0, bb.origin_x)
    y0 = max(0, bb.origin_y)
    x1 = min(w, bb.origin_x + bb.width)
    y1 = min(h, bb.origin_y + bb.height)
    return (x0, y0, x1, y1)


def run_cv_pipeline(image_path: str) -> Dict[str, Any]:
    """Run the CV camera_geometry_pass on an image."""
    from engine.vision_pipeline import _detect_catchlights

    img = cv2.imread(image_path)
    if img is None:
        return {"ok": False, "error": f"cannot read {image_path}"}

    face_box = _detect_face_box(img)

    # Run catchlight detection (which now returns face_geometry)
    t0 = time.time()
    cl_result = _detect_catchlights(img, face_box)
    face_geom = cl_result.get("face_geometry") if cl_result else None

    if not face_geom:
        return {"ok": False, "error": "no face_geometry from catchlight detection",
                "_elapsed_s": round(time.time() - t0, 2)}

    # Also get pose_solver if possible
    pose_solver = None
    try:
        from engine.vision_passes import pose_solver_pass
        pose_solver = pose_solver_pass(img, face_box=face_box)
    except Exception:
        pass

    result = camera_geometry_pass(face_geometry=face_geom, pose_solver=pose_solver)
    result["_elapsed_s"] = round(time.time() - t0, 2)
    return result


# ── Pretty-print table ──────────────────────────────────────────────────

COL_W = 22
LABEL_W = 24

def _cell(height: str, angle: str, h_conf: Any, a_conf: Any, elapsed: Any) -> List[str]:
    """Return formatted cell lines."""
    return [
        f"  ht: {height or '?':>13s}",
        f"  hz: {angle or '?':>13s}",
        f"  h_c: {str(h_conf or '?'):>12s}",
        f"  a_c: {str(a_conf or '?'):>12s}",
        f"  time: {str(elapsed or '?'):>11s}s",
    ]


def print_comparison(image_label: str, cv_result: Dict, vlm_results: Dict[str, Dict]):
    """Print one image's comparison block."""
    print(f"\n{'─' * 100}")
    print(f"  {image_label}")
    print(f"{'─' * 100}")

    # Header
    headers = ["CV Pipeline"] + MODELS
    print(f"{'':>{LABEL_W}}", end="")
    for h in headers:
        print(f"{h:^{COL_W}}", end="")
    print()
    print(f"{'':>{LABEL_W}}", end="")
    for _ in headers:
        print(f"{'─' * (COL_W - 2):^{COL_W}}", end="")
    print()

    # Build cells
    cv_cell = _cell(
        cv_result.get("camera_height", "FAIL"),
        cv_result.get("camera_horizontal_angle", "FAIL"),
        cv_result.get("height_confidence"),
        cv_result.get("angle_confidence"),
        cv_result.get("_elapsed_s"),
    )

    vlm_cells = []
    for model in MODELS:
        r = vlm_results.get(model, {})
        if "error" in r:
            vlm_cells.append([f"  ERROR: {r['error'][:18]}"] + [""] * 4)
        else:
            vlm_cells.append(_cell(
                r.get("camera_height_relative_to_eyes", "?"),
                r.get("camera_horizontal_angle", "?"),
                r.get("height_confidence"),
                r.get("angle_confidence"),
                r.get("_elapsed_s"),
            ))

    labels = ["height:", "horiz angle:", "height conf:", "angle conf:", "latency:"]
    for i, label in enumerate(labels):
        print(f"{label:>{LABEL_W}}", end="")
        print(f"{cv_cell[i]:^{COL_W}}", end="")
        for vc in vlm_cells:
            print(f"{vc[i] if i < len(vc) else '':^{COL_W}}", end="")
        print()

    # Print VLM reasoning if available
    for model in MODELS:
        r = vlm_results.get(model, {})
        reasoning = r.get("reasoning", "")
        if reasoning:
            print(f"  {model} reasoning: {reasoning[:90]}")


def main():
    print("=" * 100)
    print("  GEOMETRY COMPARISON: CV Pipeline vs OpenAI Models")
    print(f"  Models: CV camera_geometry_pass, {', '.join(MODELS)}")
    print(f"  Images: {len(TEST_IMAGES)}")
    print("=" * 100)

    # Agreement tracking
    agreements = {m: {"height": 0, "angle": 0} for m in MODELS}
    total = 0

    for rel_path, label in TEST_IMAGES:
        full_path = str(PROJECT_ROOT / rel_path)
        if not Path(full_path).exists():
            print(f"\n  ⚠ SKIP: {label} — file not found")
            continue

        print(f"\n  ▶ Processing: {label}...")

        # Run CV
        cv_result = run_cv_pipeline(full_path)
        cv_h = cv_result.get("camera_height", "?")
        cv_a = cv_result.get("camera_horizontal_angle", "?")

        # Run VLMs
        vlm_results = {}
        for model in MODELS:
            print(f"    calling {model}...", end=" ", flush=True)
            vlm_results[model] = call_vlm(model, full_path)
            print(f"done ({vlm_results[model].get('_elapsed_s', '?')}s)")

        print_comparison(label, cv_result, vlm_results)

        # Track agreement
        if cv_result.get("ok"):
            total += 1
            for model in MODELS:
                r = vlm_results.get(model, {})
                if r.get("camera_height_relative_to_eyes") == cv_h:
                    agreements[model]["height"] += 1
                if r.get("camera_horizontal_angle") == cv_a:
                    agreements[model]["angle"] += 1

    # ── Summary ─────────────────────────────────────────────────────────
    print(f"\n{'=' * 100}")
    print("  AGREEMENT SUMMARY (CV vs VLM)")
    print(f"{'=' * 100}")
    print(f"  {'Model':<16} {'Height Match':>14} {'Angle Match':>14}")
    print(f"  {'─' * 44}")
    for model in MODELS:
        h_pct = (agreements[model]["height"] / total * 100) if total else 0
        a_pct = (agreements[model]["angle"] / total * 100) if total else 0
        print(f"  {model:<16} {agreements[model]['height']}/{total} ({h_pct:.0f}%)      {agreements[model]['angle']}/{total} ({a_pct:.0f}%)")

    # Cross-model agreement
    print(f"\n  VLM Cross-Model Agreement:")
    print(f"  {'─' * 44}")
    # check if all 3 VLMs agree with each other more than with CV
    print(f"  (Review above table to assess inter-model consensus)")
    print()


if __name__ == "__main__":
    main()
