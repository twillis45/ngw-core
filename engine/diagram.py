from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict

from engine.normalizer import normalize_modifier_list, normalize_token


class SubjectAnchor(str, Enum):
    CENTER = "center"


class CameraAnchor(str, Enum):
    FRONT = "front"


class LightPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    label: str = ""
    angle_deg: float
    height_m: float
    distance_m: float
    modifier: str
    notes: List[str] = Field(default_factory=list)


class SubjectPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: SubjectAnchor
    pose: str
    x: float
    y: float


class CameraPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: CameraAnchor
    angle: str
    angle_deg: float
    distance_m: float
    x: float
    y: float


class DiagramSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    lights: List[LightPlacement]
    subject: SubjectPosition
    camera: CameraPosition


def _choose_modifier(available: List[str], preferred: List[str], fallback: str) -> str:
    available_set = set(available)
    for item in preferred:
        if item in available_set:
            return item
    return fallback


def _key_angle_for_mood(mood: str) -> float:
    mood = normalize_token(mood)
    mapping = {
        "beauty": 0.0,
        "high key": 15.0,
        "highkey": 15.0,
        "corporate": 20.0,
        "natural": 30.0,
        "cinematic": 60.0,
        "editorial": 75.0,
        "low key": 45.0,
        "lowkey": 45.0,
    }
    return mapping.get(mood, 20.0)


def _needs_fill(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"beauty", "corporate", "high key", "highkey"}


def _needs_rim(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"beauty", "cinematic", "low key", "lowkey"}


def build_diagram(system: Dict[str, Any], *, modifiers_available: Optional[List[str]] = None) -> DiagramSpec:
    system_id = str(system.get("id") or system.get("system_id") or "unknown")
    taxonomy = dict(system.get("taxonomy_refs") or {})
    mood = normalize_token(str(taxonomy.get("mood", "corporate")))

    available = normalize_modifier_list(modifiers_available or [])
    lights: List[LightPlacement] = []

    system_modifier = str(
        system.get("modifier")
        or taxonomy.get("modifier_family")
        or ""
    ).strip().lower()

    if system_modifier:
        key_modifier = system_modifier
    else:
        key_modifier = _choose_modifier(
            available,
            ["beauty_dish", "softbox", "umbrella", "grid_spot", "grid"],
            "softbox",
        )

    if any(x in key_modifier for x in ("softbox", "umbrella", "beauty_dish")):
        key_distance = 1.0
    elif "grid" in key_modifier:
        key_distance = 1.6
    elif "bare" in key_modifier:
        key_distance = 1.8
    else:
        key_distance = 1.4

    lights.append(
        LightPlacement(
            role="key",
            label="Key Light",
            angle_deg=_key_angle_for_mood(mood),
            height_m=1.8,
            distance_m=key_distance,
            modifier=key_modifier,
            notes=["Primary shaping light."],
        )
    )

    if _needs_fill(mood):
        lights.append(
            LightPlacement(
                role="fill",
                label="Fill Light",
                angle_deg=-15.0,
                height_m=1.6,
                distance_m=1.4,
                modifier=_choose_modifier(available, ["umbrella", "softbox"], "umbrella"),
                notes=["Fill placed opposite key for contrast control."],
            )
        )

    if _needs_rim(mood):
        lights.append(
            LightPlacement(
                role="rim",
                label="Rim Light",
                angle_deg=135.0,
                height_m=2.0,
                distance_m=1.8,
                modifier=_choose_modifier(available, ["grid_spot", "grid", "stripbox", "alldefaults"], "grid_spot"),
                notes=["Rim placed behind subject for separation."],
            )
        )

    return DiagramSpec(
        system_id=system_id,
        lights=lights,
        subject=SubjectPosition(
            position=SubjectAnchor.CENTER,
            pose="neutral",
            x=0.0,
            y=0.0,
        ),
        camera=CameraPosition(
            position=CameraAnchor.FRONT,
            angle="eye_level",
            angle_deg=0.0,
            distance_m=2.0,
            x=0.0,
            y=-2.0,
        ),
    )


def build_diagram_spec(system: Dict[str, Any], *, modifiers_available: Optional[List[str]] = None) -> DiagramSpec:
    return build_diagram(system, modifiers_available=modifiers_available)
