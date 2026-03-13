"""Vision-Language Model (VLM) integration for reference photo enrichment.

Calls an external VLM (OpenAI GPT-4o by default) to extract subject/scene
details that pure CV cannot detect: expression nuance, cosmetic details,
styling, framing context.

The VLM is NOT used for lighting analysis — the local CV pipeline handles that.

Configuration (env vars):
    VLM_PROVIDER      – "openai" (default) | "anthropic" | "none" (disable)
                         When unset or "auto", uses OpenAI if OPENAI_API_KEY
                         is present, otherwise disables VLM. No auto-fallback
                         to Anthropic — set VLM_PROVIDER="anthropic" explicitly.
    OPENAI_API_KEY    – Required when VLM_PROVIDER is "openai"
    ANTHROPIC_API_KEY – Required when VLM_PROVIDER is "anthropic"
    VLM_MODEL         – Model name override (default depends on provider)
"""
from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from engine.image_analysis_models import (
    VLMDescription,
    VLMSignals,
    VLMGeometrySignals,
    VLMShadowSignals,
    VLMHighlightSignals,
    VLMCatchlightSignals,
    VLMReconstructionEstimates,
)

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

_VLM_PROVIDER = os.environ.get("VLM_PROVIDER", "auto").lower().strip()
_VLM_MODEL = os.environ.get("VLM_MODEL", "")

# Auto-detect provider: use OpenAI if key is set, otherwise disable.
# No fallback to Anthropic — provider must be set explicitly.
if _VLM_PROVIDER == "auto":
    if os.environ.get("OPENAI_API_KEY"):
        _VLM_PROVIDER = "openai"
    else:
        _VLM_PROVIDER = "none"

# Default model per provider
if not _VLM_MODEL:
    if _VLM_PROVIDER == "openai":
        _VLM_MODEL = "gpt-4.1"
    elif _VLM_PROVIDER == "anthropic":
        _VLM_MODEL = "claude-sonnet-4-20250514"
    else:
        _VLM_MODEL = ""


def vlm_available() -> bool:
    """Return True if a VLM provider is configured and usable."""
    if _VLM_PROVIDER == "none":
        return False
    if _VLM_PROVIDER == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    if _VLM_PROVIDER == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    return False


# ── Prompt ───────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional photography lighting analyst. Your job is to extract \
OBSERVABLE PHYSICAL SIGNALS from a reference portrait photo. A separate rule \
engine interprets these signals — you must NEVER determine the final lighting \
setup, modifier type, or equipment. You extract signals only.

Return a JSON object with two sections:

═══ SECTION 1: SUBJECT & SCENE (legacy compatibility) ═══

