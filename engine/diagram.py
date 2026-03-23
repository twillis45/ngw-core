from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict

from engine.normalizer import normalize_modifier_list, normalize_token
from engine.master_mode import get_diagram_overrides


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
    power_hint: str = ""       # e.g. "f/8", "1/2 power", "match key"
    ratio_hint: str = ""       # e.g. "2:1 key-to-fill"
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
    pattern: Optional[str] = None
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
    return mood in {"beauty", "corporate", "high key", "highkey", "natural"}


def _needs_rim(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"beauty", "cinematic", "low key", "lowkey"}


def _needs_background_light(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"high key", "highkey", "corporate"}


def _needs_triangle(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"headshot triangle", "headshot_triangle", "triangle", "hurley"}


def _fill_preferences(mood: str):
    """Return (preferred_list, fallback) for fill modifier based on mood/pattern."""
    mood = normalize_token(mood)
    if mood == "beauty":
        # Clamshell: reflector below chin is the classic fill
        return (["reflector", "softbox", "beauty_dish"], "reflector")
    if mood == "natural":
        # Natural: reflector bounce simulates wall/window bounce
        return (["reflector", "softbox"], "reflector")
    if mood in {"high key", "highkey"}:
        # High key: even, soft fill
        return (["softbox", "umbrella", "reflector"], "softbox")
    # Corporate / default: soft even fill
    return (["softbox", "reflector", "umbrella"], "softbox")


def _key_preferences(mood: str):
    """Return (preferred_list, fallback) for KEY modifier based on mood."""
    mood = normalize_token(mood)
    if mood == "beauty":
        return (["beauty_dish", "softbox", "umbrella"], "beauty_dish")
    if mood in {"cinematic", "low key", "lowkey"}:
        return (["grid_spot", "grid", "stripbox", "softbox"], "grid_spot")
    if mood == "editorial":
        return (["grid_spot", "grid", "bare", "stripbox"], "grid_spot")
    if mood in {"high key", "highkey"}:
        return (["softbox", "umbrella", "beauty_dish"], "softbox")
    if mood == "natural":
        return (["softbox", "umbrella"], "softbox")
    # corporate / default — broad, even, flattering
    return (["softbox", "umbrella", "beauty_dish"], "softbox")


def _rim_preferences(mood: str):
    """Return (preferred_list, fallback) for RIM modifier based on mood."""
    mood = normalize_token(mood)
    if mood == "beauty":
        # Hair/rim for beauty: softer separation
        return (["stripbox", "softbox", "grid"], "stripbox")
    # Cinematic / low key / default: tight edge
    return (["grid_spot", "grid", "stripbox"], "grid_spot")


