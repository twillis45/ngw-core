"""Three-layer reference photo analysis: image_read, lighting_read, recreation_setup.

This module sits ON TOP of the existing cue extraction and inference pipeline.
It consumes already-computed data (VisualCueReport, cue inference stages,
LightingInference) and synthesises photographer-useful structured output.

No new CV or I/O operations are performed here.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.constants import (
    BG,
    CATCHLIGHT,
    CONFIDENCE,
    DRAMATIC,
    FRAMING,
    GENRE,
    GOBO,
    RESOLUTION,
    TONAL,
)

from engine.image_analysis_models import (
    ColorPalette,
    DramaticLightSignals,
    ImageRead,
    LightingRead,
    RecreationSetup,
    ReferencePhotoAnalysis,
    SceneContext,
    VisualCueReport,
)


# ─── Resolution quality ───────────────────────────────────────────────────

# The resolution_quality metric tells the photographer how COMPLETE the
# analysis is (how many fields were resolved with meaningful content),
# independent of the confidence value (which reflects upstream data
# availability).  A gobo image may have low confidence (no catchlights,
# no skin, heuristic-only) but excellent resolution (28/28 fields).

_IMAGE_READ_SCORABLE = (
    "genre", "visual_intent", "mood", "camera_subject_relationship",
    "pose_notes", "background_relationship", "contrast_shadow_feel",
    "notable_visual_devices", "narrative",
)
_LIGHTING_READ_SCORABLE = (
    "source_quality", "source_direction", "shadow_pattern", "fill_presence",
    "rim_presence", "lighting_family", "tonal_processing_notes",
    "key_observations", "ambiguity_notes",
)
_RECREATION_SCORABLE = (
    "setup_family", "modifier_suggestion", "key_placement", "fill_strategy",
    "background_strategy", "camera_subject_guidance", "setup_notes",
    "alternate_hypotheses",
)


def _compute_resolution_quality(obj: Any, scorable_fields: tuple) -> str:
    """Compute resolution quality from resolved field ratio.

    Returns one of: excellent | good | fair | poor
    """
    total = len(scorable_fields)
    if total == 0:
        return "unknown"
    resolved = 0
    for field in scorable_fields:
        val = getattr(obj, field, None)
        if val is None:
            continue
        if isinstance(val, str) and val in ("", "unknown"):
            continue
        if isinstance(val, list) and len(val) == 0:
            continue
        if isinstance(val, int) and val == 0 and field == "light_count":
            continue
        resolved += 1
    pct = resolved / total * 100
    if pct >= RESOLUTION.EXCELLENT:
        return "excellent"
    elif pct >= RESOLUTION.GOOD:
        return "good"
    elif pct >= RESOLUTION.FAIR:
        return "fair"
    return "poor"


# ─── Helpers ──────────────────────────────────────────────────────────────


def _modifier_to_source_quality(modifier: str) -> str:
    """Map modifier to source quality using canonical mapping."""
    from engine.lighting_simulator import modifier_quality
    # Handle legacy aliases not in the canonical enum
    _LEGACY_ALIASES = {"hard_source": "bare_bulb", "ambient": "window"}
    canonical = _LEGACY_ALIASES.get(modifier, modifier)
    return modifier_quality(canonical)

_MODIFIER_TO_PRACTICAL = {
    "softbox": "medium softbox (2x3 or similar)",
    "umbrella": "shoot-through or reflective umbrella",
    "beauty_dish": "beauty dish with or without sock",
    "mola": "Mola deep parabolic reflector (Setti 28\" or Euro 33.5\")",
    "mola_reflector": "Mola deep parabolic reflector (Setti 28\" or Euro 33.5\")",
    "hard_source": "head with standard reflector, fresnel, or zoom reflector",
    "ellipsoidal": "ETC Source Four (or similar ellipsoidal) with gobo gate",
    "optical_snoot": "optical snoot / projection attachment on strobe",
    "gobo": "gobo / projection pattern in gate slot or optical snoot",
    "window": "large window or scrim as key",
    "ambient": "ambient / available light",
}

_DIRECTION_TO_TEXT = {
    "upper_left": "camera-left, ~45 degrees, elevated",
    "upper_right": "camera-right, ~45 degrees, elevated",
    "left": "camera-left, ~90 degrees",
    "right": "camera-right, ~90 degrees",
    "top_center": "directly above, centred",
    "lower_left": "camera-left, slightly below eye level",
    "lower_right": "camera-right, slightly below eye level",
    "below": "below subject",
}

# Clock position (1–12) from catchlight → key light direction.
# Catchlight at N o'clock means the light source IS at that clock position.
_CLOCK_TO_DIRECTION = {
    1: "upper_right",
    2: "upper_right",
    3: "right",
    4: "right",
    5: "lower_right",
    6: "below",
    7: "lower_left",
    8: "left",
    9: "left",
    10: "upper_left",
    11: "upper_left",
    12: "top_center",
}


def _parse_clock_position(pos_text: str) -> Optional[int]:
    """Parse '5 o'clock' into 5."""
    import re
    m = re.match(r"(\d+)\s*o'?clock", pos_text.lower().strip())
    if m:
        val = int(m.group(1))
        if 1 <= val <= 12:
            return val
    return None

# Geometry inference stores shadow-fall direction as key_light_direction.
# Shadow on upper-left → key light on upper-right (opposite side).
# Invert when converting to display text so text says where the KEY is.
_SHADOW_TO_KEY_DIRECTION = {
    "upper_left": "upper_right",
    "upper_right": "upper_left",
    "left": "right",
    "right": "left",
    "below": "top_center",
    "top_center": "below",
    "lower_left": "lower_right",
    "lower_right": "lower_left",
    "unknown": "unknown",
}

_HEIGHT_LABELS = {
    "high": "elevated above subject eye level",
    "eye_level": "at subject eye level",
    "low": "below subject eye level",
}


def _bg_is_effectively_dark(cue_report: VisualCueReport) -> bool:
    """Return True when the background is effectively dark/unlit.

    The cue extraction may classify a nearly-black background as "gradient"
    when there's a tiny bit of luminance variation (e.g. BG mean 2, std 17).
    This helper catches that case by parsing the BG mean from the
    BackgroundIllumination notes or checking the pattern directly.

    A background with mean brightness < 30 (out of 255) is considered dark
    regardless of the pattern classification.
    """
    bg = cue_report.background_illumination
    if not bg:
        return False  # No data — can't determine

    # Explicit dark classification
    if bg.pattern == "dark":
        return True

    # Parse BG mean from notes (format: "BG mean: N, std: M")
    import re
    for note in (bg.notes or []):
        m = re.search(r"BG mean:\s*([\d.]+)", note)
        if m:
            mean_val = float(m.group(1))
            if mean_val < BG.EFFECTIVELY_DARK_MEAN:
                return True

    return False


def _safe(val: Any, default: str = "") -> str:
    """Return str(val) if truthy, else *default*."""
    return str(val) if val else default


# Catchlight shapes that are strong evidence of a soft/diffused modifier.
# Real gobo/slit setups use bare bulbs or fresnels → small point catchlights.
_SOFT_CATCHLIGHT_SHAPES = frozenset({"rectangular", "octagonal", "circular", "round", "square"})


def _catchlights_contradict_hard_source(vision_data: Optional[Dict[str, Any]]) -> bool:
    """Return True if catchlight evidence strongly indicates a soft modifier.

    When shadow_interruption_pattern fires but catchlights show rectangular or
    large soft-modifier shapes, the shadow interruption is likely a false
    positive (e.g. textured clothing, patterned background, or screen artefacts
    rather than an actual gobo/slit projection).
    """
    if not vision_data:
        return False
    cd = vision_data.get("catchlights", {})
    if not cd or not cd.get("ok"):
        return False

    catchlights = cd.get("catchlights", [])
    if not catchlights:
        return False

    # Check if any catchlight has a soft modifier shape with decent intensity
    for cl in catchlights:
        shape = (cl.get("shape") or "").lower()
        intensity = cl.get("intensity", 0)
        if shape in _SOFT_CATCHLIGHT_SHAPES and intensity >= 0.5:
            return True

    # Also check the inferred modifier text
    inferred = cd.get("inferred", {})
    modifier_text = (inferred.get("likelyModifier") or "").lower()
    if any(tok in modifier_text for tok in ("softbox", "umbrella", "octabox", "beauty dish")):
        return True

    return False


def _build_scene_context(
    vision_data: Optional[Dict[str, Any]],
    cue_report: VisualCueReport,
    vlm_description: Optional[Any] = None,
) -> SceneContext:
    """Build a SceneContext from raw pipeline data.

    This is computed once at the top of ``build_reference_photo_analysis()``
    and threaded through all downstream functions, replacing scattered
    ad-hoc derivations of bg_is_environmental, no_face_mesh, person_ratio,
    bg_ratio, etc.

    When *vlm_description* is available, its ``background_context`` is used
    as a fallback for scene classification when CV signals are weak or
    missing (e.g. segmentation failure, person_ratio ≈ 0).
    """
    ctx = SceneContext()

    # ── Mask ratios ──────────────────────────────────────────────────
    if vision_data:
        region = vision_data.get("region_attribution", {})
        masks = region.get("masks", {}) if isinstance(region, dict) else {}
        ctx.person_ratio = masks.get("person_ratio", 0.0) or 0.0
        ctx.skin_ratio = masks.get("skin_ratio", 0.0) or 0.0
        ctx.bg_ratio = masks.get("background_ratio", 0.0) or 0.0

    # ── Face mesh status ─────────────────────────────────────────────
    if vision_data:
        cl_data = vision_data.get("catchlights", {})
        if isinstance(cl_data, dict):
            cl_reason = (cl_data.get("reason") or "").lower()
            ctx.has_face_mesh = "no_face_mesh" not in cl_reason
            if not ctx.has_face_mesh:
                ctx.face_mesh_failure_reason = cl_reason
            # Catchlight info
            if cl_data.get("ok"):
                cl_list = cl_data.get("catchlights", [])
                ctx.has_catchlights = len(cl_list) > 0
                ctx.catchlight_count = len(cl_list)
        else:
            ctx.has_face_mesh = False
            ctx.face_mesh_failure_reason = "catchlight_data_missing"
    else:
        ctx.has_face_mesh = False
        ctx.face_mesh_failure_reason = "no_vision_data"

    # ── Background pattern ───────────────────────────────────────────
    bg = cue_report.background_illumination
    if bg:
        ctx.bg_pattern = bg.pattern or "unknown"
        ctx.bg_is_environmental = bg.pattern == "environmental"
    ctx.bg_is_effectively_dark = _bg_is_effectively_dark(cue_report)

    # ── Scene type classification ────────────────────────────────────
    # Combine background pattern with vision_pipeline's environment detection
    if ctx.bg_is_environmental:
        ctx.scene_type = "environmental"
    elif vision_data:
        bg_env = vision_data.get("background_environment", {})
        if isinstance(bg_env, dict):
            # The background_environment detector uses the key "environment"
            # (not "classification") for its result.
            env_class = (bg_env.get("environment") or bg_env.get("classification") or "").lower()
            _tex_std = bg_env.get("texture_std", 0.0) or 0.0
            if env_class == "outdoor":
                ctx.scene_type = "outdoor"
            elif env_class == "studio":
                # Cross-validate: bg_env can misclassify blown-out outdoor
                # skies as "studio" (low texture + low edge ratio mimics a
                # seamless backdrop).  When face mesh is missing, use
                # additional signals to confirm studio classification.
                if ctx.has_face_mesh:
                    ctx.scene_type = "studio_portrait"
                elif ctx.bg_pattern in ("dark", "even"):
                    # Dark/even bg is a strong studio signal regardless of face
                    ctx.scene_type = "studio_portrait"
                elif ctx.bg_pattern == "gradient" and ctx.person_ratio > 0.30:
                    # Gradient bg + subject filling >30% → likely studio seamless
                    ctx.scene_type = "studio_portrait"
                # else: gradient bg + small subject + no face mesh → ambiguous,
                # could be outdoor sky gradient — leave as "unknown"
            else:
                # Fallback: dark/even bg → studio (strong signal);
                # gradient bg → only studio when face mesh confirms it
                # (gradient also appears in outdoor sky shots).
                if ctx.bg_pattern in ("dark", "even"):
                    if ctx.has_face_mesh or ctx.person_ratio > 0.05:
                        ctx.scene_type = "studio_portrait"
                elif ctx.bg_pattern == "gradient" and ctx.has_face_mesh:
                    ctx.scene_type = "studio_portrait"
        else:
            if ctx.bg_pattern in ("dark", "even"):
                if ctx.has_face_mesh or ctx.person_ratio > 0.05:
                    ctx.scene_type = "studio_portrait"
            elif ctx.bg_pattern == "gradient" and ctx.has_face_mesh:
                ctx.scene_type = "studio_portrait"
    else:
        if ctx.bg_pattern in ("dark", "even"):
            if ctx.has_face_mesh or ctx.person_ratio > 0.05:
                ctx.scene_type = "studio_portrait"
        elif ctx.bg_pattern == "gradient" and ctx.has_face_mesh:
            ctx.scene_type = "studio_portrait"

    # ── VLM fallback for scene classification ──────────────────────
    # When CV signals are weak (person_ratio ≈ 0, bg_env empty) but VLM
    # is available, use VLM's background_context to classify the scene.
    # VLM enriches but never overrides a confident CV classification.
    if ctx.scene_type == "unknown" and vlm_description is not None:
        vlm_ok = getattr(vlm_description, "ok", False)
        vlm_bg = (getattr(vlm_description, "background_context", "") or "").lower() if vlm_ok else ""
        if vlm_bg:
            _outdoor_tokens = {
                "outdoor", "outside", "balcony", "terrace", "rooftop",
                "roof", "street", "sky", "sun", "sunset", "sunrise",
                "beach", "park", "garden", "field", "city", "building",
                "tree", "foliage", "landscape", "mountain", "ocean",
                "water", "alley", "sidewalk", "urban",
            }
            _studio_tokens = {
                "dark studio", "seamless", "backdrop", "studio",
                "featureless", "plain background", "solid background",
            }
            _env_tokens = {
                "cafe", "restaurant", "bar", "hotel", "lobby", "room",
                "interior", "kitchen", "bathroom", "bedroom", "hallway",
                "staircase", "window", "doorway",
            }
            if any(tok in vlm_bg for tok in _outdoor_tokens):
                ctx.scene_type = "outdoor"
            elif any(tok in vlm_bg for tok in _env_tokens):
                ctx.scene_type = "environmental"
            elif any(tok in vlm_bg for tok in _studio_tokens):
                # Only trust VLM "studio" if bg pattern also supports it
                if ctx.bg_pattern in ("dark", "even", "gradient"):
                    ctx.scene_type = "studio_portrait"

    # ── Pose reliability ─────────────────────────────────────────────
    # Pose landmarks are unreliable when bg_ratio is very high (subject
    # occupies <25% of frame) or when no face mesh was detected.
    ctx.pose_reliable = ctx.has_face_mesh and ctx.bg_ratio <= FRAMING.POSE_UNRELIABLE_BG

    # ── Face cue count ───────────────────────────────────────────────
    # Count how many face-dependent cues produced data (not None with conf>0)
    _face_cues = 0
    if cue_report.primary_shadow_direction and cue_report.primary_shadow_direction.confidence > 0:
        _face_cues += 1
    if cue_report.vertical_light_angle and cue_report.vertical_light_angle.confidence > 0:
        _face_cues += 1
    if cue_report.pose_induced_shadow_interference and cue_report.pose_induced_shadow_interference.confidence > 0:
        _face_cues += 1
    if cue_report.shadow_interruption_pattern and cue_report.shadow_interruption_pattern.detected:
        _face_cues += 1
    ctx.face_cue_count = _face_cues

    return ctx


def _background_is_likely_key_spill(
    cue_report: VisualCueReport,
    lighting_intel: Any,
) -> bool:
    """Return True if the bright background is likely lit by key spill,
    not a dedicated background light.

    Indicators:
      - Background is bright and evenly lit or shows gradient consistent
        with key light falloff (not a tight spot pattern)
      - Subject-background separation is low/moderate (subject is close)
      - Background avg luminance > 200 (bright wall or seamless)
    When the subject is close to a white wall/seamless and the key light
    is the only source, the background will be bright from spill.
    A gradient on a close background is consistent with inverse-square
    falloff from the key, not a dedicated background light.
    """
    bg = cue_report.background_illumination
    if not bg:
        return False

    # Spots are deliberate — a tight circular or shaped pattern on the
    # background is a dedicated background light, not spill.
    if bg.pattern == "spot":
        return False

    sep = cue_report.subject_background_separation

    # Even backgrounds: typical white seamless / wall
    if bg.pattern == "even" and bg.brightness_relative in ("brighter", "similar"):
        if sep and sep.luminance_delta is not None and sep.luminance_delta < 0.45:
            return True

    # Gradient backgrounds: key light falloff across a close wall/backdrop.
    # When the subject is close to the background (low separation) AND the
    # background is bright, the gradient is from the key, not a bg light.
    if bg.pattern == "gradient" and bg.brightness_relative in ("brighter", "similar"):
        if sep and sep.luminance_delta is not None and sep.luminance_delta < 0.35:
            return True

    return False


def _classify_genre(
    classification: Optional[Dict[str, Any]],
    modifier_family: Optional[str],
    framing: str,
    has_gobo: bool,
    cue_report: Optional[VisualCueReport] = None,
) -> str:
    """Classify genre without forcing into classic portrait categories.

    Produces genre labels that reflect what the image actually is:
    portrait, headshot, beauty, editorial, fashion, fashion editorial,
    cinematic, fine art, environmental.
    """
    # Direct evidence from lighting devices
    if has_gobo:
        # Gobo + B&W + extreme contrast + tight crop → fine-art / beauty territory
        # rather than generic "editorial".
        tp = cue_report.tonal_processing_estimation if cue_report else None
        _is_bw = tp.is_bw if tp else False
        _is_hc = tp.is_high_contrast_grade if tp else False
        _framing_lower = framing.lower() if framing else ""
        _is_tight = "tight" in _framing_lower or "close" in _framing_lower
        _mood = (classification.get("mood") or "").lower() if classification else ""
        if _is_bw and _is_hc and _is_tight:
            return "fine art portrait"
        if _is_bw and _is_hc:
            return "fine art"
        if _mood == "cinematic":
            return "cinematic portrait"
        return "editorial portrait"
    if modifier_family == "beauty_dish":
        return "beauty"

    # Tonal processing signals
    is_bw = False
    is_high_contrast = False
    if cue_report:
        tp = cue_report.tonal_processing_estimation
        if tp:
            is_bw = tp.is_bw
            is_high_contrast = tp.is_high_contrast_grade

    mood = ""
    brightness = ""
    if classification:
        mood = (classification.get("mood") or "").lower()
        brightness = (classification.get("brightness") or "").lower()

    # Framing-based base
    framing_lower = framing.lower() if framing else ""
    is_tight = (
        "tight" in framing_lower or "close" in framing_lower
        or "headshot" in framing_lower or "head-and-shoulders" in framing_lower
        or "head and shoulders" in framing_lower
    )
    # "wide" alone in "full body or wide framing" should NOT trigger environmental —
    # only explicit "environmental" framing or standalone "wide" (not "wide framing"
    # as a fallback from person_ratio heuristics).
    is_wide = "environmental" in framing_lower

    # Cinematic mood — its own genre, don't shove into portrait
    if mood == "cinematic":
        if is_bw:
            return "cinematic fine art"
        return "cinematic"

    # B&W + dramatic/editorial moods → fine art
    if is_bw and mood in ("dramatic", "edgy", "moody", "artistic"):
        return "fine art"

    # Fashion/glamour moods
    if mood in ("glamorous", "fashion"):
        if is_bw:
            return "fashion editorial"
        return "fashion"

    # Editorial moods
    if mood in ("dramatic", "edgy", "moody"):
        return "editorial"

    # Low-key mood from classifier → dark, dramatic single-source lighting.
    # Dark background + low-key = studio portrait with dramatic lighting.
    # The framing may say "wide" from person_ratio heuristics (which can be
    # wrong for head-and-shoulders crops where the person fills the frame).
    # Check background: dark/controlled bg = studio portrait, not editorial.
    # P1d: Environmental bg + wide framing → "environmental", not "editorial".
    if mood in ("low_key", "dark"):
        _bg_is_controlled = False
        _bg_is_env = False
        if cue_report:
            _bg = cue_report.background_illumination
            if _bg and _bg.pattern in ("dark", "gradient", "even"):
                _bg_is_controlled = True
            if _bg and _bg.pattern == "environmental":
                _bg_is_env = True
        if is_tight or _bg_is_controlled:
            return "portrait"
        if _bg_is_env and is_wide:
            return "environmental"
        return "editorial"

    # B&W high-key → fashion editorial (studio white background B&W)
    if is_bw and brightness in ("high", "very_high"):
        return "fashion editorial"

    # B&W with no strong mood signal → fine art
    if is_bw:
        return "fine art"

    # High contrast grade (color) with dramatic feel
    if is_high_contrast and mood in ("dark", "intense"):
        return "editorial"

    # Framing-based fallback
    if is_tight:
        return "headshot"
    if is_wide:
        return "environmental"

    return "portrait"


def _collect_visual_devices(
    cue_report: VisualCueReport,
    lighting_intel: Any,
    vision_data: Optional[Dict[str, Any]] = None,
    sip_marginal: bool = False,
    sip_suppressed: bool = False,
    scene_ctx: Optional[SceneContext] = None,
) -> List[str]:
    devices: List[str] = []

    sip = cue_report.shadow_interruption_pattern
    sip_detected = sip is not None and sip.detected
    # Don't report gobo/slit if catchlights show soft modifier shapes
    if sip_detected and _catchlights_contradict_hard_source(vision_data):
        sip_detected = False
    # P3d: caller already determined this SIP is a false positive
    if sip_suppressed:
        sip_detected = False
    if sip_detected:
        # P1a: When parallelism is marginal, hedge the gobo language
        _hedge = " (possible)" if sip_marginal else ""
        # Include shape detail from the shadow interruption classification
        line_count = getattr(sip, "line_count", 0) or 0
        if sip.classification == "geometric_bar":
            shape_hint = f" ({line_count}-line pattern)" if line_count > 0 else ""
            devices.append(f"slit / flag lighting{shape_hint}{_hedge}")
        elif sip.classification == "patterned_projection":
            shape_hint = ""
            # Try to describe the shape from line count heuristics
            if line_count == 2:
                shape_hint = " (cross pattern)"
            elif line_count >= 4:
                shape_hint = " (grid/window pattern)"
            elif line_count == 1:
                shape_hint = " (single-slit pattern)"
            devices.append(f"gobo projection{shape_hint}{_hedge}")
        else:
            devices.append(f"projected shadow pattern{_hedge}")

    spec = cue_report.specular_highlight_behavior
    # P3a: Only add rim/edge separation when gobo isn't the primary light
    # shaper — with a gobo, the illuminated edges are the projected pattern
    # boundary, not actual rim or edge lighting from a separate source.
    _has_gobo_device = any("gobo" in d.lower() for d in devices)
    if (spec and spec.intensity in ("strong", "moderate")
            and spec.spread == "tight" and not _has_gobo_device):
        devices.append("rim / edge separation")

    bg = cue_report.background_illumination
    if bg and bg.pattern == "spot" and not _bg_is_effectively_dark(cue_report):
        devices.append("background spot")
    elif bg and bg.pattern == "gradient" and not _bg_is_effectively_dark(cue_report):
        devices.append("background gradient")

    if lighting_intel and lighting_intel.background_light_detected:
        if _background_is_likely_key_spill(cue_report, lighting_intel):
            pass  # Bright even background near subject = key spill, not dedicated light
        elif bg and bg.pattern == "dark":
            pass  # Dark background — upstream false positive, no dedicated light
        elif "background spot" not in devices and "background gradient" not in devices:
            devices.append("dedicated background light")

    tp = cue_report.tonal_processing_estimation
    if tp:
        if tp.is_bw:
            devices.append("black & white conversion")
            # Warm toning: B&W image with residual colour warmth
            # (mean saturation > 5 indicates sepia/selenium/warm toning,
            # not pure monochrome)
            if tp.mean_saturation > 5:
                devices.append("warm toning")
        elif tp.is_high_contrast_grade:
            devices.append("high-contrast grade")

    # Low-key lighting: extreme/high contrast + dark background + single dominant
    # source.  This is a defining visual technique for corporate portraits,
    # dramatic headshots, and editorial work — not just a tonal processing artefact.
    cr_dev = cue_report.contrast_ratio
    bg_dev = cue_report.background_illumination
    _cr_label_dev = (cr_dev.label if cr_dev else "").lower()
    _bg_dark_dev = _bg_is_effectively_dark(cue_report) or (
        bg_dev and bg_dev.pattern == "dark"
    )
    if _cr_label_dev in ("extreme", "high") and _bg_dark_dev:
        devices.append("low-key lighting")

    # Glossy / specular skin highlights — when specular highlights are strong
    # and the spread is wide/broad, it suggests glossy skin or reflective makeup
    # (common in beauty and fine art work).
    spec = cue_report.specular_highlight_behavior
    if spec and spec.intensity == "strong" and spec.spread in ("wide", "moderate", "broad"):
        devices.append("glossy skin / reflective highlight")
    elif spec and spec.intensity in ("strong", "moderate") and spec.spread == "broad":
        devices.append("glossy skin / reflective highlight")

    # Selective reveal — gobo + dark background + small visible area means
    # the shaped light is revealing only a fragment of the subject.
    # Photographers describe this as "selective reveal" or "sculpted reveal"
    # — a defining visual device in fine art and editorial gobo work.
    _has_gobo_device = any("gobo" in d.lower() or "slit" in d.lower() for d in devices)
    if _has_gobo_device:
        if scene_ctx is not None:
            _sr_bg_ratio = scene_ctx.bg_ratio
        else:
            _sr_masks = {}
            if vision_data:
                _sr_ra = vision_data.get("region_attribution")
                if isinstance(_sr_ra, dict):
                    _sr_masks = _sr_ra.get("masks") or {}
            _sr_bg_ratio = _sr_masks.get("background_ratio", 0.0) or 0.0
        _sr_bg_dark = scene_ctx.bg_is_effectively_dark if scene_ctx is not None else _bg_is_effectively_dark(cue_report)
        if _sr_bg_ratio > FRAMING.BG_DOMINANT and _sr_bg_dark:
            devices.append("selective reveal — shaped light exposes only a fragment of the subject")

    # Gobo / extreme tight crop: when very little of the subject is visible
    # (bg_ratio > 0.80), "tight" specular with moderate+ intensity represents
    # prominent surface gloss (lips, nose bridge) on the small visible area,
    # not just edge separation.  Common in fine art and beauty work.
    if (spec and spec.intensity in ("strong", "moderate")
            and spec.spread == "tight"
            and not any("glossy" in d.lower() for d in devices)):
        if scene_ctx is not None:
            _bg_ratio_check = scene_ctx.bg_ratio
        else:
            _masks = {}
            if vision_data:
                _ra = vision_data.get("region_attribution")
                if isinstance(_ra, dict):
                    _masks = _ra.get("masks") or {}
            _bg_ratio_check = _masks.get("background_ratio", 0.0) or 0.0
        if _bg_ratio_check > 0.80:
            devices.append("glossy skin / reflective highlight")

    return devices


