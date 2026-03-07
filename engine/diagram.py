from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict

from engine.normalizer import normalize_modifier_list, normalize_token


class LightSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    angle_deg: float
    height_m: float
    distance_m: float
    modifier: str
    notes: List[str] = Field(default_factory=list)


class DiagramSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    lights: List[LightSpec]
    subject: Dict[str, Any] = Field(default_factory=dict)
    camera: Dict[str, Any] = Field(default_factory=dict)


def _choose_modifier(available: List[str], preferred: List[str], *, fallback: str) -> str:
    avail = set(available)
    for p in preferred:
        if p in avail:
            return p
    return fallback


def build_diagram_spec(system: Dict[str, Any], *, modifiers_available: Optional[List[str]] = None) -> DiagramSpec:
    """
    Deterministic diagram rules for contract tests:
      - beauty: key angle 0
      - outdoor: key angle 45
      - dramatic: key + rim; key prefers grid; rim prefers alldefaults if present
    """
    system_id = str(system.get("id") or system.get("system_id") or "unknown")
    taxonomy = system.get("taxonomy_refs") or {}
    mood = normalize_token(str(taxonomy.get("mood", "neutral")))
    environment = normalize_token(str(taxonomy.get("environment", "studio")))

    mods = normalize_modifier_list(modifiers_available or [])
    lights: List[LightSpec] = []

    if mood == "beauty":
        key_angle = 0.0
    elif environment == "outdoor":
        key_angle = 45.0
    else:
        key_angle = 30.0

    key_modifier = _choose_modifier(
        mods,
        preferred=["beauty_dish", "softbox", "umbrella"],
        fallback="softbox",
    )

    if mood == "dramatic":
        key_modifier = _choose_modifier(mods, preferred=["grid", "softbox"], fallback=key_modifier)
        rim_modifier = _choose_modifier(mods, preferred=["alldefaults", "stripbox", "grid"], fallback="stripbox")

        lights.append(
            LightSpec(
                role="key",
                angle_deg=key_angle,
                height_m=1.9,
                distance_m=1.2,
                modifier=key_modifier,
                notes=["Higher contrast key for dramatic mood."],
            )
        )
        lights.append(
            LightSpec(
                role="rim",
                angle_deg=135.0,
                height_m=2.0,
                distance_m=1.5,
                modifier=rim_modifier,
                notes=["Rim/kicker to separate subject from background."],
            )
        )
    else:
        lights.append(
            LightSpec(
                role="key",
                angle_deg=key_angle,
                height_m=1.8,
                distance_m=1.1,
                modifier=key_modifier,
                notes=["Primary shaping light."],
            )
        )

    return DiagramSpec(system_id=system_id, lights=lights, subject={"pose": "neutral"}, camera={"shot": "portrait"})
