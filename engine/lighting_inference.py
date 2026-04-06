"""Lighting Inference Engine.

Translates already-extracted vision data (catchlights, skin tone, palette
classification) into the system's lighting vocabulary so the scoring engine
can give context-aware bonuses.

Pure computation — no I/O, no model loading.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ── Clock-position geometry rules ──────────────────────────────────────────

def _clock_num(position_str: str) -> Optional[int]:
    """Extract the integer hour from a string like '10 o'clock'."""
    try:
        return int(position_str.split()[0])
    except (ValueError, IndexError):
        return None


def _classify_clock(hour: int) -> str:
    """Map a clock hour to a rough quadrant label."""
    if hour in (10, 11):
        return "upper_left"
    if hour in (1, 2):
        return "upper_right"
    if hour == 12:
        return "top_center"
    if hour in (4, 5, 6, 7, 8):
        return "lower"
    if hour == 3:
        return "hard_right"
    if hour == 9:
        return "hard_left"
    return "other"


def _infer_pattern_from_catchlights(
    catchlights: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Infer lighting pattern from catchlight positions.

    Returns dict with:
      pattern, pattern_confidence, key_position_text,
      fill_method_text, light_count, unrecognized_details, notes
    """
    if not catchlights:
        return {
            "pattern": "unknown",
            "pattern_confidence": 0.0,
            "key_position_text": "",
            "fill_method_text": "",
            "light_count": 0,
            "unrecognized_details": [],
            "notes": ["No catchlights detected."],
        }

    # Group by eye
    left = [c for c in catchlights if c.get("eye") == "left"]
    right = [c for c in catchlights if c.get("eye") == "right"]

    # ── Artifact filter: lower-hemisphere catchlights larger than the iris ──
    # Pipeline 1 (MediaPipe iris) can detect bright spots on the sclera, lower
    # eyelid, or clothing collar that appear at 4-8 o'clock with size_ratio > 1.0
    # (enclosing circle radius > iris radius).  These cannot be from a real
    # fill light — a genuine fill-light catchlight fits inside or at the iris
    # boundary.  Filter them before clamshell/pattern analysis so they don't
    # produce false clamshell detections.
    _LOWER_ARTIFACT_SIZE_LIMIT = 1.0

    def _is_credible(c: Dict) -> bool:
        _h = _clock_num(c.get("position", ""))
        if _h is None:
            return True
        if _classify_clock(_h) != "lower":
            return True  # only filter lower hemisphere
        return (c.get("size_ratio") or 0.0) <= _LOWER_ARTIFACT_SIZE_LIMIT

    left = [c for c in left if _is_credible(c)]
    right = [c for c in right if _is_credible(c)]
    max_per_eye = max(len(left), len(right))

    # ── Ring light: shape-based hard gate (Layer 0 hardware truth) ──
    # A ring catchlight is morphologically unmistakable — circular annular
    # reflection that only a ring flash or ring light can produce.  No other
    # modifier creates a donut-shaped specular in the cornea.  If detected in
    # either eye, ring_light is the pattern with high confidence — bypassing
    # all clock-position inference below.
    # Use filtered (left + right) — artifact-filtered catchlights only.
    _ring_shapes = [c for c in (left + right) if c.get("shape") == "ring"]
    if _ring_shapes:
        return {
            "pattern":             "ring_light",
            "pattern_confidence":  0.85,
            "key_position_text":   "On-axis (ring light)",
            "fill_method_text":    "Ring light provides wraparound fill",
            "light_count":         1,
            "unrecognized_details": [],
            "notes":               [
                f"Ring-shaped catchlight detected ({len(_ring_shapes)} occurrence(s)) "
                "— ring light pattern confirmed at Layer 0 (hardware shape signal)."
            ],
        }

    # Extract clock positions per eye
    left_hours = [_clock_num(c.get("position", "")) for c in left]
    right_hours = [_clock_num(c.get("position", "")) for c in right]
    left_hours = [h for h in left_hours if h is not None]
    right_hours = [h for h in right_hours if h is not None]

    left_quads = [_classify_clock(h) for h in left_hours]
    right_quads = [_classify_clock(h) for h in right_hours]

    # ── Triangle: 3 per eye — classic formation only ──
    # Classic: two upper (10+2 o'clock) + one lower fill (5-7 o'clock)
    # ── Triangle detection — commented out pending Hurley pipeline cleanup ──────
    # The "triangle" pattern is Hurley-specific (lateral strip geometry).
    # A generic 2-upper + 1-lower config is NOT triangle — it's loop/rembrandt
    # with a fill catchlight.  All triangle detection is gated until the
    # catchlight pipeline is consolidated and Hurley geometry is re-validated.
    #
    # _TRI_VARIANT_CLASSIC = "classic"    # 2 upper + 1 lower (disabled)
    # _TRI_VARIANT_HURLEY  = "hurley"     # 1 top + 2 lateral (disabled)
    # _TRI_VARIANT_NONE    = None
    #
    # def _triangle_variant(hours, quads): ...  # disabled
    # left_tri_var  = _triangle_variant(left_hours,  left_quads)
    # right_tri_var = _triangle_variant(right_hours, right_quads)
    # if left_tri_var and right_tri_var: return { "pattern": "triangle", ... }
    # if left_tri_var or  right_tri_var: return { "pattern": "triangle", ... }

    # ── Bilateral symmetric upper keys (classic twin-key, no lower fill resolved) ──
    # ── Bilateral symmetric upper → triangle — commented out pending Hurley cleanup ──
    # This path returned "triangle" for twin flanking keys at 10+2 o'clock.
    # Disabled with the rest of the Hurley detection stack.
    #
    # def _is_bilateral_symmetric(quads): ...
    # _any_lower = any(q == "lower" for q in left_quads + right_quads)
    # if not _any_lower and max_per_eye >= 2:
    #     left_bil = len(left_quads) >= 2 and _is_bilateral_symmetric(left_quads)
    #     right_bil = len(right_quads) >= 2 and _is_bilateral_symmetric(right_quads)
    #     if left_bil and right_bil: return { "pattern": "triangle", ... }
    #     if left_lat and right_lat: return { ... }  # Hurley lateral

    # ── Clamshell: 2 per eye — one upper, one lower (vertically aligned) ──
    # Floor-bounce filter: lower catchlights that are significantly dimmer
    # than upper ones are likely reflections from the ground/floor, not a
    # dedicated fill light.  True clamshell fill produces catchlights at
    # comparable intensity to the key.
    _FLOOR_BOUNCE_RATIO = 0.30  # lower must be >= 30% of upper intensity
    # Relaxed from 0.6: fill lights in clamshell setups are often 1-2 stops
    # dimmer than the key (25-50% intensity). 0.30 catches floor bounces
    # while preserving legitimate fill detection.

    def _is_clamshell(eye_catchlights: List[Dict[str, Any]], hours: List[int], quads: List[str]) -> bool:
        if len(hours) < 2:
            return False
        has_upper = any(q in ("top_center", "upper_left", "upper_right") for q in quads)
        has_lower = any(q == "lower" for q in quads)
        if not (has_upper and has_lower):
            return False
        # Intensity check: compare upper vs lower catchlight brightness
        upper_intensities = [
            c.get("intensity", 0.5)
            for c, q in zip(eye_catchlights, quads)
            if q in ("top_center", "upper_left", "upper_right")
        ]
        lower_intensities = [
            c.get("intensity", 0.5)
            for c, q in zip(eye_catchlights, quads)
            if q == "lower"
        ]
        if upper_intensities and lower_intensities:
            max_upper = max(upper_intensities)
            max_lower = max(lower_intensities)
            if max_upper > 0 and (max_lower / max_upper) < _FLOOR_BOUNCE_RATIO:
                return False  # lower catchlight too dim → floor bounce
        return True

    left_clam = _is_clamshell(left, left_hours, left_quads)
    right_clam = _is_clamshell(right, right_hours, right_quads)

    _floor_bounce_detected = False
    if not (left_clam and right_clam):
        # Check if geometry matched but intensity failed → floor bounce
        def _has_geometry(hours: List[int], quads: List[str]) -> bool:
            if len(hours) < 2:
                return False
            return (any(q in ("top_center", "upper_left", "upper_right") for q in quads)
                    and any(q == "lower" for q in quads))
        if _has_geometry(left_hours, left_quads) and _has_geometry(right_hours, right_quads):
            _floor_bounce_detected = True

    if left_clam and right_clam:
        return {
            "pattern": "clamshell",
            "pattern_confidence": 0.75,
            "key_position_text": "above, on-axis with fill below",
            "fill_method_text": "near camera axis",
            "light_count": 2,
            "unrecognized_details": [],
            "notes": ["Vertical two-light catchlight pattern (clamshell) in both eyes."],
        }

    # Floor bounce: geometry says clamshell but intensity says the lower
    # catchlights are reflections (floor, fabric, etc.) — classify as
    # butterfly/paramount (single overhead source).
    if _floor_bounce_detected:
        # Determine the primary upper position for the key light
        all_upper_hours = [h for h, q in zip(left_hours + right_hours, left_quads + right_quads)
                          if q in ("top_center", "upper_left", "upper_right")]
        dominant = max(set(all_upper_hours), key=all_upper_hours.count) if all_upper_hours else 12
        if dominant == 12:
            pos_text = "directly above (on-axis)"
        elif dominant in (11, 1):
            pos_text = "above, slightly off-axis"
        else:
            pos_text = "above"
        return {
            "pattern": "butterfly",
            "pattern_confidence": 0.65,
            "key_position_text": pos_text,
            "fill_method_text": "",
            "light_count": 1,
            "unrecognized_details": [],
            "notes": [
                "Upper + lower catchlights detected but lower are significantly "
                "dimmer — likely floor/surface bounce, not a dedicated fill. "
                "Classifying as single overhead (butterfly/paramount)."
            ],
        }

    # Single-eye clamshell is NOT reliable — lower catchlights in one eye
    # can be costume reflections, metallic accessories, or environmental
    # bounces.  Fall through to multi-catchlight or single-catchlight
    # analysis instead of returning a weak clamshell signal.

    # ── Single catchlight patterns (1 per eye) ──
    if max_per_eye == 1:
        # Use whichever eye has data; prefer consistency
        all_hours = left_hours + right_hours
        all_quads = left_quads + right_quads

        if not all_hours:
            return {
                "pattern": "unknown",
                "pattern_confidence": 0.0,
                "key_position_text": "",
                "fill_method_text": "",
                "light_count": 0,
                "unrecognized_details": [],
                "notes": ["Catchlight detected but clock position unreadable."],
            }

        # Check consistency between eyes
        both_consistent = (
            len(left_hours) == 1
            and len(right_hours) == 1
            and left_quads[0] == right_quads[0]
        )
        conf_boost = 0.2 if both_consistent else 0.0

        dominant_quad = all_quads[0]
        dominant_hour = all_hours[0]

        if dominant_quad == "upper_left" or dominant_hour in (10, 11):
            # Catchlight side indicates KEY POSITION (camera-left, elevated), not pattern.
            # Both Loop and Rembrandt produce upper-left catchlights — the nose shadow
            # is the only reliable discriminator.  Default to loop (more common) with
            # low confidence; orchestrator should override with nose-shadow result.
            return {
                "pattern": "loop",
                "pattern_confidence": 0.35 + conf_boost,
                "key_position_text": "30-45 off-axis left",
                "fill_method_text": "",
                "light_count": 1,
                "unrecognized_details": [],
                "notes": [
                    f"Single catchlight at {dominant_hour} o'clock → key camera-left; "
                    "loop/rembrandt indeterminate without nose shadow data."
                ],
            }

        if dominant_quad == "upper_right" or dominant_hour in (1, 2):
            return {
                "pattern": "loop",
                "pattern_confidence": 0.35 + conf_boost,
                "key_position_text": "30-45 off-axis right",
                "fill_method_text": "",
                "light_count": 1,
                "unrecognized_details": [],
                "notes": [
                    f"Single catchlight at {dominant_hour} o'clock → key camera-right; "
                    "loop/rembrandt indeterminate without nose shadow data."
                ],
            }

        if dominant_quad == "top_center" or dominant_hour == 12:
            # Could be butterfly/paramount — classify as loop (safe default)
            return {
                "pattern": "loop",
                "pattern_confidence": 0.4 + conf_boost,
                "key_position_text": "30 off-axis",
                "fill_method_text": "",
                "light_count": 1,
                "unrecognized_details": [],
                "notes": [f"Single catchlight at 12 o'clock → loop/butterfly."],
            }

        if dominant_quad in ("hard_left", "hard_right"):
            return {
                "pattern": "split",
                "pattern_confidence": 0.6 + conf_boost,
                "key_position_text": "90",
                "fill_method_text": "",
                "light_count": 1,
                "unrecognized_details": [],
                "notes": [f"Single catchlight at {dominant_hour} o'clock → split."],
            }

        # Unusual position
        return {
            "pattern": "unknown",
            "pattern_confidence": 0.15,
            "key_position_text": "",
            "fill_method_text": "",
            "light_count": 1,
            "unrecognized_details": [f"Catchlight at {dominant_hour} o'clock — unusual position."],
            "notes": [f"Catchlight at {dominant_hour} o'clock doesn't map to a standard pattern."],
        }

    # ── Multi-catchlight fallback (>1 per eye, not clamshell) ──
    # Multiple catchlights per eye typically come from a large soft modifier
    # (softbox edge reflections, multiple panel edges) or a key + reflector combo.
    # Infer the key light position from the brightest upper catchlight.
    _upper_quads = ("top_center", "upper_left", "upper_right")
    _all_upper = [
        c for c in (left + right)
        if _classify_clock(_clock_num(c.get("position", "")) or 12) in _upper_quads
    ]
    if _all_upper:
        _primary_c = max(_all_upper, key=lambda c: c.get("intensity", 0.0))
        _ph = _clock_num(_primary_c.get("position", ""))
        _pq = _classify_clock(_ph) if _ph else "top_center"
        _has_lower_l = any(_classify_clock(h) == "lower" for h in left_hours)
        _has_lower_r = any(_classify_clock(h) == "lower" for h in right_hours)
        _bilateral_fill = _has_lower_l and _has_lower_r
        if _pq == "top_center":
            _pat = "butterfly"
            _key_text = "on-axis (elevated)"
        else:
            _pat = "loop"
            _key_text = "30-45 off-axis left" if _pq == "upper_left" else "30-45 off-axis right"
        return {
            "pattern": _pat,
            "pattern_confidence": 0.30,
            "key_position_text": _key_text,
            "fill_method_text": "reflector fill" if _bilateral_fill else "",
            "light_count": 2 if _bilateral_fill else 1,
            "unrecognized_details": [],
            "notes": [
                f"Multiple catchlights ({len(left)}L/{len(right)}R): "
                f"primary at {_ph} o'clock → {_pat} inferred from key position."
            ],
        }
    return {
        "pattern": "unknown",
        "pattern_confidence": 0.15,
        "key_position_text": "",
        "fill_method_text": "",
        "light_count": max_per_eye,
        "unrecognized_details": [
            f"Found {max_per_eye} catchlights per eye — pattern unclear."
        ],
        "notes": ["Multiple catchlights detected but no upper catchlight identified."],
    }


def _infer_modifier_from_catchlights(
    catchlights: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Infer modifier family from catchlight shapes."""
    if not catchlights:
        return {"modifier": None, "modifier_confidence": 0.0}

    shapes = [c.get("shape", "unknown") for c in catchlights]

    # Group shapes into modifier families
    ring_count = sum(1 for s in shapes if s == "ring")
    round_count = sum(1 for s in shapes if s in ("round", "octagonal"))
    strip_count = sum(1 for s in shapes if s == "strip")
    rect_count = sum(1 for s in shapes if s in ("rectangular", "square"))
    total = ring_count + round_count + strip_count + rect_count

    if total == 0:
        return {"modifier": None, "modifier_confidence": 0.0}

    # Dominant family wins
    counts = [
        (ring_count, "ring_light", 0.7),
        (strip_count, "strip_box", 0.6),
        (round_count, "beauty_dish", 0.5),
        (rect_count, "softbox_rect", 0.6),
    ]
    counts.sort(key=lambda x: x[0], reverse=True)
    best_count, best_mod, base_conf = counts[0]

    if best_count == 0:
        return {"modifier": None, "modifier_confidence": 0.0}

    # Full agreement = higher confidence, mixed = lower
    conf = base_conf if best_count == total else base_conf * 0.6
    return {"modifier": best_mod, "modifier_confidence": round(conf, 2)}


def _merge_with_classification(
    classification: Optional[Dict[str, Any]],
    pattern_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Cross-validate palette classification with catchlight pattern inference.

    Returns dict with: detected_mood, mood_confidence, notes
    """
    if not classification:
        return {
            "detected_mood": None,
            "mood_confidence": 0.0,
            "notes": [],
        }

    palette_mood = classification.get("mood")
    palette_conf = float(classification.get("confidence", 0.3))

    pattern = pattern_result.get("pattern", "unknown")
    pattern_conf = float(pattern_result.get("pattern_confidence", 0.0))

    # Mood ↔ pattern agreement table
    _PATTERN_MOOD_AFFINITY = {
        "triangle": {"beauty", "high_key", "corporate"},
        "clamshell": {"beauty", "high_key"},
        "butterfly": {"beauty", "editorial", "high_key"},
        "rembrandt": {"cinematic", "editorial", "low_key"},
        "loop": {"corporate", "natural"},
        "split": {"cinematic", "low_key", "editorial"},
        "broad": {"corporate", "natural", "editorial"},
        "short": {"cinematic", "editorial", "low_key"},
        "flat": {"corporate", "high_key", "natural"},
    }

    notes: List[str] = []
    affinity_set = _PATTERN_MOOD_AFFINITY.get(pattern, set())

    if palette_mood and pattern != "unknown" and affinity_set:
        if palette_mood in affinity_set:
            # Agreement: boost confidence
            merged_conf = 0.6 * palette_conf + 0.4 * pattern_conf
            notes.append(
                f"Palette mood '{palette_mood}' agrees with catchlight pattern '{pattern}'."
            )
        else:
            # Disagreement: lower confidence
            merged_conf = 0.4 * palette_conf + 0.2 * pattern_conf
            notes.append(
                f"Palette mood '{palette_mood}' doesn't match catchlight pattern '{pattern}' "
                f"— confidence reduced."
            )
    else:
        # No cross-validation possible — use palette as-is
        merged_conf = palette_conf

    return {
        "detected_mood": palette_mood,
        "mood_confidence": round(max(0.0, min(1.0, merged_conf)), 3),
        "notes": notes,
    }


# ── Skin-tone mapping ──────────────────────────────────────────────────────

_SKIN_TONE_MAP = {
    "deep": "dark",
    "dark": "dark",
    "medium": "medium",
    "light": "light",
}


# ── Main dataclass ─────────────────────────────────────────────────────────

@dataclass
class LightingInference:
    """Result of inferring lighting setup from vision data."""

    pattern: str = "unknown"
    pattern_confidence: float = 0.0
    modifier_family: Optional[str] = None
    modifier_confidence: float = 0.0
    light_count: int = 0
    key_position_text: str = ""
    key_side: str = "unknown"  # "left", "right", "center", "unknown"
    fill_method_text: str = ""
    detected_mood: Optional[str] = None
    mood_confidence: float = 0.0
    detected_skin_tone: Optional[str] = None
    skin_tone_confidence: float = 0.0
    background_light_detected: bool = False
    background_light_confidence: float = 0.0
    detected_cct_kelvin: Optional[int] = None
    detected_distance_class: Optional[str] = None  # near | medium | far
    detected_environment: Optional[str] = None  # studio | outdoor_sun | outdoor_shade | window_light | etc.
    unrecognized_details: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    cue_report: Optional[Any] = None  # VisualCueReport when cue pipeline ran
    face_mesh_available: bool = True   # Phase 2: False when no face mesh detected
    data_quality: str = "full"         # full | face_limited | environmental_limited
    earring_catchlight_contamination: bool = False  # lateral catchlight excluded by cross-eye consistency check
    catchlight_intelligence: Optional[Dict] = field(default=None)  # Layer 0 physical catchlight analysis

    def to_input_ctx_fields(self) -> Dict[str, Any]:
        """Dict suitable for merging into input_ctx for score_system()."""
        out: Dict[str, Any] = {}
        if self.pattern and self.pattern != "unknown":
            out["detected_pattern"] = self.pattern
            out["detected_pattern_confidence"] = self.pattern_confidence
        if self.key_position_text:
            out["detected_key_position"] = self.key_position_text
        if self.fill_method_text:
            out["detected_fill_method"] = self.fill_method_text
        if self.modifier_family:
            out["detected_modifier"] = self.modifier_family
            out["detected_modifier_confidence"] = self.modifier_confidence
        if self.detected_mood:
            out["detected_mood"] = self.detected_mood
            out["detected_mood_confidence"] = self.mood_confidence
        if self.detected_skin_tone:
            out["detected_skin_tone"] = self.detected_skin_tone
            out["detected_skin_tone_confidence"] = self.skin_tone_confidence
        if self.light_count:
            out["detected_light_count"] = self.light_count
        if self.background_light_detected:
            out["detected_background_light"] = True
            out["detected_background_light_confidence"] = self.background_light_confidence
        if self.detected_cct_kelvin is not None:
            out["detected_cct_kelvin"] = self.detected_cct_kelvin
        if self.detected_distance_class:
            out["detected_distance_class"] = self.detected_distance_class
        if self.detected_environment:
            out["detected_environment"] = self.detected_environment
        if self.cue_report is not None:
            out["cue_analysis_available"] = True
            out["cue_confidence"] = self.cue_report.overall_confidence()
        return out


# ── Background light inference ─────────────────────────────────────────────

def _infer_background_light(
    vision_data: Dict[str, Any],
    cue_report: Any = None,
) -> Dict[str, Any]:
    """Detect whether a dedicated background light was used.

    Background lights don't create catchlights in the eyes — they illuminate
    the backdrop behind the subject.  Detection relies on the brightness of the
    segmented background palette produced by the vision pipeline.

    When cue_report is available, subject-background separation is used to
    distinguish key-light spill (subject close to wall/backdrop) from a
    dedicated background light.

    Returns dict with ``detected`` (bool) and ``confidence`` (float 0–1).
    """
    region = vision_data.get("region_attribution", {})
    palettes = region.get("palettes", {})
    bg_palette = palettes.get("background_palette", [])

    if not bg_palette:
        return {"detected": False, "confidence": 0.0, "notes": []}

    # Weight each palette entry by its percentage of the background.
    # A 99% white + 1% black background should read as nearly white,
    # not be dragged down by the tiny dark swatch.
    total_pct = sum(c.get("pct", 0) for c in bg_palette)
    if total_pct > 0:
        avg_luma = sum(
            (sum(c.get("rgb", [128, 128, 128])) / 3) * c.get("pct", 0)
            for c in bg_palette
        ) / total_pct
    else:
        # Fallback: equal weighting when pct data is absent
        avg_luma = sum(
            sum(c.get("rgb", [128, 128, 128])) / 3 for c in bg_palette
        ) / len(bg_palette)

    notes: List[str] = []

    # Check if subject is close to the background (low separation).
    # When subject is against a wall/backdrop, bright background is likely
    # key-light spill, not a dedicated background light.
    subject_close_to_bg = False
    if cue_report is not None:
        sep = getattr(cue_report, "subject_background_separation", None)
        if sep is not None:
            lum_delta = getattr(sep, "luminance_delta", None)
            edge_sharpness = getattr(sep, "edge_sharpness", "unknown")
            # Low luminance delta = subject and background at similar depth
            if lum_delta is not None and lum_delta < 0.3:
                subject_close_to_bg = True
                notes.append(
                    f"Low subject-background separation (delta={lum_delta:.2f}) "
                    "— subject likely close to or against the background."
                )
            # Sharp boundary = no DoF blur = physically close
            elif edge_sharpness == "sharp":
                subject_close_to_bg = True
                notes.append(
                    "Sharp subject-background boundary "
                    "— subject likely close to the background."
                )

    if avg_luma > 220:
        if subject_close_to_bg:
            # Bright but subject is against the background — likely key spill
            # on a white wall/seamless, not a dedicated light.
            notes.append(
                f"Very bright background (avg luma {round(avg_luma)}) but "
                "subject close to background — likely key light spill, "
                "not a dedicated background light."
            )
            return {"detected": False, "confidence": 0.2, "notes": notes}
        # Very bright + separated — almost certainly a dedicated background light
        notes.append(
            f"Very bright background (avg luma {round(avg_luma)}) — "
            "dedicated background light or intentionally overexposed sweep."
        )
        return {"detected": True, "confidence": 0.85, "notes": notes}

    if avg_luma > 180:
        if subject_close_to_bg:
            notes.append(
                f"Bright background (avg luma {round(avg_luma)}) but "
                "subject close to background — likely key light spill."
            )
            return {"detected": False, "confidence": 0.15, "notes": notes}
        notes.append(
            f"Bright background (avg luma {round(avg_luma)}) — "
            "likely a background light or significant key-light spill."
        )
        return {"detected": True, "confidence": 0.6, "notes": notes}

    if avg_luma > 140:
        # Mid-bright — could be ambient or a gelled background light.
        # Too ambiguous for high confidence.
        notes.append(
            f"Moderately bright background (avg luma {round(avg_luma)}) — "
            "possible background light, but could also be ambient."
        )
        return {"detected": False, "confidence": 0.3, "notes": notes}

    # Dark background — no background light (or it's turned off / dark gel).
    return {"detected": False, "confidence": 0.0, "notes": []}


# ── Layer 0: Catchlight Intelligence ──────────────────────────────────────

def _build_catchlight_intelligence(
    catchlight_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build Layer 0 catchlight intelligence from raw Pipeline 1 catchlights.

    Classifies each catchlight by role, identifies the primary key, infers
    the modifier type and size from shape + total relative area coverage, and
    counts intentional light sources.

    ``total_relative_area`` = Σ(size_ratio²) across key-source catchlights.
    Since area ∝ enc_r² = (size_ratio × iris_r)², this dimensionless metric
    directly encodes the apparent angular size of the source — the primary
    determinant of shadow softness and highlight wrap.

    Returns dict with:
      primary_key, modifier, fill_bilateral,
      light_count_from_catchlights, artifact_count, catchlights, notes.
    """
    if not catchlight_list:
        return {
            "primary_key": None,
            "modifier": None,
            "fill_bilateral": False,
            "light_count_from_catchlights": 0,
            "artifact_count": 0,
            "catchlights": [],
            "notes": ["No catchlights available for Layer 0 analysis."],
        }

    notes: List[str] = []

    # ── Artifact filter: lower-hemisphere catchlights larger than iris ──
    _LOWER_ARTIFACT_LIMIT = 1.0

    def _is_lower_hemisphere(c: Dict) -> bool:
        h = _clock_num(c.get("position", ""))
        return h is not None and _classify_clock(h) == "lower"

    def _is_artifact(c: Dict) -> bool:
        return _is_lower_hemisphere(c) and (c.get("size_ratio") or 0.0) > _LOWER_ARTIFACT_LIMIT

    artifact_catchlights = [c for c in catchlight_list if _is_artifact(c)]
    credible = [c for c in catchlight_list if not _is_artifact(c)]
    artifact_count = len(artifact_catchlights)

    if artifact_count > 0:
        notes.append(
            f"{artifact_count} lower-hemisphere catchlight(s) with size_ratio > "
            f"{_LOWER_ARTIFACT_LIMIT} filtered as sclera/clothing artifacts "
            "(extend beyond iris boundary)."
        )

    # ── Separate by hemisphere ──
    _UPPER_QUADS = {"top_center", "upper_left", "upper_right"}

    def _quad(c: Dict) -> str:
        h = _clock_num(c.get("position", ""))
        return _classify_clock(h) if h is not None else "other"

    upper = [c for c in credible if _quad(c) in _UPPER_QUADS]
    lower = [c for c in credible if _quad(c) == "lower"]

    # ── Identify primary key: brightest upper catchlight ──
    primary_key: Optional[Dict[str, Any]] = None
    primary_key_obj: Optional[Dict] = None  # reference to the raw dict for identity checks
    if upper:
        primary_key_obj = max(upper, key=lambda c: c.get("intensity", 0.0))
        pk_quad = _quad(primary_key_obj)
        primary_key = {
            "eye":        primary_key_obj.get("eye"),
            "position":   primary_key_obj.get("position"),
            "quad":       pk_quad,
            "intensity":  primary_key_obj.get("intensity"),
            "size_ratio": primary_key_obj.get("size_ratio"),
            "shape":      primary_key_obj.get("shape"),
            "role":       "key",
        }

    # ── Classify all credible catchlights ──
    # key          → the single brightest upper (primary key light)
    # modifier_edge → remaining upper catchlights (same source, different panel edge)
    # fill          → credible lower catchlights (bilateral fill light)
    # other         → lateral or unclassifiable
    classified: List[Dict[str, Any]] = []
    for c in credible:
        q = _quad(c)
        if q in _UPPER_QUADS:
            role = "key" if (c is primary_key_obj) else "modifier_edge"
        elif q == "lower":
            role = "fill"
        else:
            role = "other"
        classified.append({
            "eye":        c.get("eye"),
            "position":   c.get("position"),
            "quad":       q,
            "intensity":  c.get("intensity"),
            "size_ratio": c.get("size_ratio"),
            "shape":      c.get("shape"),
            "role":       role,
        })

    # Display list: only key + fill (modifier_edge rolled into area calc; artifacts hidden)
    display_catchlights = [cl for cl in classified if cl["role"] in ("key", "fill")]

    # ── Fill detection: bilateral lower in both eyes ──
    left_has_fill  = any(cl["role"] == "fill" and cl.get("eye") == "left"  for cl in classified)
    right_has_fill = any(cl["role"] == "fill" and cl.get("eye") == "right" for cl in classified)
    fill_bilateral = left_has_fill and right_has_fill

    # ── Key / fill intensity (for stop ratio) ──
    fill_cls = [cl for cl in classified if cl["role"] == "fill"]
    _key_intens_raw  = (primary_key_obj.get("intensity") or 0.0) if primary_key_obj else 0.0
    _fill_intens_raw = (
        sum(cl.get("intensity") or 0.0 for cl in fill_cls) / len(fill_cls)
        if fill_cls else None
    )
    key_intensity_pct  = round(_key_intens_raw * 100)  if primary_key_obj else None
    fill_intensity_pct = round(_fill_intens_raw * 100)  if _fill_intens_raw is not None else None

    # ── Modifier inference from shape + total relative area ──
    # key + modifier_edge = same light source (different reflections from same modifier)
    source_catchlights = [cl for cl in classified if cl["role"] in ("key", "modifier_edge")]

    modifier: Optional[Dict[str, Any]] = None
    if source_catchlights:
        # total_relative_area = Σ(size_ratio²) — aggregate angular coverage of the modifier.
        total_relative_area = sum(
            (cl.get("size_ratio") or 0.0) ** 2
            for cl in source_catchlights
        )

        # key_area = size_ratio² of the primary key catchlight alone — the most reliable
        # single-point size measurement.  When multiple catchlights from the same source
        # have inconsistent apparent sizes (different angles / edge vs face reflections),
        # the primary key is the cleanest signal.  Use it as the size classification input;
        # total_relative_area is kept for display reference.
        _pk_sr = (primary_key_obj.get("size_ratio") or 0.0) if primary_key_obj else 0.0
        key_area = _pk_sr ** 2

        # Size classification anchor:
        #   Single source  → key_area (primary key is the authoritative reading)
        #   Multiple sources contributing consistently → total is valid, but cap at
        #   2× key_area to prevent modifier_edge inflation from dominating.
        contributing_count = len(source_catchlights)

        size_area = key_area if key_area > 0 else total_relative_area
        if contributing_count > 1 and total_relative_area > key_area * 2.5:
            # Aggregate is >2.5× the primary key alone — secondary catchlights are inflating
            # the estimate.  Default to primary key size.
            size_area = key_area

        # Determine dominant shape
        shapes = [cl.get("shape", "unknown") for cl in source_catchlights if cl.get("shape")]
        ring_ct  = sum(1 for s in shapes if s == "ring")
        strip_ct = sum(1 for s in shapes if s == "strip")
        round_ct = sum(1 for s in shapes if s in ("round", "octagonal"))
        rect_ct  = sum(1 for s in shapes if s in ("rectangular", "square"))

        # ── Photographer-readable size estimates ──────────────────────────────
        # total_relative_area encodes apparent angular size of the source.
        # Estimates below are calibrated to standard portrait distance (5-8ft / 1.5-2.5m).
        # All modifier sizes are approximate equivalents — actual dimensions depend
        # on subject-to-light distance.

        # ── Cluster meaning: what the combined catchlight pattern tells a photographer ──
        # Multiple specular points from one modifier are ONE source, not multiple lights.
        # The cluster count/shape encodes modifier size and working distance.
        def _cluster_meaning(count: int, shape: str) -> str:
            if shape == "ring_light":
                return (
                    "The ring-shaped specular IS the modifier — circular on-axis reflection "
                    "is the unmistakable ring light signature. One source."
                )
            if shape == "strip_box":
                if count == 1:
                    return (
                        "Single elongated specular bar — strip box face reflecting as a clean "
                        "streak. One source."
                    )
                return (
                    f"{count} elongated specular points — the strip box face and edges "
                    "each reflecting separately. One source; the cluster tells you the "
                    "strip is large or close enough to show its geometry in the cornea."
                )
            if shape in ("beauty_dish", "softbox_rect"):
                if count == 1:
                    return (
                        "Single clean specular — source appears compact from this working "
                        "distance. One light, one reflection."
                    )
                if count == 2:
                    return (
                        "Two specular points in the iris — the modifier's face and one "
                        "edge. This is one source. You're seeing the edge of the "
                        "diffusion surface resolve as a separate hot spot because the "
                        "modifier is large relative to working distance."
                    )
                if count <= 4:
                    return (
                        f"{count} specular reflections — all from one source. The modifier's "
                        "edges and corners are individually visible in the cornea. "
                        "Classic large-softbox-at-moderate-distance signature."
                    )
                return (
                    f"{count} specular points — all one source. Dense cluster means a very "
                    "large modifier or the source is very close. The photographer reads "
                    "this entire cluster as a single key light."
                )
            # Generic
            if count == 1:
                return "Single specular — one compact source. One light."
            return (
                f"{count} specular points from one source. The cluster is the modifier's "
                "face reflecting in the cornea — size and count together indicate "
                f"apparent source size."
            )

        if ring_ct > 0:
            mod_type   = "ring_light"
            mod_label  = "Ring Light"
            size_class = "medium"
            size_est   = "~18-22\" ring"
            physical_meaning = (
                f"Ring light (area {total_relative_area:.3f} iris²) — "
                "on-axis circular source (~18-22\") creates wraparound catchlight ring, "
                "minimal shadows, flat-to-butterfly character"
            )
            cluster_meaning = _cluster_meaning(contributing_count, "ring_light")

        elif strip_ct >= round_ct and strip_ct >= rect_ct:
            if size_area < 0.05:
                size_class, size_label = "small",  "Narrow Strip Box"
                size_est = "~9–12\"×24–48\" strip"
                wrap = "tight lateral wrap, painterly shadow roll-off"
                mod_type  = "strip_box"
            elif size_area < 0.20:
                size_class, size_label = "medium", "Strip Box"
                size_est = "~12–16\"×48–60\" strip"
                wrap = "lateral highlight sweep, controlled spill"
                mod_type  = "strip_box"
            elif rect_ct > 0 and strip_ct - rect_ct <= 1:
                # At large angular area, a near-tie between strip and rect catchlights
                # means a large rectangular softbox/panel — not a strip box.
                # 72"+ rectangular modifiers produce slightly elongated catchlights
                # that trip the strip detector, but are not strip boxes.
                size_class, size_label = "large",  "Large Rectangular Softbox"
                size_est = "~48–72\"+ softbox / panel"
                wrap = "broad wrap, very soft shadow edge"
                mod_type  = "softbox_rect"
            else:
                # Strip clearly dominates (strip_ct ≥ rect_ct + 2) at large area
                size_class, size_label = "large",  "Wide Strip Box"
                size_est = "~20–36\"×60–90\" strip"
                wrap = "broad lateral wrap, softer shadow edge"
                mod_type  = "strip_box"
            mod_label = size_label
            physical_meaning = (
                f"{size_label} (area {total_relative_area:.3f} iris², {size_est} equiv.) — "
                f"{wrap}."
                + (" Elongated source typical in editorial and hair setups"
                   if mod_type == "strip_box" else "")
            )
            cluster_meaning = _cluster_meaning(contributing_count, mod_type)

        elif round_ct >= rect_ct and round_ct > 0:
            if size_area < 0.08:
                size_class, size_label = "small",  "Small Beauty Dish"
                size_est = "~16-20\" dish"
                detail = "punchy specular with hard catchlight edge, minimal wrap"
            elif size_area < 0.25:
                size_class, size_label = "medium", "Beauty Dish / Octa"
                size_est = "~22-33\" dish/octa"
                detail = "classic beauty punch — crisp highlights with gradual shadow falloff"
            else:
                size_class, size_label = "large",  "Large Octa"
                size_est = "~48-60\" octa"
                detail = "large round source — soft with even highlight coverage"
            mod_type  = "beauty_dish"
            mod_label = size_label
            physical_meaning = (
                f"{size_label} (area {total_relative_area:.3f} iris², {size_est} equiv.) — "
                f"{detail}"
            )
            cluster_meaning = _cluster_meaning(contributing_count, "beauty_dish")

        elif rect_ct > 0:
            if size_area < 0.05:
                size_class, size_label = "small",  "Small Softbox"
                size_est = "~16-24\" softbox"
                wrap = "limited wrap, distinct shadow edge"
            elif size_area < 0.15:
                size_class, size_label = "medium", "Medium Softbox"
                size_est = "~30-48\" softbox"
                wrap = "moderate wrap, gradual shadow transitions"
            elif size_area < 0.40:
                size_class, size_label = "large",  "Large Softbox"
                size_est = "~48-72\" softbox"
                wrap = "broad wrap, very soft shadow edge"
            else:
                size_class, size_label = "xlarge", "Very Large Softbox"
                size_est = "72\"+ softbox or proximity source"
                wrap = "extensive wrap, near-shadowless"
            mod_type  = "softbox_rect"
            mod_label = size_label
            physical_meaning = (
                f"{size_label} (area {total_relative_area:.3f} iris², {size_est} equiv.) — "
                f"{wrap}"
            )
            cluster_meaning = _cluster_meaning(contributing_count, "softbox_rect")

        else:
            # Shape unknown — classify purely from primary key area
            if size_area < 0.03:
                size_class, size_label = "point",  "Hard / Point Source"
                size_est = "bare strobe / grid spot"
                detail = "small hot specular, crisp shadow edges, high contrast"
            elif size_area < 0.15:
                size_class, size_label = "small",  "Small Modifier"
                size_est = "~16-36\" equiv."
                detail = "limited coverage, moderate shadow softness"
            elif size_area < 0.40:
                size_class, size_label = "medium", "Medium Modifier"
                size_est = "~36-60\" equiv."
                detail = "moderate coverage, soft transitions"
            else:
                size_class, size_label = "large",  "Large Modifier"
                size_est = "60\"+ equiv."
                detail = "broad coverage, soft shadows"
            mod_type  = "hard_source" if size_class == "point" else "softbox_rect"
            mod_label = size_label
            physical_meaning = (
                f"{size_label} (area {total_relative_area:.3f} iris², {size_est}) — {detail}"
            )
            cluster_meaning = _cluster_meaning(contributing_count, mod_type)

        # ── Working distance estimate from primary key's size_ratio ──────────
        # size_ratio = enc_r / iris_r encodes the apparent angular half-size of the
        # source.  Larger size_ratio → source fills more of the visual field →
        # closer to subject (for a given modifier size).
        # Thresholds calibrated to a medium-large modifier at typical portrait distances.
        _pk_sr = (primary_key_obj.get("size_ratio") or 0.0) if primary_key_obj else 0.0
        if _pk_sr < 0.08:
            distance_class     = "very_far"
            distance_est_ft    = "9-12+ ft"
            distance_quality   = "small angular source — directional, defined shadow edge"
        elif _pk_sr < 0.18:
            distance_class     = "far"
            distance_est_ft    = "6-9 ft"
            distance_quality   = "classic portrait distance — controlled softness"
        elif _pk_sr < 0.30:
            distance_class     = "standard"
            distance_est_ft    = "4-6 ft"
            distance_quality   = "standard close distance — soft shadows, gradual transitions"
        elif _pk_sr < 0.50:
            distance_class     = "close"
            distance_est_ft    = "2-4 ft"
            distance_quality   = "proximity — very soft wrap, broad highlight coverage"
        else:
            distance_class     = "proximity"
            distance_est_ft    = "< 2 ft"
            distance_quality   = "extreme proximity — wrapping, near-shadowless"

        # ── Size confidence: cross-reference size_class with distance_class ──────
        # total_relative_area encodes ANGULAR size, not physical size.
        # The same area reading is consistent with multiple (size, distance) pairs.
        # We can narrow confidence using the distance estimate.
        #
        # High confidence: area AND distance are jointly consistent with ONE size range.
        # Low confidence:  proximity/close distance makes large-area ambiguous
        #                  (small mod close vs large mod standard).
        _size_confidence: str
        _size_caveat: Optional[str] = None

        if size_class in ("xlarge", "large") and distance_class in ("proximity", "close"):
            # Large area + close distance = ambiguous — could be smaller mod very close
            _size_confidence = "low"
            if distance_class == "proximity":
                _size_caveat = (
                    "source is < 2 ft away — apparent size is dominated by proximity, "
                    "not modifier size. Could be a 24-36\" source at extreme close range."
                )
                size_est = "unknown — proximity dominant"
                mod_label = f"Large/Close Source"
            else:  # close (2-4ft)
                _size_caveat = (
                    "source is 2-4 ft away — area reading is consistent with both "
                    f"{size_est} at standard distance OR a smaller modifier at close range."
                )
        elif size_class == "xlarge" and distance_class == "standard":
            # Large area + standard distance = genuinely large
            _size_confidence = "medium"
            _size_caveat = (
                "large apparent area at standard distance — consistent with 60-80\"+ "
                "softbox, but could also be a moderately large source closer than estimated."
            )
        elif size_class in ("point", "small") and distance_class in ("far", "very_far"):
            # Small area + far distance = genuinely compact source
            _size_confidence = "high"
        elif size_class in ("medium", "large") and distance_class == "standard":
            _size_confidence = "high"
        else:
            _size_confidence = "medium"

        modifier = {
            "type":                 mod_type,
            "label":                mod_label,
            "size_class":           size_class,
            "size_estimate":        size_est,
            "size_confidence":      _size_confidence,
            "size_caveat":          _size_caveat,
            "total_relative_area":  round(total_relative_area, 4),
            "contributing_count":   contributing_count,
            "physical_meaning":     physical_meaning,
            "cluster_meaning":      cluster_meaning,
            "distance_class":       distance_class,
            "distance_est_ft":      distance_est_ft,
            "distance_quality":     distance_quality,
        }

    # ── Light count from credible catchlights ──
    light_count_from_catchlights = (1 if primary_key is not None else 0)
    if fill_bilateral:
        light_count_from_catchlights += 1

    # ── Stops / lighting ratio ──
    stops_down: Optional[float] = None
    lighting_ratio_str: Optional[str] = None
    if (
        key_intensity_pct and fill_intensity_pct
        and key_intensity_pct > 0 and fill_intensity_pct > 0
    ):
        _s = math.log2(key_intensity_pct / fill_intensity_pct)
        stops_down = round(_s, 1)
        ratio_n = max(1, round(2 ** _s))
        lighting_ratio_str = f"{ratio_n}:1"

    # ── Fill source classification (reflector vs second head) ──
    _fill_shapes = [cl.get("shape", "") for cl in fill_cls if cl.get("shape")]
    _fill_hard   = any(s in ("round", "point", "dot") for s in _fill_shapes)
    if fill_bilateral and not _fill_hard:
        fill_source_label = "Reflector fill"
    elif fill_bilateral:
        fill_source_label = "Fill head"
    elif fill_cls:
        fill_source_label = "Fill head (one side)"
    else:
        fill_source_label = None

    # ── Photographer-read sentences ──
    # key_read  → "Large Softbox, camera-right, ~48-72" at 4-6 ft. One light."
    # fill_read → "Reflector fill, ~1.5 stops down → 3:1 ratio."
    key_read: Optional[str] = None
    fill_read: Optional[str] = None
    lighting_summary: Optional[str] = None

    if primary_key and modifier:
        _quad_val = primary_key.get("quad", "")
        _dir = {
            "upper_right": "camera-right",
            "upper_left":  "camera-left",
            "top_center":  "on-axis",
        }.get(_quad_val, "off-axis")
        _size    = modifier.get("size_estimate", "")
        _dist    = modifier.get("distance_est_ft", "")
        _mlabel  = modifier.get("label", "modifier")
        _one     = "One light." if light_count_from_catchlights == 1 else ""
        key_read = f"{_mlabel}, {_dir}, {_size} at {_dist}.{' ' + _one if _one else ''}"

    if fill_source_label:
        if stops_down is not None and lighting_ratio_str:
            fill_read = (
                f"{fill_source_label}, ~{stops_down} stops down "
                f"\u2192 {lighting_ratio_str} ratio."
            )
        else:
            fill_read = f"{fill_source_label} detected."

    _parts = [p for p in [key_read, fill_read] if p]
    lighting_summary = "  ".join(_parts) if _parts else None

    # Ring light flag: any source catchlight with ring shape = confirmed ring light.
    # Exposed so orchestrator can apply hard boost/veto on ring_light pattern candidate.
    _ring_light_detected = ring_ct > 0 if source_catchlights else False

    return {
        "primary_key":                  primary_key,
        "modifier":                     modifier,
        "fill_bilateral":               fill_bilateral,
        "fill_source_label":            fill_source_label,
        "key_intensity_pct":            key_intensity_pct,
        "fill_intensity_pct":           fill_intensity_pct,
        "stops_down":                   stops_down,
        "lighting_ratio":               lighting_ratio_str,
        "key_read":                     key_read,
        "fill_read":                    fill_read,
        "lighting_summary":             lighting_summary,
        "light_count_from_catchlights": light_count_from_catchlights,
        "artifact_count":               artifact_count,
        "catchlights":                  display_catchlights,
        "ring_light_detected":          _ring_light_detected,
        "notes":                        notes,
    }


# ── Public entry point ─────────────────────────────────────────────────────

def infer_lighting_from_vision(
    vision_data: Dict[str, Any],
    classification: Optional[Dict[str, Any]] = None,
    cue_report: Optional[Any] = None,
    vlm_description: Optional[Any] = None,  # VLMDescription — typed as Any to avoid circular import
) -> LightingInference:
    """Translate vision pipeline output into lighting vocabulary.

    Args:
        vision_data: The ``vision`` dict from ``describe_image(..., "vision")``
                     (must contain at least ``catchlights`` sub-dict).
        classification: The ``classification`` dict from ``describe_image()``
                        (palette-based mood/brightness/etc.).
        cue_report: Optional ``VisualCueReport`` from the cue extraction pipeline.
                    When provided, enriches the inference with cue-based analysis.
        vlm_description: Optional ``VLMDescription`` — when provided, the VLM's
                    ``signals.catchlights.jewellery_catchlight_suspected`` flag
                    is used to reinforce the cross-eye contamination check.

    Returns:
        A ``LightingInference`` with all detected fields populated.
    """
    all_notes: List[str] = []

    # Extract VLM jewellery flag once — used later in the contamination check
    _vlm_jewellery_flag: bool = False
    if vlm_description is not None:
        try:
            _vlm_jewellery_flag = bool(
                vlm_description.signals
                and vlm_description.signals.catchlights
                and vlm_description.signals.catchlights.jewellery_catchlight_suspected
            )
        except Exception:
            pass

    # ── Catchlights → pattern + modifier ──
    catchlight_data = vision_data.get("catchlights", {})
    catchlight_list = catchlight_data.get("catchlights", []) if catchlight_data.get("ok") else []

    pattern_result = _infer_pattern_from_catchlights(catchlight_list)
    modifier_result = _infer_modifier_from_catchlights(catchlight_list)

    # Triangle contrast gate: real triangle lighting wraps from 3 directions
    # producing low-to-moderate contrast.  Very high contrast weakens the
    # 3-light theory — extra catchlights may be reflections.
    # Soft gate: penalise confidence instead of hard-vetoing to "unknown",
    # so triangle can still win if other classifiers agree.
    if pattern_result.get("pattern") == "triangle" and cue_report is not None:
        _cr = getattr(cue_report, "contrast_ratio", None)
        _cr_label = (getattr(_cr, "label", "") if _cr else "").lower()
        if _cr_label in ("high", "extreme"):
            pattern_result = dict(pattern_result)  # don't mutate original
            _orig_conf = pattern_result.get("pattern_confidence", 0.5)
            _penalty = 0.5 if _cr_label == "extreme" else 0.35
            pattern_result["pattern_confidence"] = max(0.15, _orig_conf - _penalty)
            pattern_result["notes"] = pattern_result.get("notes", []) + [
                f"Triangle confidence penalised (−{_penalty:.2f}): {_cr_label} contrast "
                "weakens 3-light theory. Extra catchlights may be reflections."
            ]

    # Split asymmetry gate: a genuine 90° side key produces left-right
    # facial shadow asymmetry.  Low asymmetry weakens the split hypothesis.
    # Soft gate: penalise confidence proportionally instead of hard-vetoing
    # to "loop", so split can still win if other classifiers confirm it.
    if pattern_result.get("pattern") == "split" and cue_report is not None:
        _ls = getattr(cue_report, "light_structure", None)
        _lra = getattr(_ls, "left_right_asymmetry", None)
        if _lra is not None and _lra < 0.20:
            pattern_result = dict(pattern_result)
            _orig_conf = pattern_result.get("pattern_confidence", 0.5)
            # Scale penalty: 0.20 → small, 0.05 → large
            _penalty = 0.35 * (1.0 - _lra / 0.20)
            pattern_result["pattern_confidence"] = max(0.15, _orig_conf - _penalty)
            pattern_result["notes"] = pattern_result.get("notes", []) + [
                f"Split confidence penalised (−{_penalty:.2f}): left_right_asymmetry={_lra:.3f} "
                f"is low for a 90° side key (threshold 0.20). "
                "May be catchlight from reflective surface rather than key light."
            ]

    all_notes.extend(pattern_result.get("notes", []))

    # ── Cross-validate palette mood with catchlight pattern ──
    mood_result = _merge_with_classification(classification, pattern_result)
    all_notes.extend(mood_result.get("notes", []))

    # ── Skin tone ──
    skin_data = vision_data.get("skin_tone", {})
    detected_skin_tone = None
    skin_tone_conf = 0.0
    if skin_data and skin_data.get("ok"):
        raw_tone = skin_data.get("skin_tone_guess", "")
        detected_skin_tone = _SKIN_TONE_MAP.get(raw_tone, raw_tone or None)
        conf_label = skin_data.get("confidence", "low")
        skin_tone_conf = {"high": 0.8, "medium": 0.5, "low": 0.3}.get(conf_label, 0.3)

    # ── Background light ──
    bg_result = _infer_background_light(vision_data, cue_report=cue_report)
    all_notes.extend(bg_result.get("notes", []))

    # If background light detected, include it in the total light count
    total_lights = pattern_result["light_count"]
    if bg_result["detected"]:
        total_lights += 1

    # ── Cue-based enrichment (when available) ──
    if cue_report is not None and cue_report.ok and cue_report.cues_computed > 0:
        from engine.cue_inference import run_cue_inference_pipeline

        pipeline = run_cue_inference_pipeline(cue_report)
        setup_family = pipeline["setup_family"]
        source_quality = pipeline["source_quality"]

        # Confidence boosting: if cue-based inference agrees with catchlight-based
        if setup_family.primary_confidence > 0.3:
            cue_pattern = _map_setup_family_to_pattern(setup_family.primary_hypothesis)

            if cue_pattern == pattern_result["pattern"] and cue_pattern != "unknown":
                # Agreement — boost pattern confidence
                boost = min(0.15, setup_family.primary_confidence * 0.2)
                pattern_result["pattern_confidence"] = min(
                    0.95,
                    pattern_result["pattern_confidence"] + boost,
                )
                all_notes.append(
                    f"Cue-based analysis agrees with catchlight inference "
                    f"('{cue_pattern}') — confidence boosted by {boost:.2f}."
                )
            elif pattern_result["pattern"] == "unknown" and cue_pattern != "unknown":
                # Catchlights inconclusive but cues suggest a pattern
                pattern_result["pattern"] = cue_pattern
                pattern_result["pattern_confidence"] = setup_family.primary_confidence * 0.6
                all_notes.append(
                    f"Catchlights inconclusive; cue-based analysis suggests "
                    f"'{cue_pattern}' (confidence {setup_family.primary_confidence:.2f})."
                )
            elif cue_pattern != "unknown" and cue_pattern != pattern_result["pattern"]:
                # Disagreement — keep catchlight result, record alternative
                all_notes.append(
                    f"Cue-based analysis suggests '{cue_pattern}' but catchlights "
                    f"indicate '{pattern_result['pattern']}' — using catchlight result."
                )
                for alt in setup_family.alternate_hypotheses:
                    # alternate_hypotheses is List[FieldCandidate] — use attribute access
                    _alt_val = getattr(alt, "value", None) or alt.get("hypothesis", "") if isinstance(alt, dict) else alt.value
                    _alt_conf = getattr(alt, "confidence", 0.0) if not isinstance(alt, dict) else alt.get("confidence", 0.0)
                    all_notes.append(
                        f"Alternate hypothesis: {_alt_val} "
                        f"(confidence {_alt_conf:.2f})"
                    )

        # Enrich modifier when catchlights couldn't determine it
        if modifier_result["modifier"] is None and source_quality.key_modifier_family != "unknown":
            mapped = _map_cue_modifier(source_quality.key_modifier_family)
            if mapped is not None:
                modifier_result["modifier"] = mapped
                modifier_result["modifier_confidence"] = source_quality.confidence * 0.5
                all_notes.append(
                    f"Modifier inferred from cue analysis: {source_quality.key_modifier_family}"
                )

        # Forward ambiguity notes
        all_notes.extend(setup_family.ambiguity_notes)

    # ── Determine key light side (left / right / center) ──
    key_side = "unknown"
    earring_contamination_detected = False

    # From catchlight quadrants: the catchlight position tells us where the
    # light source is relative to the subject.
    if catchlight_list:
        left_eye = [c for c in catchlight_list if c.get("eye") == "left"]
        right_eye = [c for c in catchlight_list if c.get("eye") == "right"]

        # ── Cross-eye consistency check ──────────────────────────────────────
        # Large hoop earrings and other jewellery reflect into the lateral edge
        # of the near eye, creating a false "hard_right" or "hard_left"
        # catchlight that has no counterpart in the other eye.  Real key
        # catchlights appear at consistent clock positions in both eyes.
        #
        # Contamination heuristic: if both eyes have catchlights and one eye
        # has a dominant lateral catchlight (3 or 9 o'clock) that:
        #   (a) has no corresponding lateral catchlight in the other eye, AND
        #   (b) is larger (higher size_ratio) than the non-lateral catchlights
        #       in that same eye, OR is the only catchlight in that eye,
        # then treat it as a jewellery / specular contamination and exclude it
        # from the key-side vote, logging the flag.
        def _is_lateral(hour: Optional[int]) -> bool:
            return hour in (3, 9)

        def _dominant_hour(eye_cls: List[Dict[str, Any]]) -> Optional[int]:
            """Return the clock hour of the highest size_ratio catchlight."""
            if not eye_cls:
                return None
            best = max(eye_cls, key=lambda c: c.get("size_ratio", 0.0))
            return _clock_num(best.get("position", ""))

        filtered_catchlight_list = list(catchlight_list)  # start with full set

        if left_eye and right_eye:
            left_dominant_hour = _dominant_hour(left_eye)
            right_dominant_hour = _dominant_hour(right_eye)

            for (suspect_eye, other_eye, suspect_dominant) in [
                (left_eye, right_eye, left_dominant_hour),
                (right_eye, left_eye, right_dominant_hour),
            ]:
                if not _is_lateral(suspect_dominant):
                    continue
                # Check if the other eye also has a lateral dominant
                other_dominant = _dominant_hour(other_eye)
                if _is_lateral(other_dominant):
                    continue  # both eyes lateral → not an earring, likely hard side-light
                # Confirm the suspect is the largest in its eye
                suspect_sizes = [c.get("size_ratio", 0.0) for c in suspect_eye]
                suspect_entry = max(suspect_eye, key=lambda c: c.get("size_ratio", 0.0))
                non_lateral = [c for c in suspect_eye
                               if not _is_lateral(_clock_num(c.get("position", "")))]
                if non_lateral and not _vlm_jewellery_flag:
                    # Size-dominance guard: only exclude the lateral catchlight
                    # if it is the largest in its eye.  This avoids accidentally
                    # stripping a real side-key catchlight that happens to be
                    # slightly smaller than the key catchlight.
                    # When the VLM has already flagged jewellery contamination,
                    # skip this guard — the VLM's visual read of earrings
                    # overrides the size ambiguity.
                    max_non_lateral_size = max(c.get("size_ratio", 0.0) for c in non_lateral)
                    if suspect_entry.get("size_ratio", 0.0) <= max_non_lateral_size:
                        continue  # lateral catchlight is not dominant — keep it
                # Flag and remove the contaminated catchlight(s) from the vote
                contaminated = [
                    c for c in suspect_eye
                    if _is_lateral(_clock_num(c.get("position", "")))
                ]
                for c in contaminated:
                    if c in filtered_catchlight_list:
                        filtered_catchlight_list.remove(c)
                earring_contamination_detected = True
                vlm_confirm = " (VLM confirmed jewellery present)" if _vlm_jewellery_flag else ""
                all_notes.append(
                    f"Cross-eye consistency check: dominant lateral catchlight "
                    f"at {suspect_dominant} o'clock in one eye has no counterpart "
                    f"in the other eye — excluded from key-side vote "
                    f"(likely jewellery/specular contamination){vlm_confirm}."
                )

        # ── Re-derive pattern from clean (filtered) catchlight list ──────────
        # If contamination was detected, the original pattern_result was computed
        # from the raw catchlight list which included the spurious lateral
        # catchlight.  Re-run pattern inference on the filtered list so that
        # LightingInference.pattern reflects the clean signal.
        if earring_contamination_detected and filtered_catchlight_list != catchlight_list:
            _orig_pattern = pattern_result.get("pattern", "unknown")
            _clean_pattern = _infer_pattern_from_catchlights(filtered_catchlight_list)
            if _clean_pattern.get("pattern") not in (None, "unknown") or _orig_pattern == "split":
                # Only replace if we got a useful clean pattern OR
                # if the original was split (which we know is contaminated)
                pattern_result = dict(pattern_result)  # copy to avoid mutating original
                pattern_result["pattern"] = _clean_pattern.get("pattern", "unknown")
                pattern_result["pattern_confidence"] = _clean_pattern.get("pattern_confidence", 0.3)
                pattern_result["key_position_text"] = _clean_pattern.get("key_position_text", pattern_result.get("key_position_text", ""))
                all_notes.append(
                    f"Pattern re-derived from clean catchlight list after earring removal: "
                    f"'{pattern_result['pattern']}' (was '{_orig_pattern}')."
                )

        all_cls = (
            [c for c in filtered_catchlight_list if c.get("eye") in ("left", "right")]
            or filtered_catchlight_list
        )
        if not all_cls:
            all_cls = left_eye or right_eye  # fallback: use raw list if filter removed everything

        if all_cls:
            hours = [_clock_num(c.get("position", "")) for c in all_cls]
            hours = [h for h in hours if h is not None]
            if hours:
                # Majority-vote approach: classify each catchlight individually
                # and take the most common side.  This is more robust than
                # averaging clock positions, which can be skewed by a single
                # outlier (e.g. a floor reflection at 3 o'clock when three
                # other catchlights are at 10-11 o'clock).
                _CLOCK_TO_SIDE = {
                    "upper_left": "left", "hard_left": "left",
                    "upper_right": "right", "hard_right": "right",
                    "top_center": "center",
                    # "lower" and "other" are likely reflections, not key
                }
                side_votes = {"left": 0, "right": 0, "center": 0}
                for h in hours:
                    quadrant = _classify_clock(h)
                    mapped_side = _CLOCK_TO_SIDE.get(quadrant)
                    if mapped_side:
                        side_votes[mapped_side] += 1
                best_side = max(side_votes, key=side_votes.get)
                if side_votes[best_side] > 0:
                    key_side = best_side

    # From cue-based geometry (may override or fill gap)
    if cue_report is not None and cue_report.ok and cue_report.cues_computed > 0:
        try:
            from engine.cue_inference import infer_geometry
            geo = infer_geometry(cue_report)
            cue_dir = geo.key_light_direction  # "left", "right", "center", "unknown"
            if cue_dir != "unknown":
                if key_side == "unknown":
                    key_side = cue_dir
                elif key_side != cue_dir:
                    all_notes.append(
                        f"Catchlights suggest key from {key_side}, "
                        f"shadow analysis suggests {cue_dir}."
                    )
        except Exception:
            pass

    # Pattern-based direction fallback: some patterns have inherent key
    # positions.  When neither catchlights nor shadow analysis resolved
    # a direction, use the pattern itself as a weak signal.
    _pat = pattern_result.get("pattern", "unknown")
    if key_side == "unknown" and _pat in ("butterfly", "clamshell"):
        key_side = "center"   # overhead / on-axis
        all_notes.append(
            f"Key direction inferred as center from {_pat} pattern."
        )

    # ── Extract CCT, distance, environment from cue report ──
    _detected_cct = None
    _detected_distance = None
    _detected_env = None

    if cue_report is not None and cue_report.ok:
        # Color temperature from classification or cue report.
        # VLM classifiers return string descriptors ("warm", "cool", "daylight")
        # rather than numeric Kelvin values.  Map them so detected_cct_kelvin
        # is populated and the blueprint WB reflects the actual reference image.
        _CCT_STRING_TO_KELVIN = {
            "tungsten": 3200, "incandescent": 3200, "warm": 3200,
            "warm_white": 3800, "candle": 2700, "halogen": 3400,
            "neutral": 5500, "daylight": 5500, "strobe": 5500,
            "flash": 5500, "natural": 5600, "studio": 5600,
            "overcast": 6500, "cool": 6500, "cloudy": 6500,
            "shade": 7500, "open_shade": 7500, "blue_sky": 8000,
        }
        if classification and classification.get("colorTemperature"):
            ct = classification["colorTemperature"]
            if isinstance(ct, (int, float)) and ct > 0:
                _detected_cct = int(ct)
            elif isinstance(ct, str):
                _detected_cct = _CCT_STRING_TO_KELVIN.get(ct.lower().strip())

        # Environment from cue-based inference (already ran above)
        if cue_report.cues_computed > 0:
            try:
                from engine.cue_inference import infer_environment
                env_result = infer_environment(cue_report)
                if env_result.environment_type != "unknown":
                    _detected_env = env_result.environment_type
            except Exception:
                pass

    # Phase 2: Detect whether face mesh was available
    _cl_reason = (catchlight_data.get("reason") or "").lower() if isinstance(catchlight_data, dict) else ""
    _has_face_mesh = "no_face_mesh" not in _cl_reason
    _data_quality = "full" if _has_face_mesh else "face_limited"

    # ── Layer 0: catchlight intelligence ──
    _catchlight_intel = _build_catchlight_intelligence(catchlight_list)

    # ── Light count reconciliation ──
    # Compare pattern-derived light count against catchlight-derived count.
    # A divergence flags where the two inference paths disagree — useful for
    # triage and future rule refinement.  No confidence change; informational only.
    _cl_light_count = (_catchlight_intel or {}).get("light_count_from_catchlights", 0)
    if _cl_light_count > 0 and abs(_cl_light_count - total_lights) >= 2:
        all_notes.append(
            f"Light count divergence: pattern inference → {total_lights}, "
            f"catchlight intelligence → {_cl_light_count}. "
            "One path may be over- or under-counting (background light, reflectors, or missed catchlights)."
        )

    # Promote catchlight intelligence modifier type over the raw shape vote.
    # _infer_modifier_from_catchlights votes across ALL raw catchlights (including
    # softbox edge secondaries that tip the strip count).  _build_catchlight_intelligence
    # uses only credible, role-classified source catchlights with per-source shape
    # analysis — the primary key catchlight shape is the authoritative reading.
    _ci_mod = (_catchlight_intel or {}).get("modifier") or {}
    if _ci_mod.get("type"):
        modifier_result["modifier"] = _ci_mod["type"]
        modifier_result["modifier_confidence"] = max(
            modifier_result.get("modifier_confidence", 0.0),
            0.65,
        )

    return LightingInference(
        pattern=pattern_result["pattern"],
        pattern_confidence=pattern_result["pattern_confidence"],
        modifier_family=modifier_result["modifier"],
        modifier_confidence=modifier_result["modifier_confidence"],
        light_count=total_lights,
        key_position_text=pattern_result["key_position_text"],
        key_side=key_side,
        fill_method_text=pattern_result["fill_method_text"],
        detected_mood=mood_result["detected_mood"],
        mood_confidence=mood_result["mood_confidence"],
        detected_skin_tone=detected_skin_tone,
        skin_tone_confidence=skin_tone_conf,
        background_light_detected=bg_result["detected"],
        background_light_confidence=bg_result["confidence"],
        detected_cct_kelvin=_detected_cct,
        detected_distance_class=_detected_distance,
        detected_environment=_detected_env,
        unrecognized_details=pattern_result.get("unrecognized_details", []),
        notes=all_notes,
        cue_report=cue_report,
        face_mesh_available=_has_face_mesh,
        data_quality=_data_quality,
        earring_catchlight_contamination=earring_contamination_detected,
        catchlight_intelligence=_catchlight_intel,
    )


def _map_setup_family_to_pattern(setup_family: str) -> str:
    """Map setup family names to existing pattern vocabulary."""
    mapping = {
        "single_key_rembrandt": "rembrandt",
        "single_key_split": "split",
        "single_key_loop": "loop",
        "clamshell_beauty": "clamshell",
        "triangle_headshot": "triangle",
        "butterfly_paramount": "loop",
        "window_light": "loop",
        "natural_ambient": "unknown",
        "dramatic_chiaroscuro": "rembrandt",
        "gobo_projection": "projected",
        "slit_cut_light": "projected",
    }
    return mapping.get(setup_family, "unknown")


def _map_cue_modifier(cue_modifier: str) -> Optional[str]:
    """Map cue modifier family names to existing modifier vocabulary."""
    mapping = {
        "beauty_dish": "beauty_dish",
        "softbox": "softbox_rect",
        "umbrella": "softbox_rect",
        "hard_source": None,
        "window": None,
        "ambient": None,
    }
    return mapping.get(cue_modifier)


# ── Catchlight → diagram-light matching ───────────────────────────────────
# Maps each detected catchlight back to the diagram light it supports.

# Which clock quadrants correspond to which diagram-light role, per pattern.
_ROLE_QUADRANT_MAP: Dict[str, Dict[str, set]] = {
    "triangle": {
        "key_left":  {"upper_left"},
        "key_right": {"upper_right", "top_center"},
        "fill_low":  {"lower"},
    },
    "clamshell": {
        "key":  {"upper_left", "upper_right", "top_center"},
        "fill": {"lower"},
    },
    "butterfly": {
        "key": {"upper_left", "upper_right", "top_center"},
    },
    "rembrandt": {
        # Key can be on either side — left or right — depending on which side
        # the subject's lit cheek faces the camera.
        "key": {"upper_left", "upper_right"},
    },
    "loop": {
        # Loop key can also be on either side; top_center → slight front elevation.
        "key": {"upper_left", "upper_right", "top_center"},
    },
    "split": {
        "key": {"hard_left", "hard_right"},
    },
    "broad": {
        # Broad = key illuminates the camera-facing cheek; same quadrant
        # positions as loop but on the broad side of the face.
        "key": {"upper_left", "upper_right", "top_center"},
    },
    "short": {
        # Short = key illuminates the turned-away cheek; same physical
        # positions as loop/rembrandt but on the short (far) side.
        "key": {"upper_left", "upper_right"},
    },
    "flat": {
        # Flat = even, non-directional light; key position is ambiguous
        # or centered — accept all upper/center quadrants.
        "key": {"upper_left", "upper_right", "top_center"},
    },
}


def match_catchlights_to_diagram(
    diagram_lights: List[Dict[str, Any]],
    catchlights: List[Dict[str, Any]],
    pattern: str,
) -> List[Dict[str, Any]]:
    """Annotate each diagram light with the catchlights that support it.

    Returns a *new* list of diagram-light dicts, each augmented with a
    ``detectedFrom`` key containing the matching catchlight entries.
    Lights with no matching catchlights get an empty list.

    Args:
        diagram_lights: Light dicts from ``DiagramSpec.model_dump()["lights"]``.
        catchlights: Raw catchlight list from the vision pipeline.
        pattern: The detected pattern name (e.g., ``"triangle"``).
    """
    quad_map = _ROLE_QUADRANT_MAP.get(pattern, {})
    enriched: List[Dict[str, Any]] = []

    for light in diagram_lights:
        role = light.get("role", "")
        target_quads = quad_map.get(role, set())

        matched: List[Dict[str, Any]] = []
        for c in catchlights:
            hour = _clock_num(c.get("position", ""))
            if hour is not None:
                quad = _classify_clock(hour)
                if quad in target_quads:
                    matched.append(c)

        out = dict(light)
        out["detectedFrom"] = matched
        enriched.append(out)

    return enriched


# ── Description generators ────────────────────────────────────────────────
# Human-readable narratives for photographers, describing what the vision
# pipeline sees in the reference image.

_PATTERN_DESCRIPTIONS: Dict[str, str] = {
    "triangle": (
        "Triangle (Hurley-style) lighting — three light sources forming a "
        "triangle pattern of catchlights. Two flanking keys placed at roughly "
        "10 and 2 o'clock with a lower fill at 5–6 o'clock. This produces "
        "even, flattering light with three-dimensional depth and is a hallmark "
        "of Peter Hurley's headshot technique."
    ),
    "clamshell": (
        "Clamshell lighting — two vertically stacked sources, one above and one "
        "below the face. The upper key provides the primary shaping while the "
        "lower fill (often a reflector) opens shadows under the chin and nose. "
        "This classic beauty setup minimises skin texture and creates "
        "symmetrical, flattering light."
    ),
    "butterfly": (
        "Butterfly (paramount) lighting — a single key light positioned directly "
        "above and in front of the subject, creating a symmetrical shadow beneath "
        "the nose. Named for the butterfly-shaped shadow it produces. A hallmark "
        "of classic Hollywood glamour and beauty photography."
    ),
    "rembrandt": (
        "Rembrandt-style lighting — a single key light placed roughly 45° off-axis "
        "and above the subject, creating the signature triangle of light on the "
        "shadow-side cheek. Named after the painter's use of this dramatic yet "
        "natural-looking pattern. Strong sense of dimension and mood."
    ),
    "loop": (
        "Loop lighting — the key light is positioned about 30° off-axis and slightly "
        "above, casting a small shadow of the nose that loops downward without "
        "reaching the lip. Versatile, flattering for most face shapes, and the "
        "most commonly used portrait lighting pattern."
    ),
    "split": (
        "Split lighting — the key light is placed at roughly 90° to the subject, "
        "illuminating exactly half the face while leaving the other half in deep "
        "shadow. Creates maximum drama and dimension. Often used in cinematic "
        "and editorial work for its bold, graphic look."
    ),
    "broad": (
        "Broad lighting — the key light illuminates the wider, camera-facing side "
        "of the face. This opens up the facial plane and can make faces appear "
        "wider. Common in corporate headshots and editorial work where a "
        "welcoming, approachable look is desired."
    ),
    "short": (
        "Short lighting — the key light illuminates the narrower, turned-away side "
        "of the face, placing the camera-facing cheek in shadow. This slims the "
        "face and adds depth and drama. A classic cinematic and editorial choice "
        "for creating mood and dimension."
    ),
    "flat": (
        "Flat lighting — even, non-directional illumination with minimal shadow "
        "depth across the face. Typically produced by large, frontal light sources "
        "or ambient wrap. Common in corporate photography, beauty retouching "
        "workflows, and high-key commercial setups."
    ),
    "unknown": (
        "The lighting pattern could not be identified with certainty. This may "
        "indicate ambient or mixed lighting, an unconventional setup, or "
        "catchlights that were too small or obscured to read reliably."
    ),
}

_MODIFIER_DESCRIPTIONS: Dict[str, str] = {
    "beauty_dish": (
        "Beauty dish — produces a focused, slightly contrasty light with a "
        "distinctive round catchlight. The parabolic reflector creates light "
        "that's harder than a softbox but softer than bare flash, ideal for "
        "skin texture and definition."
    ),
    "softbox_rect": (
        "Rectangular softbox — produces broad, even, diffused light with soft "
        "shadow transitions. The rectangular catchlight is a telltale sign. "
        "Workhorse modifier for corporate and beauty work."
    ),
    "softbox": (
        "Softbox — broad, diffused light source that wraps around the subject. "
        "Creates soft shadow transitions and even illumination."
    ),
}

_MOOD_DESCRIPTIONS: Dict[str, str] = {
    "beauty": "Beauty — soft, flattering, minimal shadows. Designed to make skin glow.",
    "cinematic": "Cinematic — dramatic contrast, warm tones, strong directional light with deep shadows.",
    "corporate": "Corporate/Clean — even, professional lighting. Moderate contrast, neutral tones.",
    "editorial": "Editorial — bold, graphic light with strong angles and hard shadows for visual impact.",
    "natural": "Natural — soft, window-like quality simulating available light. Gentle, organic feel.",
    "high_key": "High key — bright, airy, minimal shadows. Background often blown white.",
    "low_key": "Low key — dark, moody. Single directional source with deep blacks and minimal fill.",
}


def describe_catchlights(
    catchlight_data: Dict[str, Any],
    inference: LightingInference,
) -> Dict[str, Any]:
    """Generate a photographer-friendly description of the detected catchlights.

    Args:
        catchlight_data: The ``catchlights`` dict from vision pipeline
                         (contains ``ok``, ``count``, ``catchlights`` list, ``inferred``).
        inference: The ``LightingInference`` built from this data.

    Returns:
        Dict with ``summary``, ``details`` list, and ``whatTheyReveal``.
    """
    if not catchlight_data or not catchlight_data.get("ok"):
        return {
            "summary": "No catchlights were detected in this image.",
            "details": [],
            "whatTheyReveal": (
                "Without visible catchlights, the lighting setup cannot be "
                "reverse-engineered from the eyes. The subject may have been "
                "looking away, eyes closed, or the light sources too diffuse "
                "to register as distinct reflections."
            ),
        }

    items = catchlight_data.get("catchlights", [])
    count = catchlight_data.get("count", len(items))
    inferred = catchlight_data.get("inferred", {})

    # Group by eye for description
    left = [c for c in items if c.get("eye") == "left"]
    right = [c for c in items if c.get("eye") == "right"]

    details: List[str] = []
    for eye_label, eye_list in [("Left eye", left), ("Right eye", right)]:
        if not eye_list:
            continue
        positions = []
        for c in eye_list:
            pos = c.get("position", "unknown")
            shape = c.get("shape", "unknown")
            intensity = c.get("intensity", 0)
            strength = "bright" if intensity > 0.7 else "moderate" if intensity > 0.4 else "faint"
            positions.append(f"{strength} {shape} highlight at {pos}")
        details.append(f"{eye_label}: {'; '.join(positions)}.")

    # Build summary
    if count == 0:
        summary = "No distinct catchlights detected."
    elif count == 1:
        shape = items[0].get("shape", "unknown")
        pos = items[0].get("position", "unknown position")
        summary = f"One {shape} catchlight at {pos}, indicating a single light source."
    elif count == 2:
        shapes = [c.get("shape", "unknown") for c in items]
        dominant = shapes[0] if shapes[0] == shapes[1] else "mixed"
        summary = (
            f"Two catchlights detected ({dominant} shape), "
            f"consistent with a two-light setup."
        )
    elif count == 3:
        summary = (
            f"Three catchlights detected per eye, consistent with a "
            f"three-light setup (likely triangle/Hurley-style)."
        )
    else:
        summary = f"{count} catchlights detected per eye — multi-light setup."

    # What the catchlights reveal
    reveals = []
    if inferred.get("keyLightPosition"):
        reveals.append(f"Key light position: {inferred['keyLightPosition']}.")
    if inferred.get("likelyModifier"):
        reveals.append(f"Likely modifier: {inferred['likelyModifier']}.")
    if inference.pattern and inference.pattern != "unknown":
        reveals.append(
            f"Pattern identified: {inference.pattern} "
            f"(confidence: {round(inference.pattern_confidence * 100)}%)."
        )

    return {
        "summary": summary,
        "details": details,
        "whatTheyReveal": " ".join(reveals) if reveals else (
            "Catchlight positions were detected but did not map to a "
            "recognisable lighting pattern with high confidence."
        ),
    }


def describe_light_quality(
    classification: Optional[Dict[str, Any]],
    palette: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Describe the overall light quality inferred from palette and classification.

    Returns dict with ``quality`` (hard/soft), ``colorTemperature``, ``brightness``,
    ``direction``, and ``summary``.
    """
    if not classification:
        return {
            "quality": "unknown",
            "colorTemperature": "unknown",
            "brightness": "unknown",
            "direction": "unknown",
            "summary": "Light quality could not be determined from this image.",
        }

    quality = classification.get("lightQuality", "unknown")
    temp = classification.get("colorTemperature", "unknown")
    brightness = classification.get("brightness", "unknown")

    quality_text = {
        "hard": "Hard light with defined shadow edges — typical of bare flash, grid spots, or direct sun.",
        "soft": "Soft, diffused light with gentle shadow transitions — typical of softboxes, umbrellas, or overcast sky.",
    }.get(quality, "Light quality undetermined.")

    temp_text = {
        "warm": "Warm colour temperature (below ~5000 K) — golden/amber tones, possibly CTO-gelled or tungsten.",
        "cool": "Cool colour temperature (above ~6000 K) — blueish tones, possibly daylight-balanced or slightly blue-gelled.",
        "neutral": "Neutral colour temperature (~5000–5500 K) — balanced daylight tones.",
    }.get(temp, "Colour temperature undetermined.")

    bright_text = {
        "low": "Low overall brightness — deep shadows dominate, consistent with low-key or dramatic lighting.",
        "medium": "Medium brightness — balanced exposure with a mix of highlights and shadows.",
        "high": "High overall brightness — bright, open lighting with minimal deep shadows. Possibly high-key.",
    }.get(brightness, "")

    # Direction hint from classification
    recipe = classification.get("suggestedRecipe") or ""
    if "rembrandt" in recipe:
        direction = "Strong side light (roughly 45° off-axis)"
    elif "clamshell" in recipe or "butterfly" in recipe:
        direction = "Frontal, on-axis lighting (key directly above camera)"
    elif "split" in recipe:
        direction = "Hard side light (roughly 90° off-axis)"
    elif "loop" in recipe:
        direction = "Slightly off-axis (roughly 30° from camera)"
    else:
        direction = "Direction not definitively determined from palette alone"

    parts = [quality_text, temp_text]
    if bright_text:
        parts.append(bright_text)
    parts.append(f"Direction: {direction}.")

    return {
        "quality": quality,
        "colorTemperature": temp,
        "brightness": brightness,
        "direction": direction,
        "summary": " ".join(parts),
    }


def describe_background(
    vision_data: Optional[Dict[str, Any]],
    overall_palette: Optional[Dict[str, Any]],
    inference: Optional[LightingInference] = None,
) -> Dict[str, Any]:
    """Describe background characteristics from segmentation and palette data.

    Args:
        vision_data: The ``vision`` dict from describe_image (contains region_attribution).
        overall_palette: The top-level ``palette`` dict.
        inference: Optional ``LightingInference`` for background-light info.

    Returns:
        Dict with ``summary``, ``dominantColors``, ``backgroundRatio``,
        ``backgroundLight``, and ``notes``.
    """
    if not vision_data:
        return {
            "summary": "Background could not be analyzed.",
            "dominantColors": [],
            "backgroundRatio": None,
            "backgroundLight": None,
            "notes": [],
        }

    region = vision_data.get("region_attribution", {})
    masks = region.get("masks", {})
    palettes = region.get("palettes", {})

    bg_ratio = masks.get("background_ratio")
    bg_palette = palettes.get("background_palette", [])

    notes: List[str] = []

    # Dominant background colours
    color_names = [c.get("name", "unknown") for c in bg_palette[:3]]

    # Determine background character
    if bg_palette:
        avg_luma = sum(
            sum(c.get("rgb", [128, 128, 128])) / 3 for c in bg_palette
        ) / len(bg_palette)

        if avg_luma > 220:
            bg_char = "near-white or blown-out background (high-key style)"
            notes.append("Very bright background — likely intentionally overexposed or a white sweep.")
        elif avg_luma > 180:
            bg_char = "bright, light-toned background"
        elif avg_luma > 80:
            bg_char = "mid-tone background"
        elif avg_luma > 40:
            bg_char = "dark background"
            notes.append("Dark background suggests studio with controlled spill or low-key intent.")
        else:
            bg_char = "very dark or black background (low-key style)"
            notes.append("Near-black background — minimal light spill, subject fully isolated.")
    else:
        bg_char = "background could not be isolated"

    # Background ratio description
    ratio_desc = ""
    if bg_ratio is not None:
        pct = round(bg_ratio * 100)
        if pct > 60:
            ratio_desc = f"Background occupies ~{pct}% of the frame — wider framing with environmental context."
        elif pct > 30:
            ratio_desc = f"Background occupies ~{pct}% of the frame — typical portrait framing."
        else:
            ratio_desc = f"Background occupies only ~{pct}% of the frame — tight crop, subject fills the frame."

    # Background light detection
    bg_light_info: Optional[Dict[str, Any]] = None
    if inference and inference.background_light_detected:
        conf_label = (
            "high confidence" if inference.background_light_confidence >= 0.7 else
            "moderate confidence" if inference.background_light_confidence >= 0.4 else
            "low confidence"
        )
        bg_light_info = {
            "detected": True,
            "confidence": inference.background_light_confidence,
            "confidenceLabel": conf_label,
            "description": (
                "A dedicated background light was detected based on the brightness "
                "of the backdrop. This light illuminates the background independently "
                "of the subject lighting, creating separation and depth."
            ),
        }
        notes.append(
            f"Background light detected ({conf_label}) — "
            "backdrop is independently illuminated."
        )

    summary_parts = [bg_char.capitalize() + "."]
    if color_names:
        summary_parts.append(f"Dominant tones: {', '.join(color_names)}.")
    if ratio_desc:
        summary_parts.append(ratio_desc)
    if bg_light_info:
        summary_parts.append("A dedicated background light appears to be in use.")

    return {
        "summary": " ".join(summary_parts),
        "dominantColors": color_names,
        "backgroundRatio": round(bg_ratio, 2) if bg_ratio is not None else None,
        "backgroundLight": bg_light_info,
        "notes": notes,
    }


def describe_pattern(inference: LightingInference) -> Dict[str, Any]:
    """Human-readable description of the detected lighting pattern.

    Returns dict with ``name``, ``description``, ``confidence``, ``lightCount``,
    ``keyPosition``, ``fillMethod``.
    """
    pattern = inference.pattern
    conf = inference.pattern_confidence

    conf_label = (
        "high confidence" if conf >= 0.7 else
        "moderate confidence" if conf >= 0.4 else
        "low confidence"
    )

    return {
        "name": pattern,
        "description": _PATTERN_DESCRIPTIONS.get(pattern, _PATTERN_DESCRIPTIONS["unknown"]),
        "confidence": conf,
        "confidenceLabel": conf_label,
        "lightCount": inference.light_count,
        "keyPosition": inference.key_position_text or "undetermined",
        "fillMethod": inference.fill_method_text or "no fill detected",
        "modifier": {
            "name": inference.modifier_family or "unknown",
            "description": _MODIFIER_DESCRIPTIONS.get(
                inference.modifier_family or "", "Modifier could not be determined."
            ),
            "confidence": inference.modifier_confidence,
        },
        "mood": {
            "name": inference.detected_mood or "unknown",
            "description": _MOOD_DESCRIPTIONS.get(
                inference.detected_mood or "", "Mood could not be classified."
            ),
            "confidence": inference.mood_confidence,
        },
    }


def describe_subject(
    vision_data: Optional[Dict[str, Any]],
    image_analysis: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Describe the subject's position, pose, and framing.

    Args:
        vision_data: The ``vision`` dict from describe_image.
        image_analysis: The full ``describe_image()`` result (for grayscale flag, etc.).

    Returns:
        Dict with ``pose``, ``angle``, ``framing``, ``skinTone``, and ``summary``.
    """
    if not vision_data:
        return {
            "pose": "unknown",
            "angle": "unknown",
            "framing": "unknown",
            "skinTone": None,
            "summary": "Subject could not be analyzed.",
        }

    pose_data = vision_data.get("pose", {})
    region = vision_data.get("region_attribution", {})
    masks = region.get("masks", {})
    skin_data = vision_data.get("skin_tone", {})

    pose = pose_data.get("pose", "unknown") if pose_data.get("ok") else "unknown"
    angle = pose_data.get("angle", "unknown") if pose_data.get("ok") else "unknown"
    visibility = pose_data.get("visibility", 0) if pose_data.get("ok") else 0

    # Pose description
    is_grayscale = (image_analysis or {}).get("is_grayscale_like", False)
    pose_text = {
        "standing": "Subject is standing",
        "sitting": "Subject is seated",
        "headshot": "Close-up headshot",
        "upper_body": "Upper-body framing (head and torso visible)",
    }.get(pose, None)
    if pose_text is None:
        if not pose_data.get("ok") and is_grayscale:
            pose_text = "Pose could not be detected (B&W processing may limit landmark detection)"
        elif not pose_data.get("ok"):
            pose_text = "Pose could not be detected (landmarks not found)"
        else:
            pose_text = "Subject's pose is not clearly determined"

    # Angle description
    angle_text = {
        "front-ish": "facing the camera (front-on or near-front angle)",
        "profile-ish": "turned to the side (profile or three-quarter angle)",
    }.get(angle, "at an undetermined angle")

    # Framing: landmark-based framing takes priority (it knows which body
    # parts are visible), then fall back to person_ratio as a fill estimate.
    # Exception: when person_ratio is very low (<15%) and landmarks say
    # "full_body", the detection is almost certainly wrong — the subject
    # occupies a tiny slice of the frame (tight crop, or heavy shadow
    # masking in gobo/chiaroscuro setups).  Override to tight crop.
    pose_framing = pose_data.get("framing") if pose_data.get("ok") else None
    person_ratio = masks.get("person_ratio")
    background_ratio = masks.get("background_ratio", 0.0) or 0.0
    pct = round(person_ratio * 100) if person_ratio is not None else None

    if pose_framing == "headshot":
        framing = "tight crop — headshot framing (shoulders visible, lower body cropped)"
    elif pose_framing == "half_body":
        framing = "half-body framing — head and torso visible, legs cropped"
    elif pose_framing == "full_body":
        if pct is not None and pct < 15:
            # Very low person_ratio contradicts "full_body" — likely a tight
            # crop where landmarks were unreliable (gobo masking, B&W, etc.)
            framing = "close-up or tight crop (landmark framing unreliable at this coverage)"
            # Also correct the pose label — "standing" from a tiny mask is wrong
            if pose in ("standing",):
                pose = "unknown"
                pose_text = "Subject's pose could not be reliably determined"
        elif pct is not None and pct > 50:
            framing = "full-body framing — subject fills the frame"
        elif pct is not None and pct > 20:
            framing = "full-body framing — subject in environmental context"
        else:
            framing = "full-body framing detected from landmarks"
    elif pct is not None:
        # No landmark framing available — fall back to ratio-based guess
        if pct > 60:
            framing = "tight crop — subject fills most of the frame"
        elif pct > 30:
            framing = "medium fill — subject occupies a moderate portion of the frame"
        elif pct > 15:
            framing = "wide framing — subject in environmental context"
        else:
            framing = "environmental framing — subject is a small part of the scene"
    else:
        framing = "framing could not be determined"

    # Skin tone
    skin_tone_desc = None
    if skin_data and skin_data.get("ok"):
        raw = skin_data.get("skin_tone_guess", "")
        conf = skin_data.get("confidence", "low")
        skin_tone_desc = f"{raw} skin tone ({conf} confidence)"

    # Face box → position in frame
    face_box = region.get("face_box")
    face_position = ""
    if face_box and len(face_box) == 4:
        cx = (face_box[0] + face_box[2]) / 2
        if cx < 0.4:
            face_position = "Face is positioned left of centre in the frame."
        elif cx > 0.6:
            face_position = "Face is positioned right of centre in the frame."
        else:
            face_position = "Face is centred in the frame."

    summary_parts = [f"{pose_text}, {angle_text}."]
    summary_parts.append(f"Framing: {framing}.")
    if face_position:
        summary_parts.append(face_position)
    if skin_tone_desc:
        summary_parts.append(f"Detected {skin_tone_desc}.")
    if visibility > 0:
        vis_label = (
            "good" if visibility > 0.7 else
            "partial" if visibility > 0.4 else
            "limited"
        )
        summary_parts.append(f"Body landmark visibility: {vis_label}.")

    # Pose source note (mask fallback vs landmarks)
    if pose_data.get("source") == "mask_fallback":
        summary_parts.append("(Pose estimated from silhouette shape.)")

    # Background environment
    # Override outdoor classification when strong studio indicators are present:
    # - Very high background_ratio (>0.75) with dominant dark tones
    # - Low person_ratio with high contrast (dramatic studio setup)
    bg_env = vision_data.get("background_environment", {}) if vision_data else {}
    environment_desc = None
    if bg_env.get("ok"):
        env_type = bg_env.get("environment", "unknown")
        hints = bg_env.get("hints", [])

        # Heuristic override: "outdoor" is likely wrong when background is
        # predominantly dark (studio/dramatic setup) or person_ratio is tiny.
        if env_type == "outdoor" and background_ratio > 0.75:
            # Check if the image analysis suggests this is a controlled/dark setup
            bg_colors = (image_analysis or {}).get("background", {}).get("dominantColors", [])
            bg_colors_lower = [c.lower() for c in (bg_colors or [])]
            is_dark_bg = any(c in bg_colors_lower for c in ("black", "dark gray", "dark grey"))
            if is_dark_bg:
                env_type = "studio"
                hints = []  # Clear misleading outdoor hints

        env_parts = []
        if env_type == "outdoor":
            env_parts.append("Outdoor setting")
            if "natural_sunlight" in hints:
                env_parts.append("with natural sunlight")
            if "foliage" in hints or "possible_foliage" in hints:
                env_parts.append("with foliage/plants visible")
            if "directional_light" in hints and "natural_sunlight" not in hints:
                env_parts.append("with directional light")
        elif env_type == "studio":
            env_parts.append("Studio or controlled environment")
        if env_parts:
            environment_desc = " ".join(env_parts) + "."
            summary_parts.append(environment_desc)

    return {
        "pose": pose,
        "angle": angle,
        "framing": framing,
        "skinTone": skin_tone_desc,
        "facePosition": face_position or None,
        "environment": environment_desc,
        "summary": " ".join(summary_parts),
    }


def build_reference_description(
    vision_data: Dict[str, Any],
    classification: Optional[Dict[str, Any]],
    image_analysis: Dict[str, Any],
    inference: LightingInference,
    cue_report: Optional[Any] = None,
    vlm_description: Optional[Any] = None,
) -> Dict[str, Any]:
    """Build the complete human-readable description bundle for a reference image.

    This is the single entry point called from the route handler.  It assembles
    descriptions of catchlights, light quality, background, pattern, and subject
    into one dict suitable for inclusion in the API response.

    Args:
        vision_data: The ``vision`` sub-dict from ``describe_image()``.
        classification: The ``classification`` sub-dict.
        image_analysis: The full ``describe_image()`` result (for palette, etc.).
        inference: The ``LightingInference`` already computed for this image.
        cue_report: Optional ``VisualCueReport`` — when provided, adds the
                    three-layer ``referenceAnalysis`` to the result.
        vlm_description: Optional ``VLMDescription`` — when provided, enriches
                    the image_read layer with VLM-derived subject details.

    Returns:
        Dict with keys: ``catchlights``, ``lightQuality``, ``background``,
        ``pattern``, ``subject``, and optionally ``referenceAnalysis``.
    """
    catchlight_data = vision_data.get("catchlights", {}) if vision_data else {}
    overall_palette = image_analysis.get("palette") if image_analysis else None

    result = {
        "catchlights": describe_catchlights(catchlight_data, inference),
        "lightQuality": describe_light_quality(classification, overall_palette),
        "background": describe_background(vision_data, overall_palette, inference=inference),
        "pattern": describe_pattern(inference),
        "subject": describe_subject(vision_data, image_analysis=image_analysis),
    }

    if cue_report is not None:
        try:
            from engine.reference_read import build_reference_photo_analysis

            analysis_obj = build_reference_photo_analysis(
                vision_data=vision_data,
                classification=classification,
                cue_report=cue_report,
                lighting_intel=inference,
                image_analysis=image_analysis,
                vlm_description=vlm_description,
            )
            result["referenceAnalysis"] = analysis_obj.model_dump()
        except Exception:
            pass  # reference analysis is best-effort

    return result
