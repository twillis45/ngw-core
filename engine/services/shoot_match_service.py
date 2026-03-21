"""Shoot-match service — assembles the full shoot-match result.

This module owns the business logic that was previously inline in the route.
The route (api/routes/shoot_match.py) is now a thin HTTP layer that:
  1. Parses the request
  2. Resolves taxonomy labels → codes
  3. Calls build_shoot_match_result()
  4. Returns the HTTP response

Responsibilities of this service:
  - System filtering and tiered gear matching
  - Reference image analysis delegation (calls orchestrator)
  - Pattern candidate assembly (candidate-first, no premature collapse)
  - Selector invocation and alternative backfill
  - Card assembly (coaching, diagnostics, camera settings)
  - Reference analysis enrichment
  - Response packaging with backward-compatible fields

┌─────────────────────────────────────────────────────────────────┐
│ Authoritative pattern candidate selection is NOT done here.     │
│ It lives in engine.orchestrator.resolve_pattern_candidates().   │
│ This service CONSUMES those candidates; it does not rank them.  │
└─────────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

SYSTEMS_PATH = Path("data/lighting_systems.json")


# ═══════════════════════════════════════════════════════════════════════════
# Configuration — taxonomy maps, labels, camera presets
# ═══════════════════════════════════════════════════════════════════════════
# These maps translate between display labels (UI) and internal codes (engine).
# They live here as the single source; the route imports from here.

MOOD_MAP = {
    "Clean & Classic": "corporate",
    "Moody & Dramatic": "cinematic",
    "Soft & Ethereal": "beauty",
    "Bold & Edgy": "editorial",
    "High Fashion": "beauty",
    "Natural & Available": "natural",
    "Cinematic": "cinematic",
    "beauty": "beauty",
    "cinematic": "cinematic",
    "corporate": "corporate",
    "editorial": "editorial",
    "natural": "natural",
    "high_key": "high_key",
    "low_key": "low_key",
}

ENVIRONMENT_MAP = {
    # Legacy UI labels (EnvironmentScreen v1 — kept for backward compat)
    "Small Room": "studio_small",
    "Home Studio": "home_studio",
    "Medium Studio": "studio_medium",
    "Large Studio": "studio_large",
    "Outdoor": "on_location_outdoor",
    "Window Light": "on_location_indoor",
    "Office": "studio_small",
    # New UI — enum values pass through directly
    "studio_small": "studio_small",
    "studio_medium": "studio_medium",
    "studio_large": "studio_large",
    "home_studio": "home_studio",
    "on_location_indoor": "on_location_indoor",
    "on_location_outdoor": "on_location_outdoor",
    "event": "event",
}

GEAR_MAP = {
    "speedlight": "speedlight",
    "two speedlights": "speedlight_2_light",
    "strobe": "strobe_mono",
    "strobe pack": "strobe_pack",
    "led panel": "led_panel",
    "led tube": "led_tube",
    "led cob": "led_cob",
    "ring light": "ring_light",
    "fresnel": "fresnel",
    "continuous lights": "continuous_2_light",
    "natural light": "natural_window",
    "reflector only": "reflector_only",
}

GEAR_TO_MODIFIERS = {
    "speedlight": [
        "umbrella", "umbrella_large", "umbrella_reflective",
        "softbox_small", "softbox", "grid_spot", "snoot",
    ],
    "two speedlights": [
        "umbrella", "umbrella_large", "umbrella_reflective",
        "softbox_small", "softbox", "grid_spot", "snoot",
    ],
    "strobe": [
        "softbox", "softbox_large", "octabox", "octabox_large",
        "stripbox", "stripbox_medium",
        "beauty_dish", "grid_spot", "snoot", "barn_doors",
        "umbrella_reflective", "umbrella_reflective_large",
        "reflector", "scrim",
    ],
    "strobe pack": [
        "softbox", "softbox_large", "octabox", "octabox_large",
        "stripbox", "stripbox_medium", "stripbox_narrow",
        "beauty_dish", "grid_spot", "snoot", "barn_doors", "gobo", "optical_snoot",
        "umbrella_reflective", "umbrella_reflective_large",
        "reflector", "v_flat", "scrim",
    ],
    "led panel": ["scrim", "reflector", "v_flat"],
    "led tube": ["grid", "barn_doors"],
    "led cob": [
        "softbox", "softbox_large", "octabox",
        "umbrella", "umbrella_reflective",
        "reflector", "scrim",
    ],
    "ring light": ["scrim"],
    "fresnel": ["grid_spot", "snoot", "barn_doors", "gobo"],
    "continuous lights": [
        "softbox", "umbrella", "umbrella_reflective",
        "reflector", "scrim",
    ],
    "natural light": ["reflector", "v_flat", "scrim"],
    "reflector only": ["reflector"],
}

GEAR_GROUPS = {
    "flash": ["speedlight", "speedlight_2_light", "strobe_mono", "strobe_pack"],
    "continuous": ["led_panel", "led_cob", "led_tube", "continuous_2_light", "continuous_led", "fresnel"],
    "ambient": ["natural_window", "reflector_only"],
    "specialty": ["ring_light"],
}

_GEAR_TO_GROUP: Dict[str, str] = {}
for _grp, _members in GEAR_GROUPS.items():
    for _m in _members:
        _GEAR_TO_GROUP[_m] = _grp

GEAR_ADAPT_NOTES: Dict[str, str] = {
    "speedlight": "Lower power, move closer for equivalent output",
    "speedlight_2_light": "Use two speedlights to approximate strobe output",
    "strobe_mono": "Full power control — ideal substitute",
    "strobe_pack": "Dial down to match the setup's power requirements",
    "led_panel": "Use diffusion; adjust distance for equivalent brightness",
    "led_cob": "Point-source LED — use with modifier for softer light",
    "led_tube": "Position as accent/rim; limited as key without modifier",
    "continuous_2_light": "Lower shutter speed to compensate for output",
    "continuous_led": "Lower shutter speed to compensate for output",
    "fresnel": "Focusable beam — great for controlled spill",
    "natural_window": "Position subject near window; use reflector for fill",
    "reflector_only": "Bounce available light; limited control",
    "ring_light": "Even, flat lighting — best for beauty/fashion at close range",
    "basic_2_light": "Simple two-light kit — adjust distances for ratio",
}

MODIFIER_LABELS = {
    "softbox_small": "Softbox 24×24\"",
    "softbox": "Softbox 36×48\"",
    "softbox_large": "Softbox 48×72\"",
    "octabox_small": "Octabox 32\"",
    "octabox": "Octabox 47\"",
    "octabox_large": "Octabox 60\"",
    "stripbox": "Stripbox 12×36\"",
    "stripbox_medium": "Stripbox 12×48\"",
    "stripbox_narrow": "Stripbox 9×36\"",
    "umbrella": "Shoot-Through 33\"",
    "umbrella_large": "Shoot-Through 45\"",
    "umbrella_reflective": "Reflective 43\"",
    "umbrella_reflective_large": "Reflective 60\"",
    "beauty_dish": "Beauty Dish",
    "grid_spot": "Grid / Spot",
    "grid": "Honeycomb Grid",
    "snoot": "Snoot",
    "barn_doors": "Barn Doors",
    "gobo": "Gobo / Pattern",
    "optical_snoot": "Optical Snoot",
    "reflector": "Reflector",
    "v_flat": "V-Flat",
    "scrim": "Scrim",
    "softbox_octa": "Octabox",
    "softbox_rect": "Rectangular Softbox",
    "softbox_strip": "Strip Box",
    "umbrella_shoot_through": "Shoot-Through Umbrella",
    "diffusion_panel": "Diffusion Panel / Scrim",
    "bare_bulb": "Bare Bulb",
    "gel_cto": "CTO Gel",
}

ROLE_LABELS = {"key": "Key Light", "fill": "Fill Light", "rim": "Rim Light", "background": "Background Light"}

CAMERA_SETTINGS = {
    "beauty": {
        "aperture": "f/2.8 – f/5.6", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Open up to f/2.8 for shallower depth of field and skin smoothing",
    },
    "cinematic": {
        "aperture": "f/2 – f/4", "iso": "100 – 400", "shutter": "1/125",
        "wb": "4800 K (warm)",
        "tip": "Shoot at f/2–f/4 for dramatic fall-off; consider CTO gel on key",
    },
    "corporate": {
        "aperture": "f/5.6 – f/8", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Shoot at f/5.6–f/8 for full sharpness across the face",
    },
    "editorial": {
        "aperture": "f/4 – f/8", "iso": "100", "shutter": "1/200",
        "wb": "5200 K",
        "tip": "Experiment with hard light and strong angles for graphic impact",
    },
    "natural": {
        "aperture": "f/2.8 – f/4", "iso": "200 – 800", "shutter": "1/125",
        "wb": "5800 K (daylight)",
        "tip": "Match your WB to the window light; bump ISO before adding flash",
    },
    "high_key": {
        "aperture": "f/8 – f/11", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Overexpose the background by 1–2 stops for that pure-white look",
    },
    "low_key": {
        "aperture": "f/4 – f/5.6", "iso": "100", "shutter": "1/200",
        "wb": "5000 K",
        "tip": "Underexpose ambient by 2+ stops; let the key be your only source",
    },
    "dramatic": {
        "aperture": "f/4 – f/5.6", "iso": "100", "shutter": "1/200",
        "wb": "5000 K",
        "tip": "Keep ambient low; let the key light do all the work",
    },
}


# ═══════════════════════════════════════════════════════════════════════════
# Result container
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ShootMatchResult:
    """Structured result from the shoot-match service.

    Carries both the candidate-first structure (pattern_candidates)
    and backward-compatible flattened fields (authoritative_pattern, cards).
    """
    cards: Dict[str, Any] = dc_field(default_factory=dict)
    authoritative_pattern: str = "unknown"
    pattern_candidates: Any = None    # PatternCandidates from orchestrator
    confidence: float = 0.0
    needs_review: bool = False
    validation_scores: Dict[str, Any] = dc_field(default_factory=dict)
    contradictions: List[str] = dc_field(default_factory=list)

    # Photographer-centric structured output (Phase 3)
    shoot_loop: Optional[Dict[str, Any]] = None

    # Supplementary data
    gear_match: Optional[Dict[str, Any]] = None
    reference_analysis: Optional[Dict[str, Any]] = None
    lighting_intelligence: Optional[Dict[str, Any]] = None
    vlm_description: Any = None
    vlm_reconstruction: Any = None
    processing_ms: int = 0
    request_id: str = ""

    # Perception / robustness layer
    face_validation: Optional[Dict[str, Any]] = None
    signal_reliability: Optional[Dict[str, Any]] = None
    edge_case_flags: Optional[Dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers (moved from route)
# ═══════════════════════════════════════════════════════════════════════════

def _load_systems() -> List[Dict[str, Any]]:
    with open(SYSTEMS_PATH, encoding="utf-8") as f:
        return json.load(f)["systems"]


@dataclass
class FilterResult:
    """Holds filtered systems plus metadata about how strict the match was."""
    systems: List[Dict[str, Any]] = dc_field(default_factory=list)
    match_tier: str = "exact"       # exact | gear_group | any_gear | mood_only
    adapted_from: Optional[str] = None
    adapt_note: Optional[str] = None


def filter_systems(
    systems: List[Dict[str, Any]],
    *,
    mood: str,
    environment: str,
    gear: List[str],
    gear_mode: str,
    skin_tone: Optional[str] = None,
) -> FilterResult:
    """Filter and tier-match systems against user inputs.

    Progressive gear matching (5 tiers):
      1. Exact gear match (mood + env + gear)
      2. Gear group substitution (mood + env + same family)
      3. Drop environment, keep mood + exact gear
      4. Drop environment, use gear group
      5. Mood only — show best regardless of gear
    """
    # Base pool: filter by mood
    mood_pool = systems
    if mood:
        mood_pool = [s for s in systems if s["taxonomy_refs"].get("mood") == mood]

    # Environment filter
    env_pool = mood_pool
    if environment:
        env_filtered = [s for s in mood_pool if s["taxonomy_refs"].get("environment") == environment]
        if env_filtered:
            env_pool = env_filtered

    # Skin tone filter (soft)
    # DB uses mixed synonyms: normalise to a set of equivalent values so
    # "fair" matches both "fair" and "light" entries, "deep" matches "deep"
    # and "dark", etc.
    _SKIN_TONE_EQUIVALENTS: Dict[str, set] = {
        "fair":   {"fair", "light"},
        "light":  {"light", "fair"},
        "medium": {"medium"},
        "olive":  {"medium", "olive"},
        "deep":   {"deep", "dark"},
        "dark":   {"dark", "deep"},
    }

    def _apply_skin_tone(pool):
        if skin_tone:
            accepted = _SKIN_TONE_EQUIVALENTS.get(skin_tone, {skin_tone})
            tone_matches = [s for s in pool if s["taxonomy_refs"].get("skin_tone") in accepted]
            if tone_matches:
                return tone_matches
        return pool

    # If not "myGear", return everything that matches mood + env
    if gear_mode != "myGear" or not gear:
        return FilterResult(systems=_apply_skin_tone(env_pool))

    # Progressive gear matching (4 tiers)
    owned = {GEAR_MAP.get(g.lower()) for g in gear} - {None}

    # Tier 1: Exact gear match
    exact = [s for s in env_pool if s["taxonomy_refs"].get("gear_profile") in owned]
    exact = _apply_skin_tone(exact)
    if exact:
        return FilterResult(systems=exact, match_tier="exact")

    # Tier 2: Gear group substitution
    owned_groups = {_GEAR_TO_GROUP.get(g) for g in owned} - {None}
    group_profiles = set()
    for grp in owned_groups:
        group_profiles.update(GEAR_GROUPS.get(grp, []))
    group_matches = [s for s in env_pool if s["taxonomy_refs"].get("gear_profile") in group_profiles]
    group_matches = _apply_skin_tone(group_matches)
    if group_matches:
        user_gear_name = next(iter(gear), "your gear")
        note = GEAR_ADAPT_NOTES.get(next(iter(owned)), "Adapt power and distance for your gear")
        return FilterResult(
            systems=group_matches,
            match_tier="gear_group",
            adapted_from=group_matches[0]["taxonomy_refs"].get("gear_profile", ""),
            adapt_note=f"Adapted for {user_gear_name}: {note}",
        )

    # Tier 3: Drop environment, keep mood + exact gear
    mood_gear = [s for s in mood_pool if s["taxonomy_refs"].get("gear_profile") in owned]
    mood_gear = _apply_skin_tone(mood_gear)
    if mood_gear:
        return FilterResult(
            systems=mood_gear, match_tier="any_gear",
            adapt_note="Setup shown for a different environment — adjust distances for your space",
        )

    # Tier 4: Drop environment, use gear group
    mood_group = [s for s in mood_pool if s["taxonomy_refs"].get("gear_profile") in group_profiles]
    mood_group = _apply_skin_tone(mood_group)
    if mood_group:
        user_gear_name = next(iter(gear), "your gear")
        note = GEAR_ADAPT_NOTES.get(next(iter(owned)), "Adapt power and distance for your gear")
        return FilterResult(
            systems=mood_group,
            match_tier="gear_group",
            adapted_from=mood_group[0]["taxonomy_refs"].get("gear_profile", ""),
            adapt_note=f"Adapted for {user_gear_name}: {note}. Adjust distances for your space.",
        )

    # Tier 5: Mood only
    fallback = _apply_skin_tone(mood_pool) if mood_pool else _apply_skin_tone(env_pool)
    if fallback:
        return FilterResult(
            systems=fallback, match_tier="mood_only",
            adapt_note="This setup uses different gear — see adaptation notes below",
        )

    return FilterResult(
        systems=_apply_skin_tone(systems), match_tier="mood_only",
        adapt_note="Showing best available setup — adapt for your gear and space",
    )


def build_modifiers(gear: List[str], gear_mode: str) -> List[str]:
    """Build available modifier list from user's gear."""
    if gear_mode != "myGear" or not gear:
        return []
    mods: set = set()
    for g in gear:
        mods.update(GEAR_TO_MODIFIERS.get(g.lower(), []))
    return list(mods)