def _build_narrative(
    genre: str,
    mood: str,
    contrast_feel: str,
    bg_rel: str,
    devices: List[str],
    cam_subj: str,
    source_quality: str,
    shadow_pattern: str,
    confidence: float,
    scene_description: str = "",
    pose_notes: str = "",
    likely_photographer: str = "",
) -> str:
    """Build a single-sentence 'At a Glance' label for the reference image.

    Pose, scene, and lighting details are shown in their respective cards
    (The Shot, The Light).  The narrative is the genre/mood/framing identity
    plus a style-reference nod when a likely photographer is detected.
    """
    # ── Single sentence: genre + mood + framing + style reference ──
    genre_display = genre.replace("_", " ")
    mood_lc = (mood or "").lower()
    genre_lc = genre_display.lower()

    def _article(next_word: str) -> str:
        first = next_word.lstrip().split()[0].lower() if next_word.strip() else ""
        return "An" if first and first[0] in "aeiou" else "A"

    has_portrait = "portrait" in genre_lc
    if mood and mood_lc not in genre_lc:
        if has_portrait:
            opener = f"{_article(mood)} {mood} {genre_display}"
        else:
            opener = f"{_article(mood)} {mood} {genre_display} portrait"
    else:
        if has_portrait or genre_lc in ("beauty", "fashion", "headshot"):
            opener = f"{_article(genre_display)} {genre_display}"
        else:
            opener = f"{_article(genre_display)} {genre_display} portrait"

    # Add framing context inline when available
    if cam_subj and cam_subj.lower() not in ("unknown", ""):
        cam_short = cam_subj.split("—")[0].strip().rstrip(".")
        opener += f" — {cam_short}"

    # Style reference — who likely shot this or whose style it echoes
    photog = (likely_photographer or "").strip()
    if photog and photog.lower() != "unknown":
        opener += f", in the style of {photog}"

    opener += "."

    return opener


def _build_contrast_feel(cue_report: VisualCueReport) -> str:
    parts: List[str] = []
    cr = cue_report.contrast_ratio
    if cr and cr.label != "unknown":
        parts.append(f"{cr.label} contrast")

    seh = cue_report.shadow_edge_hardness
    if seh and seh.classification != "unknown":
        parts.append(f"{seh.classification} shadow edges")

    tp = cue_report.tonal_processing_estimation
    if tp and tp.is_bw:
        # Warm toning: B&W with residual color warmth
        if tp.mean_saturation > TONAL.WARM_TONING_SAT:
            parts.append("warm monochrome toning")
        else:
            parts.append("monochrome toning")
    elif tp and tp.is_high_contrast_grade:
        parts.append("heavy contrast grade")

    return ", ".join(parts) if parts else ""


def _build_background_relationship(
    cue_report: VisualCueReport,
    bg_ratio: float = 0.0,
) -> str:
    parts: List[str] = []
    sep = cue_report.subject_background_separation
    if sep:
        if sep.luminance_delta is not None:
            if sep.luminance_delta > 0.6:
                parts.append("strong subject-background separation")
            elif sep.luminance_delta > 0.3:
                parts.append("moderate subject-background separation")
            else:
                parts.append("subtle subject-background separation")

    bg = cue_report.background_illumination
    effectively_dark = _bg_is_effectively_dark(cue_report)
    if bg:
        if bg.pattern == "dark" or effectively_dark:
            # When bg dominates the frame (>80%) and is dark, the subject merges
            # into pure black — "moderate separation" is misleading.
            if bg_ratio > FRAMING.BG_EXTREME:
                # Override separation descriptor for extreme cases
                parts = [p for p in parts if "separation" not in p]
                parts.append("pure black negative space — subject merges with background in shadow areas")
            else:
                # P1b: Distinguish studio seamless from generic "dark"
                # when bg is controlled and uniform.
                if bg.brightness_relative == "darker" and (
                    not bg.notes or any("std" in n for n in bg.notes)
                ):
                    parts.append("dark studio background, subject isolated")
                else:
                    parts.append("dark / negative-space background")
        elif bg.pattern == "even":
            parts.append("evenly lit background")
        elif bg.pattern == "gradient":
            # Parse BG mean from notes to characterise tone
            import re as _re_bg
            _bg_mean = None
            for _note in (bg.notes or []):
                _m = _re_bg.search(r"BG mean:\s*([\d.]+)", _note)
                if _m:
                    _bg_mean = float(_m.group(1))
                    break
            if _bg_mean is not None and BG.MID_GREY_MIN <= _bg_mean <= BG.MID_GREY_MAX:
                # Specific characterisation — drop generic "subtle separation".
                # bg_mean 50-80 is perceptually mid-grey (visible backdrop tone),
                # not truly dark.  Only bg_mean < 50 is genuinely dark/black.
                parts = [p for p in parts if "separation" not in p]
                parts.append("mid-grey studio backdrop")
            elif _bg_mean is not None and _bg_mean < BG.DARK_THRESHOLD:
                parts.append("dark studio backdrop with gradient")
            else:
                parts.append("gradient-lit background")
        elif bg.pattern == "spot":
            parts.append("spot-lit background")
        elif bg.pattern == "environmental":
            parts.append("environmental background")
        if not effectively_dark:
            if bg.brightness_relative == "darker":
                parts.append("darker than subject")
            elif bg.brightness_relative == "similar":
                # "similar" can still be perceptually darker, especially in
                # B&W images where subject skin is typically brighter than
                # a mid-grey backdrop.  Use luminance_delta as a secondary check.
                sep = cue_report.subject_background_separation
                if sep and sep.luminance_delta is not None and sep.luminance_delta > BG.LUMINANCE_DELTA_PERCEPTUAL_MIN:
                    parts.append("darker than subject")
            elif bg.brightness_relative == "brighter":
                # Cross-check: "brighter" from cue extraction compares BG
                # against the overall foreground mean, which is skewed by
                # dark clothing.  luminance_delta from subject_background_
                # separation is more perceptually accurate (compares person
                # region highlights vs BG).  If it shows subject is brighter
                # (positive delta), the BG is perceptually darker.
                sep = cue_report.subject_background_separation
                if sep and sep.luminance_delta is not None and sep.luminance_delta > BG.LUMINANCE_DELTA_PERCEPTUAL_MIN:
                    parts.append("darker than subject")
                else:
                    parts.append("brighter than subject")

    return ", ".join(parts) if parts else ""


def _derive_fill_presence(
    geometry: Any,
    cue_report: VisualCueReport,
    face_mesh_available: bool = True,
) -> str:
    has_fill = getattr(geometry, "has_fill", False)
    cr = cue_report.contrast_ratio
    cr_label = cr.label if cr else "unknown"

    if not has_fill:
        if cr_label in ("high", "extreme"):
            if not face_mesh_available:
                # High contrast here reflects post-grading, NOT measured shadow depth.
                # Without face mesh we cannot distinguish "deliberately unfilled" from
                # "softer image that was heavily graded to look contrasty."
                # Return unknown so fill_strategy doesn't recommend negative fill.
                return "unknown"
            return "none"
        return "none" if cr_label == "unknown" else "subtle"

    if cr_label in ("low",):
        return "strong"
    if cr_label in ("medium",):
        return "moderate"
    return "subtle"


def _derive_rim_presence(
    cue_report: VisualCueReport,
    light_count: int = 0,
    shadow_pattern: str = "",
) -> str:
    spec = cue_report.specular_highlight_behavior
    if not spec:
        return "unknown"
    # A dedicated rim requires at least 2 detected sources.  With 0 or 1 lights,
    # any specular highlights — including "strong + tight" — are key reflections
    # off skin, fabric, or costume, NOT a backlight.  Full-body images with no
    # face mesh are especially prone to false positives here (clothing/jewelry
    # specular reads as tight on B&W high-contrast images).
    if light_count <= 1:
        return "none"
    # Clamshell: both lights are frontal (upper key + lower fill) — there's
    # no backlight that could create rim.  Moderate specular is key+fill
    # reflecting off angled surfaces (costume, jewelry, etc.).
    if "clamshell" in shadow_pattern.lower():
        return "none"
    # Multi-source confirmed: strong + tight specular is definitive rim evidence.
    if spec.intensity == "strong" and spec.spread == "tight":
        return "strong"
    if spec.intensity in ("moderate", "strong"):
        return "subtle"
    return "none"


