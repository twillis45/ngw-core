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
import time
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
    ColorPalette,
)

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

_VLM_PROVIDER = os.environ.get("VLM_PROVIDER", "auto").lower().strip()
_VLM_MODEL = os.environ.get("VLM_MODEL", "")

# Auto-detect provider: prefer OpenAI, fall back to Anthropic, then disable.
if _VLM_PROVIDER == "auto":
    if os.environ.get("OPENAI_API_KEY"):
        _VLM_PROVIDER = "openai"
    elif os.environ.get("ANTHROPIC_API_KEY"):
        _VLM_PROVIDER = "anthropic"
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


# Probe result dict — set by main.py lifespan after startup probe.
# {"ok": bool, "provider": str, "detail": str} or None if not yet probed.
_vlm_probe_result: Optional[dict] = None

def vlm_available() -> bool:
    """Return True if a VLM provider is configured (key present).

    Does NOT check probe result — a failed probe means the key may be bad,
    but VLM calls have their own per-request timeouts (30s) and auth-error
    detection, so we let them try and fail fast rather than killing VLM
    entirely for the session.
    """
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
      "jewellery_catchlight_suspected": <true if a lateral catchlight (3–5 or 7–9 o'clock) is present AND the subject is wearing large hoop earrings, statement earrings, or other reflective jewellery near eye level; false otherwise>,
      "confidence": <float 0.0-1.0>,
      "notes": ["<what you see in the eye reflections — if jewellery_catchlight_suspected is true, describe which earring or accessory and which eye is affected>"]
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
    },
    "color_palette": {
      "dominant_colors": ["<list ALL significant colors in the scene — minimum 4, up to 8 — ordered by visual weight. MUST include clothing/garment colors, prop colors, skin tone, background. Use specific names: 'vivid red', 'deep crimson', 'warm caramel skin', 'dark teal', etc. Do not skip saturated accent colors even if small.>"],
      "dominant_color_hexes": ["<one approximate hex code per dominant_color in the same order — e.g. '#C14B3E', '#3A2E2B'. Best-effort estimate. Must have same count as dominant_colors.>"],
      "contrasting_pairs": ["<list ALL notable color contrasts — e.g. 'red garment vs green background (complementary)', 'warm skin vs cool teal backdrop (warm/cool split)', 'bright highlight vs deep shadow (value contrast)', 'saturated clothing vs neutral background'>"],
      "color_temperature_key": "<describe key light color: 'Warm (tungsten/gold, ~3200-4000K)' | 'Neutral (daylight strobe, ~5500K)' | 'Cool (shade/HMI, ~6500K+)' | 'Mixed' or null>",
      "color_temperature_shadows": "<describe shadow/fill color: same options as color_temperature_key, or 'Neutral grey' | null>",
      "warm_cool_split": <true if there is a deliberate warm key vs cool shadow or vice versa, else false>,
      "background_color": "<describe background color and tone — e.g. 'dark teal', 'white', 'warm grey', 'graduated black-to-grey', 'black' or null>",
      "color_harmony": "<PRIMARY harmony — best single label: 'analogous' | 'complementary' | 'split_complementary' | 'triadic' | 'monochromatic' | 'neutral' | 'warm_cool_split' | 'unknown'>",
      "alternate_harmonies": ["<list any OTHER applicable harmony labels from the same set — e.g. if primary is 'complementary' and there is also a warm/cool split, include 'warm_cool_split'. May be empty.>"],
      "harmony_swatches": {
        "<harmony_name e.g. 'complementary'>": ["<2-4 hex codes from dominant_color_hexes that BEST represent this harmony — e.g. the complementary pair, the analogous cluster, the triadic trio. Use hex codes, not names.>"]
      },
      "palette_character": "<1-sentence description of the palette character — e.g. 'Muted, desaturated — dark tones with one vivid accent' or 'Saturated bold complementary contrast — red garment vs green tones'>",
      "color_grading_notes": "<any visible post-processing colour treatment — e.g. 'Shadows lifted with blue-teal cast' or 'High contrast, minimal colour grading' or null>",
      "confidence": <float 0.0-1.0>,
      "notes": ["<brief reasoning for color observations>"]
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
- CATCHLIGHT CONTAMINATION: Large hoop earrings, chandelier earrings, and other reflective jewellery worn near eye level can reflect into the lateral edge of the iris and appear as a catchlight at 3–5 or 7–9 o'clock. These are NOT key-light catchlights. If you observe a lateral catchlight in an eye closest to visible earrings, set jewellery_catchlight_suspected=true and describe it in notes. The primary catchlight for lighting analysis should be the upper-hemisphere catchlight (10–2 o'clock range), not the lateral one.

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


