"""
NGW Shoot Mode API
==================
Thin formatting layer that transforms shoot-match results into a
step-by-step on-set workflow.  Two endpoints:

  POST /shoot-mode/start           → structured steps for the chosen role
  POST /shoot-mode/evaluate-test-shot → basic vision feedback on a test photo
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────

CEILING_MAP: Dict[str, float] = {
    "low": 2.4,        # ~8 ft
    "normal": 2.7,     # ~9 ft
    "high": 3.7,       # ~12 ft
    "very_high": 4.9,  # ~16 ft
}

ROLE_COLORS: Dict[str, str] = {
    "key": "#F5B041",
    "fill": "#4DA3FF",
    "rim": "#9B7CFF",
    "background": "#39D98A",
}


def _m_to_ft(m: float) -> str:
    total_in = round(m * 39.3701)
    feet, inches = divmod(total_in, 12)
    return f"{feet}'{inches}\"" if inches else f"{feet}'"


def _check_ceiling(light: Dict[str, Any], ceiling_m: Optional[float]) -> Optional[str]:
    """Generate warning if light height exceeds or nears the ceiling."""
    if ceiling_m is None:
        return None
    height_m = light.get("height_m", 0)
    if height_m > ceiling_m:
        adjusted = ceiling_m - 0.15
        return (
            f"Recommended height ({_m_to_ft(height_m)}) exceeds your "
            f"ceiling ({_m_to_ft(ceiling_m)}). Lower the light to "
            f"{_m_to_ft(adjusted)} and increase power slightly to compensate."
        )
    if height_m > ceiling_m - 0.3:
        return (
            f"Light at {_m_to_ft(height_m)} is within 1 foot of the ceiling "
            f"({_m_to_ft(ceiling_m)}). Consider angling the light downward "
            f"more steeply."
        )
    return None


def _distance_reference(distance_ft_str: str) -> Dict[str, str]:
    """Human-friendly distance approximations."""
    # Parse feet from string like "6'2\""
    try:
        parts = distance_ft_str.replace('"', '').split("'")
        feet = int(parts[0])
        inches = int(parts[1]) if len(parts) > 1 and parts[1] else 0
        total_ft = feet + inches / 12.0
    except (ValueError, IndexError):
        return {"feet": distance_ft_str, "meters": "", "approx": ""}

    meters = total_ft * 0.3048
    arm_lengths = round(total_ft / 2.5, 1)
    steps = round(total_ft / 2.5, 1)

    return {
        "feet": distance_ft_str,
        "meters": f"{meters:.1f}m",
        "approx": f"~{arm_lengths} arm lengths" if arm_lengths >= 1 else "within arm's reach",
        "steps": f"~{steps} large steps",
    }


def _room_guidance_for_light(
    light: Dict[str, Any],
    room: Optional["RoomDimensionsFt"],
    subject_x: Optional[float] = None,
    subject_y: Optional[float] = None,
) -> List[str]:
    """Generate wall-relative placement tips for a single light when room dimensions are known."""
    if room is None:
        return []

    import math

    tips: List[str] = []

    # Subject defaults to center of room
    sx = subject_x if subject_x is not None else room.widthFt / 2.0
    sy = subject_y if subject_y is not None else room.lengthFt / 2.0

    angle_deg = light.get("angle_deg", 0)
    distance_m = light.get("distance_m", 0)
    distance_ft = distance_m * 3.281

    if distance_ft <= 0:
        return tips

    # Compute absolute position (same coordinate system as spatialEngine.js)
    # 0° = toward camera (+Y from subject), positive = camera-right (+X)
    angle_rad = math.radians(angle_deg)
    lx = sx + distance_ft * math.sin(angle_rad)
    ly = sy - distance_ft * math.cos(angle_rad)

    # Wall distances
    left_wall = lx
    right_wall = room.widthFt - lx
    back_wall = ly
    front_wall = room.lengthFt - ly

    # Choose the closest wall reference
    wall_dists = [
        (left_wall, "left wall"),
        (right_wall, "right wall"),
        (back_wall, "back wall"),
        (front_wall, "front wall (camera side)"),
    ]
    wall_dists.sort(key=lambda w: w[0])
    closest_dist, closest_name = wall_dists[0]

    if closest_dist < 0:
        tips.append(f"⚠️ Light extends beyond the {closest_name} — move closer to subject or adjust angle")
    elif closest_dist < 1.5:
        tips.append(f"Light will be within 1.5 ft of the {closest_name} — ensure clearance for the stand")
    else:
        tips.append(f"Place {closest_dist:.0f} ft from the {closest_name}")

    # Additional reference if second wall is close
    if len(wall_dists) > 1:
        second_dist, second_name = wall_dists[1]
        if second_dist < 3:
            tips.append(f"{second_dist:.0f} ft from {second_name}")

    return tips


def _build_light_step(
    light: Dict[str, Any],
    step_num: int,
    ceiling_m: Optional[float],
    room: Optional["RoomDimensionsFt"] = None,
) -> Dict[str, Any]:
    """Build a single light-placement step from a mapped light dict."""
    role_key = light.get("roleKey", "key")
    warnings: List[str] = []

    # Ceiling check — need raw height_m for comparison
    ceiling_warning = _check_ceiling(light, ceiling_m)
    if ceiling_warning:
        warnings.append(ceiling_warning)

    distance_str = light.get("distance", "")
    distance_ref = _distance_reference(distance_str) if distance_str else None

    tips: List[str] = []
    for note in light.get("notes", []):
        if isinstance(note, str) and note.strip():
            tips.append(note)

    # Wall-proximity guidance from room dimensions
    room_tips = _room_guidance_for_light(light, room)
    tips.extend(room_tips)

    return {
        "id": f"light_{role_key}",
        "stepNumber": step_num,
        "title": light.get("role", role_key.title()),
        "subtitle": light.get("modifier", ""),
        "type": "light_placement",
        "data": {
            "roleKey": role_key,
            "roleColor": ROLE_COLORS.get(role_key, "#A9AFBB"),
            "modifier": light.get("modifier", ""),
            "position": light.get("position", ""),
            "height": light.get("height", ""),
            "distance": distance_str,
            "distanceRef": distance_ref,
            "powerHint": light.get("powerHint", ""),
        },
        "warnings": warnings,
        "tips": tips,
    }


def _build_steps(
    result: Dict[str, Any],
    ceiling_m: Optional[float],
    role: str,
    room: Optional["RoomDimensionsFt"] = None,
) -> List[Dict[str, Any]]:
    """Build ordered step list for the given role."""
    steps: List[Dict[str, Any]] = []
    step_num = 1

    setup = result.get("setup") or result.get("cards", {}).get("shootThisSetup", {})
    camera = result.get("cameraSettings") or result.get("cards", {}).get("cameraSettings", {})
    how_to_test = result.get("howToTest") or result.get("cards", {}).get("howToTest", {})
    what_to_look_for = result.get("whatToLookFor") or result.get("cards", {}).get("whatToLookFor", {})
    quick_fixes = result.get("quickFixes") or result.get("cards", {}).get("quickFixes", {})
    substitutions = result.get("substitutions") or result.get("cards", {}).get("substitutions", {})
    diagnostics = result.get("diagnostics") or result.get("cards", {}).get("diagnostics", [])
    best_match = result.get("bestMatch") or result.get("cards", {}).get("bestMatch", {})

    lights = setup.get("lights", [])

    # ── Step 1: Camera Setup ──
    if role in ("photographer", "second_shooter") and camera:
        tips = []
        if camera.get("tip"):
            tips.append(camera["tip"])
        steps.append({
            "id": "camera_setup",
            "stepNumber": step_num,
            "title": "Camera Setup",
            "subtitle": f"{camera.get('aperture', '')} · ISO {camera.get('iso', '')}",
            "type": "camera_setup",
            "data": {
                "aperture": camera.get("aperture", ""),
                "iso": camera.get("iso", ""),
                "shutter": camera.get("shutter", ""),
                "wb": camera.get("wb", ""),
            },
            "warnings": [],
            "tips": tips,
        })
        step_num += 1

    # ── Steps 2–N: Light Placement ──
    if role in ("photographer", "assistant"):
        # Sort lights: key first, then fill, then others
        role_order = {"key": 0, "fill": 1, "rim": 2, "background": 3}
        sorted_lights = sorted(
            lights,
            key=lambda l: role_order.get(l.get("roleKey", ""), 99),
        )
        for light in sorted_lights:
            step = _build_light_step(light, step_num, ceiling_m, room=room)
            steps.append(step)
            step_num += 1

    # ── Test Exposure Step ──
    if role in ("photographer", "second_shooter"):
        test_items = []
        if isinstance(how_to_test, dict):
            test_items = how_to_test.get("fixOrder", [])
        elif isinstance(how_to_test, list):
            test_items = how_to_test

        good_signs = []
        warnings_list = []
        if isinstance(what_to_look_for, dict):
            good_signs = what_to_look_for.get("goodSigns", [])
            warnings_list = what_to_look_for.get("warnings", [])

        steps.append({
            "id": "test_exposure",
            "stepNumber": step_num,
            "title": "Test Exposure",
            "subtitle": "Take a test shot and verify",
            "type": "test_exposure",
            "data": {
                "checklist": test_items,
                "goodSigns": good_signs,
                "warnings": warnings_list,
            },
            "warnings": [],
            "tips": [],
        })
        step_num += 1

    # ── Adjustments Step ──
    if role == "photographer":
        fixes = []
        if isinstance(quick_fixes, dict):
            fixes = quick_fixes.get("fixes", [])
        elif isinstance(quick_fixes, list):
            fixes = quick_fixes

        sub_items = []
        if isinstance(substitutions, dict):
            sub_items = substitutions.get("items", [])

        diag_summaries = []
        if isinstance(diagnostics, list):
            for d in diagnostics:
                if isinstance(d, dict) and d.get("symptoms"):
                    diag_summaries.append({
                        "id": d.get("id", ""),
                        "symptoms": d.get("symptoms", [])[:3],
                        "fixes": d.get("quick_fixes", [])[:3],
                    })

        steps.append({
            "id": "adjustments",
            "stepNumber": step_num,
            "title": "Adjustments",
            "subtitle": "Fine-tune if needed",
            "type": "adjustments",
            "data": {
                "quickFixes": fixes,
                "substitutions": sub_items,
                "diagnostics": diag_summaries,
            },
            "warnings": [],
            "tips": [],
        })

    return steps


# ── Request / Response models ─────────────────────────────

class RoomDimensionsFt(BaseModel):
    lengthFt: float = Field(..., description="Room depth in feet")
    widthFt: float = Field(..., description="Room width in feet")
    ceilingFt: float = Field(..., description="Ceiling height in feet")


class ShootModeStartRequest(BaseModel):
    result: Dict[str, Any] = Field(..., description="Full result from shoot-match or recommendation")
    ceilingHeight: Optional[str] = Field(None, description="Ceiling height key: low/normal/high/very_high")
    ceilingHeightFt: Optional[float] = Field(None, description="Custom ceiling height in feet")
    roomDimensionsFt: Optional[RoomDimensionsFt] = Field(None, description="Exact room dimensions in feet")
    role: str = Field("photographer", description="photographer | assistant | second_shooter")


class EvaluateTestShotRequest(BaseModel):
    testShotPath: str = Field(..., description="Path to uploaded test shot image")
    setupId: Optional[str] = Field(None, description="Optional setup ID for context")


# ── Endpoints ─────────────────────────────────────────────

@router.post("/shoot-mode/start")
def shoot_mode_start(req: ShootModeStartRequest) -> Dict[str, Any]:
    """Transform a shoot-match result into step-by-step workflow."""
    if req.role not in ("photographer", "assistant", "second_shooter"):
        raise HTTPException(status_code=422, detail="Invalid role. Use: photographer, assistant, second_shooter")

    # Resolve ceiling height
    ceiling_m: Optional[float] = None
    if req.roomDimensionsFt:
        ceiling_m = req.roomDimensionsFt.ceilingFt * 0.3048
    elif req.ceilingHeightFt:
        ceiling_m = req.ceilingHeightFt * 0.3048
    elif req.ceilingHeight:
        ceiling_m = CEILING_MAP.get(req.ceilingHeight)

    # Build steps
    steps = _build_steps(req.result, ceiling_m, req.role, room=req.roomDimensionsFt)

    # Extract metadata
    best_match = req.result.get("bestMatch") or req.result.get("cards", {}).get("bestMatch", {})
    setup_name = best_match.get("name", "Lighting Setup")
    pattern = best_match.get("lightingPattern", "")

    # Estimate time: ~2 min per light step + 1 min camera + 2 min test
    light_steps = sum(1 for s in steps if s["type"] == "light_placement")
    estimated_min = light_steps * 2 + 3

    return {
        "status": "success",
        "sessionId": f"shoot_{uuid.uuid4().hex[:8]}",
        "metadata": {
            "setupName": setup_name,
            "pattern": pattern,
            "role": req.role,
            "totalSteps": len(steps),
            "estimatedMinutes": estimated_min,
            "ceilingHeightM": ceiling_m,
        },
        "steps": steps,
    }


@router.post("/shoot-mode/evaluate-test-shot")
async def evaluate_test_shot(req: EvaluateTestShotRequest) -> Dict[str, Any]:
    """Analyze a test shot and provide basic feedback."""
    image_path = Path(req.testShotPath)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Test shot image not found")

    # Run basic vision analysis
    feedback: Dict[str, Any] = {
        "status": "success",
        "notes": [],
    }

    try:
        from engine.image_analysis import describe_image
        raw = describe_image(str(image_path), describe_mode="vision")
        if raw and raw.get("ok"):
            vision = raw.get("vision", {})
            if vision and vision.get("ok"):
                # Extract useful feedback
                exposure = vision.get("exposure", {})
                if exposure:
                    if exposure.get("overall") == "underexposed":
                        feedback["notes"].append("Image appears underexposed. Try opening up 1/2 stop or increasing flash power.")
                    elif exposure.get("overall") == "overexposed":
                        feedback["notes"].append("Image appears overexposed. Try stopping down 1/2 stop or reducing flash power.")
                    else:
                        feedback["notes"].append("Exposure looks good.")

                skin_tone = vision.get("skin_tone")
                if skin_tone:
                    feedback["skinTone"] = skin_tone

                catchlights = vision.get("catchlights", {})
                if catchlights and catchlights.get("ok"):
                    cl_list = catchlights.get("catchlights", [])
                    feedback["catchlightCount"] = len(cl_list)
                    if len(cl_list) == 0:
                        feedback["notes"].append("No catchlights detected. Check that your key light is positioned correctly.")
                    elif len(cl_list) >= 1:
                        feedback["notes"].append(f"{len(cl_list)} catchlight(s) detected — light placement looks correct.")
    except Exception:
        feedback["notes"].append("Could not analyze image. Ensure the image is a clear, well-lit photo.")

    if not feedback["notes"]:
        feedback["notes"].append("Analysis complete. Check your image against the good signs listed in the test step.")

    return feedback