def _reliability_label(score: int) -> str:
    if score >= 90:
        return "Very Reliable"
    if score >= 75:
        return "Reliable"
    if score >= 60:
        return "Good Option"
    if score >= 40:
        return "Experimental"
    return "Not Ideal"


def _confidence_tier(score: float) -> Dict[str, Any]:
    """Map numeric confidence to photographer-friendly tier.

    ≥85  → Locked        — "Shoot as shown, expect consistent results"
    70–84 → Strong       — "Minor tweaks may be needed on set"
    55–69 → Usable       — "Good starting point, test and refine"
    <55  → Needs adjustment — "Use as inspiration, expect to adjust"
    """
    if score >= 85:
        return {"tier": "Locked", "label": "Shoot as shown, expect consistent results", "icon": "lock"}
    if score >= 70:
        return {"tier": "Strong", "label": "Minor tweaks may be needed on set", "icon": "thumbs-up"}
    if score >= 55:
        return {"tier": "Usable", "label": "Good starting point, test and refine", "icon": "sliders"}
    return {"tier": "Needs adjustment", "label": "Use as inspiration, expect to adjust", "icon": "wrench"}


def _build_setup_summary(
    *,
    source: Dict[str, Any],
    pattern: str,
    light_count: int,
    modifier_family: str,
    key_direction: str,
) -> str:
    """Build a brief one-liner describing the setup for photographers."""
    parts = []

    # Pattern name (human-friendly)
    _PATTERN_NAMES = {
        "rembrandt": "Rembrandt",
        "loop": "Loop",
        "split": "Split",
        "butterfly": "Butterfly/Paramount",
        "clamshell": "Clamshell",
        "triangle": "Triangle",
        "broad": "Broad",
        "short": "Short",
        "gobo": "Gobo/Projected",
        "flat": "Flat",
        "flat_fashion": "Flat Fashion",
        "high_key": "High Key",
        "low_key": "Low Key",
        "window_portrait": "Window Portrait",
        "rim_only": "Rim Only",
        "ring_light": "Ring Light",
    }
    pattern_name = _PATTERN_NAMES.get(pattern, pattern.replace("_", " ").title())
    parts.append(f"{pattern_name} lighting")

    # Light count
    if light_count == 1:
        parts.append("single source")
    elif light_count == 2:
        parts.append("key + fill")
    elif light_count == 3:
        parts.append("3-light setup")
    elif light_count > 3:
        parts.append(f"{light_count}-light setup")

    # Modifier hint
    _MOD_SHORT = {
        "soft": "soft modifiers",
        "hard": "hard light",
        "mixed": "mixed modifiers",
        "natural": "natural light",
    }
    mod_hint = _MOD_SHORT.get(modifier_family)
    if mod_hint:
        parts.append(mod_hint)

    return " · ".join(parts)