{
  "subject_type": "<who: 'woman', 'man', 'child', 'couple', 'group', etc.>",
  "subject_count": <integer>,
  "apparent_skin_tones": ["<Fitzpatrick-adjacent: 'very fair', 'fair', 'light-medium', 'medium', 'medium-dark', 'dark', 'very dark'>"],
  "skin_tone_mixed": <true if subjects have visibly different skin tones>,
  "framing": "<tight close-up, head-and-shoulders, three-quarter, full body, etc.>",
  "pose": "<head position, body angle, gaze direction, chin tilt>",
  "expression": "<facial expression and emotional quality>",
  "styling_details": ["<cosmetic/styling: lashes, lip gloss, skin texture, makeup, hair>"],
  "notable_features": ["<physical features highlighted by composition: jawline, cheekbones, eyes>"],
  "background_context": "<what is visible in background, or 'dark/featureless'>",
  "clothing_accessories": "<visible clothing, jewelry, accessories>",
  "overall_mood": "<2-4 comma-separated mood descriptors>",
  "lighting_style": "<ONE lighting family name for compatibility — choose from: 'rembrandt', 'loop', 'butterfly/paramount', 'split', 'broad', 'short', 'clamshell', 'flat/beauty', 'rim/edge', 'natural/ambient', 'mixed/practical', 'dramatic/chiaroscuro', 'high-key', 'low-key'>",
  "likely_photographer": "<known photographer name or 'unknown'>",
  "derivation": {
    "framing_rationale": "<how you determined the framing>",
    "background_rationale": "<how you determined the background>",
    "subject_rationale": "<how you determined subject type/count>",
    "skin_tone_rationale": "<how you assessed skin tones, correcting for lighting>",
    "lighting_style_rationale": "<how you identified the lighting family>"
  },

═══ SECTION 2: PHYSICAL SIGNALS (new — extract what you observe) ═══

  "signals": {
    "geometry": {
      "camera_height_relative_to_eyes": "<'above' | 'at_eye_level' | 'below' | null>",
      "camera_horizontal_angle": "<'straight_on' | 'slight_left' | 'slight_right' | 'profile_left' | 'profile_right' | null>",
      "head_rotation_deg": <float -90 to 90 (negative=turned left, positive=right) or null>,
      "torso_rotation_deg": <float -90 to 90 or null>,
      "shoulder_line_angle": <float degrees from horizontal, -45 to 45 or null>,
      "subject_lean": "<'none' | 'toward_camera' | 'away' | 'left' | 'right' | null>",
      "confidence": <float 0.0-1.0>,
      "notes": ["<brief reasoning for geometry observations>"]
    },
    "shadows": {
      "shadow_vector_deg": <float 0-360, clock direction shadow falls on face (0=down from directly above, 90=falls to subject's left, 180=upward, 270=falls to subject's right) or null>,
      "shadow_softness": <float 0.0 (razor sharp edge) to 1.0 (completely diffused, no visible edge) or null>,
      "shadow_length_ratio": <float, nose shadow length divided by nose length (0.0=no shadow, 1.0=shadow reaches lip, >1.0=extends past lip) or null>,
      "shadow_visible_on": ["<list facial regions where shadows are visible: 'nose', 'jaw_left', 'jaw_right', 'cheek_left', 'cheek_right', 'neck', 'eye_socket_left', 'eye_socket_right', 'forehead'>"],
      "confidence": <float 0.0-1.0>,
      "notes": ["<what shadow features you observed and where>"]
    },
    "highlights": {
      "highlight_width_ratio": <float 0.0-1.0, width of lit side divided by total face width or null>,
      "highlight_specularity": <float 0.0 (matte, no shine) to 1.0 (mirror-like specular reflections) or null>,
      "highlight_axis_deg": <float, angle of the main highlight band relative to vertical or null>,
      "confidence": <float 0.0-1.0>,
      "notes": ["<what highlight features you observed>"]
    },
    "catchlights": {
      "catchlight_count": <integer, distinct light sources visible in eyes or null if eyes not visible>,
      "catchlight_shape": "<'round' | 'rectangular' | 'octagonal' | 'strip' | 'mixed' | 'none_visible' | null>",
      "catchlight_position": "<clock position of primary catchlight: '1_oclock' through '12_oclock' or null>",
      "catchlight_relative_intensity": "<'bright' | 'dim' | 'mixed' | null>",
      "confidence": <float 0.0-1.0>,
      "notes": ["<what you see in the eye reflections>"]
    },
    "reconstruction": {
      "key_light_angle_deg": <float 0-180, estimated angle of key light from camera axis or null>,
      "key_light_height": "<'high' (above head) | 'eye_level' | 'low' (below chin) | null>",
      "modifier_size_class": "<'small' (bare bulb/grid) | 'medium' (beauty dish/small softbox) | 'large' (3ft+ softbox/umbrella) | 'very_large' (wall-size/window) | null>",
      "fill_present": <true | false | null>,
      "negative_fill": <true (v-flat/flag visible or shadow-side deliberately darkened) | false | null>,
      "background_light_present": <true | false | null>,
      "background_distance_category": "<'close' (2-4ft) | 'moderate' (5-10ft) | 'far' (10ft+) | 'infinity' (outdoor/sky) | null>",
      "confidence": <float 0.0-1.0>,
      "notes": ["<reasoning for your reconstruction estimates>"]
    }
  }
}

SIGNAL EXTRACTION RULES:
- In the signals section, report ONLY what you OBSERVE — measurable properties
- Do NOT name lighting patterns (rembrandt, butterfly, etc.) in signals — only in lighting_style
- Do NOT name equipment brands or specific modifiers in signals
- Use null for any signal you cannot confidently observe
- shadow_vector_deg uses a clock/compass convention: 0°=shadow falls straight down (light from above), 90°=shadow falls to subject's left (light from subject's right), etc.
- Confidence per section: 0.0 = cannot determine, 0.5 = rough estimate, 0.8+ = clearly visible
- Be concise in notes — state what visual evidence you used

