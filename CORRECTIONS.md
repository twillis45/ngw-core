# Lighting Corrections Log

## How to Use This File

When you discover a lighting evaluation error:
1. Log it here with the date, issue, and fix
2. Tell Claude Code: `Read CORRECTIONS.md. Implement the latest correction. One change per message, diff only, max 150 lines. READY FOR NEXT.`
3. After all changes are applied, run tests to confirm nothing broke

Each correction entry includes the exact file, the exact change, and the reasoning.

---

## 2026-03-09 — Triangle Lighting Pattern (Hurley-style Headshot)

### Problem
A Peter Hurley headshot using his signature triangle continuous lighting setup was misdiagnosed by the engine. The catchlights clearly show three lights in a triangle formation (two flanking keys + one low fill). The engine classified this as "unknown" or "clamshell" because `patterns.py` has no triangle pattern and `diagram.py` has no concept of symmetric dual keys with a low fill.

### Reference
- Three continuous lights arranged in a triangle
- Two lights flanking at roughly 10 o'clock and 2 o'clock, slightly above eye level
- One light below chin level completing the triangle
- Nearly shadowless face with subtle dimension
- Three distinct catchlights visible in a triangle formation in each eye
- White background blown clean
- Continuous lighting (not strobe)

### Correction 1 of 3: Add triangle pattern to `engine/patterns.py`

In `classify_lighting_pattern()`, add this block BEFORE the clamshell check (around line 32):

```python
    # Triangle (Hurley-style): three-light symmetric setup for headshots
    # Two flanking keys + low fill creating triangle catchlights
    if ("headshot" in m or "clean" in m or "beauty" in m) and (
        "triangle" in kp or "symmetric" in kp or "dual key" in kp or "hurley" in kp
    ):
        return "triangle"
```

In `shadow_expectations_for()`, add this block BEFORE the rembrandt-ish check (around line 66):

```python
    if p == "triangle":
        return {
            "pattern": "Triangle (Hurley-style)",
            "what_you_should_see": [
                "Three catchlights forming a triangle in each eye.",
                "Nearly shadowless face with subtle dimension from angled keys.",
                "Clean jawline — no hard shadow under chin.",
                "Even skin exposure across both sides of face.",
                "Background blown clean white with no visible gradient.",
            ],
            "what_means_it_is_wrong": [
                "One side brighter than the other → lights not balanced; meter both sides independently.",
                "Hard nose shadow appearing → one light too high or too far to the side; bring it back toward center.",
                "Only two catchlights visible → third light not reaching the eyes; move it closer or raise it slightly.",
                "Flat or waxy skin look → lights too close; move all three back 6–12 inches.",
                "Hot spot on forehead → lower the two upper lights or feather them slightly.",
            ],
            "fix_order": [
                "Balance power between all three lights (meter each independently at subject position).",
                "Adjust angles — small moves only, 5–10° at a time.",
                "Then adjust distance (all three should move together to maintain the triangle shape).",
            ],
        }
```

In `catchlight_plan_for()`, add handling for triangle pattern. Update the `ideal` variable section (around line 183):

```python
    if p == "triangle":
        ideal = "Three catchlights in a triangle — two upper (10 and 2 o'clock), one lower (5–6 o'clock)"
```

And add this to the `avoid` list when pattern is triangle:

```python
    if p == "triangle":
        return {
            "goal": "Three clean catchlights per eye forming an even triangle. This is the signature look.",
            "expected_shape": expected_shape,
            "ideal_position": "Two upper catchlights at 10 and 2 o'clock, one lower at 5–6 o'clock",
            "avoid": [
                "Missing third catchlight — means the low fill isn't reaching the eyes.",
                "Uneven triangle (one catchlight bigger) — lights at different distances.",
                "Catchlights merging into a blob — lights too close together, spread them out.",
                "Extra catchlight from background or bounce — flag or kill the spill source.",
            ],
            "quick_fixes": [
                "Missing bottom catchlight: raise the low fill slightly or angle it more toward the face.",
                "Uneven triangle: measure distances from each light to subject — they should match.",
                "One catchlight too bright: that light is closer or higher power — pull it back or dim it.",
            ],
        }
```

### Correction 2 of 3: Add triangle diagram layout to `engine/diagram.py`

Add a new helper function after `_needs_rim()` (around line 92):

