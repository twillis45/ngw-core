#!/usr/bin/env python3
"""
Side-by-side signal comparison: CV pipeline vs OpenAI models.

Compares 4 signal categories across CV and 3 VLMs:
  1. Highlights (specularity, width ratio, axis)
  2. Shadows (vector, softness, length ratio)
  3. Background (direction, intensity ratio)
  4. Skin tone (luma-based vs VLM Fitzpatrick)

Runs 5 test images through each.
"""
from __future__ import annotations

import json
import os
import sys
import time
import base64
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv()

import cv2
import numpy as np
from openai import OpenAI

client = OpenAI()

# ── Test images ─────────────────────────────────────────────────────────
TEST_IMAGES: List[Tuple[str, str]] = [
    ("static/uploads/162dc0ef91424d3a.jpg",          "Portrait 1"),
    ("benchmarks/images/rembrandt_classic.jpg",       "Rembrandt"),
    ("benchmarks/images/butterfly.jpg",               "Butterfly"),
    ("benchmarks/images/loop_standard.jpg",           "Loop"),
    ("benchmarks/images/beauty_dish_clean.jpg",       "Beauty Dish"),
]

MODELS = ["gpt-4.1", "gpt-4o", "o4-mini"]

# ── Signal-focused VLM prompt ──────────────────────────────────────────
_SIGNAL_PROMPT = """\
You are a professional photography lighting analyst. Examine this portrait and \
return ONLY a JSON object with these observable signals:

{
  "highlights": {
    "highlight_width_ratio": <float 0.0-1.0, width of lit side / total face width>,
    "highlight_specularity": <float 0.0 (matte) to 1.0 (mirror-like specular)>,
    "highlight_axis_deg": <float, angle of main highlight band relative to vertical, or null>
  },
  "shadows": {
    "shadow_vector_deg": <float 0-360, clock direction shadow falls on face (0=directly down from above, 90=falls to subject's left, 180=upward, 270=falls to subject's right), or null>,
    "shadow_softness": <float 0.0 (razor sharp) to 1.0 (completely diffused)>,
    "shadow_length_ratio": <float, nose shadow length / nose length (0.0=no shadow, 1.0=reaches lip), or null>
  },
  "background": {
    "background_brightness": <float 0.0 (pure black) to 1.0 (pure white)>,
    "background_color": "<descriptive color: 'black', 'dark grey', 'medium grey', 'light grey', 'white', 'warm grey', 'cool grey', 'teal', etc.>",
    "background_gradient_direction": "<'left' | 'right' | 'top' | 'bottom' | 'center' | 'uniform' | null>",
    "background_light_present": <true | false>
  },
  "skin_tone": {
    "skin_tone_category": "<'very fair' | 'fair' | 'light-medium' | 'medium' | 'medium-dark' | 'dark' | 'very dark'>",
    "skin_tone_warmth": "<'warm' | 'neutral' | 'cool'>",
    "is_bw_image": <true | false>
  },
  "reasoning": "<1-2 sentences on key observations>"
}

Conventions:
- shadow_vector_deg: 0=shadow falls DOWN (light above), 90=shadow falls to subject's LEFT (light from subject's right), 270=shadow falls to subject's RIGHT (light from subject's left)
- highlight_width_ratio: 0.5 = evenly lit (flat), 0.3 = narrow highlight (split), 0.7 = broad lighting
- Assess skin tone as if in neutral/corrected light, not how lighting shifts it

Return ONLY valid JSON. No markdown, no code blocks."""


def encode_image(path: str) -> Tuple[str, str]:
    data = Path(path).read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    ext = Path(path).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp"}
    return b64, mime_map.get(ext, "image/jpeg")


