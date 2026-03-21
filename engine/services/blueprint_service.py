"""Lighting Blueprint Engine — Phase 6 + Phase 10.

Converts an AnalysisResult (pattern + signals) into a physically-shootable
lighting blueprint: exact light positions, modifiers, power ratios, camera
settings, and fallback options.

Phase 10 adds recommended_kits (good / better / best gear tiers).

Architecture rule: this service CONSUMES engine.orchestrator.AnalysisResult
only.  It does NOT rank patterns or run any inference.  All pattern decisions
are final by the time this service is called.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Clock-position convention
# ═══════════════════════════════════════════════════════════════════════════
# Bird's-eye view with camera at 6:00, subject at center facing 12:00.
#   12:00 → directly in front of subject (camera axis)
#   10:00 → camera's right, subject's left — classic rembrandt/loop side
#    9:00 → camera's right side (split / short)
#    7:00 → camera's right rear (rim from behind-left)
#    2:00 → camera's left, subject's right
#    3:00 → camera's left side
#    5:00 → camera's left rear (rim from behind-right)
#
# angle_deg  = horizontal off-axis angle (0 = camera axis, 90 = side light)
# height_deg = vertical elevation above eye level (0 = eye level, 45 = above)

# ═══════════════════════════════════════════════════════════════════════════
# Dataclasses
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class LightSpec:
    role: str                     # key | fill | rim | hair | background | accent
    clock: str                    # clock position string, e.g. "10:00"
    angle_deg: float              # horizontal off-axis (0–180)
    height_deg: float             # vertical elevation above eye level
    distance_ft: float            # estimated distance from subject
    height_label: str             # "above eye level" | "eye level" | "below eye level"
    modifier: str                 # modifier family code
    modifier_label: str           # human-readable modifier name
    power_ratio: float            # relative to key light (key = 1.0)
    power_ratio_label: str        # e.g. "1:2 (one stop under key)"
    notes: List[str] = dc_field(default_factory=list)


@dataclass
class BlueprintResult:
    pattern: str
    pattern_label: str
    lights: List[Dict[str, Any]]
    subject_notes: str
    background_notes: str
    camera_settings: Dict[str, Any]
    coaching: List[str]
    fallback_options: List[Dict[str, Any]]
    recommended_kits: Dict[str, Any]
    signal_confidence: float
    data_quality: str             # "full" | "face_limited" | "estimated"
    warnings: List[str]


# ═══════════════════════════════════════════════════════════════════════════
# Pattern blueprint templates
# ═══════════════════════════════════════════════════════════════════════════
# Each template defines the canonical light arrangement. build_lighting_blueprint()
# customises positions and modifiers using live signals from the AnalysisResult.

_PATTERN_BLUEPRINTS: Dict[str, Dict[str, Any]] = {

    # ── Classic portrait patterns ──────────────────────────────────────────

    "rembrandt": {
        "label": "Rembrandt",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",   # camera-right front
                "angle_deg": 45,
                "height_deg": 45,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_rect",
                "modifier_label": "Medium rectangular softbox (24×36\")",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power (reference)",
                "notes": [
                    "Position until a small inverted triangle of light appears on the shadowed cheek.",
                    "If the triangle disappears, move light more to the side.",
                    "If the triangle merges with the nose-shadow, raise the light.",
                ],
            },
            {
                "role": "fill",
                "clock_default": "12:30",   # near camera axis
                "angle_deg": 10,
                "height_deg": 0,
                "height_label": "eye level",
                "distance_ft": 5.0,
                "modifier": "reflector_silver",
                "modifier_label": "Silver reflector or V-flat",
                "power_ratio": 0.25,
                "power_ratio_label": "1:4 ratio (two stops under key)",
                "notes": [
                    "Reflector fill preserves shadow depth.  Use a strobe fill at 1:4 if reflector not available.",
                ],
            },
        ],
        "subject_notes": "Face turned 30–45° away from the key light. The ear on the shadow side should just be visible.",
        "background_notes": "Dark seamless or dark textured wall, 3–6 ft behind subject.",
        "coaching": [
            "The Rembrandt triangle must be no wider than the eye and no taller than from the eye to the corner of the mouth.",
            "Shadow side of the face should be darker than the lit side by at least 1.5 stops.",
            "Hair light from above-behind adds separation without spilling on face.",
        ],
        "fallbacks": [
            {
                "scenario": "No reflector available",
                "action": "Use white V-flat at 1:6 ratio or allow full shadow (low-key Rembrandt).",
            },
            {
                "scenario": "Softbox too large for space",
                "action": "Switch to beauty dish at same position — slightly harder shadow, similar triangle.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200 (sync limit)",
            "iso": "100–200",
            "focus_point": "Near eye (eye AF or single-point on catchlight eye)",
            "white_balance": "Flash preset or 5500 K",
        },
    },

    "loop": {
        "label": "Loop",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:30",
                "angle_deg": 30,
                "height_deg": 30,
                "height_label": "above eye level",
                "distance_ft": 4.5,
                "modifier": "softbox_rect",
                "modifier_label": "Medium rectangular softbox (24×36\")",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Lower than Rembrandt key — aim to cast a small downward loop shadow from the nose.",
                    "Shadow should not touch the lip line.",
                ],
            },
            {
                "role": "fill",
                "clock_default": "1:30",
                "angle_deg": 30,
                "height_deg": 0,
                "height_label": "eye level",
                "distance_ft": 5.0,
                "modifier": "softbox_rect",
                "modifier_label": "Medium rectangular softbox or reflector",
                "power_ratio": 0.5,
                "power_ratio_label": "1:2 ratio (one stop under key)",
                "notes": [
                    "Opposite side from key.  A reflector works well for a natural look.",
                ],
            },
        ],
        "subject_notes": "Face turned 15–30° from camera. More flattering than Rembrandt for many face shapes.",
        "background_notes": "Mid-tone or light gray seamless, 4–6 ft behind subject.",
        "coaching": [
            "The nose-loop shadow should point slightly downward toward the corner of the mouth — not straight down.",
            "Keep shadow from crossing the philtrum (upper lip); if it does, lower the light.",
            "Works well for corporate, beauty, and editorial.",
        ],
        "fallbacks": [
            {
                "scenario": "Loop shadow too long",
                "action": "Raise light slightly or move subject's face closer to camera axis.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–200",
            "focus_point": "Near eye",
            "white_balance": "Flash preset or 5500 K",
        },
    },

    "butterfly": {
        "label": "Butterfly (Paramount)",
        "lights": [
            {
                "role": "key",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": 50,
                "height_label": "well above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_octa",
                "modifier_label": "Octa softbox or beauty dish",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Raise light directly above camera-to-subject axis until shadow falls directly under the nose.",
                    "Classic Old Hollywood look — very flattering for cheekbones.",
                ],
            },
            {
                "role": "fill",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": -20,
                "height_label": "below eye level (reflector or fill card)",
                "distance_ft": 3.0,
                "modifier": "reflector_white",
                "modifier_label": "White reflector or fill card",
                "power_ratio": 0.33,
                "power_ratio_label": "1:3 ratio",
                "notes": [
                    "Fill card below lens opens shadow under chin — prevents harsh under-chin shadow.",
                ],
            },
        ],
        "subject_notes": "Subject faces camera directly. Works best for symmetrical, oval face shapes.",
        "background_notes": "White or light gray seamless, or high-key gradient.",
        "coaching": [
            "The butterfly shadow under the nose should be symmetrical — if not, the light is off-axis.",
            "Add a hair light directly behind/above subject for full glamour setup.",
            "Beauty dish gives slightly harder, more defined shadow than softbox.",
        ],
        "fallbacks": [
            {
                "scenario": "No overhead position available",
                "action": "Use a boom arm or raise the light stand to maximum height.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/4",
            "shutter": "1/125–1/200",
            "iso": "100–200",
            "focus_point": "Eye AF — nose shadow check after each frame",
            "white_balance": "Flash preset or 5500 K",
        },
    },

    "split": {
        "label": "Split",
        "lights": [
            {
                "role": "key",
                "clock_default": "9:00",
                "angle_deg": 90,
                "height_deg": 10,
                "height_label": "near eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_rect",
                "modifier_label": "Medium softbox or hard light with grid",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Light exactly at 90° to camera-subject axis.",
                    "Precisely halves the face into lit and shadow sides.",
                    "Hard light at this position creates dramatic, graphic look.",
                ],
            },
        ],
        "subject_notes": "Subject faces camera directly. Face divides into two vertical halves.",
        "background_notes": "Dark background recommended for maximum impact. 4–8 ft behind subject.",
        "coaching": [
            "Split lighting is most effective for dramatic, editorial, or fashion contexts.",
            "Even a small amount of fill (1:8+) softens without losing the split effect.",
            "For environmental portraits, the split key can be the window edge.",
        ],
        "fallbacks": [
            {
                "scenario": "Need less drama",
                "action": "Move light to 10:30 position — transitions to loop lighting.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Lit eye or nearest eye",
            "white_balance": "Flash preset",
        },
    },

    "broad": {
        "label": "Broad",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",
                "angle_deg": 40,
                "height_deg": 35,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_rect",
                "modifier_label": "Large rectangular softbox",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Key on the side of the face turned TOWARD camera — illuminates the wider visible area.",
                    "Subject must be turned so their near ear is visible to camera.",
                ],
            },
        ],
        "subject_notes": "Face turned toward the key light. Key hits the larger (near-camera) side of the face.",
        "background_notes": "Mid-tone background, 4–6 ft behind.",
        "coaching": [
            "Broad lighting widens apparent face width — use for narrow/long faces.",
            "Avoid for round faces — use short or loop instead.",
            "Ensure catchlight lands in the near (toward camera) eye.",
        ],
        "fallbacks": [
            {
                "scenario": "Face appears too wide",
                "action": "Turn subject slightly more toward key — transitions toward short lighting.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–200",
            "focus_point": "Near eye (key-side eye)",
            "white_balance": "Flash preset",
        },
    },

    "short": {
        "label": "Short",
        "lights": [
            {
                "role": "key",
                "clock_default": "2:00",
                "angle_deg": 45,
                "height_deg": 35,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_rect",
                "modifier_label": "Medium rectangular softbox",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Key on the side of the face turned AWAY from camera — illuminates the narrower far side.",
                    "Subject must be turned so their far ear is on the same side as the key.",
                ],
            },
        ],
        "subject_notes": "Face turned away from the key light. Key hits the smaller (far-camera) side of the face.",
        "background_notes": "Dark to mid-tone background emphasises the sculpted look.",
        "coaching": [
            "Short lighting narrows apparent face width — most flattering for round or wide faces.",
            "Creates more shadow on the near (toward camera) side — more dramatic than broad.",
            "Catchlight should land in the far eye; near eye may have only reflected fill.",
        ],
        "fallbacks": [
            {
                "scenario": "Too little light on near eye",
                "action": "Add subtle fill on camera side at 1:6 ratio.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Near eye",
            "white_balance": "Flash preset",
        },
    },

    "clamshell": {
        "label": "Clamshell",
        "lights": [
            {
                "role": "key",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": 40,
                "height_label": "above eye level",
                "distance_ft": 3.5,
                "modifier": "softbox_octa",
                "modifier_label": "Octa softbox or beauty dish",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": ["Upper light — angled down toward subject's face."],
            },
            {
                "role": "fill",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": -30,
                "height_label": "below eye level",
                "distance_ft": 3.0,
                "modifier": "reflector_silver",
                "modifier_label": "Large silver/white reflector or second softbox below lens",
                "power_ratio": 0.5,
                "power_ratio_label": "1:2 ratio (one stop under key)",
                "notes": [
                    "Lower source fills under-eye and chin shadows.",
                    "Classic beauty setup — creates wrap-around glow.",
                ],
            },
        ],
        "subject_notes": "Subject faces directly into the setup. Both lights on the camera axis.",
        "background_notes": "White or high-key seamless typical. Can add background light for separation.",
        "coaching": [
            "Clamshell is the standard beauty setup — even fill, minimal shadows.",
            "Increase key-to-fill ratio for more dimension without losing the wrap.",
            "Add a hair light above-behind for full commercial beauty look.",
        ],
        "fallbacks": [
            {
                "scenario": "Second strobe not available",
                "action": "Use a large white V-flat below lens as the lower fill source.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/4",
            "shutter": "1/125–1/200",
            "iso": "100",
            "focus_point": "Eye AF",
            "white_balance": "Flash preset",
        },
    },

    "window_portrait": {
        "label": "Window Light",
        "lights": [
            {
                "role": "key",
                "clock_default": "9:00",
                "angle_deg": 60,
                "height_deg": 15,
                "height_label": "slightly above eye level",
                "distance_ft": 3.0,
                "modifier": "window_natural",
                "modifier_label": "Natural window (large diffuse source)",
                "power_ratio": 1.0,
                "power_ratio_label": "Natural ambient (no control)",
                "notes": [
                    "Subject positioned 2–4 ft from window — further = softer falloff.",
                    "Overcast sky gives softest, most even window light.",
                    "Direct sun through window creates hard shadows — diffuse with sheer curtain.",
                ],
            },
            {
                "role": "fill",
                "clock_default": "3:00",
                "angle_deg": 60,
                "height_deg": 0,
                "height_label": "eye level",
                "distance_ft": 3.0,
                "modifier": "reflector_white",
                "modifier_label": "White reflector or white wall",
                "power_ratio": 0.2,
                "power_ratio_label": "Ambient bounce",
                "notes": [
                    "White reflector opposite the window bounces light into shadows.",
                    "Room walls act as natural fill — darker room = more dramatic shadows.",
                ],
            },
        ],
        "subject_notes": "Position subject perpendicular to window. Face at 45–90° to window plane.",
        "background_notes": "Interior room background — distance controls depth of field and ambient exposure.",
        "coaching": [
            "Shoot 1–2 hours after sunrise or before sunset for warm window light.",
            "Overcast is ideal — consistent, soft, non-directional.",
            "Use a reflector opposite the window to control shadow side.",
            "Camera ISO may need to increase (400–1600) to match ambient.",
        ],
        "fallbacks": [
            {
                "scenario": "Window light too harsh",
                "action": "Tape a white sheet or sheer curtain over the window to diffuse.",
            },
            {
                "scenario": "Light direction changes",
                "action": "Reposition subject relative to window, not the other way around.",
            },
        ],
        "camera_settings": {
            "aperture": "f/1.8–f/4 (wider for low ambient)",
            "shutter": "1/60–1/250 (match ambient)",
            "iso": "400–1600",
            "focus_point": "Eye AF or single point on near eye",
            "white_balance": "Daylight (5500–6500 K) or cloudy (6500 K)",
        },
    },

    "high_key": {
        "label": "High Key",
        "lights": [
            {
                "role": "key",
                "clock_default": "11:00",
                "angle_deg": 20,
                "height_deg": 30,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_octa",
                "modifier_label": "Large octa softbox",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [],
            },
            {
                "role": "fill",
                "clock_default": "1:00",
                "angle_deg": 20,
                "height_deg": 10,
                "height_label": "near eye level",
                "distance_ft": 4.5,
                "modifier": "softbox_rect",
                "modifier_label": "Medium softbox",
                "power_ratio": 0.75,
                "power_ratio_label": "1:1.3 ratio (near-even fill)",
                "notes": ["High fill ratio minimises shadows for clean high-key look."],
            },
            {
                "role": "background",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": 0,
                "height_label": "aimed at background",
                "distance_ft": 6.0,
                "modifier": "strobe_bare",
                "modifier_label": "Two bare strobes or strip softboxes behind subject on background",
                "power_ratio": 1.5,
                "power_ratio_label": "Background overexposed 1 stop to blow out to white",
                "notes": [
                    "Background must be white seamless.",
                    "Overexpose background 1–2 stops above key to achieve pure white.",
                ],
            },
        ],
        "subject_notes": "Subject 4–6 ft in front of white seamless. Enough distance to prevent background spill on subject.",
        "background_notes": "White seamless paper or white cyc wall. Lights illuminate background to pure white.",
        "coaching": [
            "Meter background separately — aim for +1 to +2 stops over key exposure.",
            "Spill from background on subject shoulders is normal and desirable.",
            "Can create 'floating' look — no visible ground if background lights are even.",
            "Watch for unwanted shadows — high fill ratio prevents most of them.",
        ],
        "fallbacks": [
            {
                "scenario": "Background not pure white",
                "action": "Increase background light power or move subject further from background.",
            },
        ],
        "camera_settings": {
            "aperture": "f/5.6–f/11 (wider depth of field for catalog work)",
            "shutter": "1/125–1/200",
            "iso": "100",
            "focus_point": "Single point or zone AF on subject",
            "white_balance": "Flash preset or 5500 K",
        },
    },

    "low_key": {
        "label": "Low Key",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",
                "angle_deg": 45,
                "height_deg": 40,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "beauty_dish",
                "modifier_label": "Beauty dish with grid, or gridded softbox",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Grid on modifier prevents spill from reaching background.",
                    "Single light source — no fill.",
                ],
            },
        ],
        "subject_notes": "Subject in front of dark (black) background. No separation light.",
        "background_notes": "Black seamless or dark wall — must absorb all light. No background lights.",
        "coaching": [
            "Low key relies on shadow for drama — resist the urge to add fill.",
            "Use a grid on the key light to control spill and keep background black.",
            "Rim light can add separation without losing low-key mood.",
        ],
        "fallbacks": [
            {
                "scenario": "Background not going dark enough",
                "action": "Move background further back (10+ ft) or use gobo to block spill.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/4",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Near eye",
            "white_balance": "Flash preset",
        },
    },

    "ring": {
        "label": "Ring Flash",
        "lights": [
            {
                "role": "key",
                "clock_default": "12:00",
                "angle_deg": 0,
                "height_deg": 0,
                "height_label": "eye level (ring surrounds lens)",
                "distance_ft": 3.0,
                "modifier": "ring_flash",
                "modifier_label": "Ring flash or ring LED",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Ring mounts around the lens barrel — signature circular catchlight.",
                    "Creates flat, even, shadow-free illumination.",
                    "Dark edge shadow around subject if used close — distinctive editorial effect.",
                ],
            },
        ],
        "subject_notes": "Subject faces directly into ring. Works for tight crops and headshots.",
        "background_notes": "Any background — ring creates dark halo shadow on close walls.",
        "coaching": [
            "Circular catchlight is the signature tell of ring flash.",
            "Closer to background = more pronounced halo shadow — position accordingly.",
            "Ring alone creates flat, fashion editorial look.",
            "Add a rim light behind for depth and separation.",
        ],
        "fallbacks": [
            {
                "scenario": "No ring flash available",
                "action": "Large circular octa very close to camera axis approximates ring effect.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/8",
            "shutter": "1/125–1/200",
            "iso": "100",
            "focus_point": "Eye AF",
            "white_balance": "Flash preset",
        },
    },

    "rim_only": {
        "label": "Rim Only",
        "lights": [
            {
                "role": "rim",
                "clock_default": "7:00",
                "angle_deg": 135,
                "height_deg": 30,
                "height_label": "above eye level",
                "distance_ft": 5.0,
                "modifier": "strobe_bare",
                "modifier_label": "Bare strobe with grid, or Fresnel spot",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Light from behind subject — illuminates edge/outline only.",
                    "Aim to just clip the cheekbone edge and temple.",
                ],
            },
        ],
        "subject_notes": "Subject silhouetted against dark background. Only the edge is lit.",
        "background_notes": "Black background essential.",
        "coaching": [
            "Rim-only is a graphic, high-impact silhouette technique.",
            "Two opposing rim lights (7:00 and 5:00) give symmetrical edge detail.",
            "Even a small amount of key (1:8) separates face from black background.",
        ],
        "fallbacks": [
            {
                "scenario": "Want face detail with rim",
                "action": "Add a small key at 1:8 ratio — still reads as rim-dominant.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Edge or near eye",
            "white_balance": "Flash preset",
        },
    },

    "athletic_rim_sculpt": {
        "label": "Athletic Rim Sculpt",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",
                "angle_deg": 50,
                "height_deg": 25,
                "height_label": "slightly above eye level",
                "distance_ft": 5.0,
                "modifier": "strobe_bare",
                "modifier_label": "Bare strobe or Fresnel with grid",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Hard, directional key sculpts muscle definition.",
                    "No softening — hardness is intentional.",
                ],
            },
            {
                "role": "rim",
                "clock_default": "5:00",
                "angle_deg": 140,
                "height_deg": 20,
                "height_label": "slightly above eye level",
                "distance_ft": 5.0,
                "modifier": "strobe_bare",
                "modifier_label": "Bare strobe with grid",
                "power_ratio": 0.7,
                "power_ratio_label": "Slightly under key",
                "notes": [
                    "Opposite-side rim separates athlete from background.",
                    "Creates sculpted, three-dimensional muscle outline.",
                ],
            },
        ],
        "subject_notes": "Subject turned 30–45° to camera. Arms or body turned to show muscle definition.",
        "background_notes": "Dark background, black preferred. 6–10 ft behind subject.",
        "coaching": [
            "Hard light is non-negotiable for muscle sculpting — softboxes wash out definition.",
            "Have subject hold tension in muscles during capture.",
            "Rim light should clip the far shoulder/arm edge without spilling to face.",
        ],
        "fallbacks": [
            {
                "scenario": "Highlights clipping on skin",
                "action": "Lower key power 1 stop and re-meter. High-contrast skin handles less power.",
            },
        ],
        "camera_settings": {
            "aperture": "f/4–f/8 (deeper DOF for body shots)",
            "shutter": "1/125–1/200",
            "iso": "100",
            "focus_point": "Face or torso center",
            "white_balance": "Flash preset",
        },
    },

    "gobo": {
        "label": "Gobo / Shaped Light",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",
                "angle_deg": 45,
                "height_deg": 30,
                "height_label": "above eye level",
                "distance_ft": 6.0,
                "modifier": "fresnel_spot",
                "modifier_label": "Fresnel spot or ERS (ellipsoidal) with gobo slot",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power — hard focused beam",
                "notes": [
                    "Insert gobo (metal cutout) to project shape: bars, venetian blinds, leaves.",
                    "Distance to subject controls sharpness of gobo projection.",
                    "Closer source = sharper gobo edge; further = softer.",
                ],
            },
        ],
        "subject_notes": "Subject positioned in the gobo projection zone. Preview gobo pattern before placing subject.",
        "background_notes": "Dark background or allow gobo to also project on background.",
        "coaching": [
            "Gobo photography requires a hard source — Fresnel or focusable strobe.",
            "Move subject nearer/further from source to adjust projection sharpness.",
            "Venetian-blind gobo is the most popular — creates horizontal shadow bars across face.",
        ],
        "fallbacks": [
            {
                "scenario": "No gobo or ERS available",
                "action": "Use a window with venetian blinds as a natural gobo.",
            },
        ],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Eye or face center",
            "white_balance": "Flash preset",
        },
    },

    "flat": {
        "label": "Flat / Catalog",
        "lights": [
            {
                "role": "key",
                "clock_default": "12:00",
                "angle_deg": 5,
                "height_deg": 10,
                "height_label": "near eye level",
                "distance_ft": 5.0,
                "modifier": "softbox_octa",
                "modifier_label": "Large octa softbox (very close)",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Large, close source directly on camera axis for flat, shadow-free light.",
                    "Mount large octa as close to lens as practical.",
                ],
            },
        ],
        "subject_notes": "Subject faces directly into light. Minimal facial turn.",
        "background_notes": "White seamless or any even neutral background.",
        "coaching": [
            "Flat lighting is standard for e-commerce, catalog, and product pages.",
            "Add a second large source on the opposite side at equal power for perfectly flat illumination.",
            "Background light can be separate or from main light spill.",
        ],
        "fallbacks": [
            {
                "scenario": "Light source not large enough",
                "action": "Move source closer — apparent size is what creates flatness.",
            },
        ],
        "camera_settings": {
            "aperture": "f/5.6–f/11",
            "shutter": "1/125–1/200",
            "iso": "100",
            "focus_point": "Face center or product center",
            "white_balance": "Flash preset (consistent color critical for catalog)",
        },
    },

    "unknown": {
        "label": "Unknown Pattern",
        "lights": [
            {
                "role": "key",
                "clock_default": "10:00",
                "angle_deg": 45,
                "height_deg": 35,
                "height_label": "above eye level",
                "distance_ft": 4.0,
                "modifier": "softbox_rect",
                "modifier_label": "Medium rectangular softbox (versatile default)",
                "power_ratio": 1.0,
                "power_ratio_label": "Full power",
                "notes": [
                    "Pattern could not be determined from available signals.",
                    "This is a general-purpose starting point.",
                ],
            },
        ],
        "subject_notes": "Standard portrait position — adjust based on desired mood.",
        "background_notes": "Mid-tone background, 4–6 ft behind subject.",
        "coaching": [
            "Start with this general setup and adjust key angle to match detected pattern.",
            "Upload a reference image for better pattern detection.",
        ],
        "fallbacks": [],
        "camera_settings": {
            "aperture": "f/2.8–f/5.6",
            "shutter": "1/125–1/200",
            "iso": "100–400",
            "focus_point": "Near eye",
            "white_balance": "Flash preset",
        },
    },
}

# Alias patterns to canonical blueprints
_PATTERN_ALIASES: Dict[str, str] = {
    "paramount": "butterfly",
    "beauty": "clamshell",
    "high_key_beauty": "high_key",
    "flat_fashion": "flat",
    "silhouette": "gobo",
    "tabletop": "flat",
    "bottle_backlight": "rim_only",
}


# ═══════════════════════════════════════════════════════════════════════════
# Phase 10: Recommended Kits
# ═══════════════════════════════════════════════════════════════════════════

_KIT_MODIFIERS: Dict[str, Dict[str, List[Dict[str, str]]]] = {
    "softbox_rect": {
        "good": [{"item": "Godox 60×90 cm Softbox", "type": "softbox_rect", "approx_usd": "$60"}],
        "better": [{"item": "Profoto RFi 2×3 ft Softbox", "type": "softbox_rect", "approx_usd": "$280"}],
        "best": [{"item": "Broncolor Hazy Light 60×80", "type": "softbox_rect", "approx_usd": "$980"}],
    },
    "softbox_octa": {
        "good": [{"item": "Neewer 47\" Octa Softbox", "type": "softbox_octa", "approx_usd": "$70"}],
        "better": [{"item": "Godox Octa 120 cm", "type": "softbox_octa", "approx_usd": "$150"}],
        "best": [{"item": "Profoto OCF Octa 3'", "type": "softbox_octa", "approx_usd": "$340"}],
    },
    "beauty_dish": {
        "good": [{"item": "Godox 16\" Beauty Dish", "type": "beauty_dish", "approx_usd": "$55"}],
        "better": [{"item": "Elinchrom 44 cm Beauty Dish", "type": "beauty_dish", "approx_usd": "$310"}],
        "best": [{"item": "Broncolor 65 cm Focus beauty dish", "type": "beauty_dish", "approx_usd": "$720"}],
    },
    "ring_flash": {
        "good": [{"item": "Godox AR400 Ring Flash", "type": "ring_flash", "approx_usd": "$280"}],
        "better": [{"item": "Profoto B10 + RingFlash adapter", "type": "ring_flash", "approx_usd": "$800"}],
        "best": [{"item": "Broncolor Ringflash", "type": "ring_flash", "approx_usd": "$3200"}],
    },
    "strobe_bare": {
        "good": [{"item": "Godox SL60W LED bare", "type": "strobe_bare", "approx_usd": "$130"}],
        "better": [{"item": "Godox AD300Pro bare", "type": "strobe_bare", "approx_usd": "$380"}],
        "best": [{"item": "Broncolor Siros L bare", "type": "strobe_bare", "approx_usd": "$1400"}],
    },
    "reflector_silver": {
        "good": [{"item": "5-in-1 43\" Reflector (silver side)", "type": "reflector", "approx_usd": "$20"}],
        "better": [{"item": "Lastolite 95 cm TriFlip", "type": "reflector", "approx_usd": "$95"}],
        "best": [{"item": "California Sunbounce Pro silver", "type": "reflector", "approx_usd": "$250"}],
    },
    "reflector_white": {
        "good": [{"item": "5-in-1 43\" Reflector (white side)", "type": "reflector", "approx_usd": "$20"}],
        "better": [{"item": "Lastolite 75 cm TriGrip white", "type": "reflector", "approx_usd": "$75"}],
        "best": [{"item": "California Sunbounce Mini white", "type": "reflector", "approx_usd": "$180"}],
    },
    "window_natural": {
        "good": [{"item": "5-in-1 reflector + sheer curtain", "type": "reflector", "approx_usd": "$25"}],
        "better": [{"item": "Westcott 6×6 scrim with stand", "type": "diffusion", "approx_usd": "$120"}],
        "best": [{"item": "Matthews Full Apple Box + 8×8 Lite Panel", "type": "diffusion", "approx_usd": "$450"}],
    },
    "fresnel_spot": {
        "good": [{"item": "Godox S30 Focusable LED Spot", "type": "spot", "approx_usd": "$130"}],
        "better": [{"item": "Aputure LS 300x Fresnel", "type": "spot", "approx_usd": "$850"}],
        "best": [{"item": "Arri Fresnel 650W", "type": "spot", "approx_usd": "$2200"}],
    },
}

_STROBE_BODIES: Dict[str, List[Dict[str, str]]] = {
    "good": [
        {"item": "Godox AD200Pro (portable)", "type": "strobe_portable", "approx_usd": "$280"},
        {"item": "Or: Godox SK400II (studio)", "type": "strobe_mono", "approx_usd": "$180"},
    ],
    "better": [
        {"item": "Profoto B10 Plus (portable)", "type": "strobe_portable", "approx_usd": "$1800"},
        {"item": "Or: Godox MS400 (studio)", "type": "strobe_mono", "approx_usd": "$300"},
    ],
    "best": [
        {"item": "Profoto Pro-10 2400 AirTTL (studio)", "type": "strobe_pack", "approx_usd": "$5800"},
        {"item": "Or: Broncolor Siros L 800 (portable)", "type": "strobe_portable", "approx_usd": "$2400"},
    ],
}


def _build_recommended_kits(
    lights: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build good/better/best gear tiers based on the modifiers in the blueprint."""
    # Collect unique modifiers
    modifiers_needed = {light["modifier"] for light in lights}
    light_count = len(lights)

    kits: Dict[str, Any] = {}
    for tier in ("good", "better", "best"):
        strobe_count = max(1, light_count - 1)  # last light may be reflector
        items: List[Dict[str, str]] = []

        # Strobe bodies
        bodies = _STROBE_BODIES.get(tier, [])
        if bodies:
            items.append({**bodies[0], "quantity": str(strobe_count)})

        # Modifier per unique modifier type
        for mod in sorted(modifiers_needed):
            if mod in ("reflector_white", "reflector_silver", "window_natural"):
                # No body needed
                mod_items = _KIT_MODIFIERS.get(mod, {}).get(tier, [])
                items.extend(mod_items)
            else:
                mod_items = _KIT_MODIFIERS.get(mod, {}).get(tier, [])
                items.extend(mod_items)

        kits[tier] = {
            "items": items,
            "notes": _kit_tier_note(tier, light_count),
        }

    return kits