def _build_shoot_loop(
    *,
    source: Dict[str, Any],
    cards: Dict[str, Any],
    pattern: str,
    pattern_candidates: Any,
    confidence_score: int,
    lighting_intel: Any,
    mood: str,
    modifier_family: str,
) -> Dict[str, Any]:
    """Build photographer-centric structured output.

    Organizes the engine output into the photographer's mental model:
    1. What look am I creating?  (look_name, setup_summary, confidence)
    2. How do I set it up?       (key_light, fill_light, camera_settings)
    3. How do I know it's right? (check_list, fix_if_wrong)
    """
    # Extract key direction and light count from lighting_intel
    key_side = getattr(lighting_intel, "key_side", "unknown") if lighting_intel else "unknown"
    light_count = getattr(lighting_intel, "light_count", 0) if lighting_intel else 0
    # Fall back to diagram light count
    if light_count == 0 and "diagram" in cards:
        diagram_lights = cards["diagram"].get("lights", [])
        light_count = len(diagram_lights)

    setup_summary = _build_setup_summary(
        source=source,
        pattern=pattern,
        light_count=light_count,
        modifier_family=modifier_family,
        key_direction=key_side,
    )

    # Confidence tier
    tier = _confidence_tier(float(confidence_score))

    # Pattern confidence from candidates
    pattern_confidence = 0.0
    pattern_source = "unknown"
    if pattern_candidates and pattern_candidates.primary:
        pattern_confidence = round(pattern_candidates.primary.confidence * 100)
        pattern_source = pattern_candidates.primary.source

    # Key light info from diagram
    key_light = None
    fill_light = None
    other_lights = []
    if "shootThisSetup" in cards:
        for light in cards["shootThisSetup"].get("lights", []):
            role = light.get("roleKey", "")
            if role == "key" and key_light is None:
                key_light = light
            elif role == "fill" and fill_light is None:
                fill_light = light
            else:
                other_lights.append(light)

    # Check list from existing cards
    good_signs = cards.get("whatToLookFor", {}).get("goodSigns", [])
    warnings = cards.get("whatToLookFor", {}).get("warnings", [])
    quick_fixes = cards.get("quickFixes", {}).get("fixes", [])

    shoot_loop: Dict[str, Any] = {
        # 1. What look am I creating?
        "lookName": source.get("name", pattern),
        "setupSummary": setup_summary,
        "detectedPattern": pattern,
        "patternConfidence": pattern_confidence,
        "patternSource": pattern_source,
        "confidenceTier": tier,

        # 2. How do I set it up?
        "lightCount": light_count,
        "keyLight": key_light,
        "fillLight": fill_light,
        "additionalLights": other_lights if other_lights else None,
        "cameraSettings": cards.get("cameraSettings"),

        # 3. How do I know it's right?
        "checkList": good_signs[:5] if good_signs else [],
        "warningSignals": warnings[:5] if warnings else [],
        "quickFixes": quick_fixes[:5] if quick_fixes else [],

        # Context
        "mood": mood,
        "environment": source.get("taxonomy_refs", {}).get("environment"),
        "difficulty": source.get("difficulty"),
        "setupTimeMinutes": source.get("setup_time_minutes"),
    }

    # Add alternatives summary
    other_setups = cards.get("otherSetups", [])
    if other_setups:
        shoot_loop["alternatives"] = [
            {"name": s["name"], "score": s["score"]}
            for s in other_setups[:3]
        ]

    return shoot_loop


def _m_to_ft(m: float) -> str:
    total_in = round(m * 39.3701)
    feet, inches = divmod(total_in, 12)
    return f"{feet}'{inches}\"" if inches else f"{feet}'"


def _angle_desc(deg: float) -> str:
    if abs(deg) < 5:
        return "on axis (centered)"
    if abs(deg) >= 135:
        return "behind subject"
    side = "camera right" if deg >= 0 else "camera left"
    return f"{round(abs(deg))}° {side}"


def _height_desc(h: float) -> str:
    eye = 1.6
    diff = h - eye
    base = _m_to_ft(h)
    if abs(diff) < 0.1:
        return f"{base} (eye level)"
    label = "above" if diff > 0 else "below"
    return f"{base} ({_m_to_ft(abs(diff))} {label} eye level)"


def _map_light(light: Dict[str, Any]) -> Dict[str, Any]:
    mod = light.get("modifier", "")
    return {
        "roleKey": light["role"],
        "role": ROLE_LABELS.get(light["role"], light.get("label", light["role"])),
        "modifier": MODIFIER_LABELS.get(mod, mod),
        "position": _angle_desc(light["angle_deg"]),
        "height": _height_desc(light["height_m"]),
        "distance": _m_to_ft(light["distance_m"]),
        "notes": light.get("notes", []),
    }