def call_vlm(model: str, image_path: str) -> Dict[str, Any]:
    b64, mime = encode_image(image_path)
    t0 = time.time()

    kwargs: Dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": "You are a professional photography lighting analyst."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SIGNAL_PROMPT},
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

    if model.startswith("o"):
        kwargs.pop("temperature", None)
        sys_content = kwargs["messages"][0]["content"]
        user_msg = kwargs["messages"][1]
        user_msg["content"][0]["text"] = sys_content + "\n\n" + user_msg["content"][0]["text"]
        kwargs["messages"] = [user_msg]
        kwargs["max_completion_tokens"] = 1200
    else:
        kwargs["max_tokens"] = 1000
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = client.chat.completions.create(**kwargs)
        raw = response.choices[0].message.content or "{}"
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        result = json.loads(raw)
        result["_elapsed_s"] = round(time.time() - t0, 1)
        return result
    except Exception as exc:
        return {"error": str(exc), "_elapsed_s": round(time.time() - t0, 1)}


def run_cv_pipeline(image_path: str) -> Dict[str, Any]:
    """Run CV passes: highlight, shadow, background, skin_tone."""
    import mediapipe as mp
    from engine.vision_pipeline import (
        _detect_catchlights, _MODEL_DIR, _mp_delegate, _make_mp_image,
        _ycbcr_skin_mask, analyze_image_regions,
    )
    from engine.vision_passes import (
        highlight_pass, shadow_pass, background_pass, surface_class_pass,
    )

    img = cv2.imread(image_path)
    if img is None:
        return {"error": f"cannot read {image_path}"}

    h, w = img.shape[:2]
    t0 = time.time()

    # Face box
    face_box = None
    fd_model = _MODEL_DIR / "face_detector.tflite"
    if fd_model.exists():
        fd_opts = mp.tasks.vision.FaceDetectorOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=str(fd_model), delegate=_mp_delegate(),
            ),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=0.3,
        )
        detector = mp.tasks.vision.FaceDetector.create_from_options(fd_opts)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = _make_mp_image(rgb)
        fd_res = detector.detect(mp_img)
        detector.close()
        if fd_res.detections:
            bb = fd_res.detections[0].bounding_box
            face_box = (bb.origin_x, bb.origin_y,
                        bb.origin_x + bb.width, bb.origin_y + bb.height)

    # Segmentation masks — run the full pipeline to get them
    try:
        pipeline_result = analyze_image_regions(image_path)
        person_mask = pipeline_result.get("_person_mask")
        skin_mask = pipeline_result.get("_skin_mask")
        bg_mask = pipeline_result.get("_background_mask")
        skin_tone_result = pipeline_result.get("skin_tone", {})
    except Exception as exc:
        person_mask = None
        skin_mask = None
        bg_mask = None
        skin_tone_result = {"ok": False, "error": str(exc)}

    # Highlight pass
    try:
        highlight_result = highlight_pass(
            img, person_mask=person_mask, skin_mask=skin_mask, face_box=face_box,
        )
    except Exception as exc:
        highlight_result = {"ok": False, "error": str(exc)}

    # Shadow pass
    try:
        shadow_result = shadow_pass(
            img, person_mask=person_mask, skin_mask=skin_mask, face_box=face_box,
        )
    except Exception as exc:
        shadow_result = {"ok": False, "error": str(exc)}

    # Background pass
    try:
        background_result = background_pass(img, background_mask=bg_mask)
    except Exception as exc:
        background_result = {"ok": False, "error": str(exc)}

    elapsed = round(time.time() - t0, 2)

    return {
        "highlights": highlight_result,
        "shadows": shadow_result,
        "background": background_result,
        "skin_tone": skin_tone_result,
        "_elapsed_s": elapsed,
    }


# ── Pretty-print ────────────────────────────────────────────────────────

def _fmt(val, width=12):
    if val is None:
        return f"{'—':>{width}}"
    if isinstance(val, float):
        return f"{val:>{width}.3f}"
    if isinstance(val, bool):
        return f"{str(val):>{width}}"
    return f"{str(val):>{width}}"