def _kit_tier_note(tier: str, light_count: int) -> str:
    if tier == "good":
        return (
            f"Entry-level kit for {light_count}-light setup. "
            "Excellent quality-to-cost ratio — Godox ecosystem recommended."
        )
    elif tier == "better":
        return (
            f"Prosumer kit for {light_count}-light setup. "
            "Better color consistency, faster recycle, wider modifier ecosystem."
        )
    else:
        return (
            f"Professional kit for {light_count}-light setup. "
            "Industry-standard reliability, precision color, rental-grade durability."
        )


# ═══════════════════════════════════════════════════════════════════════════
# Signal extraction helpers
# ═══════════════════════════════════════════════════════════════════════════


def _extract_signals(analysis_result: Any) -> Dict[str, Any]:
    """Pull relevant signals from AnalysisResult into a flat dict."""
    signals: Dict[str, Any] = {}

    li = getattr(analysis_result, "lighting_intel", None)
    if li:
        signals["key_side"] = getattr(li, "key_side", "unknown")
        signals["modifier_family"] = getattr(li, "modifier_family", None)
        signals["modifier_confidence"] = getattr(li, "modifier_confidence", 0.0)
        signals["light_count"] = getattr(li, "light_count", 1)
        signals["background_light"] = getattr(li, "background_light_detected", False)
        signals["background_light_confidence"] = getattr(li, "background_light_confidence", 0.0)
        signals["key_position_text"] = getattr(li, "key_position_text", "")
        signals["fill_method_text"] = getattr(li, "fill_method_text", "")
        signals["detected_cct"] = getattr(li, "detected_cct_kelvin", None)
        signals["detected_environment"] = getattr(li, "detected_environment", None)
        signals["pattern_confidence"] = getattr(li, "pattern_confidence", 0.5)
        signals["data_quality"] = getattr(li, "data_quality", "full")

    cr = getattr(analysis_result, "cue_report", None)
    if cr:
        contrast = getattr(cr, "contrast_ratio", None)
        if contrast:
            signals["contrast_ratio"] = getattr(contrast, "ratio", None)
        vla = getattr(cr, "vertical_light_angle", None)
        if vla:
            signals["vertical_angle_label"] = getattr(vla, "primary_angle", None)

    fv = getattr(analysis_result, "face_validation", None)
    if fv and isinstance(fv, dict):
        signals["face_yaw"] = fv.get("faceYaw")
        signals["face_detected"] = fv.get("faceDetected", False)

    ec = getattr(analysis_result, "edge_case_flags", None)
    if ec and isinstance(ec, dict):
        signals["is_bw"] = ec.get("bwProcessing", False)
        signals["extreme_low_key"] = ec.get("extremeLowKey", False)
        signals["window_light"] = ec.get("windowLightGradient", False)

    return signals