def _is_passive_bounce_fill(
    geometry: Any,
    cue_report: VisualCueReport,
    lighting_intel: Any,
    vision_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """Detect when the second light source is actually passive bounce (floor/table).

    Floor bounce signature:
    - Exactly 2 deduped catchlights per eye
    - Source quality is soft (large modifier catches floor reflection)
    - Fill presence is subtle (not moderate/strong — strong fill = dedicated)
    - Background is gradient or darker (no dedicated bg light)
    - Second catchlight is below the primary (lower clock position)

    When detected, light_count should be 1 and fill should be "passive bounce".
    """
    if not geometry:
        return False

    light_count = getattr(geometry, "light_count_estimate", 0)
    if light_count != 2:
        return False

    has_fill = getattr(geometry, "has_fill", False)
    if not has_fill:
        return False

    # Clamshell = deliberate upper key + lower fill — NOT passive bounce.
    # The lower catchlight in a clamshell comes from a dedicated fill modifier,
    # not a floor surface.  Check both geometry and lighting_intel.
    _geo_pattern = (getattr(geometry, "shadow_pattern", "") or "").lower()
    if "clamshell" in _geo_pattern:
        return False
    if lighting_intel:
        _intel_pat = (getattr(lighting_intel, "pattern", "") or "").lower()
        _intel_kp = (getattr(lighting_intel, "key_position", "") or "").lower()
        if "clamshell" in _intel_pat or "clamshell" in _intel_kp:
            return False

    # Contrast should NOT be low — low contrast = strong dedicated fill, not passive bounce
    cr = cue_report.contrast_ratio
    cr_label = cr.label if cr else "unknown"
    if cr_label in ("low",):
        return False

    # Background check — dedicated bg light with non-dark, non-gradient bg
    # suggests a deliberate multi-light setup, not passive bounce
    bg_light = lighting_intel.background_light_detected if lighting_intel else False
    if bg_light and not _bg_is_effectively_dark(cue_report):
        bg = cue_report.background_illumination
        if bg and bg.pattern not in ("dark", "gradient"):
            return False

    # Check catchlight positions: floor bounce creates a lower catchlight.
    # Requirements for reliable floor-bounce detection:
    #   1. Per-eye: BOTH eyes must show upper + lower catchlights
    #      (single-eye lower catchlights can be costume/accessory reflections)
    #   2. Shape consistency: lower catchlight should match the upper's shape
    #      (floor bounce reflects the same modifier — a rectangular softbox
    #      bounced off a floor still looks rectangular, not round)
    if vision_data:
        cd = vision_data.get("catchlights", {})
        if cd and cd.get("ok"):
            catchlights = cd.get("catchlights", [])
            # Group by eye
            eyes: Dict[str, list] = {}
            for cl in catchlights:
                eye = cl.get("eye", "unknown")
                clock = _parse_clock_position(cl.get("position", ""))
                shape = (cl.get("shape", "") or "").lower()
                if clock:
                    eyes.setdefault(eye, []).append((clock, shape))

            # Both eyes must show upper + lower with consistent shapes
            eyes_with_bounce = 0
            for eye_label, entries in eyes.items():
                upper_shapes = [s for (h, s) in entries if h in (10, 11, 12, 1, 2)]
                lower_entries = [(h, s) for (h, s) in entries if h in (4, 5, 6, 7, 8)]
                if upper_shapes and lower_entries:
                    # Shape consistency: at least one lower catchlight should
                    # share a shape with the upper catchlights.  A round lower
                    # with rectangular upper = costume reflection, not bounce.
                    lower_shapes = [s for (_, s) in lower_entries]
                    shape_match = any(ls in upper_shapes for ls in lower_shapes if ls)
                    if shape_match:
                        eyes_with_bounce += 1

            if eyes_with_bounce >= 2:
                return True

    # Fallback: soft source + exactly 2 lights + medium/high contrast + gradient bg
    # is strongly suggestive of passive bounce
    bg = cue_report.background_illumination
    bg_is_gradient = bg and bg.pattern == "gradient"
    is_soft = _catchlights_contradict_hard_source(vision_data)  # rectangular = soft
    if is_soft and cr_label in ("medium", "high") and bg_is_gradient:
        return True

    return False


def _has_catchlight_artifacts(
    cue_report: VisualCueReport,
    vision_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """Detect when extra catchlights are costume/accessory reflections.

    Costume reflections (metallic embellishments, gold buttons, jewelry)
    create catchlights that survive deduplication but aren't real light
    sources.  Signals:
    - Asymmetric per-eye counts (real lights show in both eyes equally)
    - Shape inconsistency: extra catchlights have different shapes from
      the dominant (e.g. round vs rectangular → round is from a curved
      metallic surface, not a softbox)
    """
    refl = cue_report.reflection_architecture
    if not refl or not refl.per_eye_counts:
        return False

    per_eye = refl.per_eye_counts
    left_n = per_eye.get("left", 0)
    right_n = per_eye.get("right", 0)
    min_n = min(left_n, right_n)
    max_n = max(left_n, right_n)

    # If counts are symmetric, no artifact signal from asymmetry
    if min_n == max_n:
        # Could still have artifacts if shapes are inconsistent,
        # but asymmetry is our strongest signal.  Check shapes below.
        pass

    # Shape consistency check: do the raw catchlights show mixed shapes?
    # A real multi-light setup uses similar modifiers (all rectangular,
    # all round).  Mixed shapes (round + rectangular) in the same image
    # are strong evidence of artifact contamination.
    if vision_data:
        cd = vision_data.get("catchlights", {})
        if cd and cd.get("ok"):
            shapes = [
                (c.get("shape", "") or "").lower()
                for c in cd.get("catchlights", [])
                if c.get("shape")
            ]
            round_count = sum(1 for s in shapes if s == "round")
            rect_count = sum(1 for s in shapes if s in ("rectangular", "square"))
            # Mixed shapes: some round (likely specular from metallic surface)
            # + some rectangular (softbox).  The round ones are artifacts.
            if round_count > 0 and rect_count > 0:
                # Dominant shape should be rectangular (it's the real modifier)
                cs = cue_report.catchlight_shape
                dominant = (getattr(cs, "dominant_shape", "") if cs else "").lower()
                if dominant in ("rectangular", "square") and round_count < rect_count:
                    return True

    # Asymmetric per-eye counts with low symmetry: extra catchlights
    # in one eye but not the other = localized reflections, not a
    # real second light source.
    if max_n > min_n and min_n >= 1 and refl.symmetry_score < 0.7:
        return True

    return False


def _build_lighting_family(
    pattern: str,
    source_quality: str,
    fill_presence: str,
    light_count: int,
) -> str:
    """Build a lighting family string that describes what the light is *actually*
    doing — including non-standard setups like gobo projection.

    The family string is a hyphenated descriptor, not a database key.
    If the setup doesn't match a classic pattern, the family should still
    accurately describe what's there rather than forcing a generic label.
    """
    parts: List[str] = []
    if light_count == 1:
        parts.append("single")
    elif light_count == 2:
        parts.append("two-light")
    elif light_count >= 3:
        parts.append(f"{light_count}-light")

    if source_quality != "unknown":
        parts.append(source_quality)

    parts.append("key")

    # Include pattern when it's a distinctive non-standard setup.
    # Projected/gobo setups are their own category — they shouldn't be
    # described with the same generic family as a normal key light.
    if pattern == "projected" or "gobo" in pattern:
        parts.append("projected")
    # P1e: butterfly = overhead, clamshell = overhead + fill below
    elif pattern == "butterfly":
        parts.append("overhead")
    elif pattern == "clamshell":
        parts.append("clamshell")

    if fill_presence in ("none",):
        parts.append("no-fill")
    elif fill_presence == "passive bounce":
        parts.append("passive-fill")
    elif fill_presence in ("subtle", "moderate"):
        parts.append("with-fill")
    elif fill_presence == "strong":
        parts.append("heavy-fill")

    return "-".join(parts) if parts else "unknown"


def _derive_fill_strategy(
    fill_presence: str,
    contrast_label: str,
    shadow_pattern: str = "",
) -> str:
    if fill_presence == "passive bounce":
        return (
            "white floor or reflective surface provides passive bounce fill "
            "from below — no dedicated fill light"
        )
    if fill_presence == "none":
        if contrast_label in ("high", "extreme"):
            return "negative fill (black v-flat opposite key) to deepen shadows"
        return "no fill — shadows fall naturally"
    # Clamshell: fill is a second light below the key, not a bounce card.
    # This is the defining characteristic of clamshell lighting.
    _pat_lc = shadow_pattern.lower() if shadow_pattern else ""
    if "clamshell" in _pat_lc:
        if fill_presence == "subtle":
            return "second softbox or beauty dish below key at ~2:1 ratio (clamshell fill)"
        elif fill_presence in ("moderate", "strong"):
            return "second softbox or beauty dish below key at ~1.5:1 ratio (clamshell fill)"
    if fill_presence == "subtle":
        return "white bounce card or reflector opposite key at 3-4x key distance"
    if fill_presence == "moderate":
        return "fill light or large reflector opposite key at ~2:1 ratio"
    if fill_presence == "strong":
        return "fill light opposite key at ~1.5:1 ratio or clamshell position"
    return ""


def _infer_focal_aperture_from_geometry(
    face_ratio: float,
    person_ratio: float,
    luminance_delta: Optional[float] = None,
) -> tuple:
    """Infer focal-length range and aperture range from image geometry.

    Uses measured pixel ratios rather than framing-text keywords so the
    recommendation is anchored to what the camera actually captured.

    face_ratio      : face_area / image_area (0–1).  Primary zoom signal.
    person_ratio    : person_pixels / image_pixels (0–1).  Framing depth.
    luminance_delta : subject-background luminance separation (0–1).
                      Secondary aperture signal — high separation on a tight
                      framing suggests intentional shallow DOF.

    Returns (focal_length: str, aperture: str).
    """
    # ── Focal length ────────────────────────────────────────────────────────
    # face_ratio reflects how zoomed-in the camera is independently of
    # whether the subject is close or the lens is long.  The combination
    # of face_ratio + person_ratio narrows the plausible focal range.

    if face_ratio > 0.12:
        # Face covers >12 % of the frame — tight/close-up, telephoto territory.
        focal_length = "85–135mm"

    elif face_ratio > 0.05:
        # Face covers 5–12 % — classic headshot distance.
        focal_length = "85–105mm"

    elif face_ratio > 0.015 and person_ratio > 0.18:
        # Face present but small; substantial person area — three-quarter
        # or full-body portrait.  Mid-telephoto gives natural proportions.
        focal_length = "50–85mm"

    elif person_ratio > 0.30:
        # Person fills the frame but face is too small to anchor to a tight
        # focal length — full body.  35 mm is the studio-constrained floor;
        # 85 mm is the realistic ceiling before distance becomes impractical.
        focal_length = "35–85mm"

    elif person_ratio > 0.15:
        # Partial body / three-quarter with no strong face signal.
        focal_length = "50–85mm"

    else:
        # Subject small in frame — environmental or distant.
        focal_length = "24–50mm"

    # ── Aperture ────────────────────────────────────────────────────────────
    # DOF requirement is the primary driver.  A full-body shot mandates f/8+
    # regardless of intent; a tight close-up can afford shallow DOF.
    # luminance_delta refines the estimate for ambiguous mid-range framings.

    if face_ratio > 0.12:
        # Very tight close-up — intentional shallow DOF is the norm.
        aperture = "f/2.8–5.6"

    elif person_ratio > 0.30:
        # Full body: head-to-toe must be simultaneously sharp.
        # f/4 risks the extremities going soft, especially with any subject
        # depth relative to the camera axis.
        aperture = "f/8–11"

    elif person_ratio > 0.15 or (face_ratio > 0.015 and person_ratio > 0.10):
        # Three-quarter: torso + partial limbs visible — moderate DOF needed.
        aperture = "f/5.6–8"

    elif face_ratio > 0.05:
        # Headshot: full face (including ears and nose depth) must be sharp.
        aperture = "f/5.6–8"

    else:
        # Distant/environmental — subject sharpness vs background DOF varies;
        # f/5.6–8 is a safe mid-range recommendation.
        aperture = "f/5.6–8"

    # Secondary refinement: on tight framings, high background separation
    # is evidence that a wide aperture was used deliberately for subject
    # isolation.  Don't apply to full-body shots (DOF constraint wins).
    if (
        luminance_delta is not None
        and luminance_delta > 0.55
        and face_ratio > 0.05
        and person_ratio < 0.20
    ):
        aperture = "f/2.8–5.6"

    return focal_length, aperture


def _derive_background_strategy(
    cue_report: VisualCueReport,
    bg_light: bool,
    is_key_spill: bool = False,
) -> str:
    bg = cue_report.background_illumination
    if not bg:
        return ""

    # Catch nearly-black backgrounds that were misclassified as gradient/spot
    effectively_dark = _bg_is_effectively_dark(cue_report)

    if bg.pattern == "dark" or effectively_dark:
        if bg_light:
            return "dark background with subtle background light for separation"
        return "unlit dark background — distance varies (may be close wall or distant backdrop)"
    if bg.pattern == "spot":
        return "background light with grid or snoot for spot effect"
    if bg.pattern == "gradient":
        # P1b: When the background is darker/similar to the subject and shows
        # gradient, it's likely natural falloff from the key light hitting
        # the backdrop, not a dedicated background light.
        if bg.brightness_relative in ("darker", "similar") and not bg_light:
            return (
                "mid-tone backdrop with natural gradient from key light falloff — "
                "no dedicated background light needed"
            )
        return "background light aimed at backdrop for gradient wash"
    if bg.pattern == "even":
        if is_key_spill:
            return (
                "white or light background close behind subject — "
                "evenly lit by key light spill (no dedicated background light needed)"
            )
        return "evenly lit background (seamless or lit backdrop)"
    if bg.pattern == "environmental":
        return "environmental background — subject placed in context"
    return ""


def _key_placement_text(geometry: Any) -> str:
    raw_dir = getattr(geometry, "key_light_direction", "unknown")
    # P2e: key_light_direction now stores actual key position (inverted in
    # cue_inference), so use directly — no flip needed.
    height = getattr(geometry, "key_light_height", "unknown")

    dir_text = _DIRECTION_TO_TEXT.get(raw_dir, "")
    height_text = _HEIGHT_LABELS.get(height, "")

    # P1f: Avoid contradictions — direction text for upper_* already
    # includes "elevated", so don't append a height that contradicts.
    # Only append height when it adds genuinely new information.
    if dir_text and height_text:
        _dir_has_elevation = "elevated" in dir_text.lower() or "below" in dir_text.lower()
        if _dir_has_elevation:
            # Direction already encodes height — skip height label
            return dir_text
        return f"{dir_text}, {height_text}"
    return dir_text or height_text or ""


# ─── Public Builder Functions ─────────────────────────────────────────────


def build_image_read(
    vision_data: Optional[Dict[str, Any]],
    classification: Optional[Dict[str, Any]],
    cue_report: VisualCueReport,
    cue_inference: Dict[str, Any],
    lighting_intel: Any,
    image_analysis: Optional[Dict[str, Any]],
    vlm_description: Optional[Any] = None,
    scene_ctx: Optional[SceneContext] = None,
    lighting_read: Optional[Any] = None,
) -> ImageRead:
    """Build the 'what is happening in the image' layer."""
    # Notes collect VLM learning annotations — when VLM overrides or
    # enriches CV data, the reason is logged for downstream debugging
    # and CV pipeline improvement.
    notes: List[str] = []

    # Subject info
    subject_data = {}
    if image_analysis:
        subject_data = image_analysis.get("subject", {})
    pose_data = {}
    if vision_data:
        pose_data = vision_data.get("pose", {})

    # Detect shadow interruption early — gobo/slit images have unreliable
    # pose and framing because the mask hides most of the subject.
    sip = cue_report.shadow_interruption_pattern
    has_gobo_or_slit = sip is not None and sip.detected

    # P1a: Gate gobo narrative on SIP parallelism >= 0.5.
    # Low-parallelism detections (0.35–0.49) passed the P2b suppression
    # but are still marginal — don't commit to definitive gobo language.
    _sip_marginal = False
    if has_gobo_or_slit and sip is not None:
        _sip_par = getattr(sip, "line_parallelism", 1.0) or 1.0
        if _sip_par < 0.5:
            _sip_marginal = True

    # Cross-check: if catchlights clearly show soft modifier shapes (rectangular
    # softbox, octabox, etc.), the shadow interruption is likely a false positive
    # from textured clothing or patterned backgrounds — not a real gobo.
    if has_gobo_or_slit and _catchlights_contradict_hard_source(vision_data):
        has_gobo_or_slit = False
        _sip_marginal = False

    # P3d (image read): marginal SIP parallelism without geometry corroboration.
    # Suppress gobo unless geometry *explicitly* identifies a gobo/slit/projected
    # pattern — standard patterns (loop, rembrandt, etc.) and "unknown" both mean
    # the parallel lines are noise, not a real projected shadow.
    _sip_suppressed = False
    if has_gobo_or_slit and sip is not None:
        _sip_par_ir = getattr(sip, "line_parallelism", 1.0) or 1.0
        if _sip_par_ir < 0.70:
            _geo_ir = cue_inference.get("geometry")
            _geo_sp_ir = (getattr(_geo_ir, "shadow_pattern", "unknown") if _geo_ir else "unknown") or "unknown"
            _geo_says_gobo_ir = any(tok in _geo_sp_ir for tok in ("gobo", "slit", "project"))
            if not _geo_says_gobo_ir:
                has_gobo_or_slit = False
                _sip_marginal = False
                _sip_suppressed = True

    # Early heuristic check: when SIP didn't fire but dramatic-hard signals
    # converge, treat the framing as gobo-like (pose/framing unreliable).
    # Blueprint oracle: if lighting_read resolved a soft/mixed source, the
    # dramatic-hard heuristic is firing on contrast editing — trust blueprint.
    # Also suppressed when SIP was already determined to be a false positive.
    _lr_sq_ir = (getattr(lighting_read, "source_quality", "") or "").lower() if lighting_read else ""
    _blueprint_says_soft_ir = _lr_sq_ir in ("soft", "mixed", "ambient")
    _early_inferred_dh = False
    if not has_gobo_or_slit and not _sip_suppressed and not _blueprint_says_soft_ir:
        _early_inferred_dh = _detect_dramatic_hard_light(
            classification, vision_data, cue_report, lighting_intel,
            scene_ctx=scene_ctx,
        )

    # Extract background ratio from scene_ctx (computed once) or vision_data.
    if scene_ctx is not None:
        bg_ratio = scene_ctx.bg_ratio
    else:
        bg_ratio = 0.0
        if vision_data:
            region = vision_data.get("region_attribution", {})
            masks = region.get("masks", {}) if isinstance(region, dict) else {}
            bg_ratio = masks.get("background_ratio", 0.0) or 0.0

    # When bg_ratio > 0.75, the subject occupies < 25% of the frame.  Pose
    # landmarks are unreliable (silhouette-estimated "standing" for what is
    # really a tight face crop).
    pose_unreliable = has_gobo_or_slit or _early_inferred_dh or bg_ratio > FRAMING.POSE_UNRELIABLE_BG

    pose_text = ""
    if pose_unreliable:
        # Raw pose landmarks are unreliable (gobo masking or high bg_ratio).
        # However, upstream subject.angle may still be partially useful
        # (face orientation is more reliable than body pose in these cases).
        subj_angle = _safe(subject_data.get("angle", ""))
        if subj_angle and subj_angle.lower() not in ("unknown", "front-ish"):
            # Only use specific angles, not vague ones
            pose_text = subj_angle.replace("_", " ")
        # If even that fails, leave empty — better no info than wrong info
    elif isinstance(pose_data, dict) and pose_data.get("ok"):
        raw_pose = pose_data.get("pose", "")
        raw_angle = pose_data.get("angle", "")
        parts = []
        if raw_pose and raw_pose != "unknown":
            parts.append(raw_pose.replace("_", " "))
        if raw_angle and raw_angle != "unknown":
            parts.append(raw_angle.replace("_", " "))
        pose_text = ", ".join(parts)

    # Fallback: if pose_text is still empty, try upstream subject.pose
    # but only if it's specific and not a generic "standing" (which is often
    # wrong for tight crops)
    if not pose_text:
        subj_pose = _safe(subject_data.get("pose", ""))
        subj_angle = _safe(subject_data.get("angle", ""))
        fb_parts = []
        if subj_pose and subj_pose.lower() not in (
            "unknown", "standing", "neutral",
        ):
            fb_parts.append(subj_pose.replace("_", " "))
        if subj_angle and subj_angle.lower() not in (
            "unknown", "front-ish",
        ):
            fb_parts.append(subj_angle.replace("_", " "))
        pose_text = ", ".join(fb_parts)

    # Last-resort gaze inference: when framing is tight and pose is still empty,
    # check if the angle is "front-ish" — for a tight crop that usually means
    # direct gaze to camera, which IS meaningful even if we filtered it above
    # for full-body shots.
    _raw_framing_lc = _safe(subject_data.get("framing", "")).lower()
    _is_tight_crop = (
        "tight" in _raw_framing_lc or "close" in _raw_framing_lc
        or has_gobo_or_slit or _early_inferred_dh or bg_ratio > FRAMING.POSE_UNRELIABLE_BG
    )
    if not pose_text and _is_tight_crop:
        raw_angle = ""
        if isinstance(pose_data, dict):
            raw_angle = (pose_data.get("angle") or "").lower()
        subj_angle = _safe(subject_data.get("angle", "")).lower()
        if raw_angle == "front-ish" or subj_angle == "front-ish":
            pose_text = "direct gaze to camera"

    # P1c: When all pose fallbacks fail, explicitly flag as unavailable
    # rather than leaving empty (which could imply "no pose to describe").
    if not pose_text:
        _pose_ok = isinstance(pose_data, dict) and pose_data.get("ok")
        if not _pose_ok:
            pose_text = "pose data unavailable"

    # Framing / camera-subject relationship
    # The raw subject.framing from landmark detection is unreliable when:
    #   - shadow masking (gobo/slit) obscures the body
    #   - background ratio is very high (>0.75) suggesting heavy masking or tight crop
    raw_framing = _safe(subject_data.get("framing", ""))
    framing_text = raw_framing

    # Person ratio from scene_ctx (computed once) or vision_data fallback
    if scene_ctx is not None:
        _person_ratio = scene_ctx.person_ratio
    else:
        _person_ratio = 0.0
        if vision_data:
            _region_fr = vision_data.get("region_attribution", {})
            _masks_fr = _region_fr.get("masks", {}) if isinstance(_region_fr, dict) else {}
            _person_ratio = _masks_fr.get("person_ratio", 0.0) or 0.0

    # Face box from vision pipeline — used to gate framing when landmarks fail
    _face_box = None
    if vision_data:
        _region_fb = vision_data.get("region_attribution", {})
        _face_box = _region_fb.get("face_box") if isinstance(_region_fb, dict) else None

    if has_gobo_or_slit or _early_inferred_dh:
        # Gobo/slit (confirmed or inferred): framing is obscured by the lighting pattern.
        # Distinguish extreme close-up when very little of the subject is visible.
        if _person_ratio < FRAMING.EXTREME_CLOSEUP_BG:
            cam_subj = "extreme close-up — only fragments of the face visible through projected light pattern"
        else:
            cam_subj = "tight crop — framing obscured by projected light pattern"
        framing_text = cam_subj
    elif bg_ratio > FRAMING.BG_DOMINANT and (
        not raw_framing
        or "full-body" in raw_framing.lower()
        or "detected from landmarks" in raw_framing.lower()
    ):
        # Very high background ratio with no/unreliable framing.
        # P1a: Distinguish between (a) shadow-masked tight crop and
        # (b) environmental scene with small full-body figure.
        # When BG is "environmental", the person is small in a large scene,
        # not close-up with shadow masking.
        _bg_is_env = scene_ctx.bg_is_environmental if scene_ctx is not None else (
            cue_report.background_illumination and cue_report.background_illumination.pattern == "environmental"
        )
        if _bg_is_env:
            # Environmental scene: person_ratio reflects actual body size in frame
            if _person_ratio > FRAMING.ENV_FULL_BODY:
                cam_subj = "full body in environment"
            elif _person_ratio > FRAMING.ENV_DISTANT:
                cam_subj = "distant figure in environment"
            else:
                cam_subj = "environmental — subject very small in frame"
        elif _person_ratio < FRAMING.EXTREME_CLOSEUP_BG:
            cam_subj = "extreme close-up — subject occupies a small fraction of the frame"
        else:
            cam_subj = "close-up or tightly framed"
        framing_text = cam_subj
    else:
        cam_subj = framing_text
        # P1d: When framing text is empty/unknown, derive from person_ratio.
        # P2b: Thresholds lowered — person_ratio of 0.35+ in landscape
        # images means full body; 0.40 threshold was too high for horizontal crops.
        if not cam_subj or cam_subj.lower() in ("unknown", ""):
            # Face-box gate: if a detected face covers >5% of frame,
            # the subject is close — person_ratio alone can't distinguish
            # headshot (large face) from full body (small face).
            _face_ratio = 0.0
            if _face_box and len(_face_box) == 4:
                _fb = _face_box
                _img_h = 1
                _img_w = 1
                if vision_data:
                    _masks_dims = vision_data.get("region_attribution", {}).get("masks", {})
                    _img_h = _masks_dims.get("_image_h", 1) or 1
                    _img_w = _masks_dims.get("_image_w", 1) or 1
                _face_area = max(0, _fb[2] - _fb[0]) * max(0, _fb[3] - _fb[1])
                if _img_h > 1 and _img_w > 1:
                    _face_ratio = _face_area / (_img_h * _img_w)

            if _face_ratio > 0.10:
                cam_subj = "headshot"
            elif _face_ratio > 0.05:
                cam_subj = "close-up"
            elif _person_ratio > FRAMING.FULL_BODY:
                cam_subj = "full body or wide framing"
            elif _person_ratio > FRAMING.THREE_QUARTER:
                cam_subj = "three-quarter or medium shot"
            elif _person_ratio > FRAMING.CLOSE_UP:
                cam_subj = "close-up"
            elif _person_ratio > FRAMING.TIGHT_CLOSE_UP:
                cam_subj = "tight close-up"
            elif _person_ratio > 0:
                cam_subj = "extreme close-up"
            framing_text = cam_subj

    # Mood — enrich the raw classification mood with intensity qualifiers
    # when the image signals warrant it.  "cinematic" alone doesn't capture
    # "dark, mysterious, intense" that a photographer would naturally say.
    mood = ""
    if classification:
        mood = _safe(classification.get("mood"))

    # Filter lighting-descriptor moods that the classifier produces.
    # "low_key", "high_key" are lighting ratios, not emotional descriptors.
    # Translate to perceptual mood vocabulary.
    # P1c: "low_key" in an environmental scene (café, room) is dim ambient
    # lighting, not studio dramatic.  Use "moody, atmospheric" instead.
    _bg_is_environmental = scene_ctx.bg_is_environmental if scene_ctx is not None else (
        cue_report.background_illumination and cue_report.background_illumination.pattern == "environmental"
    )
    if mood.lower() == "low_key":
        mood = "moody, atmospheric" if _bg_is_environmental else "dramatic"
    elif mood.lower() == "high_key":
        mood = "bright, airy"

    # Append intensity qualifier when extreme contrast + low brightness
    # P1c: Skip "dark" prefix for environmental scenes — dim ambient
    # lighting is already captured by "moody, atmospheric" and adding
    # "dark" makes the mood sound inappropriately sinister.
    _bright = (_safe(classification.get("brightness")) if classification else "").lower()
    _cr = cue_report.contrast_ratio
    _cr_label = (_cr.label if _cr else "").lower()
    if mood and not _bg_is_environmental:
        if _cr_label in ("extreme", "high") and _bright in ("low", "very_low"):
            # "cinematic" → "dark, cinematic"  /  "dramatic" → "dark, intense"
            if mood.lower() not in ("dark", "intense"):
                mood = f"dark, {mood}"

    # P3c: Expand mood vocabulary to compound descriptors when signals
    # converge on specific emotional registers.
    if mood:
        mood_lc = mood.lower()
        tp_mood = cue_report.tonal_processing_estimation
        _is_bw = tp_mood and tp_mood.is_bw
        _seh_mood = cue_report.shadow_edge_hardness
        _seh_class = (_seh_mood.classification if _seh_mood else "unknown").lower()

        # Soft light + B&W → contemplative / introspective quality
        if _seh_class == "soft" and _is_bw and "contemplative" not in mood_lc:
            if "dramatic" not in mood_lc and "intense" not in mood_lc:
                mood = f"{mood}, contemplative"

        # Hard light + high/extreme contrast + color → confident, edgy
        if _seh_class == "hard" and _cr_label in ("high", "extreme") and not _is_bw:
            if "confident" not in mood_lc and "edgy" not in mood_lc:
                mood = f"{mood}, confident"

        # Low contrast + soft + bright → airy, gentle
        if _cr_label == "low" and _seh_class == "soft" and _bright in ("high", "bright"):
            if "gentle" not in mood_lc:
                mood = f"{mood}, gentle"

        # Editorial / fashion context — add "editorial" when production-quality signals present
        if any("glossy" in d.lower() for d in (
            _safe(classification.get("description")) if classification else "",
        )):
            if "editorial" not in mood_lc:
                mood = f"{mood}, editorial"

    # Visual devices
    has_gobo = has_gobo_or_slit
    devices = _collect_visual_devices(cue_report, lighting_intel, vision_data, sip_marginal=_sip_marginal, sip_suppressed=_sip_suppressed, scene_ctx=scene_ctx)

    # Fallback: if cue-level SIP didn't fire (e.g. face not detected) but
    # the inference-level dramatic-hard heuristic did, surface the gobo device
    # so image_read and lighting_read agree.
    # Blueprint oracle: if the blueprint resolved soft/mixed source quality,
    # the dramatic-hard heuristic is a false positive on contrast editing.
    # Also suppressed when SIP was already determined to be a false positive.
    if not has_gobo and not _sip_suppressed and not _blueprint_says_soft_ir:
        _inferred_dh = _detect_dramatic_hard_light(
            classification, vision_data, cue_report, lighting_intel,
            scene_ctx=scene_ctx,
        )
        if _inferred_dh and not any("gobo" in d.lower() for d in devices):
            _pps = cue_report.projected_pattern_shape
            if _pps == "cross":
                devices.append("cross-shaped gobo projection (inferred from lighting character + mask shape)")
            elif _pps in ("vertical_slit", "horizontal_slit"):
                devices.append("slit / flag projection (inferred from lighting character + mask shape)")
            else:
                devices.append("projected shadow / gobo (inferred from lighting character)")
            has_gobo = True

    # P3a: Post-filter — remove "rim / edge separation" when gobo is present.
    # With a gobo, illuminated edges are the projected pattern boundary,
    # not actual rim/edge lighting from a separate source.
    if has_gobo and "rim / edge separation" in devices:
        devices.remove("rim / edge separation")

    # Early passive-bounce check for device filtering: detect whether
    # this is a single-key + passive-bounce scenario so we can remove
    # misleading "rim / edge separation" and "background gradient" devices
    # from the narrative BEFORE it's built.
    _geometry = cue_inference.get("geometry")
    _early_passive = _is_passive_bounce_fill(
        _geometry, cue_report, lighting_intel, vision_data,
    ) if _geometry else False
    if _early_passive:
        # Passive bounce → 1 light → no rim possible
        devices = [d for d in devices if "rim" not in d.lower() and "edge separation" not in d.lower()]
        # Background gradient is just key falloff, not a deliberate device
        devices = [d for d in devices if "background gradient" not in d.lower()]

    # P1b: Extreme single-source + no fill + high contrast → "intense".
    # Photographers describe hard, unforgiving one-light setups with no
    # fill as producing an "intense" quality — especially with direct gaze.
    # P1c: Skip for environmental scenes — high contrast from floor patterns
    # or dim interiors doesn't make the mood "intense".
    _cr_for_mood = cue_report.contrast_ratio
    _cr_label_mood = (_cr_for_mood.label if _cr_for_mood else "").lower()
    if _cr_label_mood in ("extreme", "high") and not _bg_is_environmental:
        # Check for no-fill signal: either detected gobo (which implies no fill)
        # or lighting_intel says single source
        _lc_hint = getattr(lighting_intel, "light_count", 0) if lighting_intel else 0
        if (has_gobo or _lc_hint <= 1) and mood and "intense" not in mood.lower():
            mood = f"{mood}, intense"

    # P1c: Gobo + extreme close-up + dark background → photographers universally
    # describe this combination as "mysterious".  Add the qualifier after the
    # initial mood enrichment so it stacks with "dark, cinematic" etc.
    if has_gobo and bg_ratio > FRAMING.BG_EXTREME and _person_ratio < FRAMING.GOBO_PERSON_RATIO:
        if mood and "mysterious" not in mood.lower():
            mood = f"{mood}, mysterious"
        elif not mood:
            mood = "mysterious"

    modifier_family = lighting_intel.modifier_family if lighting_intel else None

    genre = _classify_genre(classification, modifier_family, framing_text, has_gobo, cue_report)

    # Editorial crossover: gobo + beauty/production elements (glossy highlights,
    # reflective makeup) suggest editorial-grade production, not just fine art.
    if "fine art" in genre.lower() and has_gobo:
        if any("glossy" in d.lower() for d in devices):
            genre = "fine art / editorial"

    # Contrast / shadow feel — override "soft shadow edges" when gobo/projection
    # is detected, since the shadow_edge_hardness cue is unreliable on B&W gobo
    # images (the heavy processing fools the edge detector).
    contrast_feel = _build_contrast_feel(cue_report)
    # Fallback: when cue-level data produced no contrast_feel (all cues
    # "unknown"), derive from VLM classification's lightQuality and mood.
    if not contrast_feel and classification:
        _cf_parts = []
        _cls_lq = (classification.get("lightQuality") or classification.get("light_quality") or "").lower()
        _cls_mood = (classification.get("mood") or "").lower()
        if _cls_lq in ("hard", "soft"):
            _cf_parts.append(f"{_cls_lq} light quality (from classification)")
        if _cls_mood in ("dramatic", "edgy", "moody"):
            _cf_parts.append("dramatic tone")
        elif _cls_mood in ("bright", "airy", "upbeat"):
            _cf_parts.append("bright, open feel")
        contrast_feel = ", ".join(_cf_parts)
    if has_gobo and "soft shadow edges" in contrast_feel:
        contrast_feel = contrast_feel.replace("soft shadow edges", "hard-edged projected shadows")
    # Catchlight correction: when soft-modifier catchlights (rectangular/octagonal)
    # contradict "hard shadow edges", the edge hardness is inflated by
    # post-processing, costume textures, or high-contrast toning — not the
    # actual source quality.  Replace with "soft shadow transitions".
    elif "hard shadow edges" in contrast_feel and _catchlights_contradict_hard_source(vision_data):
        contrast_feel = contrast_feel.replace("hard shadow edges", "soft shadow transitions")

    # Background relationship
    bg_rel = _build_background_relationship(cue_report, bg_ratio=bg_ratio)

    # Pattern for intent — prefer geometry's deduped pattern over raw
    _geo_inf = cue_inference.get("geometry")
    _geo_pat = getattr(_geo_inf, "shadow_pattern", "unknown") if _geo_inf else "unknown"
    pattern = _geo_pat if _geo_pat != "unknown" else (lighting_intel.pattern if lighting_intel else "unknown")
    # P2e: "triangle" from raw catchlights is wrong if deduped count < 3
    _geo_lc = getattr(_geo_inf, "light_count_estimate", 0) if _geo_inf else 0
    if pattern == "triangle" and _geo_lc < 3:
        pattern = "unknown"

    # Visual intent — build a descriptive phrase richer than just the genre.
    # Incorporate mood, lighting pattern, and contrast character so the intent
    # reads like a creative brief: "dramatic rembrandt portrait with deep chiaroscuro"
    intent_parts: List[str] = []
    genre_lower = genre.lower()
    if mood and mood.lower() not in genre_lower:
        # Prevent duplication: when genre appears inside mood (e.g. mood="cinematic, confident"
        # and genre="cinematic"), strip the genre word from the mood portion.
        _mood_for_intent = mood
        if genre_lower in mood.lower():
            _mood_parts = [p.strip() for p in mood.split(",")]
            _mood_parts = [p for p in _mood_parts if p.lower().strip() != genre_lower]
            _mood_for_intent = ", ".join(_mood_parts)
        if _mood_for_intent:
            intent_parts.append(_mood_for_intent)
    # Filter technical lighting patterns from visual intent — patterns like
    # "clamshell", "butterfly", "rembrandt" are lighting setup terms, not
    # creative intent descriptors.  Gobo IS meaningful for intent (it's a
    # technique), so only filter standard shadow patterns.
    _TECHNICAL_PATTERNS = {
        "clamshell", "butterfly", "rembrandt", "loop", "split",
        "paramount", "triangle", "flat", "broad", "short",
    }
    if pattern and pattern != "unknown" and pattern.lower() not in genre_lower:
        if pattern.lower() not in _TECHNICAL_PATTERNS:
            intent_parts.append(pattern.replace("_", " "))
    intent_parts.append(genre)
    # Add a contrast/tonal qualifier when it meaningfully differentiates
    cr = cue_report.contrast_ratio
    cr_label = cr.label if cr else ""
    tp_check = cue_report.tonal_processing_estimation
    # Gobo/projection is the defining technique — include it in intent.
    # Pull shape detail from devices to distinguish cross-shaped / grid / slit.
    if has_gobo and "gobo" not in genre_lower:
        _gobo_shape = ""
        for _dev in devices:
            _dl = _dev.lower()
            if "cross" in _dl:
                _gobo_shape = "cross-shaped "
                break
            elif "grid" in _dl or "window" in _dl:
                _gobo_shape = "grid-shaped "
                break
            elif "slit" in _dl:
                _gobo_shape = "slit-shaped "
                break
        intent_parts.append(f"with {_gobo_shape}gobo projection")
    elif cr_label in ("extreme", "high") and "chiaroscuro" not in genre_lower:
        # P3a: "chiaroscuro" implies hard light. When source quality is soft
        # (from catchlight shape or modifier vote), describe the contrast
        # without using chiaroscuro language.  Apply catchlight correction.
        _sq_inf = cue_inference.get("source_quality")
        _sq_mod = getattr(_sq_inf, "key_modifier_family", "") if _sq_inf else ""
        _sq_is_soft = _sq_mod in ("softbox", "umbrella", "window", "ambient")
        # Catchlight correction: rectangular/octagonal catchlights override "hard"
        if not _sq_is_soft and _catchlights_contradict_hard_source(vision_data):
            _sq_is_soft = True
        if _sq_is_soft:
            intent_parts.append("with high contrast")
        else:
            intent_parts.append("with deep chiaroscuro")
    elif tp_check and tp_check.is_bw and "fine art" not in genre_lower:
        intent_parts.append("in monochrome")
    # P1a: Enrich visual_intent with beauty/fashion language when glossy +
    # gobo are present — the combination signals styled editorial work.
    if has_gobo and any("glossy" in d.lower() for d in devices):
        intent_parts.append("— styled beauty elements through shaped light")
    visual_intent = " ".join(intent_parts)

    # Confidence (computed before narrative so the hedge can use it)
    cue_conf = cue_report.overall_confidence()
    pattern_conf = lighting_intel.pattern_confidence if lighting_intel else 0.0
    confidence = round((cue_conf + pattern_conf) / 2, 2) if (cue_conf + pattern_conf) > 0 else 0.0

    # Derive shadow pattern + source quality for the narrative
    # (we don't have lighting_read yet — derive from same sources)
    _shadow_pattern_for_narr = pattern if pattern != "unknown" else ""
    sip_for_narr = cue_report.shadow_interruption_pattern
    _sip_narr_detected = sip_for_narr is not None and sip_for_narr.detected
    # Apply same catchlight contradiction check as build_lighting_read():
    # soft-modifier catchlights (rectangular/octagonal) void the SIP.
    if _sip_narr_detected and _catchlights_contradict_hard_source(vision_data):
        _sip_narr_detected = False
    if _sip_narr_detected:
        _shadow_pattern_for_narr = "gobo"
    # Also set gobo for narrative when inference-level heuristic fired
    elif has_gobo and not _shadow_pattern_for_narr:
        # Use projected_pattern_shape for shape-aware narrative
        _pps_narr = cue_report.projected_pattern_shape
        if _pps_narr == "cross":
            _shadow_pattern_for_narr = "cross-shaped gobo"
        elif _pps_narr in ("vertical_slit", "horizontal_slit"):
            _shadow_pattern_for_narr = "slit"
        else:
            _shadow_pattern_for_narr = "gobo"
    # P3b: Use catchlight-corrected source quality for the narrative.
    # When catchlights clearly show a soft modifier (rectangular/octagonal),
    # the narrative should say "soft" even if shadow edges or the modifier
    # vote says "hard" (B&W processing inflates edge contrast, causing the
    # SEH and specular cues to outvote the catchlight shape evidence).
    # Apply the same catchlight correction as build_lighting_read() line 1417.
    _sq_for_narr = "unknown"
    _sq_inf_narr = cue_inference.get("source_quality")
    _mod_fam_narr = getattr(_sq_inf_narr, "key_modifier_family", "") if _sq_inf_narr else ""
    if _mod_fam_narr in ("softbox", "umbrella", "window", "ambient"):
        _sq_for_narr = "soft"
    elif _mod_fam_narr in ("hard_source",):
        _sq_for_narr = "hard"
    elif _mod_fam_narr in ("beauty_dish",):
        _sq_for_narr = "mixed"
    else:
        seh = cue_report.shadow_edge_hardness
        if seh and seh.classification != "unknown":
            _sq_for_narr = seh.classification
    # Catchlight correction: rectangular/octagonal catchlights override "hard"
    if _sq_for_narr == "hard" and _catchlights_contradict_hard_source(vision_data):
        _sq_for_narr = "soft"

    # Narrative
    narrative = _build_narrative(
        genre=genre,
        mood=mood,
        contrast_feel=contrast_feel,
        bg_rel=bg_rel,
        devices=devices,
        cam_subj=cam_subj,
        source_quality=_sq_for_narr,
        shadow_pattern=_shadow_pattern_for_narr,
        confidence=confidence,
    )

    # Enrich pose_notes with notable surface characteristics when the
    # visible area is small.  Glossy highlights on a tight-crop / gobo image
    # are a defining feature a photographer would describe.
    if pose_text and _person_ratio < FRAMING.TINY_SUBJECT:
        if any("glossy" in d.lower() for d in devices):
            pose_text += ", reflective highlights on visible features"

    # ── VLM enrichment (P2a) ──────────────────────────────────────────
    # Merge VLM-derived details that pure CV cannot extract: expression,
    # cosmetic/styling details, and richer pose description.
    # VLM enriches but never OVERRIDES CV-derived lighting or geometry data.
    subject_type = ""
    subject_count = 1
    subject_skin_tones: List[str] = []
    skin_tone_mixed = False
    vlm_lighting_style = ""
    vlm_likely_photographer = ""
    vlm = vlm_description
    if vlm is not None and getattr(vlm, "ok", False):
        # Subject identification — who is in the image
        subject_type = getattr(vlm, "subject_type", "") or ""
        subject_count = getattr(vlm, "subject_count", 1) or 1
        subject_skin_tones = getattr(vlm, "apparent_skin_tones", []) or []
        skin_tone_mixed = getattr(vlm, "skin_tone_mixed", False) or False

        # Lighting style & photographer — VLM high-level read
        vlm_lighting_style = getattr(vlm, "lighting_style", "") or ""
        vlm_likely_photographer = getattr(vlm, "likely_photographer", "") or ""
        if vlm_likely_photographer.lower() == "unknown":
            vlm_likely_photographer = ""

        # Pose: VLM is generally more accurate for body position than CV
        # landmarks, especially for non-standard positions (prone, reclined,
        # crouching) and tight crops where landmarks are unreliable.
        vlm_pose = getattr(vlm, "pose", "") or ""
        vlm_expr = getattr(vlm, "expression", "") or ""
        if vlm_pose:
            _cv_pose_lc = pose_text.lower() if pose_text else ""
            # Check if CV pose is vague or commonly wrong
            _cv_is_vague = not pose_text or any(
                tok in _cv_pose_lc
                for tok in ("sitting", "standing", "neutral", "unknown",
                             "profile-ish", "front-ish", "pose data unavailable")
            )
            if _cv_is_vague:
                # CV had nothing useful — use VLM pose directly
                pose_text = vlm_pose
            else:
                # CV has specific info — prefer VLM as primary but keep
                # CV details that VLM missed
                _vlm_lc = vlm_pose.lower()
                _cv_parts = [p.strip() for p in pose_text.split(",")]
                _new_cv = [p for p in _cv_parts if p.lower().strip() not in _vlm_lc]
                if _new_cv:
                    pose_text = vlm_pose + ", " + ", ".join(_new_cv)
                else:
                    pose_text = vlm_pose

        # Expression: always append if available (CV never detects this).
        # Filter out "neutral" when mood/expression signals contradict it —
        # VLM sometimes says "neutral" for expressions that are actually
        # confident, bold, or intense (which it captures in overall_mood).
        if vlm_expr:
            _vlm_mood_lc = (getattr(vlm, "overall_mood", "") or "").lower()
            _active_mood_tokens = {"bold", "confident", "glamorous", "fierce",
                                   "powerful", "sultry", "seductive", "intense",
                                   "dramatic", "theatrical", "regal", "commanding",
                                   "avant-garde", "defiant", "provocative"}
            _mood_is_active = any(t in _vlm_mood_lc for t in _active_mood_tokens)
            if _mood_is_active:
                # Remove "neutral" from expression — it contradicts the mood.
                # Handle both pure "neutral" and "neutral with ..." (keep the
                # descriptive part after "neutral " when present).
                _raw_expr_parts = [p.strip() for p in vlm_expr.split(",")]
                _expr_parts = []
                for _ep in _raw_expr_parts:
                    _ep_lc = _ep.lower().strip()
                    if _ep_lc == "neutral":
                        continue  # pure "neutral" → drop
                    if _ep_lc.startswith("neutral "):
                        # Keep descriptive suffix: "neutral with parted lips" → "slightly parted lips"
                        _suffix = _ep.strip()[len("neutral "):]
                        if _suffix.lower().startswith("with "):
                            _suffix = _suffix[len("with "):]
                        if _suffix:
                            _expr_parts.append(_suffix)
                    else:
                        _expr_parts.append(_ep.strip())
                vlm_expr = ", ".join(_expr_parts)
            if vlm_expr:
                _pose_lc = pose_text.lower()
                if vlm_expr.lower() not in _pose_lc:
                    pose_text = f"{pose_text}, {vlm_expr}" if pose_text else vlm_expr

        # Notable features → enrich pose_notes with physical/cosmetic detail
        # These are things like "strong jawline", "heavy lashes", "prominent
        # cheekbones" that photographers notice and describe in reference images.
        vlm_features = getattr(vlm, "notable_features", []) or []
        if vlm_features:
            _pose_lc = pose_text.lower()
            _new_feats = [f for f in vlm_features if f.lower() not in _pose_lc]
            if _new_feats:
                pose_text = f"{pose_text}, {', '.join(_new_feats)}" if pose_text else ", ".join(_new_feats)

        # Clothing/accessories — only append when meaningful (skip "not visible",
        # "none", or similar non-descriptive values that add noise to pose_notes)
        vlm_clothing = getattr(vlm, "clothing_accessories", "") or ""
        if vlm_clothing:
            _clothing_lc = vlm_clothing.lower().strip()
            _non_descriptive = {"not visible", "none", "n/a", "not applicable",
                                "obscured", "not shown", ""}
            if _clothing_lc not in _non_descriptive:
                _pose_lc = pose_text.lower()
                if _clothing_lc not in _pose_lc:
                    pose_text = f"{pose_text}; {vlm_clothing}" if pose_text else vlm_clothing

        # Pose vocabulary refinement: VLM often says "lying on side" for
        # subjects who are actually prone (face-down, propped on elbows).
        # When floor-level indicators are present (passive bounce, full body),
        # refine to more precise photographer terminology.
        if pose_text:
            _pose_refine_lc = pose_text.lower()
            _has_floor_signal = _early_passive or any(
                tok in _pose_refine_lc for tok in ("floor", "ground", "elbows")
            )
            if _has_floor_signal and "lying on side" in _pose_refine_lc:
                pose_text = pose_text.replace("lying on side", "prone on floor")
                pose_text = pose_text.replace("Lying on side", "Prone on floor")
            elif _has_floor_signal and "lying on" in _pose_refine_lc:
                pose_text = pose_text.replace("lying on", "prone on")
                pose_text = pose_text.replace("Lying on", "Prone on")

        # Styling details → append to visual devices list (filtered).
        # VLM styling_details often include makeup/cosmetic/skin descriptors
        # (e.g. "bold eyeliner", "natural lip color", "smooth skin texture")
        # that describe the subject, not photographic techniques.  Only keep
        # entries that relate to lighting, tonal, or camera technique.
        _STYLING_EXCLUDE_TOKENS = {
            # Makeup / cosmetics
            "eyeliner", "eyeshadow", "eye makeup", "lip color", "lip gloss",
            "lipstick", "mascara", "blush", "foundation", "concealer",
            "contour", "highlighter", "bronzer", "nail", "manicure",
            "makeup",
            # Skin descriptors
            "skin texture", "smooth skin", "matte skin", "dewy skin",
            "blemish", "pore", "complexion",
            # Lip descriptors
            "natural lip", "nude lip", "bold lip", "red lip",
            # Feature descriptors
            "lash", "brow", "eyebrow",
            # Grooming descriptors
            "clean-shaven", "shaven", "stubble", "beard", "mustache",
            "styled hair", "neatly styled", "hair styled",
        }
        vlm_styling = getattr(vlm, "styling_details", []) or []
        if vlm_styling:
            _devices_lc = " ".join(d.lower() for d in devices)
            for detail in vlm_styling:
                _detail_lc = detail.lower()
                if _detail_lc in _devices_lc:
                    continue
                # Skip makeup/cosmetic/skin descriptors
                if any(tok in _detail_lc for tok in _STYLING_EXCLUDE_TOKENS):
                    continue
                devices.append(detail)

        # Framing: VLM is more decisive than CV person_ratio heuristics.
        # When CV says "full body or wide framing" and VLM confirms "full body",
        # commit to the VLM's definitive answer rather than hedging with "or".
        vlm_framing = getattr(vlm, "framing", "") or ""
        if vlm_framing:
            _vlm_framing_lc = vlm_framing.lower().strip()
            _cam_lc = cam_subj.lower() if cam_subj else ""
            _cv_framing_old = cam_subj  # save for learning notes
            if not cam_subj or cam_subj in ("unknown", ""):
                cam_subj = vlm_framing
            elif _person_ratio < 0.01:
                # Segmentation failed — person_ratio ≈ 0 means CV has NO
                # valid pixel data for framing.  Trust VLM unconditionally.
                cam_subj = vlm_framing
                _framing_deriv = (getattr(vlm, "derivation", None) or {}).get("framing_rationale", "")
                notes.append(
                    f"VLM override [framing]: CV said '{_cv_framing_old}' "
                    f"(person_ratio={_person_ratio:.3f}, segmentation failure), "
                    f"VLM sees '{vlm_framing}'. "
                    f"CV learning: person_ratio≈0 should not produce framing guesses."
                    + (f" VLM derivation: {_framing_deriv}" if _framing_deriv else "")
                )
            elif " or " in _cam_lc:
                # CV is hedging — check if VLM resolves the ambiguity
                _either_side = _cam_lc.split(" or ")
                _matched_side = False
                for side in _either_side:
                    if side.strip() in _vlm_framing_lc or _vlm_framing_lc in side.strip():
                        cam_subj = vlm_framing
                        _matched_side = True
                        break
                # VLM disagrees with BOTH hedged options — VLM is likely more
                # accurate (e.g. CV says "full body or wide" but VLM says
                # "three-quarter").  Trust VLM over the hedged CV guess.
                if not _matched_side:
                    cam_subj = vlm_framing
                if cam_subj != _cv_framing_old:
                    _framing_deriv2 = (getattr(vlm, "derivation", None) or {}).get("framing_rationale", "")
                    notes.append(
                        f"VLM override [framing]: CV hedged '{_cv_framing_old}', "
                        f"VLM resolved to '{vlm_framing}'."
                        + (f" VLM derivation: {_framing_deriv2}" if _framing_deriv2 else "")
                    )
            elif _vlm_framing_lc in ("headshot", "head-and-shoulders", "close-up", "tight close-up") and "full body" in _cam_lc:
                # VLM says close framing but CV says full body — VLM is more
                # accurate for distinguishing headshots from full body when
                # person_ratio heuristics are misleading.
                cam_subj = vlm_framing
                notes.append(
                    f"VLM override [framing]: CV said '{_cv_framing_old}' "
                    f"(person_ratio heuristic), VLM sees '{vlm_framing}'. "
                    f"Face detection confirms close framing."
                )

        # Mood: VLM captures emotional register better than classification
        # (which produces single-word labels like "editorial" or "dramatic").
        # Prefer VLM when it's more specific than the CV-derived mood.
        vlm_mood = getattr(vlm, "overall_mood", "") or ""
        if vlm_mood:
            _vlm_mood_lc = vlm_mood.lower()
            _mood_lc = mood.lower() if mood else ""
            # Generic CV moods that VLM can improve on
            _generic_moods = {
                "editorial", "portrait", "dramatic", "neutral", "natural",
                "studio", "cinematic", "unknown", "",
            }
            # Strip compound moods down to check base word
            _base_mood = _mood_lc.split(",")[0].strip() if _mood_lc else ""
            if _base_mood in _generic_moods:
                mood = vlm_mood
            else:
                # Merge: add VLM descriptors not already present
                _vlm_parts = [p.strip() for p in vlm_mood.split(",")]
                _new_mood_parts = [
                    p for p in _vlm_parts if p.lower() not in _mood_lc
                ]
                if _new_mood_parts:
                    mood = f"{mood}, {', '.join(_new_mood_parts)}"
        # Background context: VLM sees the actual scene, which CV
        # segmentation may miss entirely (person_ratio ≈ 0, bg_env empty).
        # When CV produced a generic/wrong background description, VLM
        # overrides it with what's actually visible.
        vlm_bg_ctx = getattr(vlm, "background_context", "") or ""
        if vlm_bg_ctx:
            _vlm_bg_lc = vlm_bg_ctx.lower()
            _bg_rel_lc = bg_rel.lower() if bg_rel else ""
            # Check if CV background is generic or contradicts VLM
            _cv_bg_is_generic = (
                not bg_rel or bg_rel == "" or
                "unknown" in _bg_rel_lc or
                "mid-grey studio" in _bg_rel_lc or
                "evenly lit" in _bg_rel_lc
            )
            _vlm_is_outdoor = any(tok in _vlm_bg_lc for tok in (
                "outdoor", "outside", "balcony", "terrace", "rooftop",
                "street", "sky", "sun", "beach", "park", "garden",
                "city", "building", "urban", "alley", "field",
            ))
            _vlm_is_environmental = any(tok in _vlm_bg_lc for tok in (
                "cafe", "restaurant", "bar", "hotel", "room", "interior",
                "kitchen", "bathroom", "bedroom", "staircase", "window",
            ))
            # Detect hard contradiction: CV says studio but VLM sees outdoor
            _cv_says_studio = any(tok in _bg_rel_lc for tok in (
                "studio", "seamless", "backdrop",
            ))
            _cv_contradicted = _cv_says_studio and (_vlm_is_outdoor or _vlm_is_environmental)

            if _cv_bg_is_generic or _cv_contradicted:
                _cv_bg_old = bg_rel
                # Replace CV background with VLM scene description
                bg_rel = vlm_bg_ctx
                if _cv_contradicted:
                    _bg_deriv = (getattr(vlm, "derivation", None) or {}).get("background_rationale", "")
                    notes.append(
                        f"VLM override [background]: CV said '{_cv_bg_old}' "
                        f"but VLM sees '{vlm_bg_ctx}'. "
                        f"CV learning: segmentation failure (person_ratio={_person_ratio:.3f}) "
                        f"caused bg_env misclassification — bg_pattern='{scene_ctx.bg_pattern if scene_ctx else '?'}' "
                        f"with gradient can be outdoor sky, not studio seamless."
                        + (f" VLM derivation: {_bg_deriv}" if _bg_deriv else "")
                    )
                elif _cv_bg_is_generic and vlm_bg_ctx:
                    notes.append(
                        f"VLM enrichment [background]: CV produced generic '{_cv_bg_old}', "
                        f"VLM provided scene detail: '{vlm_bg_ctx}'."
                    )

        # Scene description for narrative: synthesize VLM data into a
        # scene-level description that photographers care about.
        vlm_scene_parts = []
        if vlm_bg_ctx:
            vlm_scene_parts.append(vlm_bg_ctx)
        vlm_framing_str = getattr(vlm, "framing", "") or ""
        vlm_pose_str = getattr(vlm, "pose", "") or ""
        if vlm_pose_str:
            vlm_scene_parts.append(vlm_pose_str)
    # ── End VLM enrichment ────────────────────────────────────────────

    # Post-VLM genre correction: when the classifier labelled the mood as
    # "cinematic" (which drove genre to "cinematic"), but VLM reveals
    # fashion/theatrical/editorial styling (elaborate costumes, avant-garde,
    # theatrical), "fashion editorial" is more accurate.
    if genre in ("cinematic", "cinematic fine art") and vlm is not None and getattr(vlm, "ok", False):
        _vlm_clothing_gc = (getattr(vlm, "clothing_accessories", "") or "").lower()
        _vlm_mood_gc = (getattr(vlm, "overall_mood", "") or "").lower()
        _mood_gc_lc = mood.lower() if mood else ""
        _fashion_genre_signals = sum([
            any(tok in _vlm_clothing_gc for tok in (
                "costume", "gown", "dress", "couture", "designer",
                "ornate", "elaborate", "ruffled", "embroidered",
            )),
            any(tok in _vlm_mood_gc for tok in (
                "theatrical", "avant-garde", "regal", "editorial", "fashion",
            )),
            any(tok in _mood_gc_lc for tok in ("theatrical", "avant-garde", "regal")),
        ])
        if _fashion_genre_signals >= 2:
            genre = "fashion editorial"

    # Post-VLM genre correction: when VLM background reveals outdoor/
    # environmental scene but genre was set from faulty CV framing
    # (e.g. person_ratio=0 → "extreme close-up" → "headshot"), fix genre
    # to match the actual scene type.
    if scene_ctx and vlm is not None and getattr(vlm, "ok", False):
        _vlm_bg_gc = (getattr(vlm, "background_context", "") or "").lower()
        _scene_is_outdoor = scene_ctx.scene_type == "outdoor" or any(
            tok in _vlm_bg_gc for tok in (
                "outdoor", "outside", "balcony", "terrace", "rooftop",
                "street", "sky", "sun", "beach", "park", "garden",
                "city", "building", "urban",
            )
        )
        _scene_is_env = scene_ctx.scene_type == "environmental" or any(
            tok in _vlm_bg_gc for tok in (
                "cafe", "restaurant", "bar", "hotel", "room", "interior",
            )
        )
        _genre_lc_gc = genre.lower()
        # "headshot" is wrong for outdoor/environmental — it implies studio
        if _genre_lc_gc == "headshot" and (_scene_is_outdoor or _scene_is_env):
            _old_genre = genre
            genre = "environmental" if _scene_is_env else "editorial"
            _subj_deriv = (getattr(vlm, "derivation", None) or {}).get("subject_rationale", "")
            _bg_deriv_g = (getattr(vlm, "derivation", None) or {}).get("background_rationale", "")
            notes.append(
                f"VLM override [genre]: CV classified as '{_old_genre}' "
                f"(from faulty framing due to segmentation failure), "
                f"but VLM reveals {scene_ctx.scene_type} scene → '{genre}'. "
                f"CV learning: when person_ratio≈0 and bg_env is ambiguous, "
                f"do not default to headshot genre."
                + (f" VLM derivation (subject): {_subj_deriv}" if _subj_deriv else "")
                + (f" VLM derivation (background): {_bg_deriv_g}" if _bg_deriv_g else "")
            )
        # "portrait" is too generic for outdoor scenes — "editorial" better
        elif _genre_lc_gc == "portrait" and _scene_is_outdoor:
            genre = "editorial"

    # Post-VLM mood enrichment: detect glamour signals from styling devices.
    # When the image has editorial glamour indicators (voluminous hair,
    # heavy grooming, fine art genre) and "glamorous" isn't already captured,
    # add it. This compensates for VLM mood variability.
    if mood:
        _mood_final_lc = mood.lower()
        if "glamorous" not in _mood_final_lc and "glamour" not in _mood_final_lc:
            _devices_lc = " ".join(d.lower() for d in devices)
            _glamour_signals = sum([
                "voluminous hair" in _devices_lc,
                any(tok in _devices_lc for tok in ("defined lash", "defined eyebrow",
                     "lip color", "lip gloss", "glossy")),
                genre.lower() in ("fine art", "editorial", "fashion", "beauty"),
                any(tok in _mood_final_lc for tok in ("bold", "confident", "powerful",
                     "fierce", "sultry")),
            ])
            if _glamour_signals >= 3:
                mood = f"{mood}, glamorous"

    # Enrich camera_subject_relationship with orientation when distinctive.
    # Landscape orientation with full-body framing → "full body, wide horizontal
    # framing" which is more specific and useful for recreation.
    if image_analysis and cam_subj:
        _orientation = (image_analysis.get("orientation") or "").lower()
        _cam_lc_final = cam_subj.lower()
        if _orientation == "landscape" and "horizontal" not in _cam_lc_final:
            # Full body / wide → add ", wide horizontal framing"
            if "full body" in _cam_lc_final:
                cam_subj = f"{cam_subj}, wide horizontal framing"
            elif "wide" in _cam_lc_final and "horizontal" not in _cam_lc_final:
                cam_subj = cam_subj.replace("wide framing", "wide horizontal framing")

    # ── Pre-narrative device cleanup ─────────────────────────────────
    # Clamshell: both lights are frontal — no rim/edge lighting possible.
    # Remove the device before rebuilding narrative so it doesn't appear.
    _pattern_lc = pattern.lower() if pattern else ""
    if "clamshell" in _pattern_lc:
        devices = [d for d in devices if "rim" not in d.lower() and "edge separation" not in d.lower()]

    # ── Rebuild visual_intent and narrative after VLM enrichment ──────
    # VLM enrichment can change mood, genre, and cam_subj substantially
    # (e.g. mood "cinematic" → "dramatic, theatrical, avant-garde",
    #  genre "cinematic" → "fashion editorial").  Rebuild intent and
    # narrative with the final values so they reflect the VLM-corrected read.
    genre_lower = genre.lower()
    intent_parts_final: List[str] = []
    if mood and mood.lower() not in genre_lower:
        _mood_for_intent_f = mood
        if genre_lower in mood.lower():
            _mood_parts_f = [p.strip() for p in mood.split(",")]
            _mood_parts_f = [p for p in _mood_parts_f if p.lower().strip() != genre_lower]
            _mood_for_intent_f = ", ".join(_mood_parts_f)
        if _mood_for_intent_f:
            intent_parts_final.append(_mood_for_intent_f)
    if pattern and pattern != "unknown" and pattern.lower() not in genre_lower:
        if pattern.lower() not in _TECHNICAL_PATTERNS:
            intent_parts_final.append(pattern.replace("_", " "))
    intent_parts_final.append(genre)
    cr = cue_report.contrast_ratio
    cr_label = cr.label if cr else ""
    tp_check = cue_report.tonal_processing_estimation
    if has_gobo and "gobo" not in genre_lower:
        _gobo_shape_f = ""
        for _dev in devices:
            _dl = _dev.lower()
            if "cross" in _dl:
                _gobo_shape_f = "cross-shaped "
                break
            elif "grid" in _dl or "window" in _dl:
                _gobo_shape_f = "grid-shaped "
                break
            elif "slit" in _dl:
                _gobo_shape_f = "slit-shaped "
                break
        intent_parts_final.append(f"with {_gobo_shape_f}gobo projection")
    elif cr_label in ("extreme", "high") and "chiaroscuro" not in genre_lower:
        _sq_inf_f = cue_inference.get("source_quality")
        _sq_mod_f = getattr(_sq_inf_f, "key_modifier_family", "") if _sq_inf_f else ""
        _sq_is_soft_f = _sq_mod_f in ("softbox", "umbrella", "window", "ambient")
        if not _sq_is_soft_f and _catchlights_contradict_hard_source(vision_data):
            _sq_is_soft_f = True
        if _sq_is_soft_f:
            intent_parts_final.append("with high contrast")
        else:
            intent_parts_final.append("with deep chiaroscuro")
    elif tp_check and tp_check.is_bw and "fine art" not in genre_lower:
        intent_parts_final.append("in monochrome")
    if has_gobo and any("glossy" in d.lower() for d in devices):
        intent_parts_final.append("— styled beauty elements through shaped light")
    visual_intent = " ".join(intent_parts_final)

    # ── Build scene description from VLM data ──────────────────────
    # Synthesize a human-readable scene description from VLM fields.
    # This describes "what's happening in the image" — the scene context
    # that photographers need before getting into technical lighting.
    scene_description = ""
    if vlm_description is not None and getattr(vlm_description, "ok", False):
        _sd_parts: List[str] = []
        _vlm_bg = getattr(vlm_description, "background_context", "") or ""
        _vlm_pose = getattr(vlm_description, "pose", "") or ""
        _vlm_expr = getattr(vlm_description, "expression", "") or ""
        _vlm_framing = getattr(vlm_description, "framing", "") or ""
        _vlm_clothing = getattr(vlm_description, "clothing_accessories", "") or ""
        _vlm_mood = getattr(vlm_description, "overall_mood", "") or ""

        # Build a flowing scene sentence
        if _vlm_bg and _vlm_pose:
            _sd_parts.append(
                f"The subject is {_vlm_pose.lower()}, "
                f"set against {_vlm_bg.lower()}."
            )
        elif _vlm_bg:
            _sd_parts.append(f"The scene takes place in {_vlm_bg.lower()}.")
        elif _vlm_pose:
            _sd_parts.append(f"The subject is {_vlm_pose.lower()}.")

        # Add expression when it adds color
        if _vlm_expr and _vlm_expr.lower() not in ("neutral", "unknown", ""):
            _sd_parts.append(f"The expression reads as {_vlm_expr.lower()}.")

        # Add clothing/styling context when descriptive
        _non_desc = {"not visible", "none", "n/a", "not applicable", "obscured", "not shown", ""}
        if _vlm_clothing and _vlm_clothing.lower().strip() not in _non_desc:
            _sd_parts.append(f"Wearing {_vlm_clothing.lower()}.")

        # Add overall mood as closing
        if _vlm_mood and _vlm_mood.lower() not in (mood.lower() if mood else "", ""):
            _sd_parts.append(f"The overall feel is {_vlm_mood.lower()}.")

        scene_description = " ".join(_sd_parts)

    # Rebuild narrative with final mood, genre, framing, contrast
    narrative = _build_narrative(
        genre=genre,
        mood=mood,
        contrast_feel=contrast_feel,
        bg_rel=bg_rel,
        devices=devices,
        cam_subj=cam_subj,
        source_quality=_sq_for_narr,
        shadow_pattern=_shadow_pattern_for_narr,
        confidence=confidence,
        scene_description=scene_description,
        pose_notes=pose_text,
        likely_photographer=vlm_likely_photographer,
    )

    result = ImageRead(
        genre=genre,
        subject_type=subject_type,
        subject_count=subject_count,
        subject_skin_tones=subject_skin_tones,
        skin_tone_mixed=skin_tone_mixed,
        visual_intent=visual_intent,
        mood=mood,
        camera_subject_relationship=cam_subj,
        pose_notes=pose_text,
        scene_description=scene_description,
        background_relationship=bg_rel,
        contrast_shadow_feel=contrast_feel,
        notable_visual_devices=devices,
        lighting_style=vlm_lighting_style,
        likely_photographer=vlm_likely_photographer,
        narrative=narrative,
        confidence=confidence,
        notes=notes,
    )
    result.resolution_quality = _compute_resolution_quality(result, _IMAGE_READ_SCORABLE)
    return result


def _collect_dramatic_hard_signals(
    classification: Optional[Dict[str, Any]],
    vision_data: Optional[Dict[str, Any]],
    cue_report: VisualCueReport,
    lighting_intel: Any,
    scene_ctx: Optional[SceneContext] = None,
) -> DramaticLightSignals:
    """Collect all signals for dramatic hard-light detection.

    Pure data — no threshold evaluation.  Each signal is a named bool
    that can be tested in isolation.  The companion function
    ``_detect_dramatic_hard_light()`` applies thresholds to these signals.
    """
    sig = DramaticLightSignals()

    if not classification:
        return sig

    # ── Gate: must be classified as "hard" ──
    light_q = (classification.get("lightQuality") or "").lower()
    sig.is_hard_quality = light_q == "hard"

    # ── Gate: soft-modifier catchlights contradict ──
    sig.catchlights_contradict = _catchlights_contradict_hard_source(vision_data)

    # ── Context: face mesh availability ──
    if scene_ctx is not None:
        _no_face_mesh = not scene_ctx.has_face_mesh
        _person_ratio = scene_ctx.person_ratio
        bg_ratio = scene_ctx.bg_ratio
    else:
        _no_face_mesh = False
        _person_ratio = 0.0
        bg_ratio = 0.0
        if vision_data:
            _cl_data = vision_data.get("catchlights", {})
            _cl_reason = (_cl_data.get("reason") or "").lower() if isinstance(_cl_data, dict) else ""
            _no_face_mesh = "no_face_mesh" in _cl_reason
            _region = vision_data.get("region_attribution", {})
            _masks = _region.get("masks", {}) if isinstance(_region, dict) else {}
            _person_ratio = _masks.get("person_ratio", 0.0) or 0.0
            bg_ratio = _masks.get("background_ratio", 0.0) or 0.0
    sig.no_face_mesh = _no_face_mesh

    # ── Scored signals ──

    # Low brightness = dramatic / chiaroscuro
    brightness = (classification.get("brightness") or "").lower()
    sig.low_brightness = brightness in ("low", "very_low")

    # Mood
    mood = (classification.get("mood") or "").lower()
    sig.dramatic_mood = mood in ("dramatic", "edgy", "cinematic", "moody")

    # B&W or high-contrast processing
    tp = cue_report.tonal_processing_estimation
    sig.bw_or_hcg = bool(tp and (tp.is_bw or tp.is_high_contrast_grade))

    # High background ratio (shadow-masked subject)
    # P2c: Suppress when no_face_mesh + low person_ratio → environmental framing
    _env_suppressed = _no_face_mesh and _person_ratio < DRAMATIC.PERSON_RATIO_ENV
    sig.high_bg_ratio = bg_ratio > DRAMATIC.BG_RATIO_SHADOW and not _env_suppressed

    # Zero catchlights or very low modifier confidence
    # P2c: Suppress when no face mesh → data ABSENCE, not evidence
    if lighting_intel and not _no_face_mesh:
        sig.zero_catchlights = lighting_intel.light_count == 0
        sig.low_modifier_conf = getattr(lighting_intel, "modifier_confidence", 1.0) < DRAMATIC.MODIFIER_CONF_LOW

    # High contrast ratio from cues
    cr = cue_report.contrast_ratio
    sig.high_contrast = bool(cr and cr.label in ("high", "extreme"))

    return sig


def _detect_dramatic_hard_light(
    classification: Optional[Dict[str, Any]],
    vision_data: Optional[Dict[str, Any]],
    cue_report: VisualCueReport,
    lighting_intel: Any,
    scene_ctx: Optional[SceneContext] = None,
) -> bool:
    """Heuristic: detect dramatic hard-light scenarios (gobo, chiaroscuro, etc.)
    when the cue extraction's shadow_interruption_pattern fails to fire.

    Returns True when multiple signals converge on a single hard source with
    no fill — even if the formal gobo detector didn't trigger.

    Uses ``_collect_dramatic_hard_signals()`` for signal collection and
    applies threshold evaluation on the resulting ``DramaticLightSignals``.
    """
    sig = _collect_dramatic_hard_signals(
        classification, vision_data, cue_report, lighting_intel,
        scene_ctx=scene_ctx,
    )

    # Gates — must pass before scoring
    if not sig.is_hard_quality:
        return False
    if sig.catchlights_contradict:
        return False

    # Need at least 3 converging signals beyond "hard".
    # P2c: When face mesh failed, all signals are weaker (contrast from
    # floor patterns, brightness from dim interior, etc.).  Require more
    # convergence (4+) to compensate for noisier evidence.
    threshold = DRAMATIC.SCORE_NO_FACE if sig.no_face_mesh else DRAMATIC.SCORE_DEFAULT
    return sig.score >= threshold


def build_lighting_read(
    cue_report: VisualCueReport,
    cue_inference: Dict[str, Any],
    lighting_intel: Any,
    classification: Optional[Dict[str, Any]] = None,
    vision_data: Optional[Dict[str, Any]] = None,
    image_read_devices: Optional[List[str]] = None,
    scene_ctx: Optional[SceneContext] = None,
) -> LightingRead:
    """Build the 'what the light is doing' layer."""
    geometry = cue_inference.get("geometry")
    source_quality_inf = cue_inference.get("source_quality")
    environment = cue_inference.get("environment")
    setup_family = cue_inference.get("setup_family")

    # Detect shadow interruption (gobo/slit) — overrides catchlight-based values
    sip = cue_report.shadow_interruption_pattern
    has_shadow_interruption = sip is not None and sip.detected

    # Cross-check: soft-modifier catchlights contradict shadow interruption
    if has_shadow_interruption and _catchlights_contradict_hard_source(vision_data):
        has_shadow_interruption = False

    # P3d: marginal SIP (<0.70 parallelism) without geometry corroboration.
    # Suppress unless geometry *explicitly* corroborates gobo/slit/projected.
    # Standard patterns (loop, rembrandt, etc.) and "unknown" both indicate the
    # parallel lines are texture noise — reset early so fill/count/family are clean.
    if has_shadow_interruption and sip is not None:
        _sip_par_lr = getattr(sip, "line_parallelism", 1.0) or 1.0
        if _sip_par_lr < 0.70:
            _geo_sp_lr = (getattr(geometry, "shadow_pattern", "unknown") if geometry else "unknown") or "unknown"
            _geo_says_gobo_lr = any(tok in _geo_sp_lr for tok in ("gobo", "slit", "project"))
            if not _geo_says_gobo_lr:
                has_shadow_interruption = False

    # Heuristic fallback: dramatic hard light without formal gobo detection
    inferred_dramatic_hard = False
    if not has_shadow_interruption:
        inferred_dramatic_hard = _detect_dramatic_hard_light(
            classification, vision_data, cue_report, lighting_intel,
            scene_ctx=scene_ctx,
        )

    # Source quality — prefer shadow edge hardness over catchlight modifier when
    # shadow interruption is detected (catchlights may be misleading reflections)
    modifier_fam = "unknown"
    if source_quality_inf:
        modifier_fam = getattr(source_quality_inf, "key_modifier_family", "unknown")
    sq_text = _modifier_to_source_quality(modifier_fam)

    seh = cue_report.shadow_edge_hardness
    if has_shadow_interruption and seh and seh.classification != "unknown":
        # Shadow interruption = trust edge hardness over catchlight modifier
        sq_text = "hard" if seh.classification == "hard" else "soft" if seh.classification == "soft" else "mixed"
    elif inferred_dramatic_hard:
        # Classification says hard + multiple converging signals — trust that
        sq_text = "hard"
    elif sq_text == "unknown" and seh and seh.classification != "unknown":
        sq_text = "hard" if seh.classification == "hard" else "soft" if seh.classification == "soft" else "mixed"

    # Last-resort fallback: use classification.lightQuality when all cue-based
    # methods failed (e.g., complete segmentation failure, no face mesh, no
    # shadow edges).  Classification comes from the VLM-level analysis.
    if sq_text == "unknown" and classification:
        _cls_lq = (classification.get("lightQuality") or classification.get("light_quality") or "").lower()
        if _cls_lq in ("hard", "soft"):
            sq_text = _cls_lq

    # Catchlight-based correction: rectangular/octagonal catchlights are strong
    # evidence of a soft modifier, even if classification or shadow edges say "hard"
    # (B&W processing and contrast grades can make shadow edges appear harder).
    if sq_text == "hard" and _catchlights_contradict_hard_source(vision_data):
        sq_text = "soft"

    # Direction — from geometry inference, with catchlight fallback.
    # P2e: key_light_direction now stores the actual key position (inverted
    # in cue_inference), so no flip needed here.
    direction_text = ""
    if geometry:
        raw_dir = getattr(geometry, "key_light_direction", "unknown")
        direction_text = _DIRECTION_TO_TEXT.get(raw_dir, "")
        height = getattr(geometry, "key_light_height", "unknown")
        height_label = _HEIGHT_LABELS.get(height, "")
        # P1f: Only append height when direction doesn't already encode it
        _dir_has_elev = "elevated" in direction_text.lower() or "below" in direction_text.lower()
        if direction_text and height_label and not _dir_has_elev:
            direction_text = f"{direction_text}, {height_label}"

    # Fallback: derive direction from catchlight clock position when
    # geometry inference couldn't determine direction
    if not direction_text and vision_data:
        cd = vision_data.get("catchlights", {})
        if cd and cd.get("ok"):
            for cl in cd.get("catchlights", []):
                pos = cl.get("position", "")
                if pos:
                    clock = _parse_clock_position(pos)
                    if clock:
                        cl_dir = _CLOCK_TO_DIRECTION.get(clock)
                        if cl_dir:
                            direction_text = _DIRECTION_TO_TEXT.get(cl_dir, "")
                            if direction_text:
                                break

    # Fallback: derive direction from lighting_intel key_position_text or key_side
    if not direction_text and lighting_intel:
        kpt = getattr(lighting_intel, "key_position_text", "") or ""
        if kpt and kpt.lower() not in ("", "undetermined", "unknown"):
            direction_text = kpt
        else:
            ks = getattr(lighting_intel, "key_side", "") or ""
            if ks and ks.lower() not in ("", "undetermined", "unknown"):
                # Convert simple side to descriptive text
                side_map = {"left": "camera-left", "right": "camera-right"}
                direction_text = side_map.get(ks.lower(), ks)

    # Fallback: derive from shadow edge distribution in cue data
    # If shadow_edge_hardness has directional notes, extract them
    if not direction_text and cue_report.shadow_edge_hardness:
        seh_notes = getattr(cue_report.shadow_edge_hardness, "notes", []) or []
        for note in seh_notes:
            note_l = note.lower()
            if "camera-left" in note_l or "camera left" in note_l:
                direction_text = "camera-left"
                break
            elif "camera-right" in note_l or "camera right" in note_l:
                direction_text = "camera-right"
                break

    # Gobo-centered fallback: when a gobo/projection pattern is detected and
    # the pattern appears centered on the subject's face (tight crop, high bg
    # ratio), the light source is likely approximately on-axis.
    if not direction_text and (has_shadow_interruption or inferred_dramatic_hard):
        _bg_r = scene_ctx.bg_ratio if scene_ctx is not None else 0.0
        if scene_ctx is None and vision_data:
            _region = vision_data.get("region_attribution", {})
            _masks = _region.get("masks", {}) if isinstance(_region, dict) else {}
            _bg_r = _masks.get("background_ratio", 0.0) or 0.0
        # High bg ratio + gobo + tight crop → light was aimed at the face
        if _bg_r > 0.7:
            direction_text = "approximately on-axis (centered gobo pattern)"

    # Named-pattern direction fallback: when the shadow pattern name implies
    # a key position (loop, rembrandt, split, butterfly) but all directional
    # cues failed, derive approximate direction from the pattern itself.
    if not direction_text:
        # Check geometry's shadow pattern or lighting_intel pattern
        _pat = ""
        if geometry:
            _pat = (getattr(geometry, "shadow_pattern", "") or "").lower()
        if not _pat or _pat == "unknown":
            _pat = (getattr(lighting_intel, "pattern", "") or "").lower() if lighting_intel else ""
        _PATTERN_DIRECTION = {
            "loop": "approximately 30-45° off-axis, slightly elevated",
            "rembrandt": "approximately 45° off-axis, elevated",
            "split": "approximately 90° to one side (side-lit)",
            "butterfly": "directly above, on-axis (butterfly/paramount)",
            "clamshell": "on-axis, above and below (clamshell)",
        }
        direction_text = _PATTERN_DIRECTION.get(_pat, "")

    if not direction_text:
        direction_text = "unknown"

    # ── Catchlight ↔ shadow direction paradox check ───────────────────────
    # When both a shadow-derived direction (from primary_shadow_direction)
    # AND catchlight clock positions are available, compare them.
    # A horizontal contradiction (shadow says key-from-left, catchlight says
    # key-from-right) is a strong signal that one reading is wrong — flag it
    # for triage rather than silently propagating a contradicted direction.
    _psd = getattr(cue_report, "primary_shadow_direction", None) if cue_report else None
    _psd_dir = getattr(_psd, "direction", "unknown") if _psd else "unknown"
    if _psd_dir not in ("unknown", "") and vision_data:
        _cd = vision_data.get("catchlights", {})
        if _cd and _cd.get("ok"):
            # Derive key direction from shadow direction
            _key_from_shadow = _SHADOW_TO_KEY_DIRECTION.get(_psd_dir, "unknown")
            _shadow_horiz = (
                "left" if "left" in _key_from_shadow
                else "right" if "right" in _key_from_shadow
                else "center"
            )
            # Derive key direction from catchlight clock positions
            for _cl in _cd.get("catchlights", []):
                _cl_pos = _cl.get("position", "")
                if not _cl_pos:
                    continue
                _cl_clock = _parse_clock_position(_cl_pos)
                if not _cl_clock:
                    continue
                _key_from_cl = _CLOCK_TO_DIRECTION.get(_cl_clock, "unknown")
                _cl_horiz = (
                    "left" if "left" in _key_from_cl
                    else "right" if "right" in _key_from_cl
                    else "center"
                )
                if (
                    _shadow_horiz in ("left", "right")
                    and _cl_horiz in ("left", "right")
                    and _shadow_horiz != _cl_horiz
                ):
                    import logging as _rr_log
                    _rr_log.getLogger(__name__).warning(
                        "PARADOX: shadow direction=%r (key from %s) contradicts "
                        "catchlight at %s o'clock (key from %s). "
                        "Possible fill-light catchlight or face-turn asymmetry.",
                        _psd_dir, _key_from_shadow,
                        _cl_clock, _key_from_cl,
                    )
                    # Record on contradictions list for downstream triage
                    if "contradictions" in dir() and isinstance(contradictions, list):
                        contradictions.append(
                            f"catchlight_shadow_paradox: shadow→key={_key_from_shadow} "
                            f"vs catchlight@{_cl_clock}→key={_key_from_cl}"
                        )
                    break  # Flag once per build

    # Shadow pattern — for gobo/slit, include shape when detectable
    # Low-parallelism SIP override: when SIP fires with very low parallelism
    # (< 0.3) AND cue_inference already identified a standard shadow pattern,
    # the SIP is likely a false positive from natural textures (tree shadows,
    # foliage, fabric patterns).  Trust the geometry-based pattern instead.
    _STANDARD_PATTERNS_SIP = {"split", "rembrandt", "loop", "butterfly", "clamshell", "triangle", "broad", "short"}
    _sip_par_val = getattr(sip, "line_parallelism", 1.0) or 1.0 if sip else 1.0
    _geo_sp = (getattr(geometry, "shadow_pattern", "unknown") if geometry else "unknown") or "unknown"
    _sip_cls = getattr(sip, "classification", "unknown") if sip else "unknown"
    if has_shadow_interruption and _sip_par_val < 0.3 and _geo_sp in _STANDARD_PATTERNS_SIP:
        # Low-confidence SIP + reliable geometry → skip gobo, use geometry pattern
        shadow_pattern = _geo_sp
    elif has_shadow_interruption and _sip_cls == "unknown" and _geo_sp in _STANDARD_PATTERNS_SIP:
        # SIP fired but couldn't classify the pattern type (unknown classification).
        # This is weak gobo evidence — natural contrast boundaries, rim light
        # falloff, or hard shadow edges can trigger SIP without an actual gobo.
        # When geometry confidently identifies a standard named pattern, trust
        # the geometric classification over the ambiguous SIP detection.
        shadow_pattern = _geo_sp
    elif (has_shadow_interruption and _sip_par_val < 0.5
          and _geo_sp in _STANDARD_PATTERNS_SIP):
        # P3c: Marginal SIP (parallelism 0.3–0.49) — geometry wins.
        # The code comments on _sip_marginal flag define 0.35–0.49 as marginal;
        # high-contrast editorial grading creates shadow-line edges at this
        # confidence level that look like projected patterns but are editing
        # artifacts.  When geometry clearly resolves a named standard pattern
        # (rembrandt, loop, split, etc.) for the same image, trust geometry.
        shadow_pattern = _geo_sp
    elif (has_shadow_interruption and _sip_par_val < 0.70
          and _geo_sp == "unknown"):
        # P3d: Marginal SIP (<0.70 parallelism) + geometry has no corroboration.
        # Hair, clothing texture, and high-contrast edits often trigger SIP at
        # this confidence without an actual projected pattern.  When geometry
        # has no competing named pattern ("unknown"), we have insufficient
        # evidence to commit to "gobo".  Fall to "unknown" so _build_lighting_family
        # does not label this a gobo setup.
        shadow_pattern = "unknown"
    elif (has_shadow_interruption and _sip_par_val < 0.70
          and _geo_sp in _STANDARD_PATTERNS_SIP):
        # P3e: Marginal SIP (0.50–0.69) AND geometry resolves a standard named
        # pattern.  The standard pattern *disproves* gobo — use geometry.
        shadow_pattern = _geo_sp
    elif has_shadow_interruption:
        # P3f: Face-boundary shadow divide gate (applied before shape resolution).
        # Split and rembrandt lighting create a hard half-face shadow terminator
        # that SIP can detect as "parallel lines" with high parallelism.  In
        # split lighting the hard vertical face divide yields exactly 2 parallel
        # shadow lines that the SIP classifier labels "patterned_projection" with
        # line_count=2 — the same signature as a real cross-shaped gobo.
        # Disambiguate: when a face is present AND the primary shadow direction
        # is clearly lateral (left / right), the parallel evidence is consistent
        # with a face-boundary origin.  "geometric_bar" (single slit / flag) is
        # physically distinct (narrow beam cut by a flag, not a face boundary)
        # and is exempt from this suppression.  All other SIP classifications
        # (patterned_projection, unknown) fall through the suppression when the
        # face + lateral conditions are met, so pattern resolution uses
        # geometry-based scoring (split / rembrandt / loop) rather than
        # committing to "projected".
        _face_present_p3f = False
        if scene_ctx is not None:
            # Face mesh available OR face found but mesh extraction failed
            _face_present_p3f = (
                scene_ctx.has_face_mesh
                or scene_ctx.face_mesh_failure_reason == "no_face_mesh_detected"
            )
        if not _face_present_p3f and vision_data:
            # Tier 2: catchlight pipeline ran ok → face mesh was available
            _cl_fb = vision_data.get("catchlights", {})
            _face_present_p3f = bool(isinstance(_cl_fb, dict) and _cl_fb.get("ok"))
        if not _face_present_p3f and vision_data:
            # Tier 3: face_box exists → face was detected even without mesh
            # (B&W / blown-highlight images can detect a face box but fail
            # the MediaPipe landmark extraction)
            _ra_p3f = vision_data.get("region_attribution", {})
            _face_present_p3f = bool(
                isinstance(_ra_p3f, dict) and _ra_p3f.get("face_box") is not None
            )
        _psd_horiz_lateral_p3f = (
            "left" in _psd_dir or "right" in _psd_dir
        ) and "center" not in _psd_dir

        if _face_present_p3f and _psd_horiz_lateral_p3f:
            # Face shadow boundary misidentified as SIP — suppress.
            # All SIP classifications (patterned_projection, geometric_bar,
            # or unclassified) are suppressed when a face is present and the
            # key is clearly lateral.  A real gobo / flag setup with lateral
            # key is the edge case, but it is rare compared to split / rembrandt
            # portraits; geometry-based scoring handles those when SIP is cleared.
            shadow_pattern = "unknown"
        else:
            # Shape from SIP classification
            _lc = getattr(sip, "line_count", 0) or 0
            if sip.classification == "patterned_projection" and _lc == 2:
                shadow_pattern = "cross-shaped gobo"
            elif sip.classification == "patterned_projection" and _lc >= 4:
                shadow_pattern = "grid/window gobo"
            elif sip.classification == "geometric_bar":
                shadow_pattern = "slit / flag projection"
            else:
                shadow_pattern = "gobo"
    elif inferred_dramatic_hard:
        # Strong dramatic hard-light signals — likely gobo or chiaroscuro.
        # BUT: if cue_inference geometry already identified a standard named
        # pattern (split, rembrandt, etc.) from shadow direction, trust that
        # over defaulting to "gobo".  Hard light ≠ gobo — split lighting is
        # hard by nature but isn't a projected pattern.
        _geo_pattern_dh = (getattr(geometry, "shadow_pattern", "unknown") if geometry else "unknown") or "unknown"
        _intel_pattern_dh = lighting_intel.pattern if (lighting_intel and lighting_intel.pattern != "unknown") else "unknown"
        _STANDARD_PATTERNS = {"split", "rembrandt", "loop", "butterfly", "clamshell", "triangle", "broad", "short"}
        if _geo_pattern_dh in _STANDARD_PATTERNS:
            _heur_base = _geo_pattern_dh
        elif _intel_pattern_dh in _STANDARD_PATTERNS:
            _heur_base = _intel_pattern_dh
        else:
            _heur_base = _intel_pattern_dh if _intel_pattern_dh != "unknown" else "gobo"
            # P3f-dramatic: lighting_intel may propagate an SIP false-positive
            # "projected" value when a face shadow boundary was misread as a gobo
            # pattern (e.g. hard split lighting with no catchlights). When
            # geometry and lighting_intel both lack a named standard pattern AND
            # lighting_intel says "projected", check whether the shadow direction
            # is clearly lateral.  If so, the "projected" label is very likely
            # a face-shadow artifact.  Fall to "unknown" so downstream geometry
            # scoring (split / rembrandt) wins.
            _psd_dh_lateral = (
                "left" in _psd_dir or "right" in _psd_dir
            ) and "center" not in _psd_dir
            # Catch both "projected" (explicit from lighting_intel) and "gobo"
            # (fallback when intel is "unknown") for the lateral-face suppression.
            if _heur_base in ("projected", "gobo") and _psd_dh_lateral:
                _heur_base = "unknown"  # shadow_pattern = _heur_base below
        if _heur_base == "gobo":
            # First check: projected_pattern_shape from person_mask analysis
            _pps = cue_report.projected_pattern_shape
            if _pps == "cross":
                _heur_base = "cross-shaped gobo"
            elif _pps in ("vertical_slit", "horizontal_slit"):
                _heur_base = "slit / flag projection"
            # Second check: image_read device text as fallback
            elif image_read_devices:
                for _dev in image_read_devices:
                    _dl = _dev.lower()
                    if "cross" in _dl:
                        _heur_base = "cross-shaped gobo"
                        break
                    elif "grid" in _dl or "window" in _dl:
                        _heur_base = "grid/window gobo"
                        break
                    elif "slit" in _dl:
                        _heur_base = "slit / flag projection"
                        break
        # After all gobo sub-type checks: if _heur_base is still generic "gobo"
        # (no projected_pattern_shape, no gobo device text) AND geometry
        # identified "low_key", trust the geometric classification.  Low-key is
        # dramatic hard light by nature (single key, dark background, high
        # contrast) and shouldn't be called "gobo" absent actual projection
        # evidence.  This prevents false gobo labels on dramatic portraits.
        if _heur_base == "gobo" and _geo_pattern_dh == "low_key":
            _heur_base = "low_key"

        # P3b: High-contrast editorial grading creates "mixed edge" shadows and
        # dramatic luminance ratios that trigger inferred_dramatic_hard — but
        # these are post-processing artifacts, not actual projected light patterns.
        # When no SIP fired (no real projected shadows detected) and the tonal
        # processing is a high-contrast grade, a "gobo" classification is almost
        # certainly wrong.  Use key-light direction to derive a standard directional
        # pattern (rembrandt → corrected to loop if source quality is soft/mixed
        # by the P2f guard below) rather than calling it a gobo.
        if _heur_base == "gobo":
            _tp_dh = getattr(cue_report, "tonal_processing", None)
            _is_hcg = getattr(_tp_dh, "is_high_contrast_grade", False) if _tp_dh else False
            if _is_hcg:
                # Derive direction-based pattern from geometry key_light_direction.
                # ~45° lateral (upper_left/upper_right) → "rembrandt" as starting
                # point; the P2f guard at line ~2653 will downgrade to "loop" if
                # source quality is soft or mixed.
                _dir_dh = getattr(geometry, "key_light_direction", "unknown") if geometry else "unknown"
                _lateral_dirs = {"upper_left", "upper_right", "left", "right",
                                  "lower_left", "lower_right"}
                if _dir_dh in _lateral_dirs:
                    _heur_base = "rembrandt"
                else:
                    # Overhead or unknown direction → loop is safest default
                    _heur_base = "loop"

        shadow_pattern = _heur_base
    else:
        # Prefer cue_inference geometry's shadow_pattern (uses deduped
        # reflection_architecture) over lighting_intel.pattern (uses raw
        # catchlights that may count floor reflections as separate sources).
        _geo_pattern = getattr(geometry, "shadow_pattern", "unknown") if geometry else "unknown"
        _intel_pattern = lighting_intel.pattern if lighting_intel else "unknown"
        if _geo_pattern != "unknown":
            shadow_pattern = _geo_pattern
        else:
            shadow_pattern = _intel_pattern
        # P2e correction: "triangle" requires 3+ lights from deduped data.
        # If lighting_intel says "triangle" but deduped light count is < 3,
        # the triangle was an artefact of counting floor reflections.
        # Use geometry's deduped count (light_count variable is set later).
        _deduped_lc = getattr(geometry, "light_count_estimate", 0) if geometry else 0
        if shadow_pattern == "triangle" and _deduped_lc < 3:
            shadow_pattern = "unknown"

        # P2f: Rembrandt requires hard light to form the triangle cheek highlight.
        # When geometry infers "rembrandt" but the modifier evidence says "soft"
        # (softbox, octagonal, large umbrella → gradual falloff), the cheek
        # triangle is unlikely to be distinct.  The lighting angle is still ~45°
        # off-axis, which produces "loop" under soft modifiers — so downgrade.
        # Only applies in the standard non-gobo, non-dramatic-hard path.
        if shadow_pattern == "rembrandt" and sq_text in ("soft", "mixed"):
            shadow_pattern = "loop"

    # P2f-global: Apply the same rembrandt→loop correction regardless of which
    # branch set shadow_pattern = "rembrandt".  The marginal-SIP rescue path
    # (P3c above) can also produce "rembrandt" from geometry — it must receive
    # the same softness/mixed correction to avoid calling mixed-edge editorial
    # portraits "Rembrandt" when a true Rembrandt requires hard cheek highlight.
    # Condition: rembrandt + non-hard source quality.
    if shadow_pattern == "rembrandt" and sq_text in ("soft", "mixed"):
        shadow_pattern = "loop"

    # ── Clamshell reality-check (PROVISIONAL — mirrors cue_inference guards) ──
    # reference_read operates at priority 0, so cue_inference pose/BW guards
    # cannot override it.  Apply the same checks here so they have full coverage.
    #
    # Guard A — Pose: clamshell requires a near-frontal face.  When the face
    # is turned (fo.confidence ≥ 0.65 → |yaw| ≈ ≥25°), the "lower" catchlights
    # are from a lateral fill or eye wetness, not a dedicated below-chin reflector.
    # Guard B — BW + unknown direction: B&W images lose shadow-direction signal,
    # so "unknown" key direction is ambiguous (could be lateral, not on-axis).
    # Treating unknown as on-axis to fire clamshell is a false assumption.
    if shadow_pattern == "clamshell":
        _fo_lr = cue_report.face_orientation
        _face_turned_lr = (
            _fo_lr is not None
            and _fo_lr.confidence >= 0.65
            and getattr(_fo_lr, "broad_side", "unknown") not in ("unknown", "")
        )
        _tp_lr = cue_report.tonal_processing_estimation
        _is_bw_lr = getattr(_tp_lr, "is_bw", False)
        _geo_dir_lr = getattr(geometry, "key_light_direction", "unknown") if geometry else "unknown"
        _bw_unknown_lr = _is_bw_lr and _geo_dir_lr in ("unknown", "")
        if _face_turned_lr or _bw_unknown_lr:
            shadow_pattern = "unknown"

    # ── Normalize shadow_pattern to canonical enum values ──────────────
    # The gobo sub-types above are descriptive ("grid/window gobo",
    # "cross-shaped gobo", "slit / flag projection") but downstream
    # consumers (resolve_pattern_candidates, scoring) expect canonical
    # LightingPattern enum values.  Preserve detail in shadow_pattern_detail,
    # collapse to "projected" for the canonical field (formerly "gobo").
    _CANONICAL_PATTERNS = {
        "split", "rembrandt", "loop", "butterfly", "clamshell", "triangle",
        "broad", "short", "projected", "flat", "rim", "unknown",
        # Extended / specialty enum values
        "ring_light", "silhouette_key", "high_key", "low_key", "window_portrait",
        "bare_bulb_editorial", "strip_dramatic", "short_fashion_key", "soft_editorial_key",
        "editorial_rim_key", "tabletop_soft_product", "bottle_backlight",
        "athletic_rim_sculpt", "window_negative_fill", "hybrid",
    }
    shadow_pattern_detail = shadow_pattern  # preserve the descriptive version
    if shadow_pattern not in _CANONICAL_PATTERNS:
        # Map gobo/slit variants to canonical "projected"
        if "gobo" in shadow_pattern.lower():
            shadow_pattern = "projected"
        elif "slit" in shadow_pattern.lower() or "flag" in shadow_pattern.lower():
            shadow_pattern = "projected"
        # else: leave as-is (unknown consumer can handle it)

    # Clamshell direction correction: the standard direction mapping produces
    # "camera-left, ~45 degrees, elevated" (or right) for any upper_left/right
    # direction, but clamshell has the key more overhead than lateral.  The
    # catchlights show the key is above with slight lateral offset — describe
    # this as "above subject, slightly camera-left/right" rather than "~45°".
    if "clamshell" in shadow_pattern.lower() and direction_text and "~45 degrees" in direction_text:
        if "camera-left" in direction_text:
            direction_text = "above subject, slightly camera-left"
        elif "camera-right" in direction_text:
            direction_text = "above subject, slightly camera-right"
        else:
            direction_text = "directly above subject"

    # Fill — gobo/slit and dramatic hard images almost never have fill
    if has_shadow_interruption or inferred_dramatic_hard:
        fill_presence = "none"
    else:
        _face_mesh_avail = getattr(scene_ctx, "has_face_mesh", True) if scene_ctx else True
        fill_presence = _derive_fill_presence(geometry, cue_report, face_mesh_available=_face_mesh_avail) if geometry else "unknown"

    # Lighting family — for gobo/slit or inferred dramatic hard light,
    # override light count from catchlights (catchlights may show multiple
    # reflections from a single masked source, or zero when obscured).
    # Only count a background light when the background is VISIBLY lit.
    # Dark backgrounds (pitch black, as in most gobo/projection setups)
    # never need a dedicated background light — the upstream
    # background_light_detected flag can be a false positive from
    # catchlight-count heuristics.
    if has_shadow_interruption or inferred_dramatic_hard:
        light_count = 1
        bg = cue_report.background_illumination
        # Only count a background light when the background is genuinely lit.
        # _bg_is_effectively_dark() catches cases where the cue extraction
        # classifies a nearly-black background as "gradient" due to tiny
        # luminance variation (e.g. BG mean 2/255).
        bg_is_lit = bg and bg.pattern not in ("dark", "unknown") and not _bg_is_effectively_dark(cue_report)
        if bg_is_lit:
            light_count = 2  # key + dedicated background light
    else:
        # P2e: Prefer cue_inference geometry's light_count_estimate (uses deduped
        # reflection_architecture) over lighting_intel.light_count (uses raw catchlights).
        _geo_lc = getattr(geometry, "light_count_estimate", 0) if geometry else 0
        _intel_lc = lighting_intel.light_count if lighting_intel else 0
        light_count = _geo_lc if _geo_lc > 0 else _intel_lc
        # Correct when upstream reports background light but it's really key spill
        # (bright even background with subject close = no dedicated bg light)
        if light_count >= 2 and lighting_intel and lighting_intel.background_light_detected:
            if _background_is_likely_key_spill(cue_report, lighting_intel):
                light_count = max(1, light_count - 1)

    # Catchlight artifact correction: costume reflections (metallic
    # embellishments, gold trim, jewelry) create false catchlights that
    # survive deduplication.  When detected, reduce light_count to 1.
    _has_artifacts = False
    if not (has_shadow_interruption or inferred_dramatic_hard) and light_count >= 2:
        _has_artifacts = _has_catchlight_artifacts(cue_report, vision_data)
        if _has_artifacts:
            light_count = 1

    # Passive bounce detection: when 2nd catchlight is floor bounce from a
    # single soft key, treat as 1-light setup with passive fill.
    # Must run AFTER light_count and fill_presence are computed.
    _passive_bounce = False
    if not (has_shadow_interruption or inferred_dramatic_hard):
        _passive_bounce = _is_passive_bounce_fill(
            geometry, cue_report, lighting_intel, vision_data,
        )
        if _passive_bounce:
            light_count = 1
            fill_presence = "passive bounce"

    # Rim — derive AFTER passive bounce correction so we use corrected light_count.
    # A single-source setup (including passive bounce) cannot have a dedicated rim.
    if (has_shadow_interruption or inferred_dramatic_hard) and fill_presence == "none":
        rim_presence = "none"
    else:
        rim_presence = _derive_rim_presence(
            cue_report, light_count=light_count, shadow_pattern=shadow_pattern,
        )

    # Fallback: when rim_presence is "unknown" (no specular data) and the
    # setup is a single-key with no fill, rim is implausible — default to "none".
    if rim_presence == "unknown" and light_count <= 1:
        rim_presence = "none"

    lighting_family = _build_lighting_family(shadow_pattern, sq_text, fill_presence, light_count)

    # Tonal processing
    tp_notes = ""
    tp = cue_report.tonal_processing_estimation
    if tp:
        parts: List[str] = []
        if tp.is_bw:
            parts.append("B&W conversion")
            # Warm toning: B&W with residual color warmth
            if tp.mean_saturation > 5:
                parts.append("warm toning")
        if tp.is_high_contrast_grade:
            parts.append("heavy contrast grade")
        if tp.is_desaturated and not tp.is_bw:
            parts.append("desaturated toning")
        if tp.estimated_processing not in ("none", "unknown", ""):
            raw_proc = tp.estimated_processing.replace("_", " ")
            # Skip raw processing tag when a human-readable equivalent
            # is already present (e.g. "bw" when "B&W conversion" added).
            _skip = False
            if raw_proc == "bw" and tp.is_bw:
                _skip = True
            elif raw_proc == "high contrast grade" and tp.is_high_contrast_grade:
                _skip = True
            if not _skip:
                parts.append(raw_proc)
        tp_notes = ", ".join(dict.fromkeys(parts))  # deduplicate

    # Default for natural color images — confirm no special processing so
    # the field is populated (photographers need to know "don't add grading").
    if not tp_notes and tp and tp.confidence >= 0.3:
        tp_notes = "natural color — no significant tonal processing detected"

    # Key observations — pull most important notes, filtering contradictions
    raw_obs: List[str] = []
    if geometry:
        raw_obs.extend(getattr(geometry, "notes", [])[:2])
    if source_quality_inf:
        raw_obs.extend(getattr(source_quality_inf, "notes", [])[:2])
    if environment:
        raw_obs.extend(getattr(environment, "notes", [])[:2])

    # Filter out stale notes that contradict the resolved analysis
    key_obs: List[str] = []
    effectively_dark_bg = _bg_is_effectively_dark(cue_report)
    _shadow_voided_in_lr = (sip is not None and sip.detected) and not has_shadow_interruption
    for note in raw_obs:
        note_lower = note.lower()
        # Drop shadow interruption notes when cross-check voided the detection
        if _shadow_voided_in_lr and any(
            tok in note_lower for tok in (
                "shadow interruption", "projected pattern", "gobo",
            )
        ):
            continue
        # Drop "2 lights" / "multi-shadow" notes when we resolved to 1 light
        if light_count <= 1 and any(
            tok in note_lower
            for tok in ("2 light", "two light", "multi-shadow", "suggests 2")
        ):
            continue
        # Drop "fill likely present" when we resolved to no fill
        if fill_presence == "none" and "fill likely" in note_lower:
            continue
        # Drop "background gradient" notes when bg is effectively dark (P1h)
        if effectively_dark_bg and "background gradient" in note_lower:
            continue
        # Drop "background light" notes when bg is effectively dark
        if effectively_dark_bg and "background light" in note_lower:
            continue
        # Drop "soft shadow edges" when shadow_pattern is projected — the B&W
        # processing fools the edge detector, producing a contradictory note.
        if ("projected" in shadow_pattern or "gobo" in shadow_pattern) and "soft shadow" in note_lower:
            continue
        # Drop "hard shadow edges" note when soft catchlights contradict it
        # (edge hardness inflated by costume textures or post-processing).
        if "hard shadow" in note_lower and _catchlights_contradict_hard_source(vision_data):
            continue
        key_obs.append(note)

    # P2a: When B&W + heavy contrast grade + projected pattern, replace the soft-edge note
    # with a more accurate description of what's actually happening.
    tp_for_obs = cue_report.tonal_processing_estimation
    if ("projected" in shadow_pattern or "gobo" in shadow_pattern) and tp_for_obs and tp_for_obs.is_bw:
        key_obs.insert(0, "Hard-edged projected shadows — shadow edge detector may read as 'soft' due to B&W processing.")

    # P1c: Artistic key observation — when projected pattern + dark background + small
    # visible area, the light IS the composition.  Photographers universally recognise
    # this as a defining characteristic of projected / gobo work: shaped light creates
    # the image rather than merely illuminating a subject.
    _p1c_bg_dark = scene_ctx.bg_is_effectively_dark if scene_ctx is not None else _bg_is_effectively_dark(cue_report)
    if scene_ctx is not None:
        _p1c_person_ratio = scene_ctx.person_ratio
    else:
        _p1c_masks = {}
        if vision_data:
            _ra_p1c = vision_data.get("region_attribution")
            if isinstance(_ra_p1c, dict):
                _p1c_masks = _ra_p1c.get("masks") or {}
        _p1c_person_ratio = _p1c_masks.get("person_ratio", 0.0) or 0.0
    if ("projected" in shadow_pattern or "gobo" in shadow_pattern) and _p1c_bg_dark and _p1c_person_ratio < FRAMING.GOBO_MYSTERIOUS:
        key_obs.append(
            "Shaped light defines the composition — projected beam carves the "
            "subject out of darkness, making light the primary design element."
        )

    # Ambiguity — filter stale shadow interruption notes when cross-check voided it
    ambiguity: List[str] = []
    shadow_voided = (sip is not None and sip.detected) and not has_shadow_interruption
    if setup_family:
        for note in getattr(setup_family, "ambiguity_notes", []):
            if shadow_voided and "shadow interruption" in note.lower():
                continue
            ambiguity.append(note)
    if environment:
        for sc in getattr(environment, "special_cases", []):
            # Filter shadow interruption special case when cross-check voided it
            if shadow_voided and "shadow_interruption" in sc.lower():
                continue
            ambiguity.append(f"Special case: {sc}")

    # P3a: Detect internal contradictions between source_quality and
    # shadow edge hardness. This can happen when B&W processing or
    # contrast grading fools one detector but not the other.
    _seh_class = seh.classification if seh else "unknown"
    if sq_text == "soft" and _seh_class == "hard":
        ambiguity.append(
            "Source quality reads as 'soft' (from modifier/catchlight shape) "
            "but shadow edges appear hard — the image may have heavy post-processing "
            "that inflates edge contrast, or a small soft source at distance."
        )
    elif sq_text == "hard" and _seh_class == "soft":
        ambiguity.append(
            "Source quality reads as 'hard' but shadow edges appear soft "
            "— the hard source may be diffused by atmosphere, distance, or "
            "a scrim between source and subject."
        )

    # Pattern disagreement: when the upstream lighting inference pattern
    # and the resolved shadow pattern diverge, note the ambiguity.
    if lighting_intel and shadow_pattern and shadow_pattern not in ("unknown", ""):
        _li_pat = (getattr(lighting_intel, "pattern", "") or "").lower()
        if _li_pat and _li_pat != "unknown" and _li_pat != shadow_pattern.lower():
            ambiguity.append(
                f"Upstream pattern inference ('{_li_pat}') differs from "
                f"resolved shadow pattern ('{shadow_pattern}') — multiple "
                f"interpretations may be valid."
            )

    # Confidence — start from upstream, but apply a floor when the analysis
    # has correctly resolved multiple core features despite low upstream confidence.
    # An analysis that identifies gobo + single source + no fill + direction
    # is meaningful even if the upstream confidence is very low.
    confidence = 0.0
    if setup_family:
        confidence = round(getattr(setup_family, "primary_confidence", 0.0), 2)

    # Count how many core features were resolved (not "unknown")
    _resolved = 0
    if sq_text not in ("unknown", ""):
        _resolved += 1
    if shadow_pattern not in ("unknown", ""):
        _resolved += 1
    if fill_presence not in ("unknown", ""):
        _resolved += 1
    if direction_text not in ("unknown", ""):
        _resolved += 1
    if light_count > 0:
        _resolved += 1
    # Floor: if we resolved 4+ core features, confidence shouldn't be below 0.3
    if _resolved >= CONFIDENCE.RESOLVED_FLOOR_MIN and confidence < CONFIDENCE.LOW:
        confidence = round(max(confidence, 0.25 + _resolved * 0.02), 2)

    # P2a: Higher floor for confirmed gobo setups.  When gobo pattern is
    # clearly detected AND multiple core features resolve, B&W processing
    # warnings shouldn't tank confidence below 0.50 — the analysis is solid.
    if "gobo" in shadow_pattern and _resolved >= CONFIDENCE.RESOLVED_FLOOR_MIN and confidence < CONFIDENCE.FLOOR_GOBO:
        confidence = CONFIDENCE.FLOOR_GOBO

    # Fallback: when no ambiguity notes were generated but confidence is
    # moderate, add a note so the field conveys what limits certainty.
    if not ambiguity and confidence < 0.55:
        ambiguity.append(
            "Analysis at moderate confidence — some lighting characteristics "
            "could not be determined with high certainty."
        )

    # ── Archetype classification ──
    archetype_data = None
    if vision_data:
        try:
            from engine.archetype_classifier import classify_archetype
            arch_result = classify_archetype(
                catchlight_topology=vision_data.get("catchlight_topology"),
                highlight_symmetry=vision_data.get("highlight_symmetry"),
                highlight_axis_map=vision_data.get("highlight_axis_map"),
                off_axis_key=vision_data.get("off_axis_key"),
                light_structure=vision_data.get("light_structure"),
                separation_light=vision_data.get("separation_light"),
                bounce_contributor=vision_data.get("bounce_contributor"),
                continuous_source=vision_data.get("continuous_source"),
            )
            if arch_result.ok:
                archetype_data = arch_result.model_dump()
        except Exception:
            pass  # archetype classification is supplementary — never block

    result = LightingRead(
        source_quality=sq_text,
        source_direction=direction_text,
        shadow_pattern=shadow_pattern,
        shadow_pattern_detail=shadow_pattern_detail,
        fill_presence=fill_presence,
        rim_presence=rim_presence,
        light_count=light_count,
        lighting_family=lighting_family,
        tonal_processing_notes=tp_notes,
        key_observations=key_obs,
        ambiguity_notes=ambiguity,
        confidence=confidence,
        archetype_classification=archetype_data,
    )
    result.resolution_quality = _compute_resolution_quality(result, _LIGHTING_READ_SCORABLE)
    return result


def build_recreation_setup(
    image_read: ImageRead,
    lighting_read: LightingRead,
    cue_inference: Dict[str, Any],
    lighting_intel: Any,
    classification: Optional[Dict[str, Any]],
    cue_report: VisualCueReport,
    vision_data: Optional[Dict[str, Any]] = None,
    scene_ctx: Optional[SceneContext] = None,
    vlm_description: Optional[Any] = None,
) -> RecreationSetup:
    """Build the 'how to recreate this' layer."""
    setup_family_inf = cue_inference.get("setup_family")
    geometry = cue_inference.get("geometry")

    # Setup family
    family = "unknown"
    if setup_family_inf:
        family = getattr(setup_family_inf, "primary_hypothesis", "unknown")

    # Detect shadow interruption
    sip = cue_report.shadow_interruption_pattern
    has_shadow_interruption = sip is not None and sip.detected

    # Cross-check: soft-modifier catchlights contradict shadow interruption
    if has_shadow_interruption and _catchlights_contradict_hard_source(vision_data):
        has_shadow_interruption = False

    # Heuristic fallback: dramatic hard light
    inferred_dramatic_hard = False
    if not has_shadow_interruption:
        inferred_dramatic_hard = _detect_dramatic_hard_light(
            classification, vision_data, cue_report, lighting_intel,
            scene_ctx=scene_ctx,
        )

    # Blueprint oracle: if lighting_read already resolved a soft or mixed source
    # quality, the dramatic-hard heuristic fired on contrast/shadow cues that
    # the blueprint already accounted for.  Trust the blueprint — suppress the
    # dramatic_hard override so recreation follows the blueprint's determination.
    _lr_sq = (getattr(lighting_read, "source_quality", "") or "").lower()
    if inferred_dramatic_hard and _lr_sq in ("soft", "mixed", "ambient"):
        inferred_dramatic_hard = False

    # If cue_inference produced a gobo/slit family but we voided the shadow
    # interruption (catchlights contradict hard source), reset to unknown so
    # the standard logic derives it from the corrected lighting_read instead.
    if family in ("gobo_projection", "slit_projection", "hard_key_gobo",
                   "slit_cut_light", "slit_flag_projection") \
            and not has_shadow_interruption and not inferred_dramatic_hard:
        family = "unknown"

    # When shadow interruption IS confirmed, classify as gobo/slit.
    # Guard: a confident VLM portrait-family classification + weak line
    # parallelism means the sip fired on hair/clothing shadows, not a real
    # gobo. Require either (a) no competing portrait classification, or
    # (b) high parallelism (≥ 0.70) before overriding the VLM hypothesis.
    _GOBO_FAMILIES = {
        "gobo_projection", "slit_projection", "hard_key_gobo",
        "slit_cut_light", "slit_flag_projection", "projected_shadow_pattern",
        "unknown",
    }
    # Cross-check lighting_read: if the lighting analysis (which already has
    # catchlight contradiction + geometry corrections) does NOT describe a
    # gobo/slit/projected setup, a marginal shadow interruption is almost
    # certainly a false positive from hair or clothing texture.
    _lighting_fam_lc = (getattr(lighting_read, "lighting_family", "") or "").lower()
    _lighting_says_gobo = any(
        tok in _lighting_fam_lc for tok in ("gobo", "slit", "projected", "projection")
    )
    if has_shadow_interruption:
        _sip_parallelism = getattr(sip, "line_parallelism", 1.0) or 1.0
        _vlm_conf = getattr(setup_family_inf, "primary_confidence", 0.0) \
            if setup_family_inf else 0.0
        _has_portrait_family = family not in _GOBO_FAMILIES
        # Suppress false-positive when:
        # (a) VLM setup inference says portrait + high confidence + marginal parallelism
        # (b) lighting_read says non-gobo + marginal parallelism (strongest oracle)
        _suppress_fp = (
            (_has_portrait_family and _vlm_conf >= 0.50 and _sip_parallelism < 0.70)
            or (not _lighting_says_gobo and _sip_parallelism < 0.70)
        )
        if _suppress_fp:
            has_shadow_interruption = False
            # Also reset family if VLM had incorrectly guessed gobo
            if family in _GOBO_FAMILIES:
                family = "unknown"  # will be properly re-derived below
        else:
            if sip.classification == "geometric_bar":
                family = "slit_flag_projection"
            elif sip.classification == "patterned_projection":
                family = "gobo_projection"
            else:
                family = "projected_shadow_pattern"

    # Override family when dramatic hard light is inferred.
    # Set gobo_projection when shadow_pattern is the canonical "projected"
    # (normalized from gobo/slit variants) or still carries a descriptive
    # gobo/slit prefix (pre-normalization paths).
    elif inferred_dramatic_hard and family == "unknown":
        _sp = (getattr(lighting_read, "shadow_pattern", "") or "").lower().strip()
        if _sp == "projected" or _sp.startswith("gobo") or _sp.startswith("slit"):
            family = "gobo_projection"
        else:
            family = "dramatic_chiaroscuro"

    # Derive family from lighting_read when still unknown.
    # Use the lighting_family string which now includes pattern info.
    if family == "unknown":
        family = lighting_read.lighting_family.replace("-", "_")

    # P1c: Override natural_ambient when evidence points to studio.
    # Rectangular/octagonal catchlights = studio modifier (softbox, octabox).
    # Controlled/gradient background = studio environment.
    # Together these override the "natural_ambient" hypothesis, which can be
    # a false positive from environmental_shadow_continuity detecting warm
    # background tones in a toned B&W image.
    if "natural" in family:
        _env = cue_inference.get("environment")
        _bg_controlled = False
        if _env:
            _bg_controlled = getattr(_env, "background_treatment", "") in ("controlled",)
        # Also check bg pattern directly for gradient (P2c mid-tone studio)
        _bg = cue_report.background_illumination
        if _bg and _bg.pattern in ("gradient", "even", "dark"):
            _bg_controlled = True
        _has_studio_catchlights = False
        _cs = cue_report.catchlight_shape
        if _cs and _cs.confidence > 0.3 and _cs.dominant_shape in ("rectangular", "octagonal", "square"):
            _has_studio_catchlights = True
        if _has_studio_catchlights and _bg_controlled:
            # Replace with lighting_read's family which is derived from actual
            # lighting character (source quality, pattern, fill presence)
            family = lighting_read.lighting_family.replace("-", "_")

    # Modifier suggestion — gobo/slit overrides catchlight-based modifier
    # ETC Source Four (ellipsoidal) is the standard fixture for projection
    # work — built-in gobo slot. Optical snoot on a strobe is the alt path.
    # P1a: Include detected gobo shape (cross, slit, etc.) in the suggestion
    #       so the photographer knows which gobo to cut/buy.
    _pps_rec = cue_report.projected_pattern_shape
    if has_shadow_interruption:
        if sip.classification == "geometric_bar":
            modifier_suggestion = (
                "ETC Source Four or optical snoot on strobe, with flag, "
                "venetian blind, or slit gobo"
            )
        elif sip.classification == "patterned_projection":
            # P1a: shape-specific gobo suggestion
            if _pps_rec == "cross":
                modifier_suggestion = (
                    "ETC Source Four with cross-shaped gobo in gate slot, "
                    "or optical snoot on strobe with cross-cut mask"
                )
            elif _pps_rec in ("vertical_slit", "horizontal_slit"):
                modifier_suggestion = (
                    "ETC Source Four with slit gobo in gate slot, "
                    "or optical snoot on strobe with slit mask"
                )
            else:
                modifier_suggestion = (
                    "ETC Source Four with gobo in gate slot, "
                    "or optical snoot on strobe with projection mask"
                )
        else:
            modifier_suggestion = (
                "ETC Source Four with gobo, or optical snoot on strobe "
                "with flag or projection mask"
            )
    elif inferred_dramatic_hard:
        # P3a: When gobo IS detected (from shadow_pattern or devices),
        # commit to the gobo recommendation — don't say "if desired"
        _has_gobo_evidence = "gobo" in lighting_read.shadow_pattern.lower()
        if _has_gobo_evidence:
            if _pps_rec == "cross":
                modifier_suggestion = (
                    "ETC Source Four with cross-shaped gobo in gate slot, "
                    "or optical snoot on strobe with cross-cut mask"
                )
            else:
                modifier_suggestion = (
                    "ETC Source Four with gobo in gate slot, "
                    "or optical snoot on strobe with projection mask"
                )
        else:
            modifier_suggestion = (
                "fresnel or ETC Source Four — add gobo or flag "
                "for projected shadow effects"
            )
    else:
        modifier_fam = lighting_intel.modifier_family if lighting_intel else None
        modifier_suggestion = _MODIFIER_TO_PRACTICAL.get(modifier_fam or "", "unknown")
        if modifier_suggestion == "unknown" and lighting_read.source_quality != "unknown":
            if lighting_read.source_quality == "hard":
                modifier_suggestion = "head with standard reflector, fresnel, or zoom reflector"
            elif lighting_read.source_quality == "soft":
                # P1g: When soft + strong fill or low contrast → extensive
                # wrap → recommend larger modifier for more enveloping light.
                _has_extensive_wrap = (
                    lighting_read.fill_presence in ("moderate", "strong")
                    or (cue_report.contrast_ratio and cue_report.contrast_ratio.label in ("low",))
                )
                if _has_extensive_wrap:
                    modifier_suggestion = (
                        "large softbox (3x4 or larger) or shoot-through umbrella, "
                        "placed close to subject for maximum wrap"
                    )
                else:
                    modifier_suggestion = "medium softbox (2x3) or umbrella"
            elif lighting_read.source_quality == "mixed":
                modifier_suggestion = "beauty dish or small softbox with grid"
            elif lighting_read.source_quality == "ambient":
                modifier_suggestion = (
                    "reflector or scrim to shape available ambient light — "
                    "no artificial source needed for primary key"
                )

        # P1d: When a known modifier was found from catchlights (e.g. softbox)
        # but fill is present → the wrap is broader than a bare medium box.
        # Recommend at least medium-to-large to account for fill.
        if modifier_suggestion != "unknown" and lighting_read.source_quality == "soft":
            _fill_present = lighting_read.fill_presence in ("subtle", "moderate", "strong")
            _is_small_medium = "medium softbox (2x3" in modifier_suggestion
            if _fill_present and _is_small_medium:
                modifier_suggestion = (
                    "medium-to-large softbox (2x3 to 3x4) or umbrella, "
                    "positioned close to subject"
                )

    # Full-body framing requires a larger modifier than head-and-shoulders.
    # A 2x3 covers a face/torso; for full body you need at least 3x4.
    _framing_lc_mod = (image_read.camera_subject_relationship or "").lower()
    _is_full_body = "full body" in _framing_lc_mod or "full-body" in _framing_lc_mod
    if _is_full_body and lighting_read.source_quality == "soft":
        if "medium softbox (2x3)" in modifier_suggestion and "3x4" not in modifier_suggestion:
            modifier_suggestion = modifier_suggestion.replace(
                "medium softbox (2x3)", "large softbox (3x4 or larger)"
            )
        elif "medium-to-large softbox (2x3 to 3x4)" in modifier_suggestion:
            modifier_suggestion = modifier_suggestion.replace(
                "medium-to-large softbox (2x3 to 3x4)", "large softbox (3x4 or larger)"
            )

    # When catchlights are rectangular, the modifier is definitively a softbox —
    # not an umbrella (which produces round catchlights). Remove umbrella
    # alternatives to give a more accurate recreation suggestion.
    _cs_rec = cue_report.catchlight_shape
    _cs_shape = (getattr(_cs_rec, "dominant_shape", "") if _cs_rec else "").lower()
    if _cs_shape in ("rectangular", "square") and "umbrella" in modifier_suggestion:
        # Replace "or umbrella" and "or shoot-through umbrella" variants
        import re as _re_mod
        modifier_suggestion = _re_mod.sub(
            r",?\s*or\s+(shoot-through\s+)?umbrella", "", modifier_suggestion
        ).strip().rstrip(",")

    # Light count — use lighting_read's count (already corrected for gobo)
    light_count = lighting_read.light_count

    # Key placement — chain fallbacks:
    # 1. geometry direction + height (most precise)
    # 2. lighting_intel.key_position_text (from catchlights)
    # 3. lighting_read.source_direction (already resolved with fallbacks)
    # 4. lighting_intel.key_side (basic side info)
    key_placement = _key_placement_text(geometry) if geometry else ""
    if not key_placement and lighting_intel:
        kpt = getattr(lighting_intel, "key_position_text", "") or ""
        if kpt and kpt.lower() not in ("", "undetermined", "unknown"):
            key_placement = kpt
    if not key_placement and lighting_read.source_direction not in ("", "unknown"):
        # Avoid propagating long explanatory text from degraded-mode strategies
        if "indeterminate" not in lighting_read.source_direction:
            key_placement = lighting_read.source_direction
    if not key_placement and lighting_intel:
        ks = getattr(lighting_intel, "key_side", "") or ""
        if ks and ks.lower() not in ("", "undetermined", "unknown"):
            side_map = {"left": "camera-left", "right": "camera-right"}
            key_placement = side_map.get(ks.lower(), ks)

    # Degraded-mode fallback: when face mesh is unavailable, provide a
    # reasonable default rather than leaving key_placement empty.
    if not key_placement and scene_ctx and not scene_ctx.has_face_mesh:
        if scene_ctx.scene_type == "studio_portrait":
            key_placement = (
                "45° camera-left or camera-right, elevated — "
                "adjust to taste (face mesh unavailable for precise placement)"
            )
        elif scene_ctx.scene_type == "environmental":
            key_placement = (
                "follow available ambient light direction — "
                "add reflector or supplemental source as needed"
            )

    # Fill strategy
    cr = cue_report.contrast_ratio
    cr_label = cr.label if cr else "unknown"
    fill_strategy = _derive_fill_strategy(
        lighting_read.fill_presence, cr_label,
        shadow_pattern=lighting_read.shadow_pattern,
    )

    # Background strategy — correct for false positives.
    # Don't trust background_light_detected when background is effectively dark.
    bg_light = lighting_intel.background_light_detected if lighting_intel else False
    if bg_light and _bg_is_effectively_dark(cue_report):
        bg_light = False  # Dark background — upstream false positive
    is_key_spill = bg_light and _background_is_likely_key_spill(cue_report, lighting_intel)
    if is_key_spill:
        bg_light = False
    background_strategy = _derive_background_strategy(cue_report, bg_light, is_key_spill=is_key_spill)

    # Camera-subject guidance — framing description lives here;
    # focal length + aperture are broken out into their own fields.
    cam_guidance = image_read.camera_subject_relationship or ""

    # Suggest focal length & aperture from image geometry (truth-layer first).
    # Extract face_ratio and person_ratio from the vision pipeline data so the
    # recommendation is anchored to measured pixel coverage rather than text
    # keyword matching on the framing description string.
    focal_length = ""
    aperture = ""

    _geo_face_ratio = 0.0
    _geo_person_ratio = scene_ctx.person_ratio if scene_ctx else 0.0
    _geo_lum_delta: Optional[float] = None

    # Face ratio from face_box + image dimensions
    if vision_data:
        _fb = vision_data.get("region_attribution", {}).get("face_box")
        _masks = vision_data.get("region_attribution", {}).get("masks", {})
        _img_h = _masks.get("_image_h", 0) or 0
        _img_w = _masks.get("_image_w", 0) or 0
        if _fb and len(_fb) == 4 and _img_h > 1 and _img_w > 1:
            _face_area = max(0, _fb[2] - _fb[0]) * max(0, _fb[3] - _fb[1])
            _geo_face_ratio = _face_area / (_img_h * _img_w)

    # Background separation as secondary aperture signal
    _sep = cue_report.subject_background_separation
    if _sep and _sep.luminance_delta is not None:
        _geo_lum_delta = _sep.luminance_delta

    # Use geometry when we have at least one reliable signal
    _has_geo = _geo_person_ratio > 0.01 or _geo_face_ratio > 0.005
    if _has_geo:
        focal_length, aperture = _infer_focal_aperture_from_geometry(
            face_ratio=_geo_face_ratio,
            person_ratio=_geo_person_ratio,
            luminance_delta=_geo_lum_delta,
        )
    else:
        # Fallback: keyword match on framing text when geometry is unavailable
        # (e.g. no segmentation mask, reference was a crop without a person).
        framing_lc = cam_guidance.lower()
        if "close" in framing_lc or "tight" in framing_lc:
            focal_length = "85–135mm"
            aperture = "f/2.8–5.6"
        elif "head" in framing_lc:
            focal_length = "85–105mm"
            aperture = "f/5.6–8"
        elif "full" in framing_lc or "environmental" in framing_lc:
            focal_length = "35–85mm"
            aperture = "f/8–11"
        elif "three-quarter" in framing_lc or "3/4" in framing_lc or "medium" in framing_lc:
            focal_length = "50–85mm"
            aperture = "f/5.6–8"

    # Setup notes
    setup_notes: List[str] = []
    tp = cue_report.tonal_processing_estimation
    if tp and tp.is_bw:
        setup_notes.append(
            "Original image is B&W — match the lighting, then convert in post."
        )
    if tp and tp.is_high_contrast_grade:
        setup_notes.append(
            "Heavy contrast grade detected — some shadow depth may be editorial, "
            "not from lighting alone."
        )
    # Note for non-BW/non-HCG images with other tonal processing
    # (desaturation, film emulation) — photographer needs to match in post.
    if tp and not tp.is_bw and not tp.is_high_contrast_grade:
        if tp.is_desaturated or tp.estimated_processing in (
            "film_emulation", "heavy_grade",
        ):
            setup_notes.append(
                "Post-processing detected (desaturation or film emulation) — "
                "match the tonal character in post-production."
            )

    # Floor-level camera guidance: when subject is prone/lying on the floor,
    # the camera must be at floor level to meet the subject's eyeline.
    _pose_lc_rec = image_read.pose_notes.lower() if image_read.pose_notes else ""
    _is_prone = any(tok in _pose_lc_rec for tok in (
        "prone", "lying", "floor", "reclined", "reclining", "on side",
    ))
    _is_full_body = "full" in cam_guidance.lower() or "wide" in cam_guidance.lower()
    if _is_prone and _is_full_body:
        setup_notes.append(
            "Subject is prone/lying on the floor — shoot from floor level "
            "(low tripod or camera on ground) to meet the subject's eyeline."
        )

    # Use cross-checked has_shadow_interruption (not raw sip.detected)
    # to avoid stale gobo references when catchlights voided the detection.
    if has_shadow_interruption:
        if sip.classification == "geometric_bar":
            setup_notes.append(
                "Geometric bar shadows suggest a flag or venetian blind in front of "
                "the light source."
            )
        elif sip.classification == "patterned_projection":
            setup_notes.append(
                "Projected shadow pattern — use a gobo or patterned mask between "
                "light and subject."
            )
    elif inferred_dramatic_hard:
        setup_notes.append(
            "Image shows dramatic hard-light characteristics — likely a single "
            "hard source with no fill. Consider adding a gobo or flag if the "
            "original has projected shadow patterns."
        )

    # Practical gobo placement guidance when gobo/projection is the setup family
    if has_shadow_interruption or (inferred_dramatic_hard and "gobo" in family):
        setup_notes.append(
            "Gobo placement: position the gobo/mask 2-3 feet from the subject "
            "for sharp projected edges. Use foamcore, cinefoil, or a commercial "
            "gobo frame. Smaller light source = sharper projection edges."
        )

    # Filter stale gobo/shadow references from hints when cross-check voided detection
    shadow_voided = (sip is not None and sip.detected) and not has_shadow_interruption
    if setup_family_inf:
        for hint in getattr(setup_family_inf, "recommendation_hints", []):
            if shadow_voided and any(
                tok in hint.lower() for tok in (
                    "gobo", "shadow interruption", "projected shadow",
                    "projected pattern shadow",
                )
            ):
                continue
            setup_notes.append(hint)

    # Soft/hard contradiction: when catchlights say "soft" but shadow edges
    # read "hard" and the image isn't already flagged as HCG, the perceived
    # contrast is likely from post-processing — note it for recreation.
    _seh_rec = cue_report.shadow_edge_hardness
    _seh_cls_rec = (getattr(_seh_rec, "classification", "") or "").lower() if _seh_rec else ""
    if (lighting_read.source_quality == "soft"
            and _seh_cls_rec == "hard"
            and not (tp and tp.is_high_contrast_grade)):
        setup_notes.append(
            "Tonal processing affects perceived contrast — modifier inference "
            "should be weighted lower than catchlight shape evidence."
        )

    # Alternates — use upstream alternates, or generate plausible ones.
    # Filter alternates that contradict the resolved light count.
    # E.g. "triangle_headshot (3 lights)" is invalid when light_count=1.
    _SETUP_LIGHT_COUNTS = {
        "triangle_headshot": 3,
        "clamshell_beauty": 2,
    }
    alternates: List[Dict[str, Any]] = []
    if setup_family_inf:
        for alt in getattr(setup_family_inf, "alternate_hypotheses", []):
            # alternate_hypotheses is List[FieldCandidate] — use attribute access
            hyp = alt.value if not isinstance(alt, dict) else alt.get("hypothesis", "")
            expected_lc = _SETUP_LIGHT_COUNTS.get(hyp)
            if expected_lc is not None and light_count < expected_lc:
                continue  # Skip — contradicts resolved light count
            # RecreationSetup.alternate_hypotheses remains List[Dict] — convert back
            alt_dict = (
                {"hypothesis": alt.value, "confidence": alt.confidence,
                 "reason": alt.demotion_reason}
                if not isinstance(alt, dict) else alt
            )
            alternates.append(alt_dict)

    # Confidence — apply same floor logic as lighting_read.
    # When we've identified a specific setup family, modifier, fill, and bg
    # strategy, the analysis has value even if upstream confidence is low.
    confidence = 0.0
    if setup_family_inf:
        confidence = round(getattr(setup_family_inf, "primary_confidence", 0.0), 2)
    # Floor: use lighting_read's confidence as a minimum (it already has the floor)
    if confidence < lighting_read.confidence:
        confidence = lighting_read.confidence

    # P2a: Gobo-specific alternates — when gobo is inferred from heuristics
    # (not formal SIP), always offer plausible alternative interpretations
    # since we can't confirm the exact projected pattern.
    if not alternates and family == "gobo_projection" and inferred_dramatic_hard:
        _sp_lower = lighting_read.shadow_pattern.lower()
        if "cross" in _sp_lower:
            alternates.append({
                "hypothesis": "two_perpendicular_strip_lights",
                "confidence": max(0.1, confidence - 0.10),
                "reason": (
                    "A cross-shaped pattern could be two perpendicular "
                    "strip lights or barn-doored snoots rather than a single gobo."
                ),
            })
        alternates.append({
            "hypothesis": "single_snoot_with_flag",
            "confidence": max(0.1, confidence - 0.08),
            "reason": (
                "A tightly snooted or barn-doored source with a flag "
                "can produce similar dramatic projected shadow patterns."
            ),
        })
        alternates.append({
            "hypothesis": "dramatic_chiaroscuro",
            "confidence": max(0.1, confidence - 0.05),
            "reason": "Hard source with no fill — could be chiaroscuro without a gobo.",
        })

    # P1e: When confidence is moderate-to-low (<0.6) and no alternates exist,
    # generate plausible alternatives so the user has options.
    # Raised from 0.3 to 0.6 — most studio portraits don't reach high
    # confidence due to B&W processing and tonal ambiguity.
    if confidence < 0.6 and not alternates:
        _sq = lighting_read.source_quality
        _fill = lighting_read.fill_presence
        if _sq == "hard":
            # Hard source — could be several dramatic setups.
            # Generate alternates regardless of fill presence: the fill
            # might be subtle/bounce and doesn't rule out dramatic setups.
            if family != "dramatic_chiaroscuro":
                alternates.append({
                    "hypothesis": "dramatic_chiaroscuro",
                    "confidence": max(0.1, confidence - 0.05),
                    "reason": "Hard source often produces chiaroscuro-style lighting.",
                })
            if family != "gobo_projection" and not has_shadow_interruption:
                alternates.append({
                    "hypothesis": "gobo_projection",
                    "confidence": max(0.1, confidence - 0.05),
                    "reason": "If projected shadows are present, this may be a gobo setup.",
                })
            if family != "classic_rembrandt":
                alternates.append({
                    "hypothesis": "classic_rembrandt",
                    "confidence": max(0.1, confidence - 0.08),
                    "reason": "Hard key can produce Rembrandt or split lighting.",
                })
        elif _sq == "soft":
            if family != "beauty_clamshell":
                alternates.append({
                    "hypothesis": "beauty_clamshell",
                    "confidence": max(0.1, confidence - 0.05),
                    "reason": "Soft source setup — could be a clamshell or butterfly arrangement.",
                })
        elif _sq == "ambient":
            alternates.append({
                "hypothesis": "natural_window_key",
                "confidence": max(0.1, confidence - 0.05),
                "reason": "Environmental scene — could be window light or doorway acting as key.",
            })
            alternates.append({
                "hypothesis": "practical_sources",
                "confidence": max(0.1, confidence - 0.08),
                "reason": (
                    "Scene lighting may come from practical sources "
                    "(lamps, signs, overhead fixtures)."
                ),
            })
        elif _sq == "unknown" or _sq == "mixed":
            # Source quality could not be determined — offer broad alternates
            alternates.append({
                "hypothesis": "single_key_with_modifier",
                "confidence": max(0.1, confidence - 0.05),
                "reason": (
                    "Source quality is uncertain — could be a single key "
                    "through a softbox, umbrella, or bare reflector."
                ),
            })
            alternates.append({
                "hypothesis": "natural_window_light",
                "confidence": max(0.1, confidence - 0.08),
                "reason": "Could be natural window light producing the observed tonal range.",
            })

    # Low-confidence note — always add when applicable, even if alternates
    # came from upstream.  Moved outside the `if not alternates` block so
    # images with upstream alternates still get the advisory.
    if confidence < 0.6:
        _low_conf_msg = (
            "Low confidence in primary hypothesis — consider showing user "
            "multiple setup options rather than a single recommendation."
        )
        if not any("low confidence" in n.lower() for n in setup_notes):
            setup_notes.append(_low_conf_msg)

    # ── VLM-informed recreation corrections ─────────────────────────
    # VLM provides scene/subject context that CV cannot detect.
    # VLM WINS over CV for recreation recommendations when the scene
    # context changes what gear/setup is appropriate.
    vlm_rec_notes: List[str] = []
    _vlm = vlm_description
    if _vlm is not None and getattr(_vlm, "ok", False):
        _vlm_subj_type = (getattr(_vlm, "subject_type", "") or "").lower()
        _vlm_subj_count = getattr(_vlm, "subject_count", 1) or 1
        _vlm_skin_tones = getattr(_vlm, "apparent_skin_tones", []) or []
        _vlm_skin_mixed = getattr(_vlm, "skin_tone_mixed", False) or False
        _vlm_bg = (getattr(_vlm, "background_context", "") or "").lower()

        # ── Multi-subject corrections ──
        # Groups, couples, threesomes need wider light spread + different
        # modifier sizing than single-subject portraits.
        if _vlm_subj_count >= 2:
            # Modifier: groups need larger coverage
            _cv_mod_old = modifier_suggestion
            if "medium softbox (2x3)" in modifier_suggestion:
                modifier_suggestion = modifier_suggestion.replace(
                    "medium softbox (2x3)",
                    "large softbox (3x4 or larger) or strip bank"
                )
                _subj_deriv_r = (getattr(_vlm, "derivation", None) or {}).get("subject_rationale", "")
                vlm_rec_notes.append(
                    f"VLM override [modifier]: CV recommended '{_cv_mod_old}' "
                    f"(single-subject sizing), VLM sees {_vlm_subj_count} subjects "
                    f"({_vlm_subj_type}). "
                    f"CV learning: multi-subject scenes need wider light coverage."
                    + (f" VLM derivation: {_subj_deriv_r}" if _subj_deriv_r else "")
                )
            elif "medium-to-large softbox" in modifier_suggestion:
                modifier_suggestion = modifier_suggestion.replace(
                    "medium-to-large softbox (2x3 to 3x4)",
                    "large softbox (4x6) or twin strip banks"
                )
                _subj_deriv_r2 = (getattr(_vlm, "derivation", None) or {}).get("subject_rationale", "")
                vlm_rec_notes.append(
                    f"VLM override [modifier]: CV sized for single subject, "
                    f"VLM sees {_vlm_subj_count} subjects ({_vlm_subj_type}). "
                    f"CV learning: group coverage requires 4x6 or wider."
                    + (f" VLM derivation: {_subj_deriv_r2}" if _subj_deriv_r2 else "")
                )

            # Key placement: wider groups need key moved further back
            if key_placement and "45°" in key_placement:
                key_placement += (
                    f" — pull light further back to cover {_vlm_subj_count} subjects evenly"
                )

            # Fill strategy: groups need more even fill
            if fill_strategy and "subtle" in fill_strategy.lower():
                _fill_old = fill_strategy
                fill_strategy += (
                    " — increase fill coverage for even illumination across "
                    f"all {_vlm_subj_count} subjects"
                )

            # Setup note for multi-subject
            _subj_note = (
                f"Multiple subjects detected ({_vlm_subj_type}, {_vlm_subj_count}) — "
                f"ensure even light coverage across all subjects. "
                f"Position subjects at similar distances from key light."
            )
            setup_notes.append(_subj_note)

        # ── Skin tone recreation guidance ──
        # Different skin tones require different exposure/modifier strategies.
        if _vlm_skin_tones:
            _has_dark = any(
                t in ("dark", "very dark", "medium-dark")
                for t in _vlm_skin_tones
            )
            _has_light = any(
                t in ("fair", "very fair", "light-medium")
                for t in _vlm_skin_tones
            )

            if _vlm_skin_mixed:
                setup_notes.append(
                    f"Mixed skin tones ({', '.join(_vlm_skin_tones)}) — "
                    f"meter for the darker skin tone to preserve detail, "
                    f"then control highlights on lighter skin with fill or "
                    f"flagging. Use a soft, large source to minimize contrast "
                    f"range between subjects."
                )
            elif _has_dark and lighting_read.source_quality == "hard":
                setup_notes.append(
                    f"Darker skin tone ({', '.join(_vlm_skin_tones)}) with hard "
                    f"light — open up exposure 1/3 to 2/3 stop from meter "
                    f"reading to preserve skin luminosity. Hard light on dark "
                    f"skin creates strong specular highlights — consider adding "
                    f"subtle fill or using a slightly larger source."
                )

        # ── Outdoor/environmental scene corrections ──
        # When VLM sees outdoor but CV recommends studio gear, correct.
        _outdoor_tokens = {
            "outdoor", "outside", "balcony", "terrace", "rooftop",
            "street", "sky", "sun", "beach", "park", "garden",
            "field", "city", "alley", "sidewalk",
        }
        _vlm_is_outdoor = any(tok in _vlm_bg for tok in _outdoor_tokens)
        _env_tokens = {
            "cafe", "restaurant", "bar", "hotel", "lobby", "room",
            "interior", "kitchen", "window", "doorway", "staircase",
        }
        _vlm_is_env = any(tok in _vlm_bg for tok in _env_tokens)

        if _vlm_is_outdoor:
            # Don't recommend studio-only gear for outdoor scenes
            _cv_family_old = family
            if family in ("unknown", "studio_portrait", "classic_rembrandt",
                          "beauty_clamshell") and \
                    scene_ctx and scene_ctx.scene_type == "outdoor":
                family = "natural_ambient"
                _bg_deriv_r = (getattr(_vlm, "derivation", None) or {}).get("background_rationale", "")
                vlm_rec_notes.append(
                    f"VLM override [setup_family]: CV said '{_cv_family_old}' "
                    f"but VLM sees outdoor scene ('{_vlm_bg[:60]}'). "
                    f"CV learning: outdoor scenes should not default to studio "
                    f"setup families."
                    + (f" VLM derivation: {_bg_deriv_r}" if _bg_deriv_r else "")
                )

            # Modifier for outdoor: recommend reflectors/scrims, not softboxes
            if "softbox" in modifier_suggestion and \
                    scene_ctx and scene_ctx.scene_type == "outdoor":
                _cv_mod_old = modifier_suggestion
                modifier_suggestion = (
                    "reflector (silver for punch, white for soft fill) or "
                    "scrim/diffusion panel to shape natural light — "
                    "add portable strobe with small modifier for fill if needed"
                )
                _bg_deriv_r2 = (getattr(_vlm, "derivation", None) or {}).get("background_rationale", "")
                vlm_rec_notes.append(
                    f"VLM override [modifier]: CV recommended '{_cv_mod_old}' "
                    f"(studio modifier) but VLM sees outdoor scene. "
                    f"CV learning: outdoor images use reflectors/scrims, "
                    f"not studio softboxes."
                    + (f" VLM derivation: {_bg_deriv_r2}" if _bg_deriv_r2 else "")
                )

            # Background strategy for outdoor
            if not background_strategy or background_strategy == "unknown" \
                    or "dark" in background_strategy.lower():
                _bg_old = background_strategy
                background_strategy = (
                    f"natural environment — {_vlm_bg[:80] if _vlm_bg else 'outdoor setting'}. "
                    f"Scout for similar location or use practical backdrop"
                )
                if _bg_old and _bg_old != "unknown":
                    _bg_deriv_r3 = (getattr(_vlm, "derivation", None) or {}).get("background_rationale", "")
                    vlm_rec_notes.append(
                        f"VLM override [background_strategy]: CV said "
                        f"'{_bg_old}', VLM sees outdoor '{_vlm_bg[:60]}'. "
                        f"CV learning: outdoor bg_strategy should describe "
                        f"location scouting, not studio backdrops."
                        + (f" VLM derivation: {_bg_deriv_r3}" if _bg_deriv_r3 else "")
                    )

        elif _vlm_is_env:
            # Environmental scene (cafe, room, etc.)
            if not background_strategy or "dark" in background_strategy.lower() \
                    or background_strategy == "unknown":
                background_strategy = (
                    f"practical location — {_vlm_bg[:80] if _vlm_bg else 'interior setting'}. "
                    f"Use existing environment; supplement with portable lights if needed"
                )

            # Add environmental setup note
            _env_note = (
                f"Environmental/location scene ({_vlm_bg[:60]}) — work with "
                f"available light first, then supplement. Gel any added lights "
                f"to match ambient color temperature."
            )
            if not any("environmental" in n.lower() or "location" in n.lower()
                       for n in setup_notes):
                setup_notes.append(_env_note)

    # Merge VLM recreation notes into image_read notes for improvement log
    if vlm_rec_notes:
        image_read.notes.extend(vlm_rec_notes)

    result = RecreationSetup(
        setup_family=family,
        modifier_suggestion=modifier_suggestion,
        light_count=light_count,
        key_placement=key_placement,
        fill_strategy=fill_strategy,
        background_strategy=background_strategy,
        camera_subject_guidance=cam_guidance,
        focal_length=focal_length,
        aperture=aperture,
        setup_notes=setup_notes,
        alternate_hypotheses=alternates,
        confidence=confidence,
    )
    result.resolution_quality = _compute_resolution_quality(result, _RECREATION_SCORABLE)
    return result


def _apply_environmental_strategy(
    lighting_read: LightingRead,
    scene_ctx: SceneContext,
    cue_report: VisualCueReport,
) -> LightingRead:
    """Post-build corrections for environmental scenes.

    When the scene is environmental (café, room, street, etc.), several
    fields that are studio-oriented produce misleading values:
      - source_quality = "hard" → should be "ambient" when no face mesh
      - source_direction = "unknown" → should explain limitation
      - light_count = 0 → should be at least 1 (ambient exists)

    This function consolidates what were previously scattered gates in
    ``build_lighting_read`` into one place.
    """
    if scene_ctx.scene_type != "environmental":
        return lighting_read

    # source_quality: "ambient" instead of misleading "hard" or "unknown"
    if lighting_read.source_quality in ("hard", "unknown") and not scene_ctx.has_face_mesh:
        lighting_read.source_quality = "ambient"

    # source_direction: explain why indeterminate
    if lighting_read.source_direction == "unknown" and not scene_ctx.has_face_mesh:
        lighting_read.source_direction = "environmental ambient — direction indeterminate"

    # light_count: minimum 1 (ambient exists)
    if lighting_read.light_count == 0:
        lighting_read.light_count = 1

    # shadow_pattern: derive descriptive pattern from available cues
    # when face-mesh-dependent pattern inference couldn't run.
    if lighting_read.shadow_pattern in ("unknown", ""):
        _seh = cue_report.shadow_edge_hardness
        _seh_cls = (getattr(_seh, "classification", "") or "").lower() if _seh else ""
        if _seh_cls == "hard":
            lighting_read.shadow_pattern = "hard directional shadows (environmental)"
        elif _seh_cls == "soft":
            lighting_read.shadow_pattern = "soft diffuse shadows (environmental)"
        elif _seh_cls == "mixed":
            lighting_read.shadow_pattern = "mixed shadows (environmental)"
        else:
            lighting_read.shadow_pattern = "environmental ambient"

    lighting_read.data_quality = "environmental_limited"
    return lighting_read


def _apply_studio_degraded_strategy(
    lighting_read: LightingRead,
    scene_ctx: SceneContext,
    cue_report: VisualCueReport,
) -> LightingRead:
    """Post-build corrections for studio scenes without face mesh.

    When the scene is classified as studio_portrait but face mesh detection
    failed, several face-dependent fields (shadow_pattern, source_direction)
    will be "unknown" because the geometry inference chain had no data.

    This function provides sensible fallbacks derived from the cues that
    *are* available: shadow edge hardness, background characteristics,
    tonal processing, and person mask data.
    """
    if scene_ctx.scene_type != "studio_portrait" or scene_ctx.has_face_mesh:
        return lighting_read

    # shadow_pattern: derive from shadow_edge_hardness classification
    # (analogous to environmental strategy but with studio-specific labels)
    if lighting_read.shadow_pattern in ("unknown", ""):
        _seh = cue_report.shadow_edge_hardness
        _seh_cls = (getattr(_seh, "classification", "") or "").lower() if _seh else ""
        if _seh_cls == "hard":
            lighting_read.shadow_pattern = "hard shadows — face-mesh unavailable for pattern classification"
        elif _seh_cls == "soft":
            lighting_read.shadow_pattern = "soft shadows — face-mesh unavailable for pattern classification"
        elif _seh_cls == "mixed":
            lighting_read.shadow_pattern = "mixed shadows — face-mesh unavailable for pattern classification"
        else:
            lighting_read.shadow_pattern = "studio — pattern indeterminate (no face mesh)"

    # source_direction: when all fallback layers failed, acknowledge the
    # limitation rather than leaving a bare "unknown"
    if lighting_read.source_direction == "unknown":
        lighting_read.source_direction = (
            "indeterminate — face mesh unavailable for shadow direction analysis"
        )

    # Confidence adjustment: the original confidence was calculated before
    # these fallbacks filled in shadow_pattern and source_direction.  Re-count
    # resolved core features and apply a floor so confidence reflects the
    # actual (post-fix) state of the analysis.
    _resolved = 0
    if lighting_read.source_quality not in ("unknown", ""):
        _resolved += 1
    if lighting_read.shadow_pattern not in ("unknown", ""):
        _resolved += 1
    if lighting_read.fill_presence not in ("unknown", ""):
        _resolved += 1
    if lighting_read.source_direction not in ("unknown", ""):
        _resolved += 1
    if lighting_read.light_count > 0:
        _resolved += 1
    if _resolved >= CONFIDENCE.RESOLVED_FLOOR_MIN and lighting_read.confidence < CONFIDENCE.LOW:
        lighting_read.confidence = round(max(lighting_read.confidence, 0.25 + _resolved * 0.02), 2)

    # data_quality: mark as degraded so downstream can distinguish
    lighting_read.data_quality = "studio_no_face_mesh"
    return lighting_read


def _apply_unknown_scene_strategy(
    lighting_read: LightingRead,
    scene_ctx: SceneContext,
    cue_report: VisualCueReport,
) -> LightingRead:
    """Fallback corrections for unclassified scenes without face mesh.

    Outdoor, rooftop, or ambiguous scenes where neither environmental nor
    studio classification was confident, and no face mesh is available.
    Uses shadow edge hardness, contrast, and specular data to fill fields
    that would otherwise stay "unknown".

    Key insight for outdoor scenes: shadow angle on ground/walls, shadow
    edge hardness, and specular highlights are available even without face
    mesh and can inform source quality and shadow pattern.
    """
    # Only fire for unknown scene type without face mesh, and only when
    # there are still unresolved fields.
    if scene_ctx.scene_type not in ("unknown", "outdoor"):
        return lighting_read
    if scene_ctx.has_face_mesh:
        return lighting_read

    # Always mark data_quality for outdoor/unknown scenes without face mesh
    if not lighting_read.data_quality or lighting_read.data_quality == "full":
        lighting_read.data_quality = "outdoor_no_face_mesh"

    _has_gaps = (
        lighting_read.shadow_pattern in ("unknown", "")
        or lighting_read.source_direction == "unknown"
    )
    if not _has_gaps:
        return lighting_read

    # shadow_pattern: derive from shadow edge hardness + contrast
    _seh = cue_report.shadow_edge_hardness
    _seh_cls = (getattr(_seh, "classification", "") or "").lower() if _seh else ""
    _cr = cue_report.contrast_ratio
    _cr_label = (_cr.label if _cr else "unknown").lower()

    if lighting_read.shadow_pattern in ("unknown", ""):
        if _seh_cls == "hard":
            if _cr_label == "extreme":
                lighting_read.shadow_pattern = "hard directional shadows — strong contrast visible on ground/surfaces"
            else:
                lighting_read.shadow_pattern = "hard directional shadows (outdoor)"
        elif _seh_cls == "soft":
            lighting_read.shadow_pattern = "soft diffuse shadows (outdoor/overcast)"
        elif _seh_cls == "mixed":
            lighting_read.shadow_pattern = "mixed shadows — multiple sources or mixed light conditions"
        else:
            lighting_read.shadow_pattern = "outdoor — shadow pattern indeterminate (no face mesh)"

    # source_direction: infer from shadow edge angle and specular data
    if lighting_read.source_direction == "unknown":
        _spec = cue_report.specular_highlight_behavior
        _spec_spread = (getattr(_spec, "spread", "") or "").lower() if _spec else ""
        # Outdoor with strong/tight specular = direct sun (high, behind or to side)
        if _spec and _spec_spread == "tight":
            lighting_read.source_direction = (
                "high overhead or behind subject — hard specular highlights "
                "indicate direct sun or strong point source"
            )
        elif _seh_cls == "hard":
            lighting_read.source_direction = (
                "directional — hard shadow edges indicate a single dominant "
                "source (sun or strobe), angle indeterminate without face mesh"
            )
        elif _seh_cls == "soft":
            lighting_read.source_direction = (
                "diffuse — soft shadows suggest overcast sky or large scrim/reflector"
            )
        else:
            lighting_read.source_direction = (
                "outdoor/mixed — direction indeterminate without face mesh"
            )

    # Confidence adjustment — same logic as studio degraded
    _resolved = 0
    if lighting_read.source_quality not in ("unknown", ""):
        _resolved += 1
    if lighting_read.shadow_pattern not in ("unknown", ""):
        _resolved += 1
    if lighting_read.fill_presence not in ("unknown", ""):
        _resolved += 1
    if lighting_read.source_direction not in ("unknown", ""):
        _resolved += 1
    if lighting_read.light_count > 0:
        _resolved += 1
    if _resolved >= CONFIDENCE.RESOLVED_FLOOR_MIN and lighting_read.confidence < CONFIDENCE.LOW:
        lighting_read.confidence = round(max(lighting_read.confidence, 0.25 + _resolved * 0.02), 2)

    lighting_read.data_quality = "outdoor_no_face_mesh"
    return lighting_read


def build_reference_photo_analysis(
    vision_data: Optional[Dict[str, Any]],
    classification: Optional[Dict[str, Any]],
    cue_report: Optional[VisualCueReport],
    lighting_intel: Any,
    image_analysis: Optional[Dict[str, Any]],
    vlm_description: Optional[Any] = None,
) -> ReferencePhotoAnalysis:
    """Orchestrate the three-layer reference photo read.

    Returns a ``ReferencePhotoAnalysis`` with image_read, lighting_read,
    and recreation_setup.  If cue_report is unavailable, returns ok=False.

    Parameters
    ----------
    vlm_description : optional VLMDescription
        When available, VLM-derived subject/expression details are merged
        into the image_read layer to enrich pose, styling, and framing.
    """
    if cue_report is None or not cue_report.ok or cue_report.cues_computed == 0:
        return ReferencePhotoAnalysis(
            ok=False,
            notes=["Cue extraction unavailable — reference analysis requires cue data."],
        )

    from engine.cue_inference import run_cue_inference_pipeline

    cue_inference = run_cue_inference_pipeline(cue_report)

    # Build scene context once — threaded to all downstream builders.
    # VLM data is passed to allow fallback scene classification when CV
    # signals are weak (e.g. person_ratio ≈ 0, bg_env empty).
    scene_ctx = _build_scene_context(vision_data, cue_report, vlm_description=vlm_description)

    # ── Blueprint first: lighting_read is the single authority ──────────
    # All downstream builders (image_read, recreation_setup) read from it
    # rather than independently re-deriving lighting character from raw CV.
    lighting_read = build_lighting_read(
        cue_report=cue_report,
        cue_inference=cue_inference,
        lighting_intel=lighting_intel,
        classification=classification,
        vision_data=vision_data,
        scene_ctx=scene_ctx,
    )

    # Phase 3: Environmental scene corrections (consolidated)
    lighting_read = _apply_environmental_strategy(lighting_read, scene_ctx, cue_report)

    # Studio degraded-mode corrections: when studio is detected but face
    # mesh is unavailable (B&W, extreme contrast, obscured face), fill in
    # fields that would otherwise stay "unknown".
    lighting_read = _apply_studio_degraded_strategy(lighting_read, scene_ctx, cue_report)

    # Outdoor/unknown scene corrections: use shadow angle on ground/walls,
    # shadow edge properties, and specular data for outdoor images without
    # face mesh where no other strategy has fired.
    lighting_read = _apply_unknown_scene_strategy(lighting_read, scene_ctx, cue_report)

    # ── VLW Reconciliation: compare VLM hypothesis vs CV evidence ──
    vlw_result = None
    if vlm_description is not None and getattr(vlm_description, "ok", False):
        from engine.vlw_reconciliation import (
            reconcile_vlw, apply_confirmed_boosts, apply_vlm_overrides,
        )

        vlw_result = reconcile_vlw(
            vlm_description=vlm_description,
            lighting_read=lighting_read,
            scene_ctx=scene_ctx,
            cue_report=cue_report,
            classification=classification,
        )

        # Auto-override: apply VLM values for known CV false-positive patterns
        # (e.g. high-contrast grade making soft light read as hard in CV).
        # This is the single-decider path — blueprint reflects VLM where CV
        # has a predictable systematic error.
        lighting_read = apply_vlm_overrides(lighting_read, vlw_result)

        # SAFE PATH: only apply confidence boosts from confirmed dimensions.
        if vlw_result.confirmed_count > 0:
            lighting_read = apply_confirmed_boosts(lighting_read, vlw_result)

        # Log remaining conflicts for human review.
        if vlw_result.conflict_count > 0:
            for reason in vlw_result.human_review_reasons:
                lighting_read.ambiguity_notes.append(f"[VLW CONFLICT] {reason}")

    # ── image_read runs after blueprint is fully resolved ────────────
    # lighting_read is passed as the oracle so image_read doesn't need to
    # re-derive source quality, gobo, or hard-light from raw CV signals.
    image_read = build_image_read(
        vision_data=vision_data,
        classification=classification,
        cue_report=cue_report,
        cue_inference=cue_inference,
        lighting_intel=lighting_intel,
        image_analysis=image_analysis,
        vlm_description=vlm_description,
        scene_ctx=scene_ctx,
        lighting_read=lighting_read,
    )

    # Log VLM corrections to improvement table for CV learning
    if image_read and image_read.notes:
        try:
            from engine.vlm_improvement_log import log_vlm_corrections
            _img_path = ""
            if image_analysis:
                _img_path = image_analysis.get("path", "") or image_analysis.get("image_path", "")
            log_vlm_corrections(
                _img_path,
                image_read.notes,
                extra={
                    "scene_type": scene_ctx.scene_type if scene_ctx else "unknown",
                    "person_ratio": scene_ctx.person_ratio if scene_ctx else 0.0,
                    "has_face_mesh": scene_ctx.has_face_mesh if scene_ctx else False,
                },
            )
        except Exception:
            pass  # best-effort

    recreation_setup = build_recreation_setup(
        image_read=image_read,
        lighting_read=lighting_read,
        cue_inference=cue_inference,
        lighting_intel=lighting_intel,
        classification=classification,
        cue_report=cue_report,
        vision_data=vision_data,
        scene_ctx=scene_ctx,
        vlm_description=vlm_description,
    )

    # ── Post-build cross-layer corrections ──────────────────────────
    # These adjustments require data from multiple layers and can't be
    # computed inside a single builder function.
    if lighting_read and image_read:
        # Add floor bounce device when passive bounce detected
        if lighting_read.fill_presence == "passive bounce":
            if "floor bounce fill" not in image_read.notable_visual_devices:
                image_read.notable_visual_devices.append("floor bounce fill")

        # Remove rim/edge-separation device when rim is definitively none
        if lighting_read.rim_presence == "none":
            image_read.notable_visual_devices = [
                d for d in image_read.notable_visual_devices
                if "rim" not in d.lower() and "edge separation" not in d.lower()
            ]

        # Remove "background gradient" device when it's just key falloff
        # from a single source with passive bounce
        if lighting_read.fill_presence == "passive bounce":
            image_read.notable_visual_devices = [
                d for d in image_read.notable_visual_devices
                if "background gradient" not in d.lower()
            ]

    # Rebuild narrative after device corrections — the narrative was built
    # inside build_image_read() before cross-layer device cleanup (rim
    # removal, floor bounce addition, etc.).  Re-generate it with the
    # corrected device list so the narrative matches the final devices.
    if lighting_read and image_read:
        image_read.narrative = _build_narrative(
            genre=image_read.genre,
            mood=image_read.mood,
            contrast_feel=image_read.contrast_shadow_feel,
            bg_rel=image_read.background_relationship,
            devices=image_read.notable_visual_devices,
            cam_subj=image_read.camera_subject_relationship,
            source_quality=lighting_read.source_quality,
            shadow_pattern=lighting_read.shadow_pattern,
            confidence=lighting_read.confidence,
            scene_description=image_read.scene_description,
            pose_notes=image_read.pose_notes,
            likely_photographer=image_read.likely_photographer,
        )

    # ── Push unique narrative insights into card-rendered fields ──
    # These were previously embedded in the longer narrative prose.
    # Now that the narrative is a short summary, surface them in the
    # fields that RefLightingCard already renders.
    if lighting_read and image_read:
        # Light character synthesis: soft source + hard-looking edges = processing
        if (lighting_read.source_quality == "soft"
                and image_read.contrast_shadow_feel
                and "hard shadow" in image_read.contrast_shadow_feel.lower()):
            _obs = (
                "Source is soft (catchlight/modifier evidence) but shadow edges "
                "appear hard — likely a post-processing contrast artifact, not "
                "actual hard light."
            )
            if _obs not in lighting_read.key_observations:
                lighting_read.key_observations.append(_obs)

        # Confidence hedge → ambiguity_notes
        if lighting_read.confidence < CONFIDENCE.LOW:
            _hedge = (
                "Confidence in this read is low — the image may be ambiguous "
                "or processing may mask the original lighting character."
            )
            if _hedge not in lighting_read.ambiguity_notes:
                lighting_read.ambiguity_notes.append(_hedge)
        elif lighting_read.confidence < CONFIDENCE.MODERATE:
            _hedge = (
                "Some lighting characteristics are uncertain — heavy processing "
                "or limited visual data may affect accuracy."
            )
            if _hedge not in lighting_read.ambiguity_notes:
                lighting_read.ambiguity_notes.append(_hedge)

    # Build VLM dump for the response when available
    vlm_dump = None
    if vlm_description is not None and getattr(vlm_description, "ok", False):
        vlm_dump = vlm_description

    # Extract color palette from VLM signals when available
    color_palette: Optional[ColorPalette] = None
    if vlm_description is not None:
        _sigs = getattr(vlm_description, "signals", None)
        if _sigs is not None:
            color_palette = getattr(_sigs, "color_palette", None)

    return ReferencePhotoAnalysis(
        image_read=image_read,
        lighting_read=lighting_read,
        recreation_setup=recreation_setup,
        color_palette=color_palette,
        vlm_description=vlm_dump,
        vlw_reconciliation=vlw_result,
        ok=True,
    )
