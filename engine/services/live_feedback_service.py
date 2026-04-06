"""Live Shoot Mode — Phase 7.

Compares a *test* image analysis against a *reference* image analysis and
produces:
  - A list of detected deviations (what changed)
  - Corrective actions for each deviation (what to do)
  - An overall match score (0.0–1.0)

Architecture rule: this service CONSUMES AnalysisResult objects only.
It never runs inference, never reads raw images, never modifies patterns.
All inference must be done by engine.orchestrator.analyze_image() before
calling this service.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Deviation types
# ═══════════════════════════════════════════════════════════════════════════

_DEVIATION_SEVERITY = {
    "pattern_mismatch": "critical",       # different lighting pattern
    "key_side_mismatch": "major",         # key moved to opposite side
    "light_count_change": "major",        # added or removed a light
    "key_angle_shift": "moderate",        # key moved but same pattern
    "fill_ratio_change": "moderate",      # fill changed by >1 stop
    "modifier_change": "minor",           # different modifier detected
    "background_light_change": "minor",   # background light added/removed
    "color_temp_shift": "minor",          # colour temperature shifted
    "brightness_shift": "minor",          # overall exposure shifted
    "contrast_change": "minor",           # contrast ratio changed
    "bw_color_mismatch": "info",          # one is B&W, other is colour
}


# ═══════════════════════════════════════════════════════════════════════════
# Corrective action templates
# ═══════════════════════════════════════════════════════════════════════════

def _key_side_correction(ref_side: str, test_side: str) -> str:
    if ref_side in ("left", "right") and test_side in ("left", "right"):
        return (
            f"Move key light from {test_side} side to {ref_side} side. "
            f"Subject may also need to turn — ensure key catchlight lands in the near eye."
        )
    return f"Key light side differs (reference: {ref_side}, current: {test_side}). Reposition key light."


def _pattern_correction(ref_pat: str, test_pat: str) -> str:
    pattern_labels = {
        "rembrandt": "Rembrandt (45° key, high, triangle on cheek)",
        "loop": "Loop (30° key, slightly high, nose-loop shadow)",
        "butterfly": "Butterfly/Paramount (key directly above, on axis)",
        "split": "Split (key at 90°, eye level, halves face)",
        "broad": "Broad (key on near-camera side of turned face)",
        "short": "Short (key on far-camera side of turned face)",
        "clamshell": "Clamshell (key above + fill below, both on axis)",
        "high_key": "High Key (multiple lights, white background overexposed)",
        "low_key": "Low Key (single key, no fill, dark background)",
        "window_portrait": "Window portrait (large off-axis diffuse source)",
        "ring_light": "Ring Light (on-axis ring source, donut catchlights)",
        "rim": "Rim / Edge Light (pure edge/backlight from behind)",
        "flat": "Flat (large source on axis, even illumination)",
        "projected": "Projected / Interrupted Light (hard spot + gobo or flag pattern)",
        "silhouette_key": "Silhouette / Back Key (backlit; subject silhouetted against light)",
        "athletic_rim_sculpt": "Athletic Rim Sculpt (hard key + opposing rim)",
    }
    ref_label = pattern_labels.get(ref_pat, ref_pat)
    return (
        f"Pattern mismatch — reference uses {ref_label}. "
        f"Current setup reads as '{test_pat}'. "
        f"Reconfigure lights to match the reference pattern."
    )


def _light_count_correction(ref_count: int, test_count: int) -> str:
    diff = ref_count - test_count
    if diff > 0:
        return (
            f"Add {diff} light(s) — reference uses {ref_count} light(s), "
            f"current setup has {test_count}."
        )
    return (
        f"Remove {-diff} light(s) — reference uses {ref_count} light(s), "
        f"current setup has {test_count}."
    )


def _fill_ratio_correction(ref_ratio: float, test_ratio: float) -> str:
    diff = ref_ratio - test_ratio
    stops = abs(diff) / 1.0  # approximate: each 0.5 ratio unit ≈ 1 stop
    direction = "increase" if diff > 0 else "reduce"
    return (
        f"{direction.capitalize()} fill by ~{stops:.0f} stop(s). "
        f"Reference fill ratio: {ref_ratio:.1f}, current: {test_ratio:.1f}."
    )


def _angle_shift_correction(ref_pos: str, test_pos: str) -> str:
    return (
        f"Key light position shifted. Reference: '{ref_pos}', current reads as '{test_pos}'. "
        f"Adjust key light angle to match reference position."
    )


def _modifier_correction(ref_mod: str, test_mod: str) -> str:
    return (
        f"Modifier differs — reference: {ref_mod or 'unknown'}, current: {test_mod or 'unknown'}. "
        f"Switch modifier to match reference quality and catchlight shape."
    )


def _bg_light_correction(ref_has: bool, test_has: bool) -> str:
    if ref_has and not test_has:
        return "Add a background light — reference image shows background illumination."
    return "Remove background light — reference has dark, unlit background."


def _color_temp_correction(ref_cct: int, test_cct: int) -> str:
    diff = test_cct - ref_cct
    direction = "warmer" if diff > 0 else "cooler"
    return (
        f"Color temperature off by ~{abs(diff)} K ({direction} than reference). "
        f"Adjust flash gel or camera white balance to {ref_cct} K."
    )


def _brightness_correction(ref_bright: str, test_bright: str) -> str:
    mapping = {"low": "dark/low-key", "normal": "normal", "high": "bright/high-key"}
    ref_label = mapping.get(ref_bright, ref_bright)
    test_label = mapping.get(test_bright, test_bright)
    if ref_bright == "high" and test_bright != "high":
        return f"Increase exposure — reference is {ref_label}, current reads as {test_label}."
    if ref_bright == "low" and test_bright != "low":
        return f"Reduce exposure — reference is {ref_label}, current reads as {test_label}."
    return f"Brightness differs (reference: {ref_label}, current: {test_label}). Adjust flash power or aperture."


# ═══════════════════════════════════════════════════════════════════════════
# Signal extraction
# ═══════════════════════════════════════════════════════════════════════════

def _extract_analysis_signals(ar: Any) -> Dict[str, Any]:
    """Extract comparable signals from an AnalysisResult."""
    signals: Dict[str, Any] = {
        "pattern": "unknown",
        "key_side": "unknown",
        "light_count": 0,
        "modifier": None,
        "background_light": False,
        "background_light_confidence": 0.0,
        "cct": None,
        "brightness": "normal",
        "contrast_ratio": None,
        "key_position_text": "",
        "fill_method": "",
        "is_bw": False,
    }

    pattern = getattr(ar, "authoritative_pattern", None)
    if pattern:
        signals["pattern"] = pattern

    li = getattr(ar, "lighting_intel", None)
    if li:
        signals["key_side"] = getattr(li, "key_side", "unknown")
        signals["light_count"] = getattr(li, "light_count", 0)
        signals["modifier"] = getattr(li, "modifier_family", None)
        signals["background_light"] = getattr(li, "background_light_detected", False)
        signals["background_light_confidence"] = getattr(li, "background_light_confidence", 0.0)
        signals["cct"] = getattr(li, "detected_cct_kelvin", None)
        signals["key_position_text"] = getattr(li, "key_position_text", "")
        signals["fill_method"] = getattr(li, "fill_method_text", "")

    cl = getattr(ar, "classification", None)
    if cl:
        signals["brightness"] = getattr(cl, "brightness", "normal")

    cr = getattr(ar, "cue_report", None)
    if cr:
        contrast = getattr(cr, "contrast_ratio", None)
        if contrast:
            signals["contrast_ratio"] = getattr(contrast, "ratio", None)
        tone = getattr(cr, "tonal_processing_estimation", None)
        if tone:
            signals["is_bw"] = getattr(tone, "is_bw", False)

    # Also check edge_case_flags (dict) if already computed
    ecf = getattr(ar, "edge_case_flags", None)
    if ecf and isinstance(ecf, dict):
        signals["is_bw"] = ecf.get("bwProcessing", signals["is_bw"])

    return signals


# ═══════════════════════════════════════════════════════════════════════════
# Deviation detection
# ═══════════════════════════════════════════════════════════════════════════

def _detect_deviations(
    ref: Dict[str, Any],
    test: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Compare reference and test signal dicts, return list of deviation dicts."""
    deviations: List[Dict[str, Any]] = []

    # ── Pattern ──
    if (
        ref["pattern"] not in ("unknown",)
        and test["pattern"] not in ("unknown",)
        and ref["pattern"] != test["pattern"]
    ):
        deviations.append({
            "type": "pattern_mismatch",
            "severity": _DEVIATION_SEVERITY["pattern_mismatch"],
            "referenceValue": ref["pattern"],
            "currentValue": test["pattern"],
            "correction": _pattern_correction(ref["pattern"], test["pattern"]),
        })

    # ── Key side ──
    if (
        ref["key_side"] not in ("unknown",)
        and test["key_side"] not in ("unknown",)
        and ref["key_side"] != test["key_side"]
    ):
        deviations.append({
            "type": "key_side_mismatch",
            "severity": _DEVIATION_SEVERITY["key_side_mismatch"],
            "referenceValue": ref["key_side"],
            "currentValue": test["key_side"],
            "correction": _key_side_correction(ref["key_side"], test["key_side"]),
        })

    # ── Light count ──
    ref_lc = ref["light_count"]
    test_lc = test["light_count"]
    if ref_lc > 0 and test_lc > 0 and abs(ref_lc - test_lc) >= 1:
        deviations.append({
            "type": "light_count_change",
            "severity": _DEVIATION_SEVERITY["light_count_change"],
            "referenceValue": ref_lc,
            "currentValue": test_lc,
            "correction": _light_count_correction(ref_lc, test_lc),
        })

    # ── Key position ──
    ref_pos = ref["key_position_text"]
    test_pos = test["key_position_text"]
    if (
        ref_pos and test_pos
        and ref_pos != test_pos
        and ref["pattern"] == test["pattern"]  # only flag if pattern matches (position sub-deviation)
    ):
        deviations.append({
            "type": "key_angle_shift",
            "severity": _DEVIATION_SEVERITY["key_angle_shift"],
            "referenceValue": ref_pos,
            "currentValue": test_pos,
            "correction": _angle_shift_correction(ref_pos, test_pos),
        })

    # ── Modifier ──
    ref_mod = ref["modifier"]
    test_mod = test["modifier"]
    if ref_mod and test_mod and ref_mod != test_mod:
        deviations.append({
            "type": "modifier_change",
            "severity": _DEVIATION_SEVERITY["modifier_change"],
            "referenceValue": ref_mod,
            "currentValue": test_mod,
            "correction": _modifier_correction(ref_mod, test_mod),
        })

    # ── Background light ──
    ref_bg = ref["background_light"]
    test_bg = test["background_light"]
    ref_bg_conf = ref["background_light_confidence"]
    test_bg_conf = test["background_light_confidence"]
    if (
        ref_bg != test_bg
        and (ref_bg_conf >= 0.5 or test_bg_conf >= 0.5)
    ):
        deviations.append({
            "type": "background_light_change",
            "severity": _DEVIATION_SEVERITY["background_light_change"],
            "referenceValue": ref_bg,
            "currentValue": test_bg,
            "correction": _bg_light_correction(ref_bg, test_bg),
        })

    # ── Color temperature ──
    ref_cct = ref["cct"]
    test_cct = test["cct"]
    if ref_cct and test_cct and abs(ref_cct - test_cct) >= 500:
        deviations.append({
            "type": "color_temp_shift",
            "severity": _DEVIATION_SEVERITY["color_temp_shift"],
            "referenceValue": ref_cct,
            "currentValue": test_cct,
            "correction": _color_temp_correction(ref_cct, test_cct),
        })

    # ── Brightness ──
    ref_bright = ref["brightness"]
    test_bright = test["brightness"]
    if ref_bright and test_bright and ref_bright != test_bright:
        deviations.append({
            "type": "brightness_shift",
            "severity": _DEVIATION_SEVERITY["brightness_shift"],
            "referenceValue": ref_bright,
            "currentValue": test_bright,
            "correction": _brightness_correction(ref_bright, test_bright),
        })

    # ── B&W mismatch ──
    if ref["is_bw"] != test["is_bw"]:
        deviations.append({
            "type": "bw_color_mismatch",
            "severity": _DEVIATION_SEVERITY["bw_color_mismatch"],
            "referenceValue": "bw" if ref["is_bw"] else "color",
            "currentValue": "bw" if test["is_bw"] else "color",
            "correction": (
                "Reference image is B&W — process in post to match."
                if ref["is_bw"]
                else "Reference image is color — disable B&W processing."
            ),
        })

    # Sort by severity
    _order = {"critical": 0, "major": 1, "moderate": 2, "minor": 3, "info": 4}
    deviations.sort(key=lambda d: _order.get(d["severity"], 5))
    return deviations


