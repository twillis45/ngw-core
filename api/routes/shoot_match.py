from __future__ import annotations

import json
import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from engine.lighting_inference import (
    build_reference_description,
    match_catchlights_to_diagram,
)
from engine.orchestrator import analyze_image
from engine.patterns import (
    catchlight_plan_for,
    classify_lighting_pattern,
    shadow_expectations_for,
)
from engine.selector import select_best_system
from engine.diagram import build_diagram, build_reference_diagram

logger = logging.getLogger(__name__)
from engine.taxonomy_loader import get_diagnostics_for_pattern
from engine.master_mode import get_coaching_overlay, list_modes

router = APIRouter()

SYSTEMS_PATH = Path("data/lighting_systems.json")

# ── Mood / environment / gear maps (mirrors src/engine JS modules) ──

MOOD_MAP = {
    # Display labels (from chat UI)
    "Clean & Classic": "corporate",
    "Moody & Dramatic": "cinematic",
    "Soft & Ethereal": "beauty",
    "Bold & Edgy": "editorial",
    "High Fashion": "beauty",
    "Natural & Available": "natural",
    "Cinematic": "cinematic",
    # Internal codes (from wizard UI)
    "beauty": "beauty",
    "cinematic": "cinematic",
    "corporate": "corporate",
    "editorial": "editorial",
    "natural": "natural",
    "high_key": "high_key",
    "low_key": "low_key",
}