def _choose_clock_for_side(side: str, clock_default: str) -> str:
    """Mirror the default clock position based on detected key side."""
    if side == "right":
        mirrors = {
            "10:00": "2:00",
            "10:30": "1:30",
            "9:00": "3:00",
            "7:00": "5:00",
            "11:00": "1:00",
        }
        return mirrors.get(clock_default, clock_default)
    return clock_default  # "left" or "unknown" → keep default


def _apply_modifier_from_inference(
    modifier_default: str,
    modifier_inferred: Optional[str],
    modifier_confidence: float,
) -> str:
    """If inference confidently detected a modifier, use it for the key light."""
    if modifier_inferred and modifier_confidence >= 0.6:
        return modifier_inferred
    return modifier_default


def _modifier_label(mod: str) -> str:
    """Human-readable label for a modifier code."""
    labels: Dict[str, str] = {
        "softbox_rect": "Rectangular softbox",
        "softbox_octa": "Octagonal softbox",
        "softbox_strip": "Strip softbox",
        "beauty_dish": "Beauty dish",
        "beauty_dish_white": "White beauty dish",
        "reflector_silver": "Silver reflector",
        "reflector_white": "White reflector",
        "umbrella_shoot": "Shoot-through umbrella",
        "umbrella_reflect": "Reflective umbrella",
        "ring_flash": "Ring flash",
        "fresnel_spot": "Fresnel spot",
        "strobe_bare": "Bare strobe",
        "window_natural": "Natural window light",
        "parabolic": "Parabolic reflector",
    }
    return labels.get(mod, mod.replace("_", " ").title())