def _compute_match_score(deviations: List[Dict[str, Any]]) -> float:
    """Score how closely the test matches the reference (1.0 = perfect match)."""
    penalty = {
        "critical": 0.40,
        "major": 0.20,
        "moderate": 0.10,
        "minor": 0.04,
        "info": 0.01,
    }
    total_penalty = sum(penalty.get(d["severity"], 0.0) for d in deviations)
    return max(0.0, round(1.0 - total_penalty, 3))


def _match_label(score: float) -> str:
    if score >= 0.90:
        return "excellent"
    if score >= 0.75:
        return "good"
    if score >= 0.55:
        return "fair"
    if score >= 0.35:
        return "poor"
    return "mismatch"


# ═══════════════════════════════════════════════════════════════════════════
# Main public function
# ═══════════════════════════════════════════════════════════════════════════

def analyze_shoot_deviation(
    reference_result: Any,
    test_result: Any,
) -> Dict[str, Any]:
    """Compare a test shot against a reference shot and return corrective guidance.

    Parameters
    ----------
    reference_result:
        AnalysisResult for the reference / target image.
    test_result:
        AnalysisResult for the most recent test shot.

    Returns
    -------
    dict with keys:
        matchScore        float  0.0–1.0
        matchLabel        str    excellent | good | fair | poor | mismatch
        deviations        list   sorted by severity
        priorityAction    str    most important corrective action (or "" if no deviations)
        summary           str    human-readable one-liner
    """
    try:
        return _analyze_inner(reference_result, test_result)
    except Exception:
        logger.exception("Shoot deviation analysis failed")
        return {
            "matchScore": 0.0,
            "matchLabel": "error",
            "deviations": [],
            "priorityAction": "Analysis failed — check server logs.",
            "summary": "Deviation analysis encountered an error.",
        }