def _camera_settings_for_pattern(pattern: str, mood: str) -> Dict[str, Any]:
    """Load camera settings from canonical YAML when pattern matches, else mood-based."""
    canonical_path = Path(f"data/systems/canonical/{pattern}.yml")
    if canonical_path.exists():
        try:
            import yaml
            with open(canonical_path) as f:
                canon = yaml.safe_load(f)
            cs = canon.get("capture_settings")
            if cs:
                return {
                    "aperture": cs.get("aperture", ""),
                    "iso": str(cs.get("iso", "")),
                    "shutter": cs.get("shutter", ""),
                    "wb": cs.get("white_balance", ""),
                    "tip": "; ".join(cs.get("notes", [])),
                }
        except Exception:
            pass
    return CAMERA_SETTINGS.get(mood, CAMERA_SETTINGS["corporate"])


# ═══════════════════════════════════════════════════════════════════════════
# Card assembly
# ═══════════════════════════════════════════════════════════════════════════

def _build_cards(
    *,
    source: Dict[str, Any],
    lights: List[Dict[str, Any]],
    diagram_dict: Dict[str, Any],
    pattern: str,
    mood: str,
    modifier_family: str,
    confidence_score: int,
    top_picks: list,
    master_mode: Optional[str],
) -> Dict[str, Any]:
    """Assemble all UI card data from engine outputs."""
    from engine.patterns import shadow_expectations_for, catchlight_plan_for
    from engine.taxonomy_loader import get_diagnostics_for_pattern
    from engine.master_mode import get_coaching_overlay

    shadows = shadow_expectations_for(pattern)
    catchlights = catchlight_plan_for(modifier_family, pattern)

    cards = {
        "bestMatch": {
            "name": source["name"],
            "reliability": confidence_score,
            "reliabilityLabel": _reliability_label(confidence_score),
            "difficulty": source.get("difficulty"),
            "setupTime": source.get("setup_time_minutes"),
        },
        "shootThisSetup": {
            "lights": [_map_light(l) for l in lights],
        },
        "spaceCheck": {
            "environment": source["taxonomy_refs"].get("environment"),
            "maxDistanceFt": _m_to_ft(max(l["distance_m"] for l in lights)),
        },
        "diagram": diagram_dict,
        "howToTest": {
            "pattern": shadows.get("pattern", pattern),
            "fixOrder": shadows.get("fix_order", []),
        },
        "whatToLookFor": {
            "goodSigns": shadows.get("what_you_should_see", []),
            "warnings": shadows.get("what_means_it_is_wrong", []) + source.get("failure_modes", []),
            "catchlights": catchlights,
        },
        "whyThisWorks": {
            "body": source.get("why_this_works", ""),
        },
        "quickFixes": {
            "fixes": catchlights.get("quick_fixes", []),
            "fixOrder": shadows.get("fix_order", []),
        },
        "diagnostics": [
            {
                "id": d["id"],
                "symptoms": d.get("symptoms", []),
                "likely_causes": d.get("likely_causes", []),
                "quick_fixes": d.get("quick_fixes", []),
            }
            for d in get_diagnostics_for_pattern(pattern)
        ],
        "substitutions": {
            "items": [
                {
                    "ifMissing": MODIFIER_LABELS.get(s["if_missing"], s["if_missing"]),
                    "use": MODIFIER_LABELS.get(s["use"], s["use"]),
                    "tradeoff": s["tradeoff"],
                }
                for s in source.get("substitutions", [])
            ],
        },
        "cameraSettings": _camera_settings_for_pattern(pattern, mood),
        "otherSetups": [
            {
                "name": p.breakdown.system_name,
                "score": round(float(p.breakdown.final_score) * 100),
                "reason": p.reason,
            }
            for p in top_picks[1:4]
        ],
    }

    # Master mode coaching overlay
    coaching = get_coaching_overlay(master_mode)
    if coaching:
        cards["bestMatch"]["masterMode"] = coaching.get("masterModeId")
        cards["bestMatch"]["masterModeLabel"] = coaching.get("masterModeLabel")
        cards["bestMatch"]["masterModeIcon"] = coaching.get("masterModeIcon")

        if coaching.get("rationale"):
            cards["whyThisWorks"]["body"] = coaching["rationale"]
        if coaching.get("camera"):
            cards["cameraSettings"] = {**cards["cameraSettings"], **coaching["camera"]}
        if coaching.get("good_signs"):
            existing = cards["whatToLookFor"].get("goodSigns", [])
            cards["whatToLookFor"]["goodSigns"] = coaching["good_signs"] + existing
        if coaching.get("warnings"):
            existing = cards["whatToLookFor"].get("warnings", [])
            cards["whatToLookFor"]["warnings"] = coaching["warnings"] + existing
        if coaching.get("quick_fixes"):
            existing = cards["quickFixes"].get("fixes", [])
            cards["quickFixes"]["fixes"] = coaching["quick_fixes"] + existing
        if coaching.get("substitution_notes"):
            existing = cards["substitutions"].get("items", [])
            mode_subs = [{"ifMissing": "—", "use": note, "tradeoff": ""} for note in coaching["substitution_notes"]]
            cards["substitutions"]["items"] = mode_subs + existing
        if coaching.get("lights_guide"):
            cards["bestMatch"]["lightsGuide"] = coaching["lights_guide"]

    return cards


# ═══════════════════════════════════════════════════════════════════════════
# Reference analysis enrichment
# ═══════════════════════════════════════════════════════════════════════════