GENERAL RULES:
- Use photographer language, be specific
- Focus on what you SEE, not equipment
- For skin tones describe what you observe — this drives lighting recommendations
- For lighting_style use shadow patterns and contrast, not equipment guesses
- For likely_photographer only name someone if strong signature markers — otherwise 'unknown'
- Return ONLY valid JSON, no markdown fencing"""

_USER_PROMPT = """\
Analyse this reference portrait photo. Describe the subject, scene, and \
styling. Then extract observable physical signals: geometry, shadows, \
highlights, catchlights, and reconstruction estimates. Return structured \
JSON only."""


# ── Image encoding ───────────────────────────────────────────────────────

def _encode_image_base64(image_path: str) -> str:
    """Read an image file and return its base64-encoded contents."""
    data = Path(image_path).read_bytes()
    return base64.b64encode(data).decode("utf-8")


def _guess_mime(image_path: str) -> str:
    """Return a reasonable MIME type for the image."""
    ext = Path(image_path).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")


# ── Provider: OpenAI ─────────────────────────────────────────────────────

def _call_openai(image_path: str) -> Dict[str, Any]:
    """Call OpenAI's vision API and return the parsed JSON response."""
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError(
            "openai package not installed. Run: pip install openai"
        )

    client = OpenAI()  # uses OPENAI_API_KEY env var
    b64 = _encode_image_base64(image_path)
    mime = _guess_mime(image_path)

    response = client.chat.completions.create(
        model=_VLM_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _USER_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{b64}",
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
        max_tokens=2200,
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    raw_text = response.choices[0].message.content or "{}"
    return json.loads(raw_text)


# ── Provider: Anthropic ──────────────────────────────────────────────────

def _call_anthropic(image_path: str) -> Dict[str, Any]:
    """Call Anthropic's vision API and return the parsed JSON response."""
    try:
        from anthropic import Anthropic
    except ImportError:
        raise RuntimeError(
            "anthropic package not installed. Run: pip install anthropic"
        )

    client = Anthropic()  # uses ANTHROPIC_API_KEY env var
    b64 = _encode_image_base64(image_path)
    mime = _guess_mime(image_path)

    response = client.messages.create(
        model=_VLM_MODEL,
        max_tokens=2200,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": _USER_PROMPT},
                ],
            },
        ],
    )

    raw_text = response.content[0].text or "{}"
    # Strip markdown fencing if present
    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw_text = "\n".join(lines)
    return json.loads(raw_text)


# ── Signal parsing ───────────────────────────────────────────────────────

def _parse_signals(raw_signals: Dict[str, Any]) -> Optional[VLMSignals]:
    """Parse the signals namespace from VLM JSON into typed sub-models.

    Each sub-model is parsed independently — if one section has invalid data,
    it becomes None while the others are still populated.  Returns None if
    the raw_signals dict is empty or all sections fail.
    """
    if not raw_signals or not isinstance(raw_signals, dict):
        return None

    def _try_model(model_cls, data):
        """Attempt to construct a Pydantic model; return None on failure."""
        if not data or not isinstance(data, dict):
            return None
        try:
            return model_cls(**data)
        except Exception as exc:
            logger.debug("Signal parse failed for %s: %s", model_cls.__name__, exc)
            return None

    geometry = _try_model(VLMGeometrySignals, raw_signals.get("geometry"))
    shadows = _try_model(VLMShadowSignals, raw_signals.get("shadows"))
    highlights = _try_model(VLMHighlightSignals, raw_signals.get("highlights"))
    catchlights = _try_model(VLMCatchlightSignals, raw_signals.get("catchlights"))
    reconstruction = _try_model(
        VLMReconstructionEstimates, raw_signals.get("reconstruction")
    )

    # If everything is None, don't create a VLMSignals wrapper
    if all(v is None for v in (geometry, shadows, highlights, catchlights, reconstruction)):
        return None

    return VLMSignals(
        geometry=geometry,
        shadows=shadows,
        highlights=highlights,
        catchlights=catchlights,
        reconstruction=reconstruction,
    )


# ── Public API ───────────────────────────────────────────────────────────

def describe_reference_image(image_path: str) -> Optional[VLMDescription]:
    """Analyse a reference photo using a VLM and return structured description.

    Returns None if:
    - VLM is not configured (no API key, provider set to "none")
    - The API call fails for any reason

    This function is designed to be best-effort — failures are logged
    but never propagate as exceptions.
    """
    if not vlm_available():
        logger.debug("VLM not available (provider=%s), skipping", _VLM_PROVIDER)
        return None

    if not os.path.isfile(image_path):
        logger.warning("VLM: image not found at %s", image_path)
        return None

    try:
        if _VLM_PROVIDER == "openai":
            raw = _call_openai(image_path)
        elif _VLM_PROVIDER == "anthropic":
            raw = _call_anthropic(image_path)
        else:
            logger.warning("Unknown VLM provider: %s", _VLM_PROVIDER)
            return None

        # Parse signals namespace (graceful — each sub-model independent)
        signals = _parse_signals(raw.get("signals", {}))

        # Map raw JSON into VLMDescription model
        return VLMDescription(
            subject_type=raw.get("subject_type", ""),
            subject_count=raw.get("subject_count", 1),
            apparent_skin_tones=raw.get("apparent_skin_tones", []),
            skin_tone_mixed=raw.get("skin_tone_mixed", False),
            framing=raw.get("framing", ""),
            pose=raw.get("pose", ""),
            expression=raw.get("expression", ""),
            styling_details=raw.get("styling_details", []),
            notable_features=raw.get("notable_features", []),
            background_context=raw.get("background_context", ""),
            clothing_accessories=raw.get("clothing_accessories", ""),
            overall_mood=raw.get("overall_mood", ""),
            lighting_style=raw.get("lighting_style", ""),
            likely_photographer=raw.get("likely_photographer", ""),
            derivation=raw.get("derivation", {}),
            signals=signals,
            ok=True,
        )
    except Exception as exc:
        logger.warning("VLM call failed: %s", exc, exc_info=True)
        return VLMDescription(ok=False, notes=[f"VLM call failed: {exc}"])
