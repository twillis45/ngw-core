"""
Spatial Calibration API routes.

Provides room-aware constraint validation and placement guidance
for lighting setups.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

# ── Constants ──

M_TO_FT = 3.28084
FT_TO_M = 1 / M_TO_FT
MIN_WALL_CLEARANCE_FT = 1.5


# ── Request/Response models ──

class RoomDimensions(BaseModel):
    lengthFt: float = Field(..., gt=0, le=100, description="Room depth in feet")
    widthFt: float = Field(..., gt=0, le=100, description="Room width in feet")
    ceilingFt: float = Field(..., gt=0, le=30, description="Ceiling height in feet")


class SpatialCalibrateRequest(BaseModel):
    room: RoomDimensions
    diagramSpec: Dict[str, Any] = Field(..., description="Diagram spec from result.diagram.spec")
    subjectPosition: Optional[Dict[str, float]] = Field(
        None, description="Custom subject position {x, y} in feet from back-left corner"
    )
    cameraPosition: Optional[Dict[str, float]] = Field(
        None, description="Custom camera position {x, y}"
    )


class SpatialValidateRequest(BaseModel):
    room: RoomDimensions
    lightHeights: List[float] = Field(
        default_factory=list, description="Light heights in feet"
    )


# ── Helpers ──

def _m_to_ft(m: float) -> str:
    ft = m * M_TO_FT
    return f"{ft:.1f}"


def _auto_subject(room: RoomDimensions) -> Dict[str, float]:
    """Default subject position: center width, 40% depth from back wall."""
    return {"x": room.widthFt / 2, "y": room.lengthFt * 0.4}


def _light_to_room_coords(
    light: Dict[str, Any], subject: Dict[str, float]
) -> Dict[str, Any]:
    """Convert angle/distance light placement to absolute room coordinates."""
    angle_deg = light.get("angle_deg", 0)
    distance_m = light.get("distance_m", 1.5)
    height_m = light.get("height_m", 1.7)

    dist_ft = distance_m * M_TO_FT
    height_ft = height_m * M_TO_FT

    angle_rad = math.radians(angle_deg)
    dx = math.sin(angle_rad) * dist_ft
    dy = math.cos(angle_rad) * dist_ft

    return {
        "x": subject["x"] + dx,
        "y": subject["y"] + dy,
        "heightFt": round(height_ft, 1),
        "role": light.get("role", "light"),
        "label": light.get("label", light.get("role", "light")),
        "angleDeg": angle_deg,
        "distanceFt": round(dist_ft, 1),
    }


def _validate(
    room: RoomDimensions, positions: List[Dict[str, Any]],
    camera: Optional[Dict[str, float]] = None,
    subject: Optional[Dict[str, float]] = None,
) -> tuple[List[str], List[str]]:
    """Validate positions against room constraints. Returns (warnings, errors)."""
    warnings: List[str] = []
    errors: List[str] = []

    for p in positions:
        name = (p.get("label") or p.get("role") or "Light").upper()

        # Ceiling
        if p["heightFt"] > room.ceilingFt:
            errors.append(
                f"{name}: Height ({p['heightFt']} ft) exceeds ceiling ({room.ceilingFt} ft). "
                f"Lower to {room.ceilingFt - 0.5:.1f} ft and increase power."
            )
        elif p["heightFt"] > room.ceilingFt - 1:
            warnings.append(
                f"{name}: Within 1 ft of ceiling. Angle downward more steeply."
            )

        # Wall proximity
        if p["x"] < MIN_WALL_CLEARANCE_FT:
            warnings.append(f"{name}: Only {p['x']:.1f} ft from left wall.")
        if p["x"] > room.widthFt - MIN_WALL_CLEARANCE_FT:
            warnings.append(f"{name}: Only {room.widthFt - p['x']:.1f} ft from right wall.")
        if p["y"] < MIN_WALL_CLEARANCE_FT:
            warnings.append(f"{name}: Only {p['y']:.1f} ft from back wall.")
        if p["y"] > room.lengthFt - MIN_WALL_CLEARANCE_FT:
            warnings.append(f"{name}: Only {room.lengthFt - p['y']:.1f} ft from front wall.")

        # Out of room
        if p["x"] < 0 or p["x"] > room.widthFt or p["y"] < 0 or p["y"] > room.lengthFt:
            errors.append(f"{name}: Position is outside the room.")

    # Camera
    if camera and camera["y"] > room.lengthFt:
        errors.append("Camera position is beyond the front wall.")
    elif camera and camera["y"] > room.lengthFt - 1:
        warnings.append("Camera is within 1 ft of the front wall.")

    return warnings, errors


def _room_guidance(
    room: RoomDimensions, positions: List[Dict[str, Any]]
) -> Dict[str, str]:
    """Generate per-light room-relative placement text."""
    guidance: Dict[str, str] = {}
    for p in positions:
        role = p.get("role", "light")
        near_x = (
            f"{p['x']:.1f} ft from the left wall"
            if p["x"] <= room.widthFt / 2
            else f"{room.widthFt - p['x']:.1f} ft from the right wall"
        )
        near_y = (
            f"{p['y']:.1f} ft from the back wall"
            if p["y"] <= room.lengthFt / 2
            else f"{room.lengthFt - p['y']:.1f} ft from the front wall"
        )
        guidance[role] = f"{near_x}, {near_y}"
    return guidance


# ── Endpoints ──

@router.post("/spatial/calibrate")
def spatial_calibrate(req: SpatialCalibrateRequest) -> Dict[str, Any]:
    """
    Compute absolute light positions in room coordinates and validate constraints.
    Returns positions, warnings, and room-relative guidance text.
    """
    subject = req.subjectPosition or _auto_subject(req.room)
    lights = req.diagramSpec.get("lights", [])

    positions = [_light_to_room_coords(l, subject) for l in lights]

    cam_dist_m = req.diagramSpec.get("camera", {}).get("distance_m", 2.0)
    camera = req.cameraPosition or {
        "x": subject["x"],
        "y": subject["y"] + cam_dist_m * M_TO_FT,
    }

    warn, err = _validate(req.room, positions, camera, subject)
    guidance = _room_guidance(req.room, positions)

    return {
        "status": "success",
        "subject": subject,
        "camera": camera,
        "positions": positions,
        "warnings": err + warn,
        "roomGuidance": guidance,
    }


@router.post("/spatial/validate")
def spatial_validate(req: SpatialValidateRequest) -> Dict[str, Any]:
    """
    Lightweight validation: check if light heights fit the ceiling.
    """
    warnings: List[str] = []

    for i, h in enumerate(req.lightHeights):
        if h > req.room.ceilingFt:
            warnings.append(
                f"Light {i + 1}: Height ({h:.1f} ft) exceeds ceiling ({req.room.ceilingFt} ft)."
            )
        elif h > req.room.ceilingFt - 1:
            warnings.append(
                f"Light {i + 1}: Within 1 ft of ceiling ({h:.1f} ft / {req.room.ceilingFt} ft)."
            )

    return {
        "status": "success",
        "fits": len(warnings) == 0,
        "warnings": warnings,
    }