def _build_reference_analysis(
    *,
    image_analysis: Dict[str, Any],
    lighting_intel: Any,
    ref_cue_report: Any,
    ref_vlm_description: Any,
    authoritative_pattern: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the referenceImageAnalysis section of the response.

    Parameters
    ----------
    authoritative_pattern : str or None
        When available, used instead of ``lighting_intel.pattern`` for
        diagram building and response fields.  Falls back to
        ``lighting_intel.pattern`` when None (e.g., upload-reference flow
        where full pipeline hasn't run).
    """
    from engine.lighting_inference import (
        build_reference_description,
        match_catchlights_to_diagram,
    )
    from engine.diagram import build_reference_diagram

    ref_analysis: Dict[str, Any] = {
        "palette": image_analysis.get("palette", {}),
        "orientation": image_analysis.get("orientation"),
        "isGrayscale": image_analysis.get("is_grayscale_like", False),
        "classification": image_analysis.get("classification"),
    }

    vision = image_analysis.get("vision", {})
    if vision and vision.get("ok"):
        ref_analysis["skinTone"] = vision.get("skin_tone")
        catchlight_data = vision.get("catchlights")
        if catchlight_data and catchlight_data.get("ok"):
            ref_analysis["catchlights"] = catchlight_data
        region = vision.get("region_attribution", {})
        masks = region.get("masks", {})
        palettes = region.get("palettes", {})
        bg_palette = palettes.get("background_palette")
        if bg_palette is not None:
            ref_analysis["background"] = {
                "palette": bg_palette,
                "ratio": masks.get("background_ratio"),
            }

    # Enrich background with light detection
    if lighting_intel is not None and lighting_intel.background_light_detected:
        bg_section = ref_analysis.get("background", {})
        bg_section["lightDetected"] = True
        bg_section["lightConfidence"] = lighting_intel.background_light_confidence
        ref_analysis["background"] = bg_section

    # Diagram + descriptions on the reference evaluation
    if lighting_intel is not None:
        # Use authoritative pattern (reconciled across all classifiers) when
        # available; fall back to lighting_intel.pattern for upload-reference
        # flow where the full pipeline hasn't run.
        diagram_pattern = authoritative_pattern if authoritative_pattern and authoritative_pattern != "unknown" else lighting_intel.pattern

        ref_diagram = build_reference_diagram(
            pattern=diagram_pattern,
            modifier_family=lighting_intel.modifier_family,
            light_count=lighting_intel.light_count,
            key_position_text=lighting_intel.key_position_text,
            fill_method_text=lighting_intel.fill_method_text,
            background_light=lighting_intel.background_light_detected,
            key_side=lighting_intel.key_side,
        )
        ref_diagram_dict = ref_diagram.model_dump()

        raw_catchlights: List[Dict[str, Any]] = []
        cd = vision.get("catchlights", {}) if vision else {}
        if cd and cd.get("ok"):
            raw_catchlights = cd.get("catchlights", [])

        matched_lights = match_catchlights_to_diagram(
            diagram_lights=ref_diagram_dict["lights"],
            catchlights=raw_catchlights,
            pattern=diagram_pattern,
        )

        diagram_lights: List[Dict[str, Any]] = []
        for ml in matched_lights:
            entry: Dict[str, Any] = {
                **_map_light(ml),
                "detectedFrom": ml.get("detectedFrom", []),
            }
            if ml.get("role") == "background":
                entry["detectedFromNote"] = (
                    "Background lights illuminate the backdrop, not the subject's eyes. "
                    "This light was inferred from background brightness analysis, "
                    "not from catchlight evidence."
                )
            diagram_lights.append(entry)

        ref_analysis["detectedDiagram"] = {
            "lights": diagram_lights,
            "subject": ref_diagram_dict["subject"],
            "camera": ref_diagram_dict["camera"],
            "raw": ref_diagram_dict,
        }

        ref_description = build_reference_description(
            vision_data=vision,
            classification=image_analysis.get("classification"),
            image_analysis=image_analysis,
            inference=lighting_intel,
            cue_report=ref_cue_report,
            vlm_description=ref_vlm_description,
        )
        ref_analysis["description"] = ref_description

    return ref_analysis


def _build_reference_read_summary(
    reference_photo_analysis: Any,
    authoritative_pattern: str,
    pattern_candidates: Any,
) -> Optional[Dict[str, Any]]:
    """Build photographer-friendly summary from the three-layer reference read.

    Extracts the structured ImageRead + LightingRead + RecreationSetup
    into a clean, organized format photographers can actually use.

    Phase 4: This upgrades the reference image output from raw data dump
    to structured photographer-centric information.
    """
    if reference_photo_analysis is None:
        return None

    image_read = getattr(reference_photo_analysis, "image_read", None)
    lighting_read = getattr(reference_photo_analysis, "lighting_read", None)
    recreation = getattr(reference_photo_analysis, "recreation_setup", None)

    if image_read is None and lighting_read is None:
        return None

    summary: Dict[str, Any] = {}

    # ── Image Read: What's in the photo ──────────────────────────
    if image_read is not None:
        summary["image"] = {
            "genre": getattr(image_read, "genre", "unknown"),
            "mood": getattr(image_read, "mood", "unknown"),
            "subjectType": getattr(image_read, "subject_type", "unknown"),
            "subjectCount": getattr(image_read, "subject_count", 1),
            "skinTones": getattr(image_read, "subject_skin_tones", []),
            "visualIntent": getattr(image_read, "visual_intent", ""),
            "poseNotes": getattr(image_read, "pose_notes", ""),
            "backgroundRole": getattr(image_read, "background_relationship", ""),
            "notableDevices": getattr(image_read, "notable_visual_devices", []),
            "narrative": getattr(image_read, "narrative", ""),
        }
        # Clean out empty strings
        summary["image"] = {k: v for k, v in summary["image"].items() if v}

    # ── Lighting Read: What the light is doing ───────────────────
    if lighting_read is not None:
        shadow_pattern = getattr(lighting_read, "shadow_pattern", "unknown")
        shadow_detail = getattr(lighting_read, "shadow_pattern_detail", "")

        lr_confidence = getattr(lighting_read, "confidence", 0.0)
        data_quality = getattr(lighting_read, "data_quality", "full")
        resolution = getattr(lighting_read, "resolution_quality", "unknown")

        summary["lighting"] = {
            "shadowPattern": shadow_pattern,
            "shadowPatternDetail": shadow_detail if shadow_detail and shadow_detail != shadow_pattern else None,
            "sourceQuality": getattr(lighting_read, "source_quality", "unknown"),
            "sourceDirection": getattr(lighting_read, "source_direction", "unknown"),
            "fillPresence": getattr(lighting_read, "fill_presence", "unknown"),
            "rimPresence": getattr(lighting_read, "rim_presence", "unknown"),
            "lightCount": getattr(lighting_read, "light_count", 0),
            "lightingFamily": getattr(lighting_read, "lighting_family", "unknown"),
            "keyObservations": getattr(lighting_read, "key_observations", []),
            "ambiguityNotes": getattr(lighting_read, "ambiguity_notes", []),
            "confidence": round(lr_confidence, 2),
            "dataQuality": data_quality,
            "resolutionQuality": resolution,
        }
        # Clean out None values
        summary["lighting"] = {k: v for k, v in summary["lighting"].items() if v is not None}

        # Tonal processing (B&W, grading, etc.)
        tp = getattr(lighting_read, "tonal_processing_notes", "")
        if tp:
            summary["lighting"]["tonalProcessing"] = tp

    # ── Pattern Analysis: Authoritative classification ───────────
    _pc_conf = (
        pattern_candidates.primary.confidence
        if pattern_candidates and pattern_candidates.primary
        else 0.0
    )
    summary["patternAnalysis"] = {
        "authoritativePattern": authoritative_pattern,
        "confidenceTier": _confidence_tier(_pc_conf * 100),
        "confidenceLabel": (
            pattern_candidates.confidence_label
            if pattern_candidates else "weak"
        ),
        "confidenceScore": round(_pc_conf, 3),
    }
    if pattern_candidates:
        summary["patternAnalysis"]["primarySource"] = (
            pattern_candidates.primary.source
            if pattern_candidates.primary else "none"
        )
        if pattern_candidates.alternates:
            summary["patternAnalysis"]["alternates"] = [
                {"pattern": c.pattern, "source": c.source, "confidence": round(c.confidence, 2)}
                for c in pattern_candidates.alternates
            ]
        if pattern_candidates.contradictions:
            summary["patternAnalysis"]["contradictions"] = list(pattern_candidates.contradictions)
        if pattern_candidates.needs_review:
            summary["patternAnalysis"]["needsReview"] = True

    # ── Recreation Setup: How to recreate it ─────────────────────
    if recreation is not None:
        rec_dict: Dict[str, Any] = {}

        # Key light setup
        key_setup = getattr(recreation, "key_light", None)
        if key_setup:
            rec_dict["keyLight"] = {
                "modifier": getattr(key_setup, "modifier", ""),
                "position": getattr(key_setup, "position", ""),
                "height": getattr(key_setup, "height", ""),
                "power": getattr(key_setup, "power", ""),
                "notes": getattr(key_setup, "notes", []),
            }
            rec_dict["keyLight"] = {k: v for k, v in rec_dict["keyLight"].items() if v}

        # Fill light setup
        fill_setup = getattr(recreation, "fill_light", None)
        if fill_setup:
            rec_dict["fillLight"] = {
                "modifier": getattr(fill_setup, "modifier", ""),
                "position": getattr(fill_setup, "position", ""),
                "notes": getattr(fill_setup, "notes", []),
            }
            rec_dict["fillLight"] = {k: v for k, v in rec_dict["fillLight"].items() if v}

        # Additional lights
        extra = getattr(recreation, "additional_lights", None)
        if extra:
            rec_dict["additionalLights"] = [
                {k: v for k, v in {
                    "role": getattr(l, "role", ""),
                    "modifier": getattr(l, "modifier", ""),
                    "position": getattr(l, "position", ""),
                    "notes": getattr(l, "notes", []),
                }.items() if v}
                for l in extra
            ]

        # Environment and tips
        env = getattr(recreation, "environment", None)
        if env:
            rec_dict["environment"] = str(env)
        tips = getattr(recreation, "tips", None) or getattr(recreation, "notes", None)
        if tips:
            rec_dict["tips"] = list(tips) if not isinstance(tips, str) else [tips]

        if rec_dict:
            summary["recreation"] = rec_dict

    return summary


def _build_lighting_intelligence(
    lighting_intel: Any,
    pattern: str,
    mood: str,
    cue_inference_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the lightingIntelligence section of the response.

    Phase 9 additions: lightSourceType, ambientConditions, environmentConfidence
    derived from cue_inference_result["environment"] (EnvironmentInference).
    """
    # Use authoritative pattern (reconciled from all classifiers) as the
    # primary detectedPattern.  lighting_intel.pattern is preserved as
    # classifierPattern for transparency.
    intel_dict: Dict[str, Any] = {
        "detectedPattern": pattern if pattern and pattern != "unknown" else lighting_intel.pattern,
        "classifierPattern": lighting_intel.pattern,
        "patternConfidence": lighting_intel.pattern_confidence,
        "detectedModifier": lighting_intel.modifier_family,
        "modifierConfidence": lighting_intel.modifier_confidence,
        "detectedMood": lighting_intel.detected_mood,
        "moodConfidence": lighting_intel.mood_confidence,
        "detectedSkinTone": lighting_intel.detected_skin_tone,
        "skinToneConfidence": lighting_intel.skin_tone_confidence,
        "lightCount": lighting_intel.light_count,
        "keyPosition": lighting_intel.key_position_text,
        "fillMethod": lighting_intel.fill_method_text,
        "backgroundLight": lighting_intel.background_light_detected,
        "backgroundLightConfidence": lighting_intel.background_light_confidence,
        "notes": lighting_intel.notes,
        "authoritative_pattern": pattern,
    }
    if lighting_intel.detected_cct_kelvin is not None:
        intel_dict["detectedCCT"] = lighting_intel.detected_cct_kelvin
    if lighting_intel.detected_environment:
        intel_dict["detectedEnvironment"] = lighting_intel.detected_environment
    if lighting_intel.detected_distance_class:
        intel_dict["detectedDistance"] = lighting_intel.detected_distance_class
    if lighting_intel.detected_mood and lighting_intel.detected_mood != mood:
        intel_dict["moodDiscrepancy"] = {
            "userSelected": mood,
            "imageDetected": lighting_intel.detected_mood,
            "note": (
                f"Your selected mood '{mood}' differs from the reference image's "
                f"detected mood '{lighting_intel.detected_mood}'. The system used "
                f"both signals to improve recommendations."
            ),
        }

    # ── Phase 9: Environment intelligence ──────────────────────────────────
    # Derive lightSourceType, ambientConditions, and environmentConfidence
    # from the EnvironmentInference stage of the cue inference pipeline.
    env_inf = None
    if cue_inference_result and isinstance(cue_inference_result, dict):
        env_inf = cue_inference_result.get("environment")

    if env_inf is not None:
        is_natural = getattr(env_inf, "is_natural_light", None)
        env_type = getattr(env_inf, "environment_type", None) or ""
        special_cases = getattr(env_inf, "special_cases", []) or []
        bg_treatment = getattr(env_inf, "background_treatment", None) or ""
        env_confidence = getattr(env_inf, "confidence", None)

        # lightSourceType: natural | artificial | mixed | unknown
        if is_natural is True and bg_treatment != "controlled":
            light_source_type = "natural"
        elif is_natural is False or bg_treatment == "controlled":
            light_source_type = "artificial"
        elif is_natural is None:
            light_source_type = "unknown"
        else:
            light_source_type = "mixed"
        intel_dict["lightSourceType"] = light_source_type

        # ambientConditions: human-readable summary of shooting conditions
        ambient = _describe_ambient_conditions(env_type, special_cases, bg_treatment)
        if ambient:
            intel_dict["ambientConditions"] = ambient

        # environmentConfidence
        if env_confidence is not None:
            intel_dict["environmentConfidence"] = round(env_confidence, 3)

        # environmentType (structured)
        if env_type and env_type != "unknown":
            intel_dict["environmentType"] = env_type

        # specialCases from environment inference
        if special_cases:
            intel_dict["environmentSpecialCases"] = special_cases

    return intel_dict


# ── Phase 9 helper ──────────────────────────────────────────────────────────

_AMBIENT_DESCRIPTIONS: Dict[str, str] = {
    "outdoor_sun_direct_sunlight":
        "Direct sunlight — hard, warm, strongly directional. Use reflector or fill flash for shadow control.",
    "outdoor_sun":
        "Outdoor sun — bright, directional. Strong shadows likely.",
    "outdoor_shade_dappled_foliage":
        "Dappled foliage — mixed hard/soft ambient. Shadow patterns may be irregular.",
    "outdoor_shade":
        "Open shade — soft, even, slightly cool. Ideal for portraits without fill.",
    "indoor_ambient_window_light":
        "Window light — single large diffuse source. Soft, directional, dependent on sky conditions.",
    "indoor_ambient":
        "Indoor ambient — soft, even fill from room surfaces. Low contrast.",
    "studio":
        "Controlled studio — artificial light only. No ambient interference.",
    "mixed":
        "Mixed light sources — artificial and natural combined. Watch for color temperature inconsistency.",
}


def _describe_ambient_conditions(
    env_type: str,
    special_cases: List[str],
    bg_treatment: str,
) -> str:
    """Return a human-readable ambient conditions string."""
    # Try most-specific key first (env_type + special_case combo)
    for case in special_cases:
        key = f"{env_type}_{case}"
        if key in _AMBIENT_DESCRIPTIONS:
            return _AMBIENT_DESCRIPTIONS[key]
    # Fall back to env_type alone
    if env_type in _AMBIENT_DESCRIPTIONS:
        return _AMBIENT_DESCRIPTIONS[env_type]
    # bg_treatment fallback
    if bg_treatment == "controlled":
        return _AMBIENT_DESCRIPTIONS.get("studio", "")
    return ""


# ═══════════════════════════════════════════════════════════════════════════
# Main service entry point
# ═══════════════════════════════════════════════════════════════════════════

def build_shoot_match_result(
    *,
    mood: str,
    environment: str,
    gear: List[str],
    gear_mode: str,
    skin_tone: Optional[str] = None,
    master_mode: Optional[str] = None,
    reference_image: Optional[str] = None,
    prior_pattern: Optional[str] = None,
    prior_confidence: Optional[float] = None,
) -> ShootMatchResult:
    """Build the complete shoot-match result.

    This is the single orchestration entry point for the shoot-match route.
    All inference, card assembly, and response packaging happens here.
    The route only parses the HTTP request and returns this result.

    Parameters
    ----------
    mood : str
        Internal mood code (already resolved from display label).
    environment : str
        Internal environment code (already resolved).
    gear : list of str
        Raw gear labels from request.
    gear_mode : str
        "myGear" or "anyGear".
    skin_tone : str or None
        Selected skin tone.
    master_mode : str or None
        Active master mode.
    reference_image : str or None
        Path to reference image file.

    Returns
    -------
    ShootMatchResult
        Complete result with cards, pattern candidates, and supplementary data.
    """
    from engine.orchestrator import (
        analyze_image,
        extract_solver_quality,
        resolve_pattern_candidates,
        PatternCandidate,
        PatternCandidates,
    )
    from engine.selector import select_best_system
    from engine.scoring import score_system as _score
    from engine.diagram import build_diagram, build_reference_diagram
    from engine.patterns import classify_lighting_pattern
    from models.output_model import SelectionPick

    t0 = time.time()

    all_systems = _load_systems()
    fr = filter_systems(
        all_systems,
        mood=mood,
        environment=environment,
        gear=gear,
        gear_mode=gear_mode,
        skin_tone=skin_tone,
    )

    if not fr.systems:
        return ShootMatchResult(
            processing_ms=round((time.time() - t0) * 1000),
            request_id=f"req_{uuid.uuid4().hex[:12]}",
        )

    filtered = fr.systems
    modifiers = build_modifiers(gear, gear_mode)

    # ── Reference image analysis ──────────────────────────────────
    image_analysis = None
    lighting_intel = None
    ref_cue_report = None
    ref_vlm_description = None
    ref_vlm_reconstruction = None
    ar = None
    if reference_image:
        image_path = Path(reference_image)
        if image_path.exists():
            try:
                ar = analyze_image(str(image_path), run_extended=True, run_solver=True, debug=True)
                if ar.ok:
                    image_analysis = ar.description
                    lighting_intel = ar.lighting_intel
                    ref_cue_report = ar.cue_report
                    ref_vlm_description = ar.vlm_description
                    ref_vlm_reconstruction = ar.vlm_reconstruction
            except Exception:
                logger.exception("Reference image analysis failed")

    # ── Build input context ──────────────────────────────────────
    engine_systems = [
        {
            "id": s["id"], "name": s["name"],
            "criteria": s["criteria"], "features": s["features"],
            "taxonomy_refs": s["taxonomy_refs"], "modifier": s.get("modifier"),
        }
        for s in filtered
    ]

    primary_gear = None
    if gear_mode == "myGear" and gear:
        primary_gear = GEAR_MAP.get(gear[0].lower())

    input_ctx: Dict[str, Any] = {"mood": mood, "environment": environment, "modifiers_available": modifiers}
    if primary_gear:
        input_ctx["gear_profile"] = primary_gear
    if master_mode:
        input_ctx["master_mode"] = master_mode
    if skin_tone:
        input_ctx["skin_tone"] = skin_tone
    if lighting_intel is not None:
        input_ctx.update(lighting_intel.to_input_ctx_fields())

    # Override detected_pattern with authoritative pattern when available.
    # lighting_intel.to_input_ctx_fields() sets detected_pattern from its own
    # classifier; the orchestrator's authoritative pattern (which reconciles
    # all classifiers) is more trustworthy.
    if ar and ar.authoritative_pattern and ar.authoritative_pattern != "unknown":
        input_ctx["detected_pattern"] = ar.authoritative_pattern
        # Use primary candidate confidence if available
        if ar.pattern_candidates:
            input_ctx["detected_pattern_confidence"] = ar.pattern_candidates.primary.confidence

    # Override detected_light_count with the deduped catchlight count from
    # reflection_architecture.  lighting_intel.light_count is raw (includes
    # floor reflections, SIP false positives); deduped count is what CV actually
    # confirmed as distinct sources.  This drives gear_profile selection:
    # count=1 → single-light systems; count=2 → 2-light systems; etc.
    if ar:
        _cr_sm = getattr(ar, "cue_report", None)
        _ra_sm = getattr(_cr_sm, "reflection_architecture", None) if _cr_sm else None
        _deduped_lc_sm = getattr(_ra_sm, "total_catchlights", None)
        # Only use deduped count when it is positive (> 0).
        # Zero means either eyes were closed, no catchlights were visible, or
        # only a single eye was detectable — in any of these cases the count
        # carries no information about the actual number of light sources and
        # should not be used to penalise all gear profiles in scoring.
        if _deduped_lc_sm is not None and _deduped_lc_sm > 0:
            input_ctx["detected_light_count"] = _deduped_lc_sm
            # Confidence derived from reflection_architecture confidence field
            _ra_conf = getattr(_ra_sm, "confidence", 0.5)
            input_ctx["detected_light_count_confidence"] = float(_ra_conf)

    # If a prior_pattern was supplied (from the ref eval screen's pre-computed
    # analysis), use it to override the detected_pattern. This ensures the setup
    # recommendation stays anchored to what the ref eval UI showed rather than
    # diverging due to a second independent analysis run.
    if prior_pattern and prior_pattern != "unknown":
        input_ctx["detected_pattern"] = prior_pattern
        if prior_confidence is not None:
            input_ctx["detected_pattern_confidence"] = prior_confidence

    # ── Selection ────────────────────────────────────────────────
    sq = extract_solver_quality(ar.solver_result) if ar and ar.solver_result else None
    outcome = select_best_system(
        engine_systems,
        input_ctx=input_ctx,
        modifiers_available=modifiers,
        solver_quality=sq,
    )

    top_picks = list(outcome.top_picks)
    winner = top_picks[0]
    winner_id = winner.breakdown.system_id
    confidence_score = round(float(outcome.confidence))

    # ── Backfill alternatives ────────────────────────────────────
    if len(top_picks) < 4:
        existing_ids = {p.breakdown.system_id for p in top_picks}
        mood_pool = [s for s in all_systems if s["taxonomy_refs"].get("mood") == mood]
        env_pool = [s for s in mood_pool if s["taxonomy_refs"].get("environment") == environment]
        for pool in [env_pool, mood_pool, all_systems]:
            if len(top_picks) >= 4:
                break
            candidates = [
                {
                    "id": s["id"], "name": s["name"],
                    "criteria": s["criteria"], "features": s["features"],
                    "taxonomy_refs": s["taxonomy_refs"], "modifier": s.get("modifier"),
                }
                for s in pool if s["id"] not in existing_ids
            ]
            if not candidates:
                continue
            scored = [(c, _score(c, input_ctx=input_ctx, solver_quality=sq)) for c in candidates]
            scored.sort(key=lambda x: -float(x[1].final_score))
            for c, bd in scored:
                if len(top_picks) >= 4:
                    break
                if bd.system_id in existing_ids:
                    continue
                existing_ids.add(bd.system_id)
                top_picks.append(SelectionPick(
                    rank=len(top_picks) + 1,
                    breakdown=bd,
                    reason=f"Alternative: from broader search (behind by {float(winner.breakdown.final_score) - float(bd.final_score):.1f} points).",
                    diagram_spec=None,
                ))

    # ── Diagram ──────────────────────────────────────────────────
    source = next((s for s in filtered if s["id"] == winner_id), filtered[0])
    diagram = build_diagram(source, modifiers_available=modifiers, master_mode=master_mode)
    diagram_dict = diagram.model_dump()
    lights = diagram_dict["lights"]

    # ── Pattern resolution (candidate-first) ─────────────────────
    # Authoritative pattern candidates come from orchestrator.resolve_pattern_candidates().
    # The fallback rule-based classifier (patterns.classify_lighting_pattern) is used
    # only when no vision pipeline ran (no reference image).
    modifier_family = source["taxonomy_refs"].get("modifier_family", "")
    gear_profile = source["taxonomy_refs"].get("gear_profile", "")

    pattern_candidates = None
    if ar and ar.pattern_candidates:
        pattern_candidates = ar.pattern_candidates
        pattern = pattern_candidates.authoritative_pattern
    elif ar and ar.authoritative_pattern and ar.authoritative_pattern != "unknown":
        # Legacy path: AnalysisResult has pattern but no candidates (shouldn't happen now)
        pattern = ar.authoritative_pattern
        pattern_candidates = PatternCandidates(
            primary=PatternCandidate(pattern=pattern, source=ar.authoritative_pattern_source, confidence=0.8),
        )
    else:
        # No reference image — rule-based fallback.
        # This is NOT authoritative pattern selection; it's a fallback for the
        # build-from-scratch flow where no vision pipeline ran.
        pattern = classify_lighting_pattern(
            mood=mood,
            modifier_family=modifier_family,
            gear_profile=gear_profile,
            key_position_text=input_ctx.get("detected_key_position", ""),
            fill_method_text=input_ctx.get("detected_fill_method", ""),
        )
        pattern_candidates = PatternCandidates(
            primary=PatternCandidate(pattern=pattern, source="rule_fallback", confidence=0.5),
        )

    diagram_dict["pattern"] = pattern

    # When pattern comes from reference analysis, override diagram geometry
    if ar and ar.authoritative_pattern_source in ("reference_read", "lighting_inference") and lighting_intel:
        try:
            ref_diagram = build_reference_diagram(
                pattern=pattern,
                modifier_family=lighting_intel.modifier_family,
                light_count=lighting_intel.light_count,
                key_position_text=lighting_intel.key_position_text,
                fill_method_text=lighting_intel.fill_method_text,
                background_light=lighting_intel.background_light_detected,
                key_side=lighting_intel.key_side,
            )
            ref_diagram_dict = ref_diagram.model_dump()
            diagram_dict["lights"] = ref_diagram_dict["lights"]
            diagram_dict["subject"] = ref_diagram_dict["subject"]
            diagram_dict["camera"] = ref_diagram_dict["camera"]
            diagram_dict["pattern"] = pattern
            lights = diagram_dict["lights"]
        except Exception:
            pass  # Fall back to system diagram

    # ── Card assembly ────────────────────────────────────────────
    cards = _build_cards(
        source=source,
        lights=lights,
        diagram_dict=diagram_dict,
        pattern=pattern,
        mood=mood,
        modifier_family=modifier_family,
        confidence_score=confidence_score,
        top_picks=top_picks,
        master_mode=master_mode,
    )

    # ── Shoot loop (photographer-centric output) ────────────────
    shoot_loop = _build_shoot_loop(
        source=source,
        cards=cards,
        pattern=pattern,
        pattern_candidates=pattern_candidates,
        confidence_score=confidence_score,
        lighting_intel=lighting_intel,
        mood=mood,
        modifier_family=modifier_family,
    )

    # ── Gear match info ──────────────────────────────────────────
    gear_match = None
    if gear_mode == "myGear":
        tier_labels = {
            "exact": "Perfect match",
            "gear_group": "Adapted for your gear",
            "any_gear": "Different environment",
            "mood_only": "Inspiration — different gear",
        }
        gear_match = {
            "tier": fr.match_tier,
            "label": tier_labels.get(fr.match_tier, "Match"),
            "isExact": fr.match_tier == "exact",
        }
        if fr.adapt_note:
            gear_match["adaptNote"] = fr.adapt_note
        if fr.adapted_from:
            gear_match["adaptedFrom"] = fr.adapted_from

    # ── Reference analysis enrichment ────────────────────────────
    ref_analysis_dict = None
    if image_analysis and image_analysis.get("ok"):
        try:
            ref_analysis_dict = _build_reference_analysis(
                image_analysis=image_analysis,
                lighting_intel=lighting_intel,
                ref_cue_report=ref_cue_report,
                ref_vlm_description=ref_vlm_description,
                authoritative_pattern=pattern,
            )
        except Exception:
            logger.exception("Reference analysis enrichment failed")

    # ── Reference read summary (Phase 4) ─────────────────────────
    # Surface the three-layer reference read (ImageRead + LightingRead +
    # RecreationSetup) as a structured photographer-friendly summary.
    ref_read_summary = None
    if ar and ar.reference_analysis is not None:
        try:
            ref_read_summary = _build_reference_read_summary(
                ar.reference_analysis,
                authoritative_pattern=pattern,
                pattern_candidates=pattern_candidates,
            )
        except Exception:
            logger.exception("Reference read summary failed")

    # Attach to ref_analysis_dict so it ships in referenceImageAnalysis
    if ref_read_summary and ref_analysis_dict is not None:
        ref_analysis_dict["referenceRead"] = ref_read_summary

    # ── Lighting intelligence ────────────────────────────────────
    lighting_intelligence = None
    if lighting_intel is not None:
        _cue_inf_res = getattr(ar, "cue_inference_result", None) if ar is not None else None
        lighting_intelligence = _build_lighting_intelligence(
            lighting_intel, pattern, mood, cue_inference_result=_cue_inf_res
        )

    # ── Solver validation scores ─────────────────────────────────
    validation_scores: Dict[str, Any] = {}
    solver_contradictions: List[str] = []
    needs_review = False
    if sq:
        validation_scores = {
            "overall_consistency": sq.get("overall_consistency", 1.0),
            "high_contradiction_count": sq.get("high_contradiction_count", 0),
            "ambiguity_class": sq.get("ambiguity_class", "clean"),
        }
        needs_review = sq.get("needs_review", False)
    if pattern_candidates and pattern_candidates.contradictions:
        solver_contradictions = list(pattern_candidates.contradictions)
        needs_review = needs_review or pattern_candidates.needs_review

    # ── VLM data ─────────────────────────────────────────────────
    vlm_desc = None
    if ref_vlm_description is not None:
        try:
            vlm_desc = ref_vlm_description.model_dump() if hasattr(ref_vlm_description, 'model_dump') else ref_vlm_description
        except Exception:
            vlm_desc = str(ref_vlm_description)

    vlm_recon = None
    if ref_vlm_reconstruction is not None:
        try:
            vlm_recon = ref_vlm_reconstruction.model_dump() if hasattr(ref_vlm_reconstruction, 'model_dump') else ref_vlm_reconstruction
        except Exception:
            vlm_recon = str(ref_vlm_reconstruction)

    # ── Perception layer ─────────────────────────────────────────
    _face_val = None
    _sig_rel = None
    _ecf = None
    if ar is not None:
        fv = getattr(ar, "face_validation", None)
        if fv is not None:
            _face_val = {
                "faceDetected": fv.face_detected,
                "faceConfidence": round(fv.face_confidence, 4),
                "faceQuality": fv.face_quality,
                "faceYaw": fv.face_yaw,
                "faceBoxAreaRatio": fv.face_box_area_ratio,
            }
        srl = getattr(ar, "signal_reliability", None)
        if srl is not None:
            _sig_rel = {
                "signalsAvailable": srl.signals_available,
                "signalsTotal": srl.signals_total,
                "faceDependentSignalsAvailable": srl.face_dependent_signals_available,
                "overallSignalStrength": srl.overall_signal_strength,
                "weakSignals": srl.weak_signals,
                "missingSignals": srl.missing_signals,
            }
        ecf = getattr(ar, "edge_case_flags", None)
        if ecf is not None:
            _ecf = {
                "blownHighlights": ecf.blown_highlights,
                "mixedColorTemperature": ecf.mixed_color_temperature,
                "outdoorFoliageShadows": ecf.outdoor_foliage_shadows,
                "windowLightGradient": ecf.window_light_gradient,
                "extremeLowKey": ecf.extreme_low_key,
                "bwProcessing": ecf.bw_processing,
                "noFace": ecf.no_face,
            }
        # Merge perception explanation into lighting_intelligence
        pex = getattr(ar, "perception_explanation", None)
        if pex is not None and lighting_intelligence is not None:
            lighting_intelligence["perceptionExplanation"] = {
                "supportingSignals": pex.supporting_signals,
                "contradictingSignals": pex.contradicting_signals,
                "ambiguityFlags": pex.ambiguity_flags,
                "patternReasoning": pex.pattern_reasoning,
            }

    return ShootMatchResult(
        cards=cards,
        authoritative_pattern=pattern,
        pattern_candidates=pattern_candidates,
        confidence=float(confidence_score),
        needs_review=needs_review,
        validation_scores=validation_scores,
        contradictions=solver_contradictions,
        shoot_loop=shoot_loop,
        gear_match=gear_match,
        reference_analysis=ref_analysis_dict,
        lighting_intelligence=lighting_intelligence,
        vlm_description=vlm_desc,
        vlm_reconstruction=vlm_recon,
        face_validation=_face_val,
        signal_reliability=_sig_rel,
        edge_case_flags=_ecf,
        processing_ms=round((time.time() - t0) * 1000),
        request_id=f"req_{uuid.uuid4().hex[:12]}",
    )