# ── OpenAI Error Code Reference ──────────────────────────────────────────
#
#  Code  Meaning                     Retryable?  Action
#  ────  ──────────────────────────  ──────────  ──────────────────────────────
#  400   Bad Request / invalid JSON  No          Fix request payload
#  401   Invalid API key             No          Check OPENAI_API_KEY env var
#  403   Forbidden / geo-blocked     No          Check account access / region
#  404   Model not found             No          Check VLM_MODEL env var
#  409   Conflict (engine overload)  Yes         Retry with backoff
#  422   Unprocessable (bad params)  No          Fix request params
#  429   Rate limited (RPM/TPM)      Yes         Retry with backoff; bump tier
#  500   Server error                Yes         Retry; check status.openai.com
#  502   Bad gateway                 Yes         Retry
#  503   Service unavailable         Yes         Retry; check status.openai.com
#  529   Server overloaded           Yes         Retry with longer backoff
#
#  Rate-limit headers returned on 429:
#    x-ratelimit-limit-requests      — RPM cap for your tier
#    x-ratelimit-limit-tokens        — TPM cap for your tier
#    x-ratelimit-remaining-requests  — requests left this window
#    x-ratelimit-remaining-tokens    — tokens left this window
#    x-ratelimit-reset-requests      — when request quota resets
#    x-ratelimit-reset-tokens        — when token quota resets
#    retry-after                     — seconds to wait before retrying
#
# ── Retry helper ─────────────────────────────────────────────────────────

_RETRY_DELAYS = (2, 5, 15)  # seconds between attempts (3 retries = 4 total attempts)