```python
def _needs_triangle(mood: str) -> bool:
    mood = normalize_token(mood)
    return mood in {"headshot_triangle", "triangle", "hurley"}
```

In `build_diagram()`, add a triangle branch BEFORE the standard key light block (around line 100, after `lights: List[LightPlacement] = []`):

```python
    if _needs_triangle(mood):
        lights.append(
            LightPlacement(
                role="key_left",
                label="Key Left",
                angle_deg=-30.0,
                height_m=1.75,
                distance_m=1.0,
                modifier=key_modifier,
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
                notes=[
                    "Below chin level, angled up toward face.",
                    "Lower power than keys — just enough to complete the triangle catchlight and lift chin shadow.",
                    "Start at half the power of the keys and adjust.",
                ],
            )
        )

        return DiagramSpec(
            system_id=system_id,
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
```

### Correction 3 of 3: Add triangle system to `data/lighting_systems.json`

Add this entry to the `systems` array in `data/lighting_systems.json`:

```json
{
  "id": "continuous__triangle__studio_medium",
  "name": "Continuous Triangle (Hurley-style Headshot)",
  "criteria": {
    "brightness": 5000,
    "energy_efficiency": 75,
    "color_accuracy": 95,
    "lifespan_hours": 50000,
    "cost_effectiveness": 65
  },
  "features": {
    "dimmable": true,
    "smart_ready": false,
    "waterproof": false
  },
  "modifier": 1.25,
  "taxonomy_refs": {
    "gear_profile": "continuous_led",
    "modifier_family": "softbox_rect",
    "environment": "studio_medium",
    "mood": "headshot_triangle",
    "skin_tone": "light"
  },
  "why_this_works": "Three continuous lights in a triangle create the signature Hurley-style shadowless headshot. Two symmetric keys wrap the face evenly while the low fill eliminates chin shadow and completes the triangle catchlight. Continuous light gives you real-time feedback — what you see is what you get. This setup flatters virtually every face shape and is extremely fast to shoot once dialed in.",
  "failure_modes": [
    "Lights not balanced — one side noticeably brighter; meter both keys independently at subject position",
    "All lights too close creates hot spots and waxy-looking skin; start at 3–4 ft and move back if needed",
    "Continuous lights struggle to overpower ambient — kill all room lights and close blinds",
    "Color temperature drift between units — set all lights to the same Kelvin and verify with a gray card",
    "Low fill too strong washes out chin and neck definition — keep it at half power of the keys"
  ],
  "substitutions": [
    {
      "if_missing": "third continuous light",
      "use": "white reflector or white V-flat below chin",
      "tradeoff": "Weaker third catchlight. Less even fill under chin. Reflector depends on key spill so less independent control."
    },
    {
      "if_missing": "continuous lights",
      "use": "three speedlights with modeling lamps on",
      "tradeoff": "Lose the real-time WYSIWYG advantage. Harder to dial in. Modeling lamps are dimmer than the actual flash output so what you see isn't exactly what you get."
    },
    {
      "if_missing": "softbox modifiers",
      "use": "shoot-through umbrellas",
      "tradeoff": "More spill, less control. Catchlights will be rounder and larger. May need more flagging to keep light off background."
    }
  ],
  "difficulty": 2,
  "setup_time_minutes": 20
},
{
  "id": "continuous__triangle__studio_small",
  "name": "Continuous Triangle — Small Space (Hurley-style Headshot)",
  "criteria": {
    "brightness": 4500,
    "energy_efficiency": 75,
    "color_accuracy": 95,
    "lifespan_hours": 50000,
    "cost_effectiveness": 60
  },
  "features": {
    "dimmable": true,
    "smart_ready": false,
    "waterproof": false
  },
  "modifier": 1.15,
  "taxonomy_refs": {
    "gear_profile": "continuous_led",
    "modifier_family": "softbox_rect",
    "environment": "studio_small",
    "mood": "headshot_triangle",
    "skin_tone": "light"
  },
  "why_this_works": "Same triangle concept adapted for tight spaces. Use smaller modifiers (24-inch or under) and tighten the triangle. In a small room you'll get more bounce off walls which actually helps this look — embrace it. Keep subject 3–4 ft from background minimum.",
  "failure_modes": [
    "Small room bounce can flatten the look too much — use black V-flats on the sides to kill bounce if needed",
    "Smaller modifiers mean harder light — move them closer to compensate but watch for hot spots",
    "Low ceiling limits the upper lights — angle them down more aggressively",
    "Background will be harder to blow clean white in a small room — may need a dedicated background light"
  ],
  "substitutions": [
    {
      "if_missing": "third light",
      "use": "white foam core below chin",
      "tradeoff": "Weaker fill, depends on key spill. In a small room this actually works better because there is more ambient bounce."
    }
  ],
  "difficulty": 2,
  "setup_time_minutes": 15
},
{
  "id": "continuous__triangle__dark_skin",
  "name": "Continuous Triangle — Dark Skin (Hurley-style Headshot)",
  "criteria": {
    "brightness": 5500,
    "energy_efficiency": 75,
    "color_accuracy": 97,
    "lifespan_hours": 50000,
    "cost_effectiveness": 65
  },
  "features": {
    "dimmable": true,
    "smart_ready": false,
    "waterproof": false
  },
  "modifier": 1.30,
  "taxonomy_refs": {
    "gear_profile": "continuous_led",
    "modifier_family": "softbox_rect",
    "environment": "studio_medium",
    "mood": "headshot_triangle",
    "skin_tone": "dark"
  },
  "why_this_works": "Triangle setup tuned for dark skin tones. Higher CRI lights are critical — 95+ minimum, 97+ preferred. The even wrap of the triangle is especially flattering on dark skin because it maintains highlight detail across the face without creating harsh contrast zones. Slightly more power on the low fill helps reveal undertones in the jawline and neck.",
  "failure_modes": [
    "Low CRI lights shift undertones — verify CRI 95+ on all three units",
    "Specular highlights on oily skin — use mattifying spray or reduce power slightly",
    "Underexposure from metering off dark skin — meter incident at subject, not reflected",
    "Triangle too tight can create uneven falloff — widen the triangle slightly for dark skin"
  ],
  "substitutions": [
    {
      "if_missing": "high-CRI continuous lights",
      "use": "strobe with modeling lamp for positioning, then dial by test frame",
      "tradeoff": "Lose WYSIWYG. Must chimping carefully. But strobe CRI is typically 95+ which is the key requirement."
    }
  ],
  "difficulty": 3,
  "setup_time_minutes": 25
}
```