def build_diagram(system: Dict[str, Any], *, modifiers_available: Optional[List[str]] = None, master_mode: Optional[str] = None) -> DiagramSpec:
    system_id = str(system.get("id") or system.get("system_id") or "unknown")
    taxonomy = dict(system.get("taxonomy_refs") or {})
    mood = normalize_token(str(taxonomy.get("mood", "corporate")))

    available = normalize_modifier_list(modifiers_available or [])
    lights: List[LightPlacement] = []

    # Master mode diagram overrides (None when no mode selected)
    mm_overrides = get_diagram_overrides(master_mode)

    system_modifier = str(
        taxonomy.get("modifier_family") or ""
    ).strip().lower()

    if system_modifier:
        key_modifier = system_modifier
    elif mm_overrides and mm_overrides.get("key_modifier_pref"):
        # Master mode preferred key modifiers take priority over mood defaults
        key_modifier = _choose_modifier(available, mm_overrides["key_modifier_pref"], mm_overrides["key_modifier_pref"][0])
    else:
        key_prefs, key_fallback = _key_preferences(mood)
        key_modifier = _choose_modifier(available, key_prefs, key_fallback)

    # Ring light is a single on-axis source — the ring itself provides fill by
    # wrapping evenly around the lens axis.  Forcing its gear_profile here
    # overrides whatever modifier_family the taxonomy carries (bare_bulb for
    # beauty-mood systems) and prevents the mood-driven fill + rim additions
    # that would produce a physically wrong 3-light diagram.
    is_ring_light = taxonomy.get("gear_profile") == "ring_light"
    if is_ring_light:
        key_modifier = "ring_light"

    # Triangle (Hurley-style): two symmetric keys + low fill — early return
    force_pattern = mm_overrides.get("force_pattern") if mm_overrides else None
    if force_pattern == "triangle" or _needs_triangle(mood):
        lights.append(
            LightPlacement(
                role="key_left",
                label="Key Left",
                angle_deg=-30.0,
                height_m=1.75,
                distance_m=1.0,
                modifier=key_modifier,
                power_hint="f/8 · match right key",
                notes=["Left key light. Symmetric with right. Continuous recommended."],
            )
        )
        lights.append(
            LightPlacement(
                role="key_right",
                label="Key Right",
                angle_deg=30.0,
                height_m=1.75,
                distance_m=1.0,
                modifier=key_modifier,
                power_hint="f/8 · match left key",
                notes=["Right key light. Symmetric with left. Match power to left key."],
            )
        )
        lights.append(
            LightPlacement(
                role="fill_low",
                label="Low Fill",
                angle_deg=0.0,
                height_m=1.2,
                distance_m=0.8,
                modifier=_choose_modifier(available, ["softbox", "softbox_rect", "umbrella"], "softbox"),
                power_hint="½ key power",
                ratio_hint="2:1 key-to-fill",
                notes=[
                    "Below chin level, angled up toward face.",
                    "Lower power than keys — just enough to complete the triangle catchlight and lift chin shadow.",
                    "Start at half the power of the keys and adjust.",
                ],
            )
        )

        return DiagramSpec(
            system_id=system_id,
            pattern="triangle",
            lights=lights,
            subject=SubjectPosition(
                position=SubjectAnchor.CENTER,
                pose="straight-on, chin slightly forward and down",
                x=0.0,
                y=0.0,
            ),
            camera=CameraPosition(
                position=CameraAnchor.FRONT,
                angle="eye_level",
                angle_deg=0.0,
                distance_m=2.5,
                x=0.0,
                y=-2.5,
            ),
        )

    if any(x in key_modifier for x in ("softbox", "umbrella", "beauty_dish")):
        key_distance = 1.0
    elif "grid" in key_modifier:
        key_distance = 1.6
    elif "bare" in key_modifier:
        key_distance = 1.8
    else:
        key_distance = 1.4

    # Master mode can override key angle
    mm_key_angle = mm_overrides.get("key_angle") if mm_overrides else None
    key_angle = mm_key_angle if mm_key_angle is not None else _key_angle_for_mood(mood)

    lights.append(
        LightPlacement(
            role="key",
            label="Key Light",
            angle_deg=key_angle,
            height_m=1.8,
            distance_m=key_distance,
            modifier=key_modifier,
            power_hint="f/8 metered at subject",
            notes=["Primary shaping light."],
        )
    )

    # Master mode can override fill/rim/background decisions
    mm_fill = mm_overrides.get("fill_enable") if mm_overrides else None
    mm_rim = mm_overrides.get("rim_enable") if mm_overrides else None
    mm_bg = mm_overrides.get("background_light") if mm_overrides else None

    wants_fill = mm_fill if mm_fill is not None else _needs_fill(mood)
    if is_ring_light:
        wants_fill = False
    if wants_fill:
        fill_prefs, fill_fallback = _fill_preferences(mood)
        fill_mod = _choose_modifier(available, fill_prefs, fill_fallback)
        is_reflector = fill_mod == "reflector"
        is_beauty = mood == "beauty"

        if is_reflector and is_beauty:
            # Clamshell: reflector below chin, centered
            fill_angle, fill_height, fill_dist = 0.0, 1.2, 0.8
            fill_note = "Reflector below chin for clamshell fill."
        elif is_reflector:
            # Non-beauty reflector: bounce opposite key
            fill_angle = -_key_angle_for_mood(mood)
            fill_height, fill_dist = 1.4, 1.0
            fill_note = "Reflector opposite key for natural bounce fill."
        else:
            fill_angle, fill_height, fill_dist = -15.0, 1.6, 1.4
            fill_note = "Fill placed opposite key for contrast control."

        # Fill power relative to key
        if is_beauty:
            fill_power = "1–2 stops below key"
            fill_ratio = "2:1 key-to-fill"
        elif mood in ("dramatic", "cinematic", "editorial", "low_key", "lowkey"):
            fill_power = "2–3 stops below key"
            fill_ratio = "4:1 key-to-fill"
        else:
            fill_power = "1–1.5 stops below key"
            fill_ratio = "2:1 key-to-fill"

        lights.append(
            LightPlacement(
                role="fill",
                label="Fill" if is_reflector else "Fill Light",
                angle_deg=fill_angle,
                height_m=fill_height,
                distance_m=fill_dist,
                modifier=fill_mod,
                power_hint=fill_power,
                ratio_hint=fill_ratio,
                notes=[fill_note],
            )
        )

    wants_rim = mm_rim if mm_rim is not None else _needs_rim(mood)
    if is_ring_light:
        wants_rim = False
    if wants_rim:
        rim_prefs, rim_fallback = _rim_preferences(mood)
        rim_mod = _choose_modifier(available, rim_prefs, rim_fallback)
        rim_label = "Hair Light" if mood == "beauty" else "Rim Light"
        rim_note = (
            "Hair light for separation and shine."
            if mood == "beauty"
            else "Rim placed behind subject for separation."
        )
        lights.append(
            LightPlacement(
                role="rim",
                label=rim_label,
                angle_deg=135.0,
                height_m=2.0,
                distance_m=1.8,
                modifier=rim_mod,
                power_hint="match key or +½ stop",
                notes=[rim_note],
            )
        )

    wants_bg = mm_bg if mm_bg is not None else _needs_background_light(mood)
    if wants_bg:
        bg_note = (
            "Background light aimed at the backdrop. "
            "For high key: overexpose 1–2 stops above key for pure white."
            if mood in ("high key", "highkey")
            else "Background light for clean, even backdrop illumination."
        )
        bg_power = (
            "+1–2 stops over key"
            if mood in ("high key", "highkey")
            else "−1 stop from key"
        )
        lights.append(
            LightPlacement(
                role="background",
                label="Background Light",
                angle_deg=180.0,
                height_m=1.0,
                distance_m=1.5,
                modifier="bare",
                power_hint=bg_power,
                notes=[bg_note],
            )
        )

    # Master mode can override camera distance and subject pose
    mm_cam_dist = mm_overrides.get("camera_distance_m") if mm_overrides else None
    mm_pose = mm_overrides.get("subject_pose") if mm_overrides else None
    cam_dist = mm_cam_dist if mm_cam_dist is not None else 2.0
    pose = mm_pose if mm_pose is not None else "neutral"

    # Derive pattern from force_pattern or leave for caller to set
    diagram_pattern = force_pattern if force_pattern else None

    return DiagramSpec(
        system_id=system_id,
        pattern=diagram_pattern,
        lights=lights,
        subject=SubjectPosition(
            position=SubjectAnchor.CENTER,
            pose=pose,
            x=0.0,
            y=0.0,
        ),
        camera=CameraPosition(
            position=CameraAnchor.FRONT,
            angle="eye_level",
            angle_deg=0.0,
            distance_m=cam_dist,
            x=0.0,
            y=-cam_dist,
        ),
    )