def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True if the exception is a 429 rate-limit error from any provider."""
    # OpenAI SDK raises openai.RateLimitError (status_code 429)
    # Anthropic SDK raises anthropic.RateLimitError (status_code 429)
    # Both inherit from their SDK's APIStatusError which has a .status_code attr.
    # We also catch generic HTTP errors that carry a 429 in their message.
    cls_name = type(exc).__name__
    if "RateLimit" in cls_name:
        return True
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    return "429" in str(exc)


def _is_auth_error(exc: Exception) -> bool:
    """Return True if the exception indicates an invalid/expired API key (401)."""
    cls_name = type(exc).__name__
    if "AuthenticationError" in cls_name or "Unauthorized" in cls_name:
        return True
    status = getattr(exc, "status_code", None)
    if status == 401:
        return True
    return "401" in str(exc) and ("api key" in str(exc).lower() or "invalid" in str(exc).lower())


def _extract_rate_limit_headers(exc: Exception) -> Dict[str, str]:
    """Pull rate-limit headers from an SDK error response (best-effort)."""
    headers: Dict[str, str] = {}
    # OpenAI / Anthropic SDK errors expose .response.headers
    resp = getattr(exc, "response", None)
    if resp is not None:
        raw_headers = getattr(resp, "headers", None) or {}
        for key in (
            "retry-after",
            "x-ratelimit-limit-requests",
            "x-ratelimit-limit-tokens",
            "x-ratelimit-remaining-requests",
            "x-ratelimit-remaining-tokens",
            "x-ratelimit-reset-requests",
            "x-ratelimit-reset-tokens",
        ):
            val = raw_headers.get(key)
            if val is not None:
                headers[key] = str(val)
    return headers


def _call_with_retry(fn, image_path: str, provider_name: str) -> Dict[str, Any]:
    """Call fn(image_path) with exponential back-off on 429 rate-limit errors."""
    last_exc: Exception = RuntimeError("unreachable")
    t_start = time.perf_counter()
    for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
        t_attempt = time.perf_counter()
        try:
            result = fn(image_path)
            elapsed = round(time.perf_counter() - t_attempt, 2)
            total_elapsed = round(time.perf_counter() - t_start, 2)
            logger.info(
                "%s VLM call succeeded — attempt=%d elapsed=%.2fs total=%.2fs",
                provider_name, attempt, elapsed, total_elapsed,
            )
            return result
        except Exception as exc:
            last_exc = exc
            elapsed = round(time.perf_counter() - t_attempt, 2)
            if _is_auth_error(exc):
                # Log 401 to DB for health monitoring, then re-raise immediately
                try:
                    from db.database import log_api_health_event
                    log_api_health_event(
                        provider=provider_name.lower(),
                        event_type="401_error",
                        detail=str(exc)[:500],
                    )
                except Exception:
                    pass  # never let health logging break the main flow
                logger.error(
                    "%s VLM authentication failed (401) — API key invalid or expired. "
                    "Update %s_API_KEY in .env and restart.",
                    provider_name, provider_name.upper(),
                )
                raise
            elif _is_rate_limit_error(exc) and delay is not None:
                rl_headers = _extract_rate_limit_headers(exc)
                rl_detail = " ".join(f"{k}={v}" for k, v in rl_headers.items()) if rl_headers else "no rate-limit headers"
                logger.warning(
                    "%s VLM rate-limited (429) on attempt %d/4 — "
                    "waited=%.2fs retrying_in=%ds | %s | error: %s",
                    provider_name, attempt, elapsed, delay,
                    rl_detail, str(exc)[:300],
                )
                try:
                    import sentry_sdk
                    sentry_sdk.add_breadcrumb(
                        category="vlm", level="warning",
                        message=f"{provider_name} 429 retry {attempt} (wait {delay}s)",
                    )
                except Exception:
                    pass
                time.sleep(delay)
            else:
                logger.error(
                    "%s VLM call failed (non-retryable) — attempt=%d elapsed=%.2fs error: %s",
                    provider_name, attempt, elapsed, str(exc)[:500],
                )
                raise
    # All retries exhausted
    total_elapsed = round(time.perf_counter() - t_start, 2)
    rl_headers = _extract_rate_limit_headers(last_exc)
    rl_detail = " ".join(f"{k}={v}" for k, v in rl_headers.items()) if rl_headers else "no rate-limit headers"
    logger.error(
        "%s VLM still rate-limited after %d attempts — total_wait=%.2fs | %s | last_error: %s",
        provider_name, len(_RETRY_DELAYS) + 1, total_elapsed, rl_detail, str(last_exc)[:500],
    )
    raise last_exc


def probe_api_key() -> dict:
    """Test the configured API key with a cheap non-token call.

    Uses lightweight httpx directly instead of the full SDK client —
    the openai SDK v2.30.0 import takes 50+ seconds on Python 3.10,
    which makes SDK-based probes impractical for startup health checks.

    For OpenAI: calls GET /v1/models (free, no token cost).
    For Anthropic: calls GET /v1/models (free, no token cost).

    Returns:
        {"ok": bool, "provider": str, "detail": str}
    """
    import httpx
    from db.database import log_api_health_event

    if _VLM_PROVIDER == "openai":
        try:
            key = os.environ.get("OPENAI_API_KEY", "")
            r = httpx.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=10,
            )
            if r.status_code == 200:
                log_api_health_event("openai", "probe_ok", f"model={_VLM_MODEL}")
                logger.info("OpenAI API key probe: OK (model=%s)", _VLM_MODEL)
                return {"ok": True, "provider": "openai", "detail": f"model={_VLM_MODEL}"}
            else:
                detail = f"HTTP {r.status_code}"
                event = "401_error" if r.status_code == 401 else "probe_fail"
                log_api_health_event("openai", event, detail)
                logger.error("OpenAI API key probe FAILED: %s", detail)
                return {"ok": False, "provider": "openai", "detail": detail}
        except Exception as exc:
            event = "401_error" if _is_auth_error(exc) else "probe_fail"
            log_api_health_event("openai", event, str(exc)[:500])
            logger.error("OpenAI API key probe FAILED: %s", exc)
            return {"ok": False, "provider": "openai", "detail": str(exc)[:200]}

    elif _VLM_PROVIDER == "anthropic":
        try:
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            r = httpx.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                },
                timeout=10,
            )
            if r.status_code == 200:
                log_api_health_event("anthropic", "probe_ok", f"model={_VLM_MODEL}")
                logger.info("Anthropic API key probe: OK (model=%s)", _VLM_MODEL)
                return {"ok": True, "provider": "anthropic", "detail": f"model={_VLM_MODEL}"}
            else:
                detail = f"HTTP {r.status_code}"
                event = "401_error" if r.status_code == 401 else "probe_fail"
                log_api_health_event("anthropic", event, detail)
                logger.error("Anthropic API key probe FAILED: %s", detail)
                return {"ok": False, "provider": "anthropic", "detail": detail}
        except Exception as exc:
            event = "401_error" if _is_auth_error(exc) else "probe_fail"
            log_api_health_event("anthropic", event, str(exc)[:500])
            logger.error("Anthropic API key probe FAILED: %s", exc)
            return {"ok": False, "provider": "anthropic", "detail": str(exc)[:200]}

    else:
        return {"ok": False, "provider": _VLM_PROVIDER, "detail": "VLM not configured"}


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
    img_kb = round(len(b64) * 3 / 4 / 1024, 1)  # approx decoded size
    logger.info(
        "[vlm:openai] request — model=%s image=%s size=%.1fKB max_tokens=2200 temp=0.2",
        _VLM_MODEL, Path(image_path).name, img_kb,
    )

    def _do_call(_image_path: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
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
            timeout=30,
        )
        elapsed = round(time.perf_counter() - t0, 2)
        # Extract usage stats
        usage = getattr(response, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", "?") if usage else "?"
        completion_tokens = getattr(usage, "completion_tokens", "?") if usage else "?"
        total_tokens = getattr(usage, "total_tokens", "?") if usage else "?"
        finish = response.choices[0].finish_reason if response.choices else "?"
        resp_id = getattr(response, "id", "?")
        logger.info(
            "[vlm:openai] response — id=%s elapsed=%.2fs finish=%s "
            "tokens(prompt=%s completion=%s total=%s) model=%s",
            resp_id, elapsed, finish,
            prompt_tokens, completion_tokens, total_tokens,
            getattr(response, "model", _VLM_MODEL),
        )
        raw_text = response.choices[0].message.content or "{}"
        return json.loads(raw_text)

    return _call_with_retry(_do_call, image_path, "OpenAI")


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
    img_kb = round(len(b64) * 3 / 4 / 1024, 1)
    logger.info(
        "[vlm:anthropic] request — model=%s image=%s size=%.1fKB max_tokens=2200",
        _VLM_MODEL, Path(image_path).name, img_kb,
    )

    def _do_call(_image_path: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        response = client.messages.create(
            model=_VLM_MODEL,
            max_tokens=2200,
            system=_SYSTEM_PROMPT,
            timeout=30,
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
        elapsed = round(time.perf_counter() - t0, 2)
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", "?") if usage else "?"
        output_tokens = getattr(usage, "output_tokens", "?") if usage else "?"
        stop_reason = getattr(response, "stop_reason", "?")
        resp_id = getattr(response, "id", "?")
        logger.info(
            "[vlm:anthropic] response — id=%s elapsed=%.2fs stop=%s "
            "tokens(input=%s output=%s) model=%s",
            resp_id, elapsed, stop_reason,
            input_tokens, output_tokens,
            getattr(response, "model", _VLM_MODEL),
        )
        raw_text = response.content[0].text or "{}"
        # Strip markdown fencing if present
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw_text = "\n".join(lines)
        return json.loads(raw_text)

    return _call_with_retry(_do_call, image_path, "Anthropic")


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
    color_palette = _try_model(ColorPalette, raw_signals.get("color_palette"))

    # If everything is None, don't create a VLMSignals wrapper
    if all(v is None for v in (geometry, shadows, highlights, catchlights, reconstruction, color_palette)):
        return None

    return VLMSignals(
        geometry=geometry,
        shadows=shadows,
        highlights=highlights,
        catchlights=catchlights,
        reconstruction=reconstruction,
        color_palette=color_palette,
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

    t0 = time.time()
    try:
        raw = None
        used_provider = _VLM_PROVIDER
        if _VLM_PROVIDER == "openai":
            try:
                raw = _call_openai(image_path)
            except Exception as openai_exc:
                # Fallback to Anthropic if OpenAI fails (quota, rate limit, etc.)
                if os.environ.get("ANTHROPIC_API_KEY"):
                    logger.warning("OpenAI VLM failed (%s), falling back to Anthropic", openai_exc)
                    raw = _call_anthropic(image_path)
                    used_provider = "anthropic"
                else:
                    raise openai_exc
        elif _VLM_PROVIDER == "anthropic":
            raw = _call_anthropic(image_path)
        else:
            logger.warning("Unknown VLM provider: %s", _VLM_PROVIDER)
            return None

        latency_ms = (time.time() - t0) * 1000
        try:
            from db.database import log_vlm_call
            log_vlm_call(used_provider, _VLM_MODEL, latency_ms, ok=True, caller="analyze_image")
        except Exception:
            pass  # metrics logging must never break analysis

        # Sentry breadcrumb — successful VLM call
        try:
            import sentry_sdk
            sentry_sdk.add_breadcrumb(
                category="vlm", level="info",
                message=f"{used_provider}/{_VLM_MODEL} OK ({latency_ms:.0f}ms)",
                data={"provider": used_provider, "model": _VLM_MODEL, "latency_ms": round(latency_ms)},
            )
        except Exception:
            pass

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
        latency_ms = (time.time() - t0) * 1000
        try:
            from db.database import log_vlm_call
            log_vlm_call(_VLM_PROVIDER, _VLM_MODEL, latency_ms, ok=False,
                         caller="analyze_image", error=str(exc)[:500])
        except Exception:
            pass
        # Sentry — capture VLM failure with provider context
        try:
            import sentry_sdk
            sentry_sdk.set_tag("vlm.provider", _VLM_PROVIDER)
            sentry_sdk.set_tag("vlm.model", _VLM_MODEL)
            sentry_sdk.capture_exception(exc)
        except Exception:
            pass
        logger.warning("VLM call failed: %s", exc, exc_info=True)
        return VLMDescription(ok=False, notes=[f"VLM call failed: {exc}"])