### Camera Guidance for Triangle Setup

This should also be added to the result mapper when the pattern is "triangle":

```
Camera:
  Lens: 70–105mm (Hurley typically shoots 70-200 at ~100mm)
  Camera Height: at subject eye level or very slightly above
  Camera Angle: straight-on
  Distance: 8–10 ft (allows compression and clean framing)
  Starting Settings: ISO 400–800 (continuous light needs more ISO than strobe)
  Shutter: 1/160–1/250
  Aperture: f/5.6–f/8
  White Balance: match to light Kelvin (typically 5000–5600K for daylight-balanced LED)

Subject:
  Distance from background: 4–6 ft (for clean white blowout)
  Pose: straight-on to camera, chin slightly forward and down ("turtle" the chin)
  Eyes: direct to lens

Exposure Notes:
  - Continuous light = lower output than strobe. Expect ISO 400–800.
  - If image is noisy, open aperture to f/4–f/5.6 and move lights closer.
  - Meter each light independently, then all together.
  - Key lights should meter identical. Low fill should meter 1–1.5 stops under.
```

### Test Steps for Triangle Setup

```
1. Turn on left key only
2. Meter at subject position — note the reading
3. Turn off left key, turn on right key only
4. Meter at subject position — should match left key within 1/10 stop
5. If not matched, adjust power until both keys read identical
6. Turn on both keys together
7. Take test frame — face should be evenly lit, both sides balanced
8. Check catchlights — should see two upper catchlights at 10 and 2 o'clock
9. Turn on low fill at half the power of the keys
10. Take test frame — check for third catchlight at 5–6 o'clock
11. Check chin shadow — should be gone or very minimal
12. Check overall face contrast — should be low contrast, open, clean
13. If face looks waxy or flat, pull all three lights back 6 inches
14. If one side is brighter, re-meter and adjust that light
15. Final frame — check histogram, confirm no clipping on skin highlights
```

---

## Template for Future Corrections

```
## YYYY-MM-DD — [Brief Description]

### Problem
[What was misdiagnosed and why]

### Reference
[What the correct setup actually is — lights, placement, catchlights, mood]

### Correction N of N: [Which file]
[Exact code change with context about where it goes]
```