def _analyze_inner(
    reference_result: Any,
    test_result: Any,
) -> Dict[str, Any]:
    ref = _extract_analysis_signals(reference_result)
    test = _extract_analysis_signals(test_result)

    deviations = _detect_deviations(ref, test)
    match_score = _compute_match_score(deviations)
    match_label = _match_label(match_score)

    priority_action = ""
    if deviations:
        priority_action = deviations[0]["correction"]  # highest-severity first

    if not deviations:
        summary = "Test shot matches reference — no corrective actions needed."
    elif match_label == "excellent":
        summary = f"Near-match ({match_score:.0%}) — minor adjustments only."
    elif match_label in ("good", "fair"):
        n = len(deviations)
        summary = (
            f"{match_score:.0%} match — {n} deviation(s) detected. "
            f"Priority: {deviations[0]['type'].replace('_', ' ')}."
        )
    else:
        summary = (
            f"Significant mismatch ({match_score:.0%}). "
            f"Critical deviations: "
            + ", ".join(
                d["type"].replace("_", " ")
                for d in deviations
                if d["severity"] == "critical"
            )
            or "see deviations list."
        )

    return {
        "matchScore": match_score,
        "matchLabel": match_label,
        "deviations": deviations,
        "priorityAction": priority_action,
        "referencePattern": ref["pattern"],
        "currentPattern": test["pattern"],
        "summary": summary,
    }