# ═══════════════════════════════════════════════════════════════════════════
# Main public function
# ═══════════════════════════════════════════════════════════════════════════


def build_lighting_blueprint(
    analysis_result: Any,
    *,
    environment: Optional[str] = None,
    subject_type: str = "headshot",
    gear: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Convert an AnalysisResult into a physically-shootable lighting blueprint.

    Parameters
    ----------
    analysis_result:
        AnalysisResult from engine.orchestrator.analyze_image().
        The service reads: authoritative_pattern, lighting_intel, cue_report,
        face_validation, edge_case_flags.  It never modifies any of these.

    environment:
        Optional override for shoot environment (studio_small, outdoor, etc.).

    subject_type:
        "headshot" | "half_body" | "full_body" | "product" (adjusts distances).

    gear:
        List of modifier family codes the photographer has available.

    Returns
    -------
    dict — ready for JSON serialisation, suitable for direct API response.
    """
    try:
        return _build_blueprint_inner(
            analysis_result,
            environment=environment,
            subject_type=subject_type,
            gear=gear or [],
        )
    except Exception:
        logger.exception("Blueprint build failed — returning minimal fallback")
        return {
            "pattern": "unknown",
            "patternLabel": "Unknown",
            "error": "Blueprint generation failed",
            "lights": [],
            "coaching": ["Upload a reference image or run a full shoot-match for a detailed blueprint."],
        }


def _build_blueprint_inner(
    analysis_result: Any,
    *,
    environment: Optional[str],
    subject_type: str,
    gear: List[str],
) -> Dict[str, Any]:
    pattern = getattr(analysis_result, "authoritative_pattern", "unknown") or "unknown"
    canonical = _PATTERN_ALIASES.get(pattern, pattern)
    template = _PATTERN_BLUEPRINTS.get(canonical, _PATTERN_BLUEPRINTS["unknown"])

    signals = _extract_signals(analysis_result)
    key_side = signals.get("key_side", "unknown")
    modifier_inferred = signals.get("modifier_family")
    modifier_conf = signals.get("modifier_confidence", 0.0)
    light_count_inferred = signals.get("light_count", 0)
    bg_light = signals.get("background_light", False)
    pattern_confidence = signals.get("pattern_confidence", 0.5)
    data_quality = signals.get("data_quality", "full")
    is_bw = signals.get("is_bw", False)

    # Distance multiplier per subject type
    dist_mult = {"headshot": 1.0, "half_body": 1.3, "full_body": 1.8, "product": 0.8}.get(
        subject_type, 1.0
    )

    # Build lights
    lights: List[Dict[str, Any]] = []
    template_lights = template.get("lights", [])

    for i, tl in enumerate(template_lights):
        role = tl["role"]
        clock_raw = tl.get("clock_default", "12:00")

        # Mirror position for detected key side (key and fill lights only)
        if role in ("key", "rim") and i == 0:
            clock = _choose_clock_for_side(key_side, clock_raw)
        elif role == "fill" and i == 1 and key_side != "unknown":
            # Fill mirrors opposite side from key
            opp = "right" if key_side == "left" else "left"
            clock = _choose_clock_for_side(opp, clock_raw)
        else:
            clock = clock_raw

        # Modifier selection: key light uses inferred modifier if confident
        mod = tl["modifier"]
        if role == "key":
            mod = _apply_modifier_from_inference(mod, modifier_inferred, modifier_conf)

        light_entry: Dict[str, Any] = {
            "role": role,
            "position": {
                "clock": clock,
                "angleDeg": tl["angle_deg"],
                "heightDeg": tl["height_deg"],
                "heightLabel": tl["height_label"],
                "distanceFt": round(tl["distance_ft"] * dist_mult, 1),
            },
            "modifier": mod,
            "modifierLabel": _modifier_label(mod),
            "powerRatio": tl["power_ratio"],
            "powerRatioLabel": tl["power_ratio_label"],
            "notes": list(tl.get("notes", [])),
        }
        lights.append(light_entry)

    # Optionally add background light if detected and not already in template
    template_roles = {tl["role"] for tl in template_lights}
    if bg_light and "background" not in template_roles and signals.get("background_light_confidence", 0) >= 0.5:
        bg_light_entry: Dict[str, Any] = {
            "role": "background",
            "position": {
                "clock": "12:00",
                "angleDeg": 0,
                "heightDeg": -10,
                "heightLabel": "aimed at background",
                "distanceFt": round(6.0 * dist_mult, 1),
            },
            "modifier": "strobe_bare",
            "modifierLabel": "Bare strobe or strip light on background",
            "powerRatio": 0.7,
            "powerRatioLabel": "Background at 0.7× key",
            "notes": ["Background light inferred from image analysis."],
        }
        lights.append(bg_light_entry)

    # Camera settings
    camera_settings = dict(template.get("camera_settings", {}))
    cct = signals.get("detected_cct")
    if cct:
        camera_settings["detectedColorTemp"] = f"{cct} K"
    if is_bw:
        camera_settings["note"] = "B&W processing detected in reference — color balance less critical."

    # Coaching: template + signal-aware additions
    coaching = list(template.get("coaching", []))
    env_detected = signals.get("detected_environment")
    if env_detected == "outdoor_sun":
        coaching.append("Strong sun detected — use a reflector or fill flash to control harsh shadows.")
    elif env_detected == "window_light":
        coaching.append("Window light detected — position subject to control falloff and shadow side.")
    if signals.get("extreme_low_key"):
        coaching.append("Extreme low-key tones detected — ensure black background and no ambient spill.")

    # Warnings
    warnings: List[str] = []
    if not signals.get("face_detected", True):
        warnings.append("No face detected in reference image — positions are estimated from pattern only.")
    if pattern_confidence < 0.5:
        warnings.append(
            f"Low pattern confidence ({pattern_confidence:.0%}) — blueprint positions are approximate."
        )
    if data_quality != "full":
        warnings.append(f"Signal quality: {data_quality} — some positions may be estimated.")

    # Recommended kits (Phase 10)
    recommended_kits = _build_recommended_kits(lights)

    result: Dict[str, Any] = {
        "pattern": pattern,
        "patternLabel": template.get("label", pattern),
        "subjectType": subject_type,
        "lights": lights,
        "subjectNotes": template.get("subject_notes", ""),
        "backgroundNotes": template.get("background_notes", ""),
        "cameraSettings": camera_settings,
        "coaching": coaching,
        "fallbackOptions": template.get("fallbacks", []),
        "recommendedKits": recommended_kits,
        "signalConfidence": round(pattern_confidence, 3),
        "dataQuality": data_quality,
        "warnings": warnings,
    }
    return result
