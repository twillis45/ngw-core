from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.image_analysis import describe_image
from engine.patterns import (
    catchlight_plan_for,
    classify_lighting_pattern,
    shadow_expectations_for,
)
from engine.selector import select_best_system
from engine.diagram import build_diagram

router = APIRouter()

SYSTEMS_PATH = Path("data/lighting_systems.json")

# ── Mood / environment / gear maps (mirrors src/engine JS modules) ──

MOOD_MAP = {
    "Clean & Classic": "corporate",
    "Moody & Dramatic": "cinematic",
    "Soft & Ethereal": "beauty",
    "Bold & Edgy": "editorial",
    "High Fashion": "beauty",
    "Natural & Available": "natural",
    "Cinematic": "cinematic",
}

ENVIRONMENT_MAP = {
    "Small Room": "studio_small",
    "Home Studio": "studio_small",
    "Medium Studio": "studio_large",
    "Large Studio": "studio_large",
    "Outdoor": "on_location_outdoor",
    "Window Light": "on_location_indoor",
    "Office": "studio_small",
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
    "speedlight": ["umbrella_shoot_through", "umbrella_reflective", "gel_cto"],
    "two speedlights": ["umbrella_shoot_through", "umbrella_reflective", "gel_cto"],
    "strobe": ["softbox_octa", "softbox_rect", "beauty_dish", "grid_spot", "bare_bulb"],
    "strobe pack": ["softbox_octa", "softbox_rect", "softbox_strip", "beauty_dish", "diffusion_panel", "grid_spot", "bare_bulb"],
    "led panel": ["diffusion_panel", "gel_cto"],
    "led tube": ["gel_cto"],
    "led cob": ["softbox_octa", "softbox_rect", "diffusion_panel"],
    "ring light": [],
    "fresnel": ["grid_spot", "gel_cto"],
    "continuous lights": ["softbox_rect", "umbrella_shoot_through"],
    "natural light": ["diffusion_panel"],
    "reflector only": [],
}

MODIFIER_LABELS = {
    "softbox_octa": "Octabox",
    "softbox_rect": "Rectangular Softbox",
    "softbox_strip": "Strip Box",
    "beauty_dish": "Beauty Dish",
    "umbrella_shoot_through": "Shoot-Through Umbrella",
    "umbrella_reflective": "Reflective Umbrella",
    "diffusion_panel": "Diffusion Panel / Scrim",
    "grid_spot": "Grid / Snoot",
    "bare_bulb": "Bare Bulb",
    "gel_cto": "CTO Gel",
}

ROLE_LABELS = {"key": "Key Light", "fill": "Fill Light", "rim": "Rim Light"}


# ── Request model ──

class ShootMatchRequest(BaseModel):
    subject: str = "headshot"
    mood: str
    environment: str
    ceiling: str = "normal"
    gearMode: str = "anyGear"
    gear: List[str] = Field(default_factory=list)
    skinTone: Optional[str] = None
    referenceImage: Optional[str] = None


# ── Helpers ──

def _load_systems() -> List[Dict[str, Any]]:
    with open(SYSTEMS_PATH, encoding="utf-8") as f:
        return json.load(f)["systems"]


def _filter_systems(
    systems: List[Dict[str, Any]], req: ShootMatchRequest
) -> List[Dict[str, Any]]:
    mood = MOOD_MAP.get(req.mood)
    env = ENVIRONMENT_MAP.get(req.environment)

    if mood:
        systems = [s for s in systems if s["taxonomy_refs"].get("mood") == mood]
    if env:
        systems = [s for s in systems if s["taxonomy_refs"].get("environment") == env]

    if req.gearMode == "myGear" and req.gear:
        owned = {GEAR_MAP.get(g.lower()) for g in req.gear} - {None}
        systems = [s for s in systems if s["taxonomy_refs"].get("gear_profile") in owned]

    if req.skinTone:
        tone_matches = [s for s in systems if s["taxonomy_refs"].get("skin_tone") == req.skinTone]
        if tone_matches:
            systems = tone_matches

    return systems