ENVIRONMENT_MAP = {
    # Display labels (from chat UI)
    "Small Room": "studio_small",
    "Home Studio": "studio_small",
    "Medium Studio": "studio_large",
    "Large Studio": "studio_large",
    "Outdoor": "on_location_outdoor",
    "Window Light": "on_location_indoor",
    "Office": "studio_small",
    # Internal codes (from wizard UI)
    "studio_small": "studio_small",
    "studio_large": "studio_large",
    "on_location_indoor": "on_location_indoor",
    "on_location_outdoor": "on_location_outdoor",
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

ROLE_LABELS = {"key": "Key Light", "fill": "Fill Light", "rim": "Rim Light", "background": "Background Light"}

CAMERA_SETTINGS = {
    "beauty": {
        "aperture": "f/2.8 \u2013 f/5.6", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Open up to f/2.8 for shallower depth of field and skin smoothing",
    },
    "cinematic": {
        "aperture": "f/2 \u2013 f/4", "iso": "100 \u2013 400", "shutter": "1/125",
        "wb": "4800 K (warm)",
        "tip": "Shoot at f/2\u2013f/4 for dramatic fall-off; consider CTO gel on key",
    },
    "corporate": {
        "aperture": "f/5.6 \u2013 f/8", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Shoot at f/5.6\u2013f/8 for full sharpness across the face",
    },
    "editorial": {
        "aperture": "f/4 \u2013 f/8", "iso": "100", "shutter": "1/200",
        "wb": "5200 K",
        "tip": "Experiment with hard light and strong angles for graphic impact",
    },
    "natural": {
        "aperture": "f/2.8 \u2013 f/4", "iso": "200 \u2013 800", "shutter": "1/125",
        "wb": "5800 K (daylight)",
        "tip": "Match your WB to the window light; bump ISO before adding flash",
    },
    "high_key": {
        "aperture": "f/8 \u2013 f/11", "iso": "100", "shutter": "1/160",
        "wb": "5500 K",
        "tip": "Overexpose the background by 1\u20132 stops for that pure-white look",
    },
    "low_key": {
        "aperture": "f/4 \u2013 f/5.6", "iso": "100", "shutter": "1/200",
        "wb": "5000 K",
        "tip": "Underexpose ambient by 2+ stops; let the key be your only source",
    },
    "dramatic": {
        "aperture": "f/4 \u2013 f/5.6", "iso": "100", "shutter": "1/200",
        "wb": "5000 K",
        "tip": "Keep ambient low; let the key light do all the work",
    },
}


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
    masterMode: Optional[str] = None


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


UPLOAD_DIR = Path("static/uploads")


@router.post("/upload-reference")
async def upload_reference(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Save an uploaded reference image, run basic analysis, and return both."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo.jpg").suffix or ".jpg"
    filename = f"ref_{uuid.uuid4().hex[:8]}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    analysis = None
    lighting_intel = None
    try:
        ar = analyze_image(str(dest), run_extended=False, run_solver=False)
        if ar.ok:
            raw = ar.description
            vision = ar.vision_data
            lighting_intel = ar.lighting_intel

            analysis = {
                "palette": raw.get("palette", {}),
                "orientation": raw.get("orientation"),
                "isGrayscale": raw.get("is_grayscale_like", False),
                "classification": ar.classification,
            }

            if vision and vision.get("ok"):
                analysis["skinTone"] = vision.get("skin_tone")
                catchlights = vision.get("catchlights")
                if catchlights and catchlights.get("ok"):
                    analysis["catchlights"] = catchlights

                # Surface background data
                region = vision.get("region_attribution", {})
                masks = region.get("masks", {})
                palettes = region.get("palettes", {})
                bg_palette = palettes.get("background_palette")
                if bg_palette is not None:
                    analysis["background"] = {
                        "palette": bg_palette,
                        "ratio": masks.get("background_ratio"),
                    }

                if lighting_intel is not None:
                    # Enrich background with light detection
                    if lighting_intel.background_light_detected:
                        bg_section = analysis.get("background", {})
                        bg_section["lightDetected"] = True
                        bg_section["lightConfidence"] = (
                            lighting_intel.background_light_confidence
                        )
                        analysis["background"] = bg_section

                    # Build detected diagram
                    ref_diagram = build_reference_diagram(
                        pattern=lighting_intel.pattern,
                        modifier_family=lighting_intel.modifier_family,
                        light_count=lighting_intel.light_count,
                        key_position_text=lighting_intel.key_position_text,
                        fill_method_text=lighting_intel.fill_method_text,
                        background_light=lighting_intel.background_light_detected,
                        key_side=lighting_intel.key_side,
                    )
                    ref_diagram_dict = ref_diagram.model_dump()

                    # Match catchlights to diagram lights
                    raw_catchlights: List[Dict[str, Any]] = []
                    cd = vision.get("catchlights", {})
                    if cd and cd.get("ok"):
                        raw_catchlights = cd.get("catchlights", [])

                    matched_lights = match_catchlights_to_diagram(
                        diagram_lights=ref_diagram_dict["lights"],
                        catchlights=raw_catchlights,
                        pattern=lighting_intel.pattern,
                    )

                    diagram_lights: List[Dict[str, Any]] = []
                    for ml in matched_lights:
                        entry: Dict[str, Any] = {
                            **_map_light(ml),
                            "detectedFrom": ml.get("detectedFrom", []),
                        }
                        if ml.get("role") == "background":
                            entry["detectedFromNote"] = (
                                "Background lights illuminate the backdrop, "
                                "not the subject's eyes. This light was "
                                "inferred from background brightness analysis, "
                                "not from catchlight evidence."
                            )
                        diagram_lights.append(entry)

                    analysis["detectedDiagram"] = {
                        "lights": diagram_lights,
                        "subject": ref_diagram_dict["subject"],
                        "camera": ref_diagram_dict["camera"],
                        "raw": ref_diagram_dict,
                    }

                    # Build descriptions
                    ref_description = build_reference_description(
                        vision_data=vision,
                        classification=ar.classification,
                        image_analysis=raw,
                        inference=lighting_intel,
                        cue_report=ar.cue_report,
                        vlm_description=ar.vlm_description,
                    )
                    analysis["description"] = ref_description

                    # Lighting intelligence summary
                    analysis["lightingIntelligence"] = {
                        "detectedPattern": lighting_intel.pattern,
                        "patternConfidence": lighting_intel.pattern_confidence,
                        "detectedModifier": lighting_intel.modifier_family,
                        "modifierConfidence": lighting_intel.modifier_confidence,
                        "lightCount": lighting_intel.light_count,
                        "keyPosition": lighting_intel.key_position_text,
                        "keySide": lighting_intel.key_side,
                        "fillMethod": lighting_intel.fill_method_text,
                        "backgroundLight": lighting_intel.background_light_detected,
                        "backgroundLightConfidence": (
                            lighting_intel.background_light_confidence
                        ),
                        "notes": lighting_intel.notes,
                    }
    except Exception:
        logger.exception("Reference image analysis failed")

    return {"path": str(dest), "analysis": analysis}


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

    # Analyze reference image if provided (vision mode for full intelligence)
    image_analysis = None
    lighting_intel = None
    ref_cue_report = None
    ref_vlm_description = None
    if req.referenceImage:
        image_path = Path(req.referenceImage)
        if image_path.exists():
            try:
                ar = analyze_image(str(image_path), run_extended=False, run_solver=False)
                if ar.ok:
                    image_analysis = ar.description
                    lighting_intel = ar.lighting_intel
                    ref_cue_report = ar.cue_report
                    ref_vlm_description = ar.vlm_description
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
    if req.masterMode:
        input_ctx["master_mode"] = req.masterMode
    if req.skinTone:
        input_ctx["skin_tone"] = req.skinTone
    if lighting_intel is not None:
        input_ctx.update(lighting_intel.to_input_ctx_fields())

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

    # Build diagram (master mode overrides geometry when active)
    diagram = build_diagram(source, modifiers_available=modifiers, master_mode=req.masterMode)
    diagram_dict = diagram.model_dump()
    lights = diagram_dict["lights"]

    # Pattern analysis
    modifier_family = source["taxonomy_refs"].get("modifier_family", "")
    gear_profile = source["taxonomy_refs"].get("gear_profile", "")
    pattern = classify_lighting_pattern(
        mood=mood,
        modifier_family=modifier_family,
        gear_profile=gear_profile,
        key_position_text=input_ctx.get("detected_key_position", ""),
        fill_method_text=input_ctx.get("detected_fill_method", ""),
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
        "cameraSettings": CAMERA_SETTINGS.get(mood, CAMERA_SETTINGS["corporate"]),
        "otherSetups": [
            {
                "name": p.breakdown.system_name,
                "score": round(float(p.breakdown.final_score) * 100),
                "reason": p.reason,
            }
            for p in top_picks[1:4]
        ],
    }

    # ── Master mode coaching overlay ──
    coaching = get_coaching_overlay(req.masterMode)
    if coaching:
        # Tag the best match with master mode info for the UI badge
        cards["bestMatch"]["masterMode"] = coaching.get("masterModeId")
        cards["bestMatch"]["masterModeLabel"] = coaching.get("masterModeLabel")
        cards["bestMatch"]["masterModeIcon"] = coaching.get("masterModeIcon")

        # Override rationale
        if coaching.get("rationale"):
            cards["whyThisWorks"]["body"] = coaching["rationale"]

        # Override camera settings
        if coaching.get("camera"):
            cards["cameraSettings"] = {**cards["cameraSettings"], **coaching["camera"]}

        # Prepend mode-specific good signs, warnings, quick fixes
        if coaching.get("good_signs"):
            existing = cards["whatToLookFor"].get("goodSigns", [])
            cards["whatToLookFor"]["goodSigns"] = coaching["good_signs"] + existing

        if coaching.get("warnings"):
            existing = cards["whatToLookFor"].get("warnings", [])
            cards["whatToLookFor"]["warnings"] = coaching["warnings"] + existing

        if coaching.get("quick_fixes"):
            existing = cards["quickFixes"].get("fixes", [])
            cards["quickFixes"]["fixes"] = coaching["quick_fixes"] + existing

        # Add substitution notes from mode
        if coaching.get("substitution_notes"):
            existing = cards["substitutions"].get("items", [])
            mode_subs = [{"ifMissing": "—", "use": note, "tradeoff": ""} for note in coaching["substitution_notes"]]
            cards["substitutions"]["items"] = mode_subs + existing

        # Pass lights guide for per-light descriptions
        if coaching.get("lights_guide"):
            cards["bestMatch"]["lightsGuide"] = coaching["lights_guide"]

    result = {
        "status": "success",
        "requestId": f"req_{uuid.uuid4().hex[:12]}",
        "processingMs": round((time.time() - t0) * 1000),
        "cards": cards,
    }

    if image_analysis and image_analysis.get("ok"):
        ref_analysis: Dict[str, Any] = {
            "palette": image_analysis.get("palette", {}),
            "orientation": image_analysis.get("orientation"),
            "isGrayscale": image_analysis.get("is_grayscale_like", False),
            "classification": image_analysis.get("classification"),
        }
        # Enrich with vision data when available
        vision = image_analysis.get("vision", {})
        if vision and vision.get("ok"):
            ref_analysis["skinTone"] = vision.get("skin_tone")
            catchlight_data = vision.get("catchlights")
            if catchlight_data and catchlight_data.get("ok"):
                ref_analysis["catchlights"] = catchlight_data
            # Surface background data at top level
            region = vision.get("region_attribution", {})
            masks = region.get("masks", {})
            palettes = region.get("palettes", {})
            bg_palette = palettes.get("background_palette")
            if bg_palette is not None:
                ref_analysis["background"] = {
                    "palette": bg_palette,
                    "ratio": masks.get("background_ratio"),
                }

        # ── Enrich top-level background with light detection ──
        if lighting_intel is not None and lighting_intel.background_light_detected:
            bg_section = ref_analysis.get("background", {})
            bg_section["lightDetected"] = True
            bg_section["lightConfidence"] = lighting_intel.background_light_confidence
            ref_analysis["background"] = bg_section

        # ── Diagram + descriptions on the reference evaluation ──
        if lighting_intel is not None:
            # Build a diagram showing what we *detected* in the reference
            ref_diagram = build_reference_diagram(
                pattern=lighting_intel.pattern,
                modifier_family=lighting_intel.modifier_family,
                light_count=lighting_intel.light_count,
                key_position_text=lighting_intel.key_position_text,
                fill_method_text=lighting_intel.fill_method_text,
                background_light=lighting_intel.background_light_detected,
                key_side=lighting_intel.key_side,
            )
            ref_diagram_dict = ref_diagram.model_dump()

            # Match each diagram light to the catchlights that prove it
            raw_catchlights: List[Dict[str, Any]] = []
            cd = vision.get("catchlights", {}) if vision else {}
            if cd and cd.get("ok"):
                raw_catchlights = cd.get("catchlights", [])

            matched_lights = match_catchlights_to_diagram(
                diagram_lights=ref_diagram_dict["lights"],
                catchlights=raw_catchlights,
                pattern=lighting_intel.pattern,
            )

            diagram_lights: List[Dict[str, Any]] = []
            for ml in matched_lights:
                entry: Dict[str, Any] = {
                    **_map_light(ml),
                    "detectedFrom": ml.get("detectedFrom", []),
                }
                # Background lights are detected from backdrop brightness,
                # not catchlights — explain why detectedFrom is empty.
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

            # Build rich human-readable descriptions of the reference image
            ref_description = build_reference_description(
                vision_data=vision,
                classification=image_analysis.get("classification"),
                image_analysis=image_analysis,
                inference=lighting_intel,
                cue_report=ref_cue_report,
                vlm_description=ref_vlm_description,
            )
            ref_analysis["description"] = ref_description

        result["referenceImageAnalysis"] = ref_analysis

    # Lighting intelligence (scoring influence from reference image)
    if lighting_intel is not None:
        intel_dict: Dict[str, Any] = {
            "detectedPattern": lighting_intel.pattern,
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
        }
        # Note discrepancy between user-selected mood and image-detected mood
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
        result["lightingIntelligence"] = intel_dict

    return result


# ── Master Modes listing ──

@router.get("/master-modes")
async def get_master_modes():
    """Return available master modes for the UI."""
    return {"modes": list_modes()}