def build_reference_diagram(
    pattern: str,
    modifier_family: Optional[str] = None,
    light_count: int = 0,
    key_position_text: str = "",
    fill_method_text: str = "",
    background_light: bool = False,
    key_side: str = "unknown",
) -> DiagramSpec:
    """Build a diagram representing what was *detected* in a reference image.

    Unlike ``build_diagram`` (which builds from a system spec), this builds
    from lighting inference — what the catchlights and palette told us the
    photographer actually used.

    Args:
        pattern: Detected pattern name (e.g. ``"triangle"``).
        modifier_family: Detected modifier (e.g. ``"softbox_rect"``).
        light_count: Number of detected light sources.
        key_position_text: Key position description.
        fill_method_text: Fill method description.
        background_light: Whether a dedicated background light was detected.
        key_side: Detected key light side — ``"left"``, ``"right"``,
                  ``"center"``, or ``"unknown"``.  When known, the diagram
                  positions the key on the correct side of the subject.
    """
    # When no modifier was detected (None), use "unknown" rather than
    # defaulting to "softbox" — that's misleading when the actual light type
    # is genuinely uncertain (e.g. zero catchlights, B&W dramatic images).
    mod = modifier_family or "unknown"
    lights: List[LightPlacement] = []
    pose = "neutral (detected)"
    cam_distance = 2.0

    # Sign multiplier: negative angles = camera-left, positive = camera-right.
    # When key_side is "left" the key goes to negative angles (camera-left).
    # When "right", positive.  When "unknown", default positive (convention).
    side = -1.0 if key_side == "left" else 1.0
    side_label = "camera-left" if key_side == "left" else (
        "camera-right" if key_side == "right" else "camera-right (assumed)"
    )

    # ── Triangle ──────────────────────────────────────────────────────────
    if pattern == "triangle":
        pose = "straight-on (detected)"
        cam_distance = 2.5
        lights = [
            LightPlacement(
                role="key_left",
                label="Detected Key Left",
                angle_deg=-30.0,
                height_m=1.75,
                distance_m=1.0,
                modifier=mod,
                notes=["Detected: left flanking key (10 o'clock catchlight)."],
            ),
            LightPlacement(
                role="key_right",
                label="Detected Key Right",
                angle_deg=30.0,
                height_m=1.75,
                distance_m=1.0,
                modifier=mod,
                notes=["Detected: right flanking key (2 o'clock catchlight)."],
            ),
        ]
        # Only add low fill if the truth layer confirms ≥3 sources or describes a fill
        if light_count >= 3 or fill_method_text:
            lights.append(
                LightPlacement(
                    role="fill_low",
                    label="Detected Low Fill",
                    angle_deg=0.0,
                    height_m=1.2,
                    distance_m=0.8,
                    modifier="softbox",
                    notes=["Detected: low fill completing the triangle (5–6 o'clock catchlight)."],
                )
            )

    # ── Clamshell ─────────────────────────────────────────────────────────
    elif pattern == "clamshell":
        lights = [
            LightPlacement(
                role="key",
                label="Detected Key Light",
                angle_deg=0.0,
                height_m=1.8,
                distance_m=1.0,
                modifier=mod,
                notes=["Detected: centered key above (top catchlight)."],
            ),
        ]
        # Only add fill if the truth layer confirms ≥2 sources or describes a fill method
        if light_count >= 2 or fill_method_text:
            lights.append(
                LightPlacement(
                    role="fill",
                    label="Detected Fill / Reflector",
                    angle_deg=0.0,
                    height_m=1.2,
                    distance_m=0.8,
                    modifier="reflector",
                    notes=["Detected: low fill below chin (bottom catchlight). Reflector or low light."],
                )
            )

    # ── Rembrandt-ish ─────────────────────────────────────────────────────
    elif pattern == "rembrandt":
        lights = [
            LightPlacement(
                role="key",
                label=f"Detected Key Light ({side_label})",
                angle_deg=side * 45.0,
                height_m=1.9,
                distance_m=1.2,
                modifier=mod,
                notes=[f"Detected: key ~45° {side_label}. Classic Rembrandt position."],
            ),
        ]

    # ── Loop ──────────────────────────────────────────────────────────────
    elif pattern == "loop":
        lights = [
            LightPlacement(
                role="key",
                label=f"Detected Key Light ({side_label})",
                angle_deg=side * 30.0,
                height_m=1.8,
                distance_m=1.0,
                modifier=mod,
                notes=[f"Detected: key ~30° {side_label}. Loop position."],
            ),
        ]

    # ── Split / Short ────────────────────────────────────────────────────
    elif pattern == "split":
        lights = [
            LightPlacement(
                role="key",
                label=f"Detected Key Light ({side_label})",
                angle_deg=side * 90.0,
                height_m=1.8,
                distance_m=1.4,
                modifier=mod,
                notes=[f"Detected: key ~90° {side_label}. Split / short lighting."],
            ),
        ]

    # ── Unknown / fallback ───────────────────────────────────────────────
    else:
        angle = side * 20.0
        notes_text = "Pattern could not be identified precisely."
        if key_side != "unknown":
            notes_text += f" Key light detected {side_label} from shadow analysis."
        lights = [
            LightPlacement(
                role="key",
                label=f"Detected Key Light" + (f" ({side_label})" if key_side != "unknown" else ""),
                angle_deg=angle,
                height_m=1.8,
                distance_m=1.2,
                modifier=mod,
                notes=[notes_text],
            ),
        ]

    # ── Background light (inferred from backdrop brightness, not catchlights) ──
    if background_light:
        lights.append(
            LightPlacement(
                role="background",
                label="Detected Background Light",
                angle_deg=180.0,
                height_m=1.0,
                distance_m=1.5,
                modifier="reflector",
                notes=[
                    "Detected: dedicated background light inferred from bright backdrop.",
                    "Positioned behind subject, aimed at the background.",
                    "Not visible in catchlights — detected from background brightness analysis.",
                ],
            )
        )

    return DiagramSpec(
        system_id="reference_detected",
        pattern=pattern if pattern != "unknown" else None,
        lights=lights,
        subject=SubjectPosition(
            position=SubjectAnchor.CENTER,
            pose=pose,
            x=0.0,
            y=0.0,
        ),
        camera=CameraPosition(
            position=CameraAnchor.FRONT,
            angle="eye_level",
            angle_deg=0.0,
            distance_m=cam_distance,
            x=0.0,
            y=-cam_distance,
        ),
    )


def build_diagram_spec(system: Dict[str, Any], *, modifiers_available: Optional[List[str]] = None, master_mode: Optional[str] = None) -> DiagramSpec:
    return build_diagram(system, modifiers_available=modifiers_available, master_mode=master_mode)