def _build_modifiers(req: ShootMatchRequest) -> List[str]:
    if req.gearMode != "myGear" or not req.gear:
        return []
    mods: set[str] = set()
    for g in req.gear:
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


def _m_to_ft(m: float) -> str:
    total_in = round(m * 39.3701)
    feet, inches = divmod(total_in, 12)
    return f"{feet}'{inches}\"" if inches else f"{feet}'"


def _angle_desc(deg: float) -> str:
    side = "camera left" if deg >= 0 else "camera right"
    if abs(deg) < 5:
        return "on axis (centered)"
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
        "role": ROLE_LABELS.get(light["role"], light.get("label", light["role"])),
        "modifier": MODIFIER_LABELS.get(mod, mod),
        "position": _angle_desc(light["angle_deg"]),
        "height": _height_desc(light["height_m"]),
        "distance": _m_to_ft(light["distance_m"]),
        "notes": light.get("notes", []),
    }


# ── Endpoint ──

@router.post("/shoot-match")
def shoot_match(req: ShootMatchRequest) -> Dict[str, Any]:
    t0 = time.time()

    all_systems = _load_systems()
    filtered = _filter_systems(all_systems, req)

    if not filtered:
        raise HTTPException(
            status_code=422,
            detail="No lighting setups match your selections. Try broadening your gear or environment.",
        )

    modifiers = _build_modifiers(req)
    mood = MOOD_MAP.get(req.mood, "natural")
    env = ENVIRONMENT_MAP.get(req.environment, "studio_small")

    # Analyze reference image if provided
    image_analysis = None
    if req.referenceImage:
        image_path = Path(req.referenceImage)
        if image_path.exists():
            try:
                image_analysis = describe_image(str(image_path), describe_mode="basic")
            except Exception:
                image_analysis = None

    # Strip to engine-safe fields
    engine_systems = [
        {
            "id": s["id"],
            "name": s["name"],
            "criteria": s["criteria"],
            "features": s["features"],
            "taxonomy_refs": s["taxonomy_refs"],
            "modifier": s.get("modifier"),
        }
        for s in filtered
    ]

    input_ctx = {"mood": mood, "environment": env, "modifiers_available": modifiers}
    if req.skinTone:
        input_ctx["skin_tone"] = req.skinTone

    outcome = select_best_system(
        engine_systems,
        input_ctx=input_ctx,
        modifiers_available=modifiers,
    )

    top_picks = list(outcome.top_picks)
    winner = top_picks[0]
    winner_id = winner.breakdown.system_id
    confidence_score = round(float(outcome.confidence))

    # Find source system (with why_this_works, failure_modes, etc.)
    source = next((s for s in filtered if s["id"] == winner_id), filtered[0])

    # Build diagram
    diagram = build_diagram(source, modifiers_available=modifiers)
    diagram_dict = diagram.model_dump()
    lights = diagram_dict["lights"]

    # Pattern analysis
    modifier_family = source["taxonomy_refs"].get("modifier_family", "")
    gear_profile = source["taxonomy_refs"].get("gear_profile", "")
    pattern = classify_lighting_pattern(
        mood=mood, modifier_family=modifier_family, gear_profile=gear_profile
    )
    shadows = shadow_expectations_for(pattern)
    catchlights = catchlight_plan_for(modifier_family, pattern)

    # Build card data
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
        "otherSetups": [
            {
                "name": p.breakdown.system_name,
                "score": round(float(p.breakdown.final_score) * 100),
                "reason": p.reason,
            }
            for p in top_picks[1:4]
        ],
    }

    result = {
        "status": "success",
        "requestId": f"req_{uuid.uuid4().hex[:12]}",
        "processingMs": round((time.time() - t0) * 1000),
        "cards": cards,
    }

    if image_analysis and image_analysis.get("ok"):
        result["referenceImageAnalysis"] = {
            "palette": image_analysis.get("palette", {}),
            "orientation": image_analysis.get("orientation"),
            "isGrayscale": image_analysis.get("is_grayscale_like", False),
        }

    return result