def print_signal_comparison(label: str, cv: Dict, vlm_results: Dict[str, Dict]):
    print(f"\n{'━' * 110}")
    print(f"  {label}")
    print(f"{'━' * 110}")

    headers = ["CV Pipeline"] + MODELS
    col_w = 18

    def _header_row():
        print(f"  {'':>24}", end="")
        for h in headers:
            print(f"{h:^{col_w}}", end="")
        print()
        print(f"  {'':>24}", end="")
        for _ in headers:
            print(f"{'─' * (col_w - 2):^{col_w}}", end="")
        print()

    # ── HIGHLIGHTS ──────────────────────────────────────────────────────
    print(f"\n  {'HIGHLIGHTS':>22}")
    _header_row()

    cv_hl = cv.get("highlights", {})
    fields = [
        ("specularity", "highlight_specularity"),
        ("width_ratio", "highlight_width_ratio"),
        ("axis_deg", "highlight_axis_deg"),
    ]
    for display, key in fields:
        cv_val = cv_hl.get(key) if cv_hl.get("ok") else None
        print(f"  {display:>22}  ", end="")
        print(f"{_fmt(cv_val, col_w - 2):^{col_w}}", end="")
        for model in MODELS:
            vr = vlm_results.get(model, {})
            hl = vr.get("highlights", {})
            v = hl.get(key)
            print(f"{_fmt(v, col_w - 2):^{col_w}}", end="")
        print()

    # ── SHADOWS ─────────────────────────────────────────────────────────
    print(f"\n  {'SHADOWS':>22}")
    _header_row()

    cv_sh = cv.get("shadows", {})
    fields = [
        ("vector_deg", "shadow_vector_deg"),
        ("softness", "shadow_softness"),
        ("length_ratio", "shadow_length_ratio"),
    ]
    for display, key in fields:
        cv_val = cv_sh.get(key) if cv_sh.get("ok") else None
        print(f"  {display:>22}  ", end="")
        print(f"{_fmt(cv_val, col_w - 2):^{col_w}}", end="")
        for model in MODELS:
            vr = vlm_results.get(model, {})
            sh = vr.get("shadows", {})
            v = sh.get(key)
            print(f"{_fmt(v, col_w - 2):^{col_w}}", end="")
        print()

    # Also show shadow_edge_gradient (CV only) for context
    if cv_sh.get("ok") and cv_sh.get("shadow_edge_gradient") is not None:
        print(f"  {'edge_gradient':>22}  ", end="")
        print(f"{_fmt(cv_sh['shadow_edge_gradient'], col_w - 2):^{col_w}}", end="")
        for _ in MODELS:
            print(f"{'(VLM n/a)':^{col_w}}", end="")
        print()

    # ── BACKGROUND ──────────────────────────────────────────────────────
    print(f"\n  {'BACKGROUND':>22}")
    _header_row()

    cv_bg = cv.get("background", {})
    # CV: intensity_ratio, direction
    print(f"  {'intensity/brightness':>22}  ", end="")
    cv_int = cv_bg.get("background_intensity_ratio") if cv_bg.get("ok") else None
    print(f"{_fmt(cv_int, col_w - 2):^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        bg = vr.get("background", {})
        v = bg.get("background_brightness")
        print(f"{_fmt(v, col_w - 2):^{col_w}}", end="")
    print()

    print(f"  {'direction':>22}  ", end="")
    cv_dir = cv_bg.get("background_direction") if cv_bg.get("ok") else None
    print(f"{str(cv_dir or '—'):^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        bg = vr.get("background", {})
        v = bg.get("background_gradient_direction", "—")
        print(f"{str(v):^{col_w}}", end="")
    print()

    print(f"  {'color':>22}  ", end="")
    print(f"{'(CV n/a)':^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        bg = vr.get("background", {})
        v = bg.get("background_color", "—")
        print(f"{str(v)[:col_w - 2]:^{col_w}}", end="")
    print()

    print(f"  {'bg_light_present':>22}  ", end="")
    print(f"{'(CV n/a)':^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        bg = vr.get("background", {})
        v = bg.get("background_light_present", "—")
        print(f"{str(v):^{col_w}}", end="")
    print()

    # ── SKIN TONE ───────────────────────────────────────────────────────
    print(f"\n  {'SKIN TONE':>22}")
    _header_row()

    cv_st = cv.get("skin_tone", {})
    print(f"  {'category':>22}  ", end="")
    cv_cat = cv_st.get("skin_tone_guess") if cv_st.get("ok") else None
    print(f"{str(cv_cat or '—'):^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        st = vr.get("skin_tone", {})
        v = st.get("skin_tone_category", "—")
        print(f"{str(v):^{col_w}}", end="")
    print()

    print(f"  {'luma_y / warmth':>22}  ", end="")
    cv_luma = cv_st.get("mean_skin_luma_y") if cv_st.get("ok") else None
    print(f"{_fmt(cv_luma, col_w - 2):^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        st = vr.get("skin_tone", {})
        v = st.get("skin_tone_warmth", "—")
        print(f"{str(v):^{col_w}}", end="")
    print()

    print(f"  {'is_bw':>22}  ", end="")
    # CV: check if bw from pipeline
    cv_bw = None
    if cv_st.get("ok"):
        cv_bw = cv_st.get("is_bw_image")
    print(f"{str(cv_bw or '—'):^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        st = vr.get("skin_tone", {})
        v = st.get("is_bw_image", "—")
        print(f"{str(v):^{col_w}}", end="")
    print()

    print(f"  {'confidence':>22}  ", end="")
    cv_conf = cv_st.get("confidence") if cv_st.get("ok") else None
    print(f"{str(cv_conf or '—'):^{col_w}}", end="")
    for _ in MODELS:
        print(f"{'—':^{col_w}}", end="")
    print()

    # ── LATENCY ─────────────────────────────────────────────────────────
    print(f"\n  {'LATENCY':>22}  ", end="")
    print(f"{str(cv.get('_elapsed_s', '?')) + 's':^{col_w}}", end="")
    for model in MODELS:
        vr = vlm_results.get(model, {})
        print(f"{str(vr.get('_elapsed_s', '?')) + 's':^{col_w}}", end="")
    print()

    # ── VLM reasoning ───────────────────────────────────────────────────
    for model in MODELS:
        vr = vlm_results.get(model, {})
        reasoning = vr.get("reasoning", "")
        if reasoning:
            print(f"  {model}: {reasoning[:100]}")


def main():
    print("=" * 110)
    print("  SIGNAL COMPARISON: CV Pipeline vs OpenAI Models")
    print(f"  Signals: highlights, shadows, background, skin tone")
    print(f"  Models: CV passes, {', '.join(MODELS)}")
    print(f"  Images: {len(TEST_IMAGES)}")
    print("=" * 110)

    all_cv = {}
    all_vlm = {}

    for rel_path, label in TEST_IMAGES:
        full_path = str(PROJECT_ROOT / rel_path)
        if not Path(full_path).exists():
            print(f"\n  ⚠ SKIP: {label} — file not found")
            continue

        print(f"\n  ▶ Processing: {label}...")

        # CV pipeline
        print(f"    running CV passes...", end=" ", flush=True)
        cv_result = run_cv_pipeline(full_path)
        print(f"done ({cv_result.get('_elapsed_s', '?')}s)")

        # VLMs
        vlm_results = {}
        for model in MODELS:
            print(f"    calling {model}...", end=" ", flush=True)
            vlm_results[model] = call_vlm(model, full_path)
            print(f"done ({vlm_results[model].get('_elapsed_s', '?')}s)")

        all_cv[label] = cv_result
        all_vlm[label] = vlm_results

        print_signal_comparison(label, cv_result, vlm_results)

    # ── Cross-image summary ─────────────────────────────────────────────
    print(f"\n{'=' * 110}")
    print("  CROSS-IMAGE AGREEMENT SUMMARY")
    print(f"{'=' * 110}")

    # Shadow direction agreement: within 45° = match
    # Convention alignment: CV uses compass (0°=up, gradient direction)
    # while VLMs use clock (0°=down, shadow fall direction).
    # Convert CV → VLM: add 180° (flip gradient→fall direction).
    print(f"\n  Shadow Vector (within 45° = match, CV converted +180° to VLM convention):")
    for model in MODELS:
        matches = 0
        total = 0
        for label in all_cv:
            cv_sh = all_cv[label].get("shadows", {})
            vlm_sh = all_vlm[label].get(model, {}).get("shadows", {})
            cv_v = cv_sh.get("shadow_vector_deg") if cv_sh.get("ok") else None
            vlm_v = vlm_sh.get("shadow_vector_deg")
            if cv_v is not None and vlm_v is not None:
                total += 1
                # Convert CV compass (0°=up) → VLM clock (0°=down)
                cv_converted = (cv_v + 180.0) % 360.0
                diff = abs(cv_converted - vlm_v)
                if diff > 180:
                    diff = 360 - diff
                if diff <= 45:
                    matches += 1
        pct = (matches / total * 100) if total else 0
        print(f"    {model:<12} {matches}/{total} ({pct:.0f}%)")

    # Shadow softness agreement: within 0.2 = match
    print(f"\n  Shadow Softness (within ±0.2 = match):")
    for model in MODELS:
        matches = 0
        total = 0
        for label in all_cv:
            cv_sh = all_cv[label].get("shadows", {})
            vlm_sh = all_vlm[label].get(model, {}).get("shadows", {})
            cv_v = cv_sh.get("shadow_softness") if cv_sh.get("ok") else None
            vlm_v = vlm_sh.get("shadow_softness")
            if cv_v is not None and vlm_v is not None:
                total += 1
                if abs(cv_v - vlm_v) <= 0.2:
                    matches += 1
        pct = (matches / total * 100) if total else 0
        print(f"    {model:<12} {matches}/{total} ({pct:.0f}%)")

    # Highlight specularity agreement: within 0.2 = match
    print(f"\n  Highlight Specularity (within ±0.2 = match):")
    for model in MODELS:
        matches = 0
        total = 0
        for label in all_cv:
            cv_hl = all_cv[label].get("highlights", {})
            vlm_hl = all_vlm[label].get(model, {}).get("highlights", {})
            cv_v = cv_hl.get("highlight_specularity") if cv_hl.get("ok") else None
            vlm_v = vlm_hl.get("highlight_specularity")
            if cv_v is not None and vlm_v is not None:
                total += 1
                if abs(cv_v - vlm_v) <= 0.2:
                    matches += 1
        pct = (matches / total * 100) if total else 0
        print(f"    {model:<12} {matches}/{total} ({pct:.0f}%)")

    # Highlight width ratio agreement: within 0.15 = match
    print(f"\n  Highlight Width Ratio (within ±0.15 = match):")
    for model in MODELS:
        matches = 0
        total = 0
        for label in all_cv:
            cv_hl = all_cv[label].get("highlights", {})
            vlm_hl = all_vlm[label].get(model, {}).get("highlights", {})
            cv_v = cv_hl.get("highlight_width_ratio") if cv_hl.get("ok") else None
            vlm_v = vlm_hl.get("highlight_width_ratio")
            if cv_v is not None and vlm_v is not None:
                total += 1
                if abs(cv_v - vlm_v) <= 0.15:
                    matches += 1
        pct = (matches / total * 100) if total else 0
        print(f"    {model:<12} {matches}/{total} ({pct:.0f}%)")

    # Skin tone: map CV 3-tier to VLM 7-tier for comparison
    print(f"\n  Skin Tone (CV 3-tier vs VLM 7-tier, directional match):")
    cv_to_vlm_map = {
        "light": {"very fair", "fair", "light-medium"},
        "medium": {"light-medium", "medium", "medium-dark"},
        "deep": {"medium-dark", "dark", "very dark"},
    }
    for model in MODELS:
        matches = 0
        total = 0
        for label in all_cv:
            cv_st = all_cv[label].get("skin_tone", {})
            vlm_st = all_vlm[label].get(model, {}).get("skin_tone", {})
            cv_cat = cv_st.get("skin_tone_guess") if cv_st.get("ok") else None
            vlm_cat = vlm_st.get("skin_tone_category")
            if cv_cat and vlm_cat:
                total += 1
                if vlm_cat in cv_to_vlm_map.get(cv_cat, set()):
                    matches += 1
        pct = (matches / total * 100) if total else 0
        print(f"    {model:<12} {matches}/{total} ({pct:.0f}%)")

    print()


if __name__ == "__main__":
    main()
